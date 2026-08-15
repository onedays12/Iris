#include "beacon_test.h"

VOID BeaconTestScenarioStartupRandomFailure(VOID)
{
    Agent agent;
    const BeaconTestTrace* trace;

    ZeroMemory(&agent, sizeof(agent));
    BeaconTestConfigureRandomFailure(1);
    TEST_ASSERT(!AgentInit(&agent));
    TEST_ASSERT(agent.initialized == 0);
    TEST_ASSERT(agent.wsa_started == 0);
    TEST_ASSERT(AgentTestGetWinsockStartupCalls() == 0);

    trace = BeaconTestGetTrace();
    TEST_ASSERT(trace != NULL);
    if (!trace) return;
    TEST_ASSERT(BeaconTestTraceHas(trace, BEACON_TEST_EVENT_CONTEXT_INIT_FAILED));
    TEST_ASSERT(!BeaconTestTraceHas(trace, BEACON_TEST_EVENT_AGENT_RUN_BEGIN));
}

VOID BeaconTestScenarioStartupWsaFailure(VOID)
{
    Agent agent;

    ZeroMemory(&agent, sizeof(agent));
    BeaconTestConfigureWsaFailure(TRUE);
    TEST_ASSERT(!AgentInit(&agent));
    TEST_ASSERT(agent.initialized == 0);
    TEST_ASSERT(agent.wsa_started == 0);
    TEST_ASSERT(AgentTestGetWinsockStartupCalls() == 1);
    TEST_ASSERT(AgentTestGetWinsockCleanupCalls() == 0);
    TEST_ASSERT(BeaconTestTraceHas(BeaconTestGetTrace(), BEACON_TEST_EVENT_CONTEXT_FREE));
}
