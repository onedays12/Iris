#pragma once

#include "beacon_common.h"

/* 发件箱队列中的单个节点 */
typedef struct OutboxNode {
    ByteBuf packet;
    struct OutboxNode* next;
} OutboxNode;

/* 线程安全的出站数据包队列 */
typedef struct Outbox {
    CRITICAL_SECTION lock;
    OutboxNode* head;
    OutboxNode* tail;
    SIZE_T count;
    SIZE_T bytes;
} Outbox;

/* 初始化发件箱 */
VOID OutboxInit(Outbox* outbox);

/* 释放发件箱及所有节点 */
VOID OutboxFree(Outbox* outbox);

/* 入队一个数据包（超限或分配失败时丢弃） */
VOID OutboxEnqueue(Outbox* outbox, ByteBuf packet);

/* 原子取出所有待发数据包（调用方负责释放节点） */
OutboxNode* OutboxDrain(Outbox* outbox);

/* 将先前取出的列表重新前置到队列前端（回塞不受限） */
VOID OutboxPushFrontList(Outbox* outbox, OutboxNode* list);

/* 释放单个节点及其数据包 */
VOID OutboxFreeNode(OutboxNode* node);
