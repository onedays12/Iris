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

VOID OutboxInit(Outbox* outbox);
VOID OutboxFree(Outbox* outbox);
VOID OutboxEnqueue(Outbox* outbox, ByteBuf packet);
OutboxNode* OutboxDrain(Outbox* outbox);
VOID OutboxPushFrontList(Outbox* outbox, OutboxNode* list);
VOID OutboxFreeNode(OutboxNode* node);
