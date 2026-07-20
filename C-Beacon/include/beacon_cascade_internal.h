#pragma once

#include "beacon_cascade.h"
#include "beacon_context.h"

/*
 * CascadeIo 后端多态接口。
 * TCP 与 PIPE 两种后端各自实现一份 ops 表。
 * 新增后端只需实现 ops + 在 CascadeIoOpsForKind 查表注册，Close/Event/
 * ReadFrame/WriteFrame 等分发点零改动。
 *
 * 设计取舍：ops 指针不内嵌进 CascadeIo（避免改动公共头 beacon_cascade.h
 * 的结构体布局），而是按 kind 查表。代价是每次调用多一次表查找，但 cascade
 * I/O 不在热路径，可接受。
 *
 * 回调签名约定：
 * - 入参 io 指向完整的 CascadeIo，实现内部按需访问 io->sock / io->pipe 等
 *   后端专属字段（实现知道自己服务于哪种 kind）。
 * - ReadRaw/WriteRaw 是底层阻塞 I/O，不含帧协议逻辑；帧组装在 cascade_frame.c
 *   统一实现，避免帧协议代码重复。
 */
typedef struct CascadeIoOps {
    VOID   (*Close)(CascadeIo* io);                                   /* 关闭后端资源 */
    HANDLE (*GetEvent)(CascadeIo* io);                                /* 返回等待事件句柄 */
    BOOL   (*ReadRaw)(CascadeIo* io, BYTE8* buf, SIZE_T len);         /* 阻塞读 len 字节 */
    BOOL   (*WriteRaw)(CascadeIo* io, const BYTE8* buf, SIZE_T len);  /* 阻塞写 len 字节（不加写锁）*/
} CascadeIoOps;

/* TCP 后端 ops（cascade_io_tcp.c 定义）*/
extern const CascadeIoOps g_cascade_io_tcp_ops;

/* PIPE 后端 ops（cascade_io_smb.c 定义）*/
extern const CascadeIoOps g_cascade_io_pipe_ops;

/* 按 io->kind 查 ops 表；未知 kind 返回 NULL。*/
const CascadeIoOps* CascadeIoOpsForKind(UINT32 kind);

/*
 * 底层 I/O 辅助（供 ops 实现复用，定义在 cascade_frame.c）。
 * TCP 用 CascadeRecvAll/CascadeSendAll（WSAEWOULDBLOCK 重试）。
 * PIPE 用 CascadePipeReadAll/CascadePipeWriteAll（overlapped 感知）。
 */
BOOL CascadeRecvAll(SOCKET s, BYTE8* buf, SIZE_T len);
BOOL CascadeSendAll(SOCKET s, const BYTE8* buf, SIZE_T len);
BOOL CascadePipeReadAll(CascadeIo* io, BYTE8* buf, SIZE_T len);
BOOL CascadePipeWriteAll(CascadeIo* io, const BYTE8* buf, SIZE_T len);

CascadeChannel* CascadeFindLocked(CascadeManager* cm, const CHAR* child_id);
VOID CascadeQueueDead(CascadeManager* cm, const CHAR* child_id, const CHAR* reason);
ByteBuf CascadeRegisterChannel(BeaconContext* ctx, const CHAR* child_id,
                               UINT32 protocol, const CHAR* hint,
                               CascadeIo* io);
