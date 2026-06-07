#pragma once

#include "beacon_context.h"

/* Beacon 代理主结构体，持有上下文和运行状态 */
typedef struct Agent {
    BeaconContext ctx;          /* beacon 核心上下文 */
    WSADATA wsa;               /* Winsock 初始化数据 */
    volatile LONG stop;        /* 停止信号（原子操作） */
    INT initialized;           /* 是否已初始化 */
    INT wsa_started;           /* Winsock 是否已启动 */
} Agent;

/* 初始化代理：加载配置、收集系统信息、初始化加密 */
INT AgentInit(Agent* agent);

/* 运行代理主循环（根据 listener_type 分发到 external/internal） */
INT AgentRun(Agent* agent);

/* 请求代理停止（设置停止标志） */
VOID AgentStop(Agent* agent);

/* 释放代理资源 */
VOID AgentFree(Agent* agent);
