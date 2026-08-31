/*
 * beacon_test_events.h - BEACON_TEST 事件常量的唯一事实源。
 *
 * 生产代码（#ifdef BEACON_TEST 下）经 beacon_test_hooks.h 引用这些宏发送事件；
 * 测试框架（beacon_test.h）引用同一份定义做断言。禁止在其它头文件中
 * 重复定义同名的常量或枚举——双表人肉同步是静默串号的温床。
 */
#pragma once

#define BEACON_TEST_EVENT_CONTEXT_INIT_BEGIN   1u
#define BEACON_TEST_EVENT_CONTEXT_INIT_FAILED  2u
#define BEACON_TEST_EVENT_WSA_STARTUP          3u
#define BEACON_TEST_EVENT_AGENT_RUN_BEGIN      4u
#define BEACON_TEST_EVENT_JOB_CREATED          5u
#define BEACON_TEST_EVENT_JOB_THREAD_STARTED   6u
#define BEACON_TEST_EVENT_JOB_COMPLETE         7u
#define BEACON_TEST_EVENT_OUTBOX_ENQUEUE       8u
#define BEACON_TEST_EVENT_CONTEXT_FREE         9u

VOID BeaconTestRecord(unsigned int type, UINT32 id, ULONG value);
