#pragma once

#include "beacon_agent.h"
#include "beacon_agent_internal.h"
#include "beacon_crypto.h"
#include "beacon_jobs.h"
#include "beacon_sleep.h"

/* 事件常量唯一事实源：beacon_test_events.h（本头文件不再重复定义） */
#include "beacon_test_events.h"

typedef enum BeaconTestFaultPoint {
    BEACON_TEST_FAULT_NONE = 0,
    BEACON_TEST_FAULT_RANDOM,
    BEACON_TEST_FAULT_WSA_STARTUP
} BeaconTestFaultPoint;

typedef struct BeaconTestFaultPlan {
    BeaconTestFaultPoint point;
    LONG fail_on_call;
    LONG call_count;
    NTSTATUS random_status;
    BOOL random_zero;
} BeaconTestFaultPlan;

typedef unsigned int BeaconTestEventType;

typedef struct BeaconTestEvent {
    BeaconTestEventType type;
    UINT32 id;
    ULONG value;
} BeaconTestEvent;

#define BEACON_TEST_MAX_EVENTS 4096u

typedef struct BeaconTestTrace {
    BeaconTestEvent events[BEACON_TEST_MAX_EVENTS];
    SIZE_T count;
} BeaconTestTrace;

typedef struct BeaconTestContext {
    BeaconTestFaultPlan faults;
    BeaconTestTrace trace;
} BeaconTestContext;

VOID BeaconTestReset(BeaconTestContext* test);
VOID BeaconTestInstall(BeaconTestContext* test);
VOID BeaconTestUninstall(BeaconTestContext* test);
VOID BeaconTestConfigureRandomFailure(LONG fail_on_call);
VOID BeaconTestConfigureRandomZero(BOOL enabled);
VOID BeaconTestConfigureWsaFailure(BOOL enabled);
BeaconTestFaultPlan* BeaconTestGetFaultPlan(VOID);
VOID BeaconTestRecord(BeaconTestEventType type, UINT32 id, ULONG value);
const BeaconTestTrace* BeaconTestGetTrace(VOID);
BOOL BeaconTestTraceHas(const BeaconTestTrace* trace, BeaconTestEventType type);
BOOL BeaconTestTraceHasOrder(const BeaconTestTrace* trace,
                             BeaconTestEventType first,
                             BeaconTestEventType second);

VOID AgentTestSetWinsockProviders(INT (WINAPI *startup)(WORD, LPWSADATA),
                                  INT (WINAPI *cleanup)(VOID));
VOID AgentTestResetWinsockProviders(VOID);
LONG AgentTestGetWinsockStartupCalls(VOID);
LONG AgentTestGetWinsockCleanupCalls(VOID);

NTSTATUS WINAPI BeaconTestRandomProvider(BCRYPT_ALG_HANDLE alg,
                                         PUCHAR buffer,
                                         ULONG length,
                                         ULONG flags);
INT WINAPI BeaconTestWsaStartup(WORD version, LPWSADATA data);
INT WINAPI BeaconTestWsaCleanup(VOID);

VOID BeaconTestAssert(BOOL condition, const CHAR* expression,
                      const CHAR* file, INT line);
VOID BeaconTestFail(const CHAR* file, INT line, const CHAR* fmt, ...);
INT BeaconTestRunAll(VOID);

#define TEST_ASSERT(expr) BeaconTestAssert((expr), #expr, __FILE__, __LINE__)
#define TEST_FAIL(...) BeaconTestFail(__FILE__, __LINE__, __VA_ARGS__)

VOID BeaconTestScenarioStartupRandomFailure(VOID);
VOID BeaconTestScenarioStartupWsaFailure(VOID);
VOID BeaconTestScenarioCryptoAndJitterFailure(VOID);
VOID BeaconTestScenarioTaskOutboxFlow(VOID);
VOID BeaconTestScenarioJobShutdown(VOID);
VOID BeaconTestScenarioSyscallNativeNoBind(VOID);
VOID BeaconTestScenarioSyscallFakeBind(VOID);
VOID BeaconTestScenarioSyscallFallback(VOID);
VOID BeaconTestScenarioSyscallRandomizedPool(VOID);
VOID BeaconTestScenarioSyscallGateCommon(VOID);
VOID BeaconTestScenarioSyscallHalosNeighbor(VOID);
VOID BeaconTestScenarioSyscallHalosReal(VOID);
VOID BeaconTestScenarioSyscallRecycledConfirmed(VOID);
VOID BeaconTestScenarioSyscallRecycledOpcodeWins(VOID);
VOID BeaconTestScenarioSyscallRecycledSortWins(VOID);
VOID BeaconTestScenarioSyscallRecycledSortFallback(VOID);
VOID BeaconTestScenarioSyscallRecycledReal(VOID);
VOID BeaconTestScenarioSyscallBindSixSlots(VOID);
VOID BeaconTestScenarioSyscallToggle(VOID);

VOID BeaconTestScenarioSpawnNoPpid(VOID);
VOID BeaconTestScenarioSpawnPpidSpoofed(VOID);
VOID BeaconTestScenarioSpawnOpenFailFallback(VOID);
VOID BeaconTestScenarioSpawnOpenFailStrict(VOID);
VOID BeaconTestScenarioSpawnCreateFailFallback(VOID);
VOID BeaconTestScenarioSpawnApplyProfile(VOID);
VOID BeaconTestScenarioSpawnPpidStdDup(VOID);

VOID BeaconTestScenarioTunnelPollRotateCursor(VOID);
VOID BeaconTestScenarioTunnelPollFairnessCrossTick(VOID);
VOID BeaconTestScenarioTunnelSplitTargetBounds(VOID);
VOID BeaconTestScenarioFsLsPathTooLong(VOID);

VOID BeaconTestScenarioParserMvCpTruncatedArgs(VOID);
VOID BeaconTestScenarioParserFsTruncatedSingleArg(VOID);
VOID BeaconTestScenarioParserKillStealTokenTruncated(VOID);
