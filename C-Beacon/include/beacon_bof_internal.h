#pragma once

#include "beacon_bof.h"

struct BofJobRuntime {
    BeaconContext* ctx;             /* 关联的 Beacon 上下文 */
    BeaconJob* job;                 /* 关联的 Job */
    HANDLE stop_event;              /* 取消事件句柄 */
    HANDLE entry_thread;            /* BOF 入口线程句柄 */
    DWORD entry_thread_id;          /* BOF 入口线程 ID */
    volatile LONG entry_started;    /* 入口线程已启动标志 */
    volatile LONG entry_done;       /* 入口线程已完成标志 */
    CRITICAL_SECTION lock;          /* 保护线程句柄的锁 */

    DWORD bss_entry_count;          /* BSS 段符号计数 */
    DWORD bss_entry_capacity;       /* BSS 段偏移表容量 */
    BSSEntry* bss_entries;          /* BSS 段偏移表 */
    COFFAPIFUNC ldr_api[16];        /* 延迟初始化的 Ldr API 表 */
    CHAR last_error[256];           /* 当前 BOF 最后错误信息 */

    volatile LONG exception_seen;   /* BOF 入口异常标志 */
    DWORD exception_code;           /* BOF 入口异常代码 */
    PVOID exception_address;        /* BOF 入口异常地址 */

    PVOID image_base;               /* BOF 映射基址，用于返回地址反查 */
    SIZE_T image_size;              /* BOF 映射大小 */
    INT registered;                 /* 是否已加入活跃 BOF 注册表 */
    struct BofJobRuntime* next;     /* 活跃 BOF 注册表链表 */
};

BOOL BofRuntimeEnsureInit(VOID);
VOID BofRuntimeSetCurrent(BofJobRuntime* runtime);
VOID BofRuntimeRegister(BofJobRuntime* runtime, PVOID image_base, SIZE_T image_size);
VOID BofRuntimeUnregister(BofJobRuntime* runtime);
VOID BofRuntimeFree(BofJobRuntime* runtime);

VOID BofSetError(BofJobRuntime* runtime, const CHAR* fmt, ...);
DWORD BofHashString(const CHAR* str, ULONG len, BOOL upper);
SIZE_T BofStrLen(const CHAR* s);
PCHAR BofStrToken(PCHAR str, const PCHAR delim);
PCHAR BofSkipImportThunkPrefix(PCHAR name);
DWORD BofGetImportPrefixSize(PCHAR name);
DWORD BofGetBeaconPrefixSize(PCHAR name);
VOID BofStripStdcallSuffix(PCHAR name);
BOOL BofCopyString(PCHAR dst, SIZE_T dstSize, const CHAR* src);
BOOL BofAppendDllSuffix(PCHAR dst, SIZE_T dstSize);
VOID BofInitLdrApi(BofJobRuntime* runtime, BeaconContext* ctx);
BOOL BofResolveDllProc(BofJobRuntime* runtime, PCHAR moduleName, PCHAR procName, PVOID* procAddr);
BOOL BofResolveCommonProc(BofJobRuntime* runtime, PCHAR procName, PVOID* procAddr);
BOOL BofRun(BeaconContext* ctx, BofJobRuntime* runtime, PCOFFEE pCoffee, PCHAR szEntryPoint,
            PVOID pvArgument, DWORD dwArgSize);
BOOL BofLoadAndRun(BeaconContext* ctx, BofJobRuntime* runtime,
                   PVOID bofBuffer, DWORD bofSize,
                   PVOID argsBuffer, DWORD argsSize,
                   PCHAR entryName);

#if _WIN64
typedef BOOLEAN(WINAPI* BofRtlAddFunctionTable)(PRUNTIME_FUNCTION function_table,
                                                DWORD entry_count,
                                                DWORD64 base_address);
typedef BOOLEAN(WINAPI* BofRtlDeleteFunctionTable)(PRUNTIME_FUNCTION function_table);
#endif
