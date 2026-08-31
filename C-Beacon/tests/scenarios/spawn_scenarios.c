#include "beacon_test.h"
#include "beacon_spawn.h"

/*
 * spawn_scenarios.c -- 统一进程创建入口（PPID 欺骗）测试。
 *
 * 用 mock Win32Api 驱动 SpawnCreateProcess 分支，不真正创建进程：
 *  - ppid=0：直通 CreateProcessW（零 attribute list 开销）；
 *  - ppid>0：NtOpenProcess -> 两段式 Initialize -> Update -> CreateProcessW
 *    （EXTENDED_STARTUPINFO_PRESENT + STARTUPINFOEXW）-> Delete；
 *  - OpenProcess 失败：fallback_plain 回退直通 / 严格模式返回失败；
 *  - CreateProcessW 失败：回退重试一次。
 */

/* ===== mock Win32Api ===== */

static UINT32 g_mock_ppid_seen;
static ACCESS_MASK g_mock_open_access;
static BOOL g_mock_open_fail;
static INT g_mock_cpw_calls;
static BOOL g_mock_cpw_result;
static BOOL g_mock_cpw_fail_once;
static DWORD g_mock_cpw_flags;
static ULONG g_mock_si_cb;
static PVOID g_mock_attr_list;
static INT g_mock_attr_init_calls;
static INT g_mock_attr_update_calls;
static INT g_mock_attr_delete_calls;
static HANDLE g_mock_attr_parent_value;
static INT g_mock_dup_calls;
static INT g_mock_dup_close_calls;
static HANDLE g_mock_si_std_in;
static HANDLE g_mock_si_std_out;
static HANDLE g_mock_si_std_err;

static NTSTATUS NTAPI MockNtOpenProcess(PHANDLE ProcessHandle, ACCESS_MASK DesiredAccess,
                                        POBJECT_ATTRIBUTES ObjectAttributes, PCLIENT_ID ClientId)
{
    (VOID)ObjectAttributes;

    g_mock_open_access = DesiredAccess;
    if (g_mock_open_fail) {
        return (NTSTATUS)0xC0000022L;   /* STATUS_ACCESS_DENIED */
    }
    g_mock_ppid_seen = (UINT32)(ULONG_PTR)ClientId->UniqueProcess;
    if (ProcessHandle) {
        *ProcessHandle = (HANDLE)(ULONG_PTR)0x12340000u;
    }
    return 0;
}

static BOOL WINAPI MockCreateProcessW(LPCWSTR app, LPWSTR cmdline,
                                      LPSECURITY_ATTRIBUTES pa, LPSECURITY_ATTRIBUTES ta,
                                      BOOL inherit, DWORD flags, LPVOID env, LPCWSTR cwd,
                                      LPSTARTUPINFOW si, LPPROCESS_INFORMATION pi)
{
    (VOID)app; (VOID)cmdline; (VOID)pa; (VOID)ta;
    (VOID)inherit; (VOID)env; (VOID)cwd;

    ++g_mock_cpw_calls;
    g_mock_cpw_flags = flags;
    g_mock_si_cb = si ? si->cb : 0;
    g_mock_attr_list = si ? ((LPSTARTUPINFOEXW)si)->lpAttributeList : NULL;
    g_mock_si_std_in = si ? si->hStdInput : NULL;
    g_mock_si_std_out = si ? si->hStdOutput : NULL;
    g_mock_si_std_err = si ? si->hStdError : NULL;

    if (g_mock_cpw_fail_once) {
        g_mock_cpw_fail_once = FALSE;
        return FALSE;
    }
    if (pi) {
        ZeroMemory(pi, sizeof(*pi));
        pi->hProcess = (HANDLE)(ULONG_PTR)0x22220000u;
        pi->hThread = (HANDLE)(ULONG_PTR)0x22220001u;
        pi->dwProcessId = 0x2222u;
    }
    return g_mock_cpw_result;
}

static BOOL WINAPI MockInitializeProcThreadAttributeList(LPPROCESS_THREAD_ATTRIBUTE_LIST list,
                                                         DWORD count, DWORD flags, PSIZE_T size)
{
    (VOID)count;
    (VOID)flags;

    ++g_mock_attr_init_calls;
    if (!list) {
        if (size) *size = 4 * sizeof(SIZE_T);   /* 两段式第一段：返回所需大小 */
        return TRUE;
    }
    return TRUE;
}

static BOOL WINAPI MockUpdateProcThreadAttribute(LPPROCESS_THREAD_ATTRIBUTE_LIST list,
                                                 DWORD flags, DWORD_PTR attr, PVOID value,
                                                 SIZE_T size, PVOID prev, PSIZE_T ret)
{
    (VOID)list;
    (VOID)flags;
    (VOID)size;
    (VOID)prev;
    (VOID)ret;

    ++g_mock_attr_update_calls;
    g_mock_attr_parent_value = value ? *(HANDLE*)value : NULL;
    TEST_ASSERT(attr == (DWORD_PTR)PROC_THREAD_ATTRIBUTE_PARENT_PROCESS);
    return TRUE;
}

static VOID WINAPI MockDeleteProcThreadAttributeList(LPPROCESS_THREAD_ATTRIBUTE_LIST list)
{
    (VOID)list;
    ++g_mock_attr_delete_calls;
}

static BOOL WINAPI MockDuplicateHandle(HANDLE src_proc, HANDLE src, HANDLE dst_proc,
                                       LPHANDLE dst, DWORD access, BOOL inherit, DWORD options)
{
    (VOID)src_proc;
    (VOID)dst_proc;
    (VOID)access;
    (VOID)inherit;

    if (options & DUPLICATE_CLOSE_SOURCE) {
        ++g_mock_dup_close_calls;
        if (dst) *dst = (HANDLE)(ULONG_PTR)0xBEEFu;
        return TRUE;
    }
    ++g_mock_dup_calls;
    if (dst) {
        *dst = (HANDLE)((ULONG_PTR)src + 0x10000u + (ULONG_PTR)g_mock_dup_calls);
    }
    return TRUE;
}

static HANDLE WINAPI MockGetCurrentProcess(VOID)
{
    return (HANDLE)(ULONG_PTR)(LONG_PTR)-1;
}

static VOID SpawnMockReset(VOID)
{
    g_mock_ppid_seen = 0;
    g_mock_open_access = 0;
    g_mock_open_fail = FALSE;
    g_mock_cpw_calls = 0;
    g_mock_cpw_result = TRUE;
    g_mock_cpw_fail_once = FALSE;
    g_mock_cpw_flags = 0;
    g_mock_si_cb = 0;
    g_mock_attr_list = NULL;
    g_mock_attr_init_calls = 0;
    g_mock_attr_update_calls = 0;
    g_mock_attr_delete_calls = 0;
    g_mock_attr_parent_value = NULL;
    g_mock_dup_calls = 0;
    g_mock_dup_close_calls = 0;
    g_mock_si_std_in = NULL;
    g_mock_si_std_out = NULL;
    g_mock_si_std_err = NULL;
}

/* 构造带 mock 槽位的 api 表 */
static VOID SpawnMockApi(Win32Api* api)
{
    ZeroMemory(api, sizeof(*api));
    api->pfnNtOpenProcess = (fnNtOpenProcess)MockNtOpenProcess;
    api->pfnCreateProcessW = (fnCreateProcessW)MockCreateProcessW;
    api->pfnInitializeProcThreadAttributeList =
        (fnInitializeProcThreadAttributeList)MockInitializeProcThreadAttributeList;
    api->pfnUpdateProcThreadAttribute =
        (fnUpdateProcThreadAttribute)MockUpdateProcThreadAttribute;
    api->pfnDeleteProcThreadAttributeList =
        (fnDeleteProcThreadAttributeList)MockDeleteProcThreadAttributeList;
}

/* ===== 场景 1：ppid=0 直通，零 attribute list 开销 ===== */

VOID BeaconTestScenarioSpawnNoPpid(VOID)
{
    Win32Api api;
    SpawnOptions opt;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    WCHAR cmdline[] = L"cmd.exe /c whoami";

    SpawnMockReset();
    SpawnMockApi(&api);
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    ZeroMemory(&pi, sizeof(pi));

    ZeroMemory(&opt, sizeof(opt));
    opt.ppid = 0;                        /* 不欺骗 */
    opt.fallback_plain = TRUE;

    TEST_ASSERT(SpawnCreateProcess(&api, &opt, NULL, cmdline, NULL, NULL, TRUE,
                                   CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                                   NULL, 0));
    TEST_ASSERT(g_mock_cpw_calls == 1);
    TEST_ASSERT((g_mock_cpw_flags & EXTENDED_STARTUPINFO_PRESENT) == 0);
    TEST_ASSERT(g_mock_si_cb == sizeof(STARTUPINFOW));
    TEST_ASSERT(g_mock_attr_init_calls == 0);
    TEST_ASSERT(g_mock_attr_update_calls == 0);
    TEST_ASSERT(g_mock_attr_delete_calls == 0);
}

/* ===== 场景 2：ppid>0 完整欺骗链路 ===== */

VOID BeaconTestScenarioSpawnPpidSpoofed(VOID)
{
    Win32Api api;
    SpawnOptions opt;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    WCHAR cmdline[] = L"cmd.exe /c whoami";

    SpawnMockReset();
    SpawnMockApi(&api);
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    ZeroMemory(&pi, sizeof(pi));

    ZeroMemory(&opt, sizeof(opt));
    opt.ppid = 0x1234u;
    opt.fallback_plain = TRUE;

    TEST_ASSERT(SpawnCreateProcess(&api, &opt, NULL, cmdline, NULL, NULL, TRUE,
                                   CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                                   NULL, 0));
    TEST_ASSERT(g_mock_ppid_seen == 0x1234u);              /* NtOpenProcess 拿到目标 pid */
    TEST_ASSERT(g_mock_attr_init_calls == 2);              /* 两段式 */
    TEST_ASSERT(g_mock_attr_update_calls == 1);
    TEST_ASSERT(g_mock_attr_parent_value == (HANDLE)(ULONG_PTR)0x12340000u);
    TEST_ASSERT(g_mock_attr_delete_calls == 1);
    TEST_ASSERT((g_mock_cpw_flags & EXTENDED_STARTUPINFO_PRESENT) != 0);
    TEST_ASSERT(g_mock_si_cb == sizeof(STARTUPINFOEXW));   /* 升级为 STARTUPINFOEX */
    TEST_ASSERT(g_mock_attr_list != NULL);
    TEST_ASSERT(pi.hProcess == (HANDLE)(ULONG_PTR)0x22220000u);
}

/* ===== 场景 3：OpenProcess 失败 + fallback_plain -> 回退直通 ===== */

VOID BeaconTestScenarioSpawnOpenFailFallback(VOID)
{
    Win32Api api;
    SpawnOptions opt;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    WCHAR cmdline[] = L"cmd.exe /c whoami";

    SpawnMockReset();
    SpawnMockApi(&api);
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));

    ZeroMemory(&opt, sizeof(opt));
    opt.ppid = 0x1234u;
    opt.fallback_plain = TRUE;
    g_mock_open_fail = TRUE;

    TEST_ASSERT(SpawnCreateProcess(&api, &opt, NULL, cmdline, NULL, NULL, TRUE,
                                   CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                                   NULL, 0));
    TEST_ASSERT(g_mock_cpw_calls == 1);                    /* 直通重试 */
    TEST_ASSERT(g_mock_attr_init_calls == 0);              /* 未进入 attribute list */
    TEST_ASSERT(g_mock_attr_delete_calls == 0);
}

/* ===== 场景 4：OpenProcess 失败 + 严格模式 -> 返回失败 ===== */

VOID BeaconTestScenarioSpawnOpenFailStrict(VOID)
{
    Win32Api api;
    SpawnOptions opt;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    CHAR err[128];
    WCHAR cmdline[] = L"cmd.exe /c whoami";

    SpawnMockReset();
    SpawnMockApi(&api);
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));
    ZeroMemory(err, sizeof(err));

    ZeroMemory(&opt, sizeof(opt));
    opt.ppid = 0x1234u;
    opt.fallback_plain = FALSE;
    g_mock_open_fail = TRUE;

    TEST_ASSERT(!SpawnCreateProcess(&api, &opt, NULL, cmdline, NULL, NULL, TRUE,
                                    CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                                    err, sizeof(err)));
    TEST_ASSERT(err[0] != '\0');
    TEST_ASSERT(g_mock_cpw_calls == 0);
    TEST_ASSERT(g_mock_attr_init_calls == 0);
}

/* ===== 场景 6：SpawnApplyProfile 解析（进程名 / 数字 PID / 空） ===== */

static WCHAR g_mock_proc_name[64];
static DWORD g_mock_proc_pid;
static INT g_mock_snap_calls;
static INT g_mock_close_calls;

static HANDLE WINAPI MockCreateToolhelp32Snapshot(DWORD flags, DWORD pid)
{
    (VOID)flags;
    (VOID)pid;
    ++g_mock_snap_calls;
    return (HANDLE)(ULONG_PTR)0x99990000u;
}

static BOOL WINAPI MockProcess32FirstW(HANDLE snap, LPPROCESSENTRY32W pe)
{
    (VOID)snap;
    if (!pe) return FALSE;
    ZeroMemory(pe, sizeof(*pe));
    pe->dwSize = sizeof(*pe);
    pe->th32ProcessID = g_mock_proc_pid;
    wcscpy_s(pe->szExeFile, ARRAYSIZE(pe->szExeFile), g_mock_proc_name);
    return g_mock_proc_name[0] != L'\0';
}

static BOOL WINAPI MockProcess32NextW(HANDLE snap, LPPROCESSENTRY32W pe)
{
    (VOID)snap;
    (VOID)pe;
    return FALSE;
}

static VOID WINAPI MockCloseHandle(HANDLE h)
{
    (VOID)h;
    ++g_mock_close_calls;
}

static VOID SpawnApplyReset(void)
{
    g_mock_proc_name[0] = L'\0';
    g_mock_proc_pid = 0;
    g_mock_snap_calls = 0;
    g_mock_close_calls = 0;
}

VOID BeaconTestScenarioSpawnApplyProfile(VOID)
{
    Win32Api api;

    SpawnApplyReset();
    SpawnMockApi(&api);
    api.pfnCreateToolhelp32Snapshot = (fnCreateToolhelp32Snapshot)MockCreateToolhelp32Snapshot;
    api.pfnProcess32FirstW = (fnProcess32FirstW)MockProcess32FirstW;
    api.pfnProcess32NextW = (fnProcess32NextW)MockProcess32NextW;
    api.pfnCloseHandle = (fnCloseHandle)MockCloseHandle;

    /* 数字 PID */
    TEST_ASSERT(SpawnApplyProfile(&api, "1234") == 1234u);
    TEST_ASSERT(SpawnGetPpid() == 1234u);

    /* 空字符串：不欺骗 */
    TEST_ASSERT(SpawnApplyProfile(&api, "") == 0u);
    TEST_ASSERT(SpawnGetPpid() == 0u);
    TEST_ASSERT(SpawnApplyProfile(&api, NULL) == 0u);

    /* 进程名：mock 快照命中 */
    wcscpy_s(g_mock_proc_name, ARRAYSIZE(g_mock_proc_name), L"explorer.exe");
    g_mock_proc_pid = 0xABCD;
    TEST_ASSERT(SpawnApplyProfile(&api, "explorer.exe") == 0xABCDu);
    TEST_ASSERT(SpawnGetPpid() == 0xABCDu);
    TEST_ASSERT(g_mock_snap_calls == 1);
    TEST_ASSERT(g_mock_close_calls == 1);

    /* 进程名找不到：回退 0（不欺骗） */
    g_mock_proc_name[0] = L'\0';
    TEST_ASSERT(SpawnApplyProfile(&api, "notfound.exe") == 0u);
    TEST_ASSERT(SpawnGetPpid() == 0u);

    /* 非法 spec（含非数字字符且查不到进程）：回退 0 */
    TEST_ASSERT(SpawnApplyProfile(&api, "123abc!") == 0u);
}

/* ===== 场景 5：spoof 创建失败 -> fallback 重试一次 ===== */

VOID BeaconTestScenarioSpawnCreateFailFallback(VOID)
{
    Win32Api api;
    SpawnOptions opt;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    WCHAR cmdline[] = L"cmd.exe /c whoami";

    SpawnMockReset();
    SpawnMockApi(&api);
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));

    ZeroMemory(&opt, sizeof(opt));
    opt.ppid = 0x1234u;
    opt.fallback_plain = TRUE;
    g_mock_cpw_result = TRUE;
    g_mock_cpw_fail_once = TRUE;         /* 第一次（spoof 创建）失败 */

    TEST_ASSERT(SpawnCreateProcess(&api, &opt, NULL, cmdline, NULL, NULL, TRUE,
                                   CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                                   NULL, 0));
    TEST_ASSERT(g_mock_cpw_calls == 2);                    /* spoof 一次 + fallback 一次 */
    TEST_ASSERT(g_mock_attr_delete_calls == 1);            /* attribute list 已清理 */
    TEST_ASSERT(pi.hProcess == (HANDLE)(ULONG_PTR)0x22220000u);
}

/* ===== 场景 7：STARTF_USESTDHANDLES 时把管道句柄 dup 进假父 ===== */

VOID BeaconTestScenarioSpawnPpidStdDup(VOID)
{
    Win32Api api;
    SpawnOptions opt;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    WCHAR cmdline[] = L"cmd.exe /c whoami";
    HANDLE caller_in = (HANDLE)(ULONG_PTR)0x10u;
    HANDLE caller_out = (HANDLE)(ULONG_PTR)0x20u;
    HANDLE caller_err = (HANDLE)(ULONG_PTR)0x30u;

    SpawnMockReset();
    SpawnMockApi(&api);
    api.pfnDuplicateHandle = (fnDuplicateHandle)MockDuplicateHandle;
    api.pfnGetCurrentProcess = (fnGetCurrentProcess)MockGetCurrentProcess;

    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = caller_in;
    si.hStdOutput = caller_out;
    si.hStdError = caller_err;
    ZeroMemory(&pi, sizeof(pi));

    ZeroMemory(&opt, sizeof(opt));
    opt.ppid = 0x1234u;
    opt.fallback_plain = TRUE;

    TEST_ASSERT(SpawnCreateProcess(&api, &opt, NULL, cmdline, NULL, NULL, TRUE,
                                   CREATE_NO_WINDOW, NULL, NULL, &si, &pi,
                                   NULL, 0));
    TEST_ASSERT((g_mock_open_access & PROCESS_DUP_HANDLE) != 0);
    TEST_ASSERT(g_mock_dup_calls == 3);
    TEST_ASSERT(g_mock_dup_close_calls == 3);
    TEST_ASSERT(g_mock_si_std_in != caller_in);
    TEST_ASSERT(g_mock_si_std_out != caller_out);
    TEST_ASSERT(g_mock_si_std_err != caller_err);
    TEST_ASSERT(g_mock_si_std_in != g_mock_si_std_out);
    TEST_ASSERT(g_mock_si_std_out != g_mock_si_std_err);
    TEST_ASSERT((g_mock_cpw_flags & EXTENDED_STARTUPINFO_PRESENT) != 0);
}
