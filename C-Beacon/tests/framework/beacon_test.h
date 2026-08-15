#pragma once

#include "beacon_agent.h"
#include "beacon_agent_internal.h"
#include "beacon_crypto.h"
#include "beacon_jobs.h"
#include "beacon_sleep.h"

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

enum BeaconTestEventValues {
    BEACON_TEST_EVENT_CONTEXT_INIT_BEGIN = 1,
    BEACON_TEST_EVENT_CONTEXT_INIT_FAILED,
    BEACON_TEST_EVENT_WSA_STARTUP,
    BEACON_TEST_EVENT_AGENT_RUN_BEGIN,
    BEACON_TEST_EVENT_JOB_CREATED,
    BEACON_TEST_EVENT_JOB_THREAD_STARTED,
    BEACON_TEST_EVENT_JOB_THREAD_EXITED,
    BEACON_TEST_EVENT_JOB_COMPLETE,
    BEACON_TEST_EVENT_OUTBOX_ENQUEUE,
    BEACON_TEST_EVENT_CONTEXT_FREE
};

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
