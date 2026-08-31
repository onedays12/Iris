#include "beacon_test.h"
#include "beacon_syscall.h"
#include "beacon_syscall_internal.h"

/*
 * syscall_scenarios.c -- syscall 层测试。
 *
 * 覆盖（docs/SYSCALL_PLAN.md §15）：
 *  - native 模式：绑定前后槽位一致（零行为变化）；
 *  - fake provider：解析成功 → SSN 缓存 + 绑定替换 + 经槽位调用真实可达；
 *  - 回退链：provider 失败 → 链上下一家；全链失败 → 槽位保持原样；
 *  - gate_common：特征扫描 / IsHooked / 伪 Nt 导出过滤单测；
 *  - halos_gate 邻居推算：fake 导出表注入（无 hook 真机触达不到的路径）；
 *  - halos_gate 真实解析：默认链在真实 ntdll 上解析并与独立扫描对照。
 *
 * 测试构建不链接 MASM stub（invoke.c 提供 C 占位），绝不真正执行 syscall：
 * 真实解析成功后只断言 SSN/callable，不调用被替换的槽位。
 */

/* ===== fake provider / invoke ===== */

static BOOL FakeInit(VOID)
{
    return TRUE;
}

static UINT32 g_fake_ssn;
static BOOL g_fake_resolve_ok;
static LONG g_fake_callable_calls;

static BOOL FakeResolveOk(UINT32 func_id, PUINT32 ssn_out)
{
    (VOID)func_id;
    if (!g_fake_resolve_ok) return FALSE;
    *ssn_out = g_fake_ssn;
    return TRUE;
}

static BOOL FakeResolveFail(UINT32 func_id, PUINT32 ssn_out)
{
    (VOID)func_id;
    (VOID)ssn_out;
    return FALSE;
}

static const SyscallProviderOps g_fake_provider_ok = {
    "fake_ok", FakeInit, FakeResolveOk, NULL
};

static const SyscallProviderOps g_fake_provider_fail = {
    "fake_fail", FakeInit, FakeResolveFail, NULL
};

/* mock callable：可观测的调用计数 + 固定 NTSTATUS */
static NTSTATUS NTAPI FakeAllocateCallable(HANDLE ProcessHandle, PVOID* BaseAddress,
                                           ULONG_PTR ZeroBits, PSIZE_T RegionSize,
                                           ULONG AllocationType, ULONG Protect)
{
    (VOID)ProcessHandle; (VOID)BaseAddress; (VOID)ZeroBits;
    (VOID)RegionSize; (VOID)AllocationType; (VOID)Protect;
    InterlockedIncrement(&g_fake_callable_calls);
    return (NTSTATUS)0x12345678L;
}

static PVOID FakeInvokeGetCallable(UINT32 func_id, UINT32 ssn)
{
    (VOID)ssn;
    if (func_id == SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) {
        return (PVOID)(ULONG_PTR)&FakeAllocateCallable;
    }
    return NULL;
}

static const SyscallInvokeOps g_fake_invoke = {
    "fake_invoke", FakeInit, FakeInvokeGetCallable
};

/* ===== 场景 1：native-only 链零行为变化 ===== */

VOID BeaconTestScenarioSyscallNativeNoBind(VOID)
{
    SyscallManager sm;
    Win32Api api;
    const SyscallProviderOps* chain[1];
    PVOID original = (PVOID)(ULONG_PTR)0x12340000u;

    TEST_ASSERT(SyscallInit(&sm));

    /* 显式 native-only 链（默认链阶段 2 起含 halos_gate，会真实解析） */
    chain[0] = &g_syscall_provider_native;
    SyscallTestSetChain(&sm, chain, 1);
    SyscallTestResolveAll(&sm);

    /* 全链失败：无 SSN、无 callable */
    TEST_ASSERT(SyscallTestGetSsn(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == 0);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == NULL);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_PROTECT_VIRTUAL_MEMORY) == NULL);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_CREATE_THREAD_EX) == NULL);

    /* 绑定后槽位保持原 ntdll 地址 */
    ZeroMemory(&api, sizeof(api));
    api.pfnNtAllocateVirtualMemory = (fnNtAllocateVirtualMemory)original;
    api.pfnNtProtectVirtualMemory = (fnNtProtectVirtualMemory)original;
    api.pfnNtCreateThreadEx = (fnNtCreateThreadEx)original;

    SyscallBindApiTable(&sm, &api);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == original);
    TEST_ASSERT((PVOID)api.pfnNtProtectVirtualMemory == original);
    TEST_ASSERT((PVOID)api.pfnNtCreateThreadEx == original);

    SyscallCleanup(&sm);
}

/* ===== 场景 2：fake provider 解析成功 → 绑定替换 → 经槽位调用 ===== */

VOID BeaconTestScenarioSyscallFakeBind(VOID)
{
    SyscallManager sm;
    Win32Api api;
    const SyscallProviderOps* chain[2];
    NTSTATUS st;

    g_fake_resolve_ok = TRUE;
    g_fake_ssn = 0x2Au;
    InterlockedExchange(&g_fake_callable_calls, 0);

    TEST_ASSERT(SyscallInit(&sm));

    /* 注入 fake 链（fake_ok 在 native 之前）与 fake invoke */
    chain[0] = &g_fake_provider_ok;
    chain[1] = &g_syscall_provider_native;
    SyscallTestSetChain(&sm, chain, 2);
    SyscallTestSetInvoke(&sm, &g_fake_invoke);

    /* 重新解析：fake 解析成功 → SSN 缓存 + callable 缓存 */
    TEST_ASSERT(SyscallResolve(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY));
    TEST_ASSERT(SyscallTestGetSsn(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == 0x2Au);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) ==
                (PVOID)(ULONG_PTR)&FakeAllocateCallable);

    /* 未提供 stub 的 API：无 callable（保持 native） */
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_PROTECT_VIRTUAL_MEMORY) == NULL);

    /* 绑定：ALLOCATE 槽位被替换为 mock callable */
    ZeroMemory(&api, sizeof(api));
    api.pfnNtAllocateVirtualMemory = (fnNtAllocateVirtualMemory)(ULONG_PTR)0x11110000u;
    api.pfnNtProtectVirtualMemory = (fnNtProtectVirtualMemory)(ULONG_PTR)0x22220000u;

    SyscallBindApiTable(&sm, &api);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtProtectVirtualMemory == (PVOID)(ULONG_PTR)0x22220000u);

    /* 经绑定后的槽位调用：mock 执行且返回固定 NTSTATUS */
    st = api.pfnNtAllocateVirtualMemory(NULL, NULL, 0, NULL, 0, 0);
    TEST_ASSERT(st == (NTSTATUS)0x12345678L);
    TEST_ASSERT(InterlockedCompareExchange(&g_fake_callable_calls, 0, 0) == 1);

    SyscallCleanup(&sm);
}

/* ===== 场景 3：回退链顺序 + 全链失败保持槽位 ===== */

VOID BeaconTestScenarioSyscallFallback(VOID)
{
    SyscallManager sm;
    Win32Api api;
    const SyscallProviderOps* chain[3];
    PVOID original = (PVOID)(ULONG_PTR)0x33330000u;

    g_fake_resolve_ok = TRUE;
    g_fake_ssn = 0x42u;

    TEST_ASSERT(SyscallInit(&sm));

    /* 链：fake_fail -> fake_ok -> native：第一家失败后由第二家解析成功 */
    chain[0] = &g_fake_provider_fail;
    chain[1] = &g_fake_provider_ok;
    chain[2] = &g_syscall_provider_native;
    SyscallTestSetChain(&sm, chain, 3);
    SyscallTestSetInvoke(&sm, &g_fake_invoke);

    TEST_ASSERT(SyscallResolve(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY));
    TEST_ASSERT(SyscallTestGetSsn(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == 0x42u);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) ==
                (PVOID)(ULONG_PTR)&FakeAllocateCallable);

    /* 全链失败（fake_ok 也失败）→ 回退 native：无 callable */
    g_fake_resolve_ok = FALSE;
    TEST_ASSERT(!SyscallResolve(&sm, SYSCALL_NT_PROTECT_VIRTUAL_MEMORY));
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_PROTECT_VIRTUAL_MEMORY) == NULL);

    /* 绑定：解析成功的 ALLOCATE 被替换；全链失败的 PROTECT 保持原样 */
    ZeroMemory(&api, sizeof(api));
    api.pfnNtAllocateVirtualMemory = (fnNtAllocateVirtualMemory)original;
    api.pfnNtProtectVirtualMemory = (fnNtProtectVirtualMemory)original;

    SyscallBindApiTable(&sm, &api);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtProtectVirtualMemory == original);

    SyscallCleanup(&sm);
}

/* ===== 场景 4：randomized gadget 池（真实 ntdll 扫描） ===== */

VOID BeaconTestScenarioSyscallRandomizedPool(VOID)
{
    SyscallManager sm;
    const SyscallProviderOps* chain[1];

    /* SyscallInit 触发 randomized invoke 的 Init：扫描当前进程 ntdll，
     * 收集 `syscall; ret`（0F 05 C3）gadget。真实 Windows 上远多于 64 个。 */
    TEST_ASSERT(SyscallInit(&sm));
    TEST_ASSERT(SyscallTestGetGadgetCount() >= SYSCALL_GADGET_POOL);

    /* native-only 链下无 callable（零行为变化语义） */
    chain[0] = &g_syscall_provider_native;
    SyscallTestSetChain(&sm, chain, 1);
    SyscallTestResolveAll(&sm);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == NULL);

    SyscallCleanup(&sm);
}

/* ===== 场景 5：gate_common 单元测试 ===== */

VOID BeaconTestScenarioSyscallGateCommon(VOID)
{
    BYTE clean_stub[40]  = { 0x4C, 0x8B, 0xD1, 0xB8, 0x2A, 0x00, 0x00, 0x00,
                             0x0F, 0x05, 0xC3 };
    BYTE far_jmp[40]     = { 0xFF, 0x25, 0x00, 0x00, 0x00, 0x00 };
    BYTE near_jmp[40]    = { 0xE9, 0x00, 0x00, 0x00, 0x00 };
    BYTE call_op[40]     = { 0xE8, 0x00, 0x00, 0x00, 0x00 };
    BYTE int3_op[40]     = { 0xCC };
    BYTE short_jmp[40]   = { 0xEB, 0x00 };
    const GateExport* ex;
    UINT32 cnt;
    UINT32 ssn;

    /* ExtractSsn：干净 stub 提取 2 字节小端 SSN */
    TEST_ASSERT(GateExtractSsn(clean_stub, &ssn));
    TEST_ASSERT(ssn == 0x2Au);

    /* ExtractSsn：被 hook 的入口（无 4C 8B D1 B8）提取失败 */
    TEST_ASSERT(!GateExtractSsn(near_jmp, &ssn));

    /* IsHooked：五种常见 hook 指令形态 */
    TEST_ASSERT(GateIsHooked(near_jmp));
    TEST_ASSERT(GateIsHooked(far_jmp));
    TEST_ASSERT(GateIsHooked(call_op));
    TEST_ASSERT(GateIsHooked(int3_op));
    TEST_ASSERT(GateIsHooked(short_jmp));
    TEST_ASSERT(!GateIsHooked(clean_stub));

    /* 真实 ntdll 导出缓存：过滤伪 Nt 导出（NtdllDefWindowProc_A 等） */
    TEST_ASSERT(GateInitCache());
    ex = GateGetExports(&cnt);
    TEST_ASSERT(ex != NULL);
    TEST_ASSERT(cnt > 300);                                       /* 真实 Nt syscall 数量 */
    TEST_ASSERT(GateFindByHash(GateHashName("NtAllocateVirtualMemory")) >= 0);
    TEST_ASSERT(GateFindByHash(GateHashName("NtdllDefWindowProc_A")) < 0);
    TEST_ASSERT(GateFindByHash(GateHashName("NtdllDialogWndProc_W")) < 0);
}

/* ===== 场景 6：halos_gate 邻居推算（fake 导出表注入） ===== */

/* 2D 数组保证行地址严格递增：[0] 低地址 / [1] 目标（被 hook）/ [2] 高地址 */
static BYTE g_fake_region[3][40];

VOID BeaconTestScenarioSyscallHalosNeighbor(VOID)
{
    GateExport exports[3];
    UINT32 ssn;

    /* 构造：邻居低 SSN 0x30，目标被 hook（E9），邻居高 SSN 0x32 */
    ZeroMemory(g_fake_region, sizeof(g_fake_region));
    g_fake_region[0][0] = 0x4C; g_fake_region[0][1] = 0x8B; g_fake_region[0][2] = 0xD1;
    g_fake_region[0][3] = 0xB8; g_fake_region[0][4] = 0x30; g_fake_region[0][5] = 0x00;
    g_fake_region[1][0] = 0xE9; g_fake_region[1][1] = 0x00;               /* 目标被 hook */
    g_fake_region[2][0] = 0x4C; g_fake_region[2][1] = 0x8B; g_fake_region[2][2] = 0xD1;
    g_fake_region[2][3] = 0xB8; g_fake_region[2][4] = 0x32; g_fake_region[2][5] = 0x00;

    exports[0].Address = g_fake_region[0];
    exports[0].Hash    = GateHashName("NtFakeNeighborLow");
    exports[1].Address = g_fake_region[1];
    exports[1].Hash    = GateHashName("NtAllocateVirtualMemory");
    exports[2].Address = g_fake_region[2];
    exports[2].Hash    = GateHashName("NtFakeNeighborHigh");
    GateTestSetExports(exports, 3);

    /* 地址序 = 0,1,2 → 目标 myIdx=1；delta=1,dir=-1 → 邻居 0 的 SSN 0x30
     * 推算：ssn = 0x30 - (1 * -1) = 0x31 */
    TEST_ASSERT(g_syscall_provider_halos_gate.ResolveNumber(
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, &ssn));
    TEST_ASSERT(ssn == 0x31u);

    /* 全 hook：目标与两侧邻居都被 hook → 解析失败（回退 native） */
    g_fake_region[0][0] = 0xE9;
    g_fake_region[2][0] = 0xE9;
    TEST_ASSERT(!g_syscall_provider_halos_gate.ResolveNumber(
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, &ssn));

    GateTestResetCache();
}

/* ===== 场景 7：halos_gate 真实解析（显式 halos 链 + 真实 ntdll） ===== */

VOID BeaconTestScenarioSyscallHalosReal(VOID)
{
    SyscallManager sm;
    const SyscallProviderOps* chain[2];
    const GateExport* ex;
    UINT32 cnt;
    LONG idx;
    UINT32 ssn_dispatch;
    UINT32 ssn_independent;

    TEST_ASSERT(SyscallInit(&sm));

    /* 默认链首已是 recycled_gate：显式 halos 链单独验证 halos 自身 */
    chain[0] = &g_syscall_provider_halos_gate;
    chain[1] = &g_syscall_provider_native;
    SyscallTestSetChain(&sm, chain, 2);
    SyscallTestResolveAll(&sm);

    ssn_dispatch = SyscallTestGetSsn(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY);
    TEST_ASSERT(ssn_dispatch > 0);
    TEST_ASSERT(SyscallTestGetSsn(&sm, SYSCALL_NT_PROTECT_VIRTUAL_MEMORY) > 0);
    TEST_ASSERT(SyscallTestGetSsn(&sm, SYSCALL_NT_CREATE_THREAD_EX) > 0);

    /* halos 解析成功 → callable 非空 */
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) != NULL);

    /* 独立对照：直接从 ntdll 导出表扫特征，SSN 必须一致 */
    TEST_ASSERT(GateInitCache());
    ex = GateGetExports(&cnt);
    TEST_ASSERT(ex != NULL);
    idx = GateFindByHash(GateHashName("NtAllocateVirtualMemory"));
    TEST_ASSERT(idx >= 0);
    TEST_ASSERT(GateExtractSsn((PBYTE)ex[idx].Address, &ssn_independent));
    TEST_ASSERT(ssn_dispatch == ssn_independent);

    SyscallCleanup(&sm);
}

/* ===== 场景 8-11：recycled_gate 决策矩阵（fake 导出表注入） ===== */

/* 2D 数组保证行地址严格递增；目标函数固定在 index 2（sortSsn = 2） */
static BYTE g_recycled_region[4][48];

static VOID RecycledSetupFakeExports(VOID)
{
    GateExport exports[4];

    ZeroMemory(g_recycled_region, sizeof(g_recycled_region));
    exports[0].Address = g_recycled_region[0];
    exports[0].Hash    = GateHashName("NtFakeNeighbor0");
    exports[1].Address = g_recycled_region[1];
    exports[1].Hash    = GateHashName("NtFakeNeighbor1");
    exports[2].Address = g_recycled_region[2];
    exports[2].Hash    = GateHashName("NtAllocateVirtualMemory");
    exports[3].Address = g_recycled_region[3];
    exports[3].Hash    = GateHashName("NtFakeNeighbor3");
    GateTestSetExports(exports, 4);
}

/* 场景 8：opcode == sort → confirmed */
VOID BeaconTestScenarioSyscallRecycledConfirmed(VOID)
{
    UINT32 ssn = 0;

    RecycledSetupFakeExports();
    g_recycled_region[2][0] = 0x4C; g_recycled_region[2][1] = 0x8B; g_recycled_region[2][2] = 0xD1;
    g_recycled_region[2][3] = 0xB8; g_recycled_region[2][4] = 0x02; g_recycled_region[2][5] = 0x00;

    TEST_ASSERT(g_syscall_provider_recycled_gate.ResolveNumber(
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, &ssn));
    TEST_ASSERT(ssn == 2u);

    GateTestResetCache();
}

/* 场景 9：opcode != sort 且 stub 干净 → 信 opcode */
VOID BeaconTestScenarioSyscallRecycledOpcodeWins(VOID)
{
    UINT32 ssn = 0;

    RecycledSetupFakeExports();
    g_recycled_region[2][0] = 0x4C; g_recycled_region[2][1] = 0x8B; g_recycled_region[2][2] = 0xD1;
    g_recycled_region[2][3] = 0xB8; g_recycled_region[2][4] = 0x09; g_recycled_region[2][5] = 0x00;

    TEST_ASSERT(g_syscall_provider_recycled_gate.ResolveNumber(
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, &ssn));
    TEST_ASSERT(ssn == 9u);

    GateTestResetCache();
}

/* 场景 10：opcode != sort 且 stub 被 hook → 信排序索引 */
VOID BeaconTestScenarioSyscallRecycledSortWins(VOID)
{
    UINT32 ssn = 0;

    RecycledSetupFakeExports();
    /* E9 hook 占前 5 字节，原 stub 字节仍在其后（ExtractSsn 可读到 opcode=9） */
    g_recycled_region[2][0] = 0xE9; g_recycled_region[2][1] = 0x00;
    g_recycled_region[2][2] = 0x00; g_recycled_region[2][3] = 0x00; g_recycled_region[2][4] = 0x00;
    g_recycled_region[2][5] = 0x4C; g_recycled_region[2][6] = 0x8B; g_recycled_region[2][7] = 0xD1;
    g_recycled_region[2][8] = 0xB8; g_recycled_region[2][9] = 0x09; g_recycled_region[2][10] = 0x00;

    TEST_ASSERT(g_syscall_provider_recycled_gate.ResolveNumber(
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, &ssn));
    TEST_ASSERT(ssn == 2u);

    GateTestResetCache();
}

/* 场景 11：无 opcode（特征被覆盖）→ 信排序索引兜底 */
VOID BeaconTestScenarioSyscallRecycledSortFallback(VOID)
{
    UINT32 ssn = 0;

    RecycledSetupFakeExports();
    /* E9 hook + 全 NOP：32 字节内无 4C 8B D1 B8 特征 */
    g_recycled_region[2][0] = 0xE9; g_recycled_region[2][1] = 0x00;

    TEST_ASSERT(g_syscall_provider_recycled_gate.ResolveNumber(
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY, &ssn));
    TEST_ASSERT(ssn == 2u);

    GateTestResetCache();
}

/* ===== 场景 13：6 槽位绑定全覆盖（阶段 4 扩展） ===== */

static PVOID FakeInvokeGetCallableAll(UINT32 func_id, UINT32 ssn)
{
    (VOID)ssn;
    switch (func_id) {
    case SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY:
    case SYSCALL_NT_PROTECT_VIRTUAL_MEMORY:
    case SYSCALL_NT_WRITE_VIRTUAL_MEMORY:
    case SYSCALL_NT_OPEN_PROCESS:
    case SYSCALL_NT_CREATE_THREAD_EX:
    case SYSCALL_NT_RESUME_THREAD:
        return (PVOID)(ULONG_PTR)&FakeAllocateCallable;
    default:
        return NULL;
    }
}

static const SyscallInvokeOps g_fake_invoke_all = {
    "fake_invoke_all", FakeInit, FakeInvokeGetCallableAll
};

VOID BeaconTestScenarioSyscallBindSixSlots(VOID)
{
    SyscallManager sm;
    Win32Api api;
    const SyscallProviderOps* chain[1];
    UINT32 funcs[6] = {
        SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY,
        SYSCALL_NT_PROTECT_VIRTUAL_MEMORY,
        SYSCALL_NT_WRITE_VIRTUAL_MEMORY,
        SYSCALL_NT_OPEN_PROCESS,
        SYSCALL_NT_CREATE_THREAD_EX,
        SYSCALL_NT_RESUME_THREAD
    };
    UINT32 i;

    TEST_ASSERT(SyscallInit(&sm));
    chain[0] = &g_fake_provider_ok;
    SyscallTestSetChain(&sm, chain, 1);
    SyscallTestSetInvoke(&sm, &g_fake_invoke_all);

    g_fake_ssn = 0x2A;
    g_fake_resolve_ok = TRUE;
    SyscallTestResolveAll(&sm);

    /* 描述表中 6 个槽位全部解析 + 绑定 */
    ZeroMemory(&api, sizeof(api));
    SyscallBindApiTable(&sm, &api);
    for (i = 0; i < 6; ++i) {
        TEST_ASSERT(SyscallTestGetSsn(&sm, funcs[i]) == 0x2A);
        TEST_ASSERT(SyscallTestGetCallable(&sm, funcs[i]) != NULL);
        TEST_ASSERT(SyscallTestGetProviderOf(&sm, funcs[i]) == 0);
    }

    /* 槽位被替换成 callable（含新扩展的 3 个） */
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtProtectVirtualMemory == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtWriteVirtualMemory == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtOpenProcess == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtCreateThreadEx == (PVOID)(ULONG_PTR)&FakeAllocateCallable);
    TEST_ASSERT((PVOID)api.pfnNtResumeThread == (PVOID)(ULONG_PTR)&FakeAllocateCallable);

    SyscallCleanup(&sm);
}

/* ===== 场景 14：syscall 运行时开关（bind -> disable -> enable 幂等） ===== */

VOID BeaconTestScenarioSyscallToggle(VOID)
{
    SyscallManager sm;
    Win32Api api;
    const SyscallProviderOps* chain[1];
    PVOID original_alloc;
    PVOID original_write;
    PVOID callable;

    TEST_ASSERT(SyscallInit(&sm));
    chain[0] = &g_fake_provider_ok;
    SyscallTestSetChain(&sm, chain, 1);
    SyscallTestSetInvoke(&sm, &g_fake_invoke_all);

    g_fake_ssn = 0x2A;
    g_fake_resolve_ok = TRUE;
    SyscallTestResolveAll(&sm);

    /* 模拟 Win32ApiInit 解析出的 ntdll 地址 */
    ZeroMemory(&api, sizeof(api));
    api.pfnNtAllocateVirtualMemory = (fnNtAllocateVirtualMemory)(ULONG_PTR)0x11110000u;
    api.pfnNtProtectVirtualMemory = (fnNtProtectVirtualMemory)(ULONG_PTR)0x22220000u;
    api.pfnNtWriteVirtualMemory = (fnNtWriteVirtualMemory)(ULONG_PTR)0x33330000u;
    api.pfnNtOpenProcess = (fnNtOpenProcess)(ULONG_PTR)0x44440000u;
    api.pfnNtCreateThreadEx = (fnNtCreateThreadEx)(ULONG_PTR)0x55550000u;
    api.pfnNtResumeThread = (fnNtResumeThread)(ULONG_PTR)0x66660000u;
    original_alloc = (PVOID)api.pfnNtAllocateVirtualMemory;
    original_write = (PVOID)api.pfnNtWriteVirtualMemory;
    callable = (PVOID)(ULONG_PTR)&FakeAllocateCallable;

    /* 绑定：槽位被替换 */
    SyscallBindApiTable(&sm, &api);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == callable);
    TEST_ASSERT(sm.bound == TRUE);

    /* 关闭：恢复原地址（含新扩展的槽位） */
    SyscallSetEnabled(&sm, &api, FALSE);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == original_alloc);
    TEST_ASSERT((PVOID)api.pfnNtWriteVirtualMemory == original_write);
    TEST_ASSERT((PVOID)api.pfnNtResumeThread == (PVOID)(ULONG_PTR)0x66660000u);
    TEST_ASSERT(sm.bound == FALSE);

    /* 幂等：重复关闭不改变 */
    SyscallSetEnabled(&sm, &api, FALSE);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == original_alloc);
    TEST_ASSERT(sm.bound == FALSE);

    /* 重新开启：重新替换（不重新解析，SSN 缓存保持） */
    SyscallSetEnabled(&sm, &api, TRUE);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == callable);
    TEST_ASSERT((PVOID)api.pfnNtWriteVirtualMemory == callable);
    TEST_ASSERT(sm.bound == TRUE);
    TEST_ASSERT(SyscallTestGetSsn(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == 0x2A);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == callable);

    /* 幂等：重复开启不改变 */
    SyscallSetEnabled(&sm, &api, TRUE);
    TEST_ASSERT((PVOID)api.pfnNtAllocateVirtualMemory == callable);

    SyscallCleanup(&sm);
}

/* ===== 场景 12：recycled_gate 真实解析（默认链 + 真实 ntdll） ===== */

VOID BeaconTestScenarioSyscallRecycledReal(VOID)
{
    SyscallManager sm;
    const GateExport* ex;
    UINT32 cnt;
    LONG idx;
    UINT32 ssn_dispatch;
    UINT32 ssn_independent;

    /* 默认链 [recycled_gate, halos_gate, native] */
    TEST_ASSERT(SyscallInit(&sm));

    ssn_dispatch = SyscallTestGetSsn(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY);
    TEST_ASSERT(ssn_dispatch > 0);
    TEST_ASSERT(SyscallTestGetCallable(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) != NULL);

    /* recycled 是链首（provider_of == 0）且解析成功 */
    TEST_ASSERT(SyscallTestGetProviderOf(&sm, SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY) == 0);

    /* 独立对照：无 hook 机器上走 confirmed 分支 → 与独立扫描一致 */
    TEST_ASSERT(GateInitCache());
    ex = GateGetExports(&cnt);
    TEST_ASSERT(ex != NULL);
    idx = GateFindByHash(GateHashName("NtAllocateVirtualMemory"));
    TEST_ASSERT(idx >= 0);
    TEST_ASSERT(GateExtractSsn((PBYTE)ex[idx].Address, &ssn_independent));
    TEST_ASSERT(ssn_dispatch == ssn_independent);

    SyscallCleanup(&sm);
}
