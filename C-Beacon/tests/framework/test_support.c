#include "beacon_test.h"

#include <stdarg.h>

static BeaconTestContext* g_test_context;
static LONG g_test_failures;

VOID BeaconTestReset(BeaconTestContext* test)
{
    if (!test) return;
    ZeroMemory(test, sizeof(*test));
    test->faults.random_status = (NTSTATUS)-1;
}

VOID BeaconTestInstall(BeaconTestContext* test)
{
    g_test_context = test;
    CryptoTestSetRandomProvider(BeaconTestRandomProvider);
    AgentTestSetWinsockProviders(BeaconTestWsaStartup, BeaconTestWsaCleanup);
}

VOID BeaconTestConfigureRandomFailure(LONG fail_on_call)
{
    if (!g_test_context) return;
    g_test_context->faults.point = BEACON_TEST_FAULT_RANDOM;
    g_test_context->faults.fail_on_call = fail_on_call;
    g_test_context->faults.call_count = 0;
}

VOID BeaconTestConfigureRandomZero(BOOL enabled)
{
    if (!g_test_context) return;
    g_test_context->faults.random_zero = enabled;
    g_test_context->faults.call_count = 0;
    if (enabled) {
        g_test_context->faults.point = BEACON_TEST_FAULT_NONE;
        g_test_context->faults.fail_on_call = 0;
    } else if (g_test_context->faults.point == BEACON_TEST_FAULT_RANDOM) {
        g_test_context->faults.point = BEACON_TEST_FAULT_NONE;
        g_test_context->faults.fail_on_call = 0;
    }
}

VOID BeaconTestConfigureWsaFailure(BOOL enabled)
{
    if (!g_test_context) return;
    g_test_context->faults.point = enabled ? BEACON_TEST_FAULT_WSA_STARTUP : BEACON_TEST_FAULT_NONE;
    g_test_context->faults.fail_on_call = 0;
    g_test_context->faults.call_count = 0;
}

BeaconTestFaultPlan* BeaconTestGetFaultPlan(VOID)
{
    return g_test_context ? &g_test_context->faults : NULL;
}

VOID BeaconTestUninstall(BeaconTestContext* test)
{
    if (g_test_context == test) g_test_context = NULL;
    CryptoTestResetRandomProvider();
    AgentTestResetWinsockProviders();
}

VOID BeaconTestRecord(BeaconTestEventType type, UINT32 id, ULONG value)
{
    BeaconTestTrace* trace;

    if (!g_test_context) return;
    trace = &g_test_context->trace;
    if (trace->count >= BEACON_TEST_MAX_EVENTS) return;
    trace->events[trace->count].type = type;
    trace->events[trace->count].id = id;
    trace->events[trace->count].value = value;
    ++trace->count;
}

const BeaconTestTrace* BeaconTestGetTrace(VOID)
{
    return g_test_context ? &g_test_context->trace : NULL;
}

BOOL BeaconTestTraceHas(const BeaconTestTrace* trace, BeaconTestEventType type)
{
    SIZE_T i;
    if (!trace) return FALSE;
    for (i = 0; i < trace->count; ++i) {
        if (trace->events[i].type == type) return TRUE;
    }
    return FALSE;
}

BOOL BeaconTestTraceHasOrder(const BeaconTestTrace* trace,
                             BeaconTestEventType first,
                             BeaconTestEventType second)
{
    SIZE_T i;
    BOOL seen = FALSE;

    if (!trace) return FALSE;
    for (i = 0; i < trace->count; ++i) {
        if (trace->events[i].type == first) seen = TRUE;
        if (seen && trace->events[i].type == second) return TRUE;
    }
    return FALSE;
}

NTSTATUS WINAPI BeaconTestRandomProvider(BCRYPT_ALG_HANDLE alg,
                                         PUCHAR buffer,
                                         ULONG length,
                                         ULONG flags)
{
    BeaconTestFaultPlan* faults;
    ULONG i;

    (VOID)alg;
    (VOID)flags;
    faults = g_test_context ? &g_test_context->faults : NULL;
    if (faults) {
        faults->call_count++;
        if (faults->point == BEACON_TEST_FAULT_RANDOM &&
            faults->fail_on_call > 0 &&
            faults->call_count == faults->fail_on_call) {
            return faults->random_status;
        }
    }

    for (i = 0; i < length; ++i) {
        buffer[i] = (BYTE)(faults && faults->random_zero ? 0 : i + 1u);
    }
    return 0;
}

INT WINAPI BeaconTestWsaStartup(WORD version, LPWSADATA data)
{
    BeaconTestFaultPlan* faults;
    (VOID)version;
    (VOID)data;

    BeaconTestRecord(BEACON_TEST_EVENT_WSA_STARTUP, 0, 0);
    faults = g_test_context ? &g_test_context->faults : NULL;
    if (faults && faults->point == BEACON_TEST_FAULT_WSA_STARTUP) {
        return WSASYSNOTREADY;
    }
    return 0;
}

INT WINAPI BeaconTestWsaCleanup(VOID)
{
    return 0;
}

VOID BeaconTestAssert(BOOL condition, const CHAR* expression,
                      const CHAR* file, INT line)
{
    if (condition) return;
    ++g_test_failures;
    fprintf(stderr, "FAIL %s(%d): %s\n", file, line, expression);
}

VOID BeaconTestFail(const CHAR* file, INT line, const CHAR* fmt, ...)
{
    va_list ap;
    ++g_test_failures;
    fprintf(stderr, "FAIL %s(%d): ", file, line);
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
    fputc('\n', stderr);
}

typedef VOID (*BeaconTestScenario)(VOID);

typedef struct BeaconTestCase {
    const CHAR* name;
    BeaconTestScenario scenario;
} BeaconTestCase;

INT BeaconTestRunAll(VOID)
{
    static const BeaconTestCase cases[] = {
        { "startup.random_failure", BeaconTestScenarioStartupRandomFailure },
        { "startup.wsa_failure", BeaconTestScenarioStartupWsaFailure },
        { "crypto_and_jitter.failure", BeaconTestScenarioCryptoAndJitterFailure },
        { "task_outbox.flow", BeaconTestScenarioTaskOutboxFlow },
        { "jobs.shutdown", BeaconTestScenarioJobShutdown },
        { "syscall.native_no_bind", BeaconTestScenarioSyscallNativeNoBind },
        { "syscall.fake_bind", BeaconTestScenarioSyscallFakeBind },
        { "syscall.fallback", BeaconTestScenarioSyscallFallback },
        { "syscall.randomized_pool", BeaconTestScenarioSyscallRandomizedPool },
        { "syscall.gate_common", BeaconTestScenarioSyscallGateCommon },
        { "syscall.halos_neighbor", BeaconTestScenarioSyscallHalosNeighbor },
        { "syscall.halos_real", BeaconTestScenarioSyscallHalosReal },
        { "syscall.recycled_confirmed", BeaconTestScenarioSyscallRecycledConfirmed },
        { "syscall.recycled_opcode_wins", BeaconTestScenarioSyscallRecycledOpcodeWins },
        { "syscall.recycled_sort_wins", BeaconTestScenarioSyscallRecycledSortWins },
        { "syscall.recycled_sort_fallback", BeaconTestScenarioSyscallRecycledSortFallback },
        { "syscall.recycled_real", BeaconTestScenarioSyscallRecycledReal },
        { "syscall.bind_six_slots", BeaconTestScenarioSyscallBindSixSlots },
        { "syscall.toggle", BeaconTestScenarioSyscallToggle },
        { "spawn.no_ppid", BeaconTestScenarioSpawnNoPpid },
        { "spawn.ppid_spoofed", BeaconTestScenarioSpawnPpidSpoofed },
        { "spawn.open_fail_fallback", BeaconTestScenarioSpawnOpenFailFallback },
        { "spawn.open_fail_strict", BeaconTestScenarioSpawnOpenFailStrict },
        { "spawn.create_fail_fallback", BeaconTestScenarioSpawnCreateFailFallback },
        { "spawn.apply_profile", BeaconTestScenarioSpawnApplyProfile },
        { "spawn.ppid_std_dup", BeaconTestScenarioSpawnPpidStdDup },
        { "tunnel.poll_rotate_cursor", BeaconTestScenarioTunnelPollRotateCursor },
        { "tunnel.poll_fairness_cross_tick", BeaconTestScenarioTunnelPollFairnessCrossTick },
        { "tunnel.split_target_bounds", BeaconTestScenarioTunnelSplitTargetBounds },
        { "fs.ls_path_too_long", BeaconTestScenarioFsLsPathTooLong },
        { "parser.mv_cp_truncated_args", BeaconTestScenarioParserMvCpTruncatedArgs },
        { "parser.fs_truncated_single_arg", BeaconTestScenarioParserFsTruncatedSingleArg },
        { "parser.kill_stealtoken_truncated", BeaconTestScenarioParserKillStealTokenTruncated }
    };
    SIZE_T i;

    for (i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        BeaconTestContext test;
        LONG before = g_test_failures;

        BeaconTestReset(&test);
        BeaconTestInstall(&test);
        printf("RUN %s\n", cases[i].name);
        cases[i].scenario();
        BeaconTestUninstall(&test);
        printf("%s %s\n", cases[i].name,
               before == g_test_failures ? "PASS" : "FAIL");
    }

    return g_test_failures == 0 ? 0 : 1;
}
