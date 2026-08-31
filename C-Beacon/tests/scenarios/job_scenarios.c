#include "beacon_test.h"

static DWORD WINAPI BeaconTestWorker(PVOID param)
{
    BeaconJob* job = (BeaconJob*)param;

    if (job && job->cancel_event) {
        WaitForSingleObject(job->cancel_event, INFINITE);
    }
    return 0;
}

VOID BeaconTestScenarioJobShutdown(VOID)
{
    BeaconContext ctx;
    BeaconJob* jobs[65];
    SIZE_T i;

    BeaconTestConfigureRandomFailure(0);
    TEST_ASSERT(ContextInit(&ctx));
    ZeroMemory(jobs, sizeof(jobs));
    for (i = 0; i < 65; ++i) {
        jobs[i] = JobCreate(&ctx, (UINT32)(2000 + i), 0, JOB_TYPE_PROCESS, "test");
        TEST_ASSERT(jobs[i] != NULL);
        if (jobs[i]) {
            TEST_ASSERT(JobStartThread(jobs[i], BeaconTestWorker, jobs[i]));
        }
    }

    ContextFree(&ctx);
    TEST_ASSERT(BeaconTestTraceHas(BeaconTestGetTrace(), BEACON_TEST_EVENT_JOB_CREATED));
    TEST_ASSERT(BeaconTestTraceHas(BeaconTestGetTrace(), BEACON_TEST_EVENT_JOB_THREAD_STARTED));

    /* NULL 取消探测必须视为编程错误返回 FALSE，而非伪装成“已取消” */
    TEST_ASSERT(!JobIsCancelRequested(NULL));
}
