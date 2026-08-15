#include "beacon_outbox.h"

#ifdef BEACON_TEST
#include "beacon_test_hooks.h"
#endif

#define OUTBOX_MAX_PACKETS 1024
#define OUTBOX_MAX_BYTES   (64 * 1024 * 1024)

/*
 * OutboxInit - 初始化发件箱临界区并清空队列。
 */
VOID OutboxInit(Outbox* outbox)
{
    InitializeCriticalSection(&outbox->lock);
    outbox->head = NULL;
    outbox->tail = NULL;
    outbox->count = 0;
    outbox->bytes = 0;
}

/*
 * OutboxFreeNode - 释放单个发件箱节点的内存。
 */
VOID OutboxFreeNode(OutboxNode* node)
{
    if (!node) return;

    BbFree(&node->packet);
    HeapFree(GetProcessHeap(), 0, node);
}

/*
 * OutboxFree - 排空并释放所有排队的数据包，然后销毁锁。
 */
VOID OutboxFree(Outbox* outbox)
{
    OutboxNode* n = outbox->head;

    /* 遍历链表并释放每个节点 */
    while (n) {
        OutboxNode* next = n->next;
        OutboxFreeNode(n);
        n = next;
    }

    outbox->head = NULL;
    outbox->tail = NULL;
    outbox->count = 0;
    outbox->bytes = 0;
    DeleteCriticalSection(&outbox->lock);
}

/*
 * OutboxEnqueue - 将数据包追加到发件箱队列尾部。
 *   超过上限时丢弃当前数据包；分配失败时也释放。
 */
VOID OutboxEnqueue(Outbox* outbox, ByteBuf packet)
{
    OutboxNode* n = (OutboxNode*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(OutboxNode));

    /* 分配失败：丢弃数据包以避免内存泄漏 */
    if (!n) {
        BbFree(&packet);
        return;
    }

    n->packet = packet;

    EnterCriticalSection(&outbox->lock);
    if (outbox->count >= OUTBOX_MAX_PACKETS ||
        packet.len > OUTBOX_MAX_BYTES ||
        outbox->bytes > OUTBOX_MAX_BYTES - packet.len) {
        LeaveCriticalSection(&outbox->lock);
        OutboxFreeNode(n);
        return;
    }

    /* O(1) 追加到队尾 */
    if (outbox->tail) {
        outbox->tail->next = n;
    } else {
        outbox->head = n;
    }
    outbox->tail = n;
    ++outbox->count;
    outbox->bytes += packet.len;
#ifdef BEACON_TEST
    BeaconTestRecord(BEACON_TEST_EVENT_OUTBOX_ENQUEUE, 0, (ULONG)packet.len);
#endif
    LeaveCriticalSection(&outbox->lock);
}

/*
 * OutboxDrain - 原子地分离并返回整个队列。
 *   调用后发件箱为空；调用方拥有所有返回的节点。
 */
OutboxNode* OutboxDrain(Outbox* outbox)
{
    OutboxNode* list;

    EnterCriticalSection(&outbox->lock);
    list = outbox->head;
    outbox->head = NULL;
    outbox->tail = NULL;
    outbox->count = 0;
    outbox->bytes = 0;
    LeaveCriticalSection(&outbox->lock);

    return list;
}

/*
 * OutboxPushFrontList - 将先前排空的列表前置到队列前端。
 *   遍历在锁外完成（传入列表归调用方所有）。
 *   回塞不受 OUTBOX_MAX_* 限制，保证已排队结果不丢失。
 */
VOID OutboxPushFrontList(Outbox* outbox, OutboxNode* list)
{
    OutboxNode* tail;
    SIZE_T count = 1;
    SIZE_T bytes;

    if (!list) return;

    /* 锁外遍历：list 归调用方所有，无需持锁 */
    tail = list;
    bytes = tail->packet.len;
    while (tail->next) {
        tail = tail->next;
        ++count;
        bytes += tail->packet.len;
    }

    /* 拼接到队首 */
    EnterCriticalSection(&outbox->lock);
    tail->next = outbox->head;
    outbox->head = list;
    if (!outbox->tail) {
        outbox->tail = tail;
    }
    outbox->count += count;
    outbox->bytes += bytes;
    LeaveCriticalSection(&outbox->lock);
}
