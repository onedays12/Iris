package core

import "sync"

const (
	outboxMaxPackets = 1024             // 队列最大包数
	outboxMaxBytes   = 64 * 1024 * 1024 // 队列最大字节数（64MB）
)

// OutboxNode 是 Outbox 链表中的一个节点，持有一个待发送的数据包。
type OutboxNode struct {
	packet []byte
	next   *OutboxNode
}

// Outbox 是线程安全的单链表队列，用于缓存待发送的结果包。
// 主循环每次心跳时 Drain 全部节点，加密后逐个发送；失败的节点通过 PushFrontList 回退。
type Outbox struct {
	mu    sync.Mutex
	head  *OutboxNode
	tail  *OutboxNode
	count int
	bytes int
}

// Init 初始化 Outbox 队列，清空所有节点和计数器。
func (o *Outbox) Init() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.head = nil
	o.tail = nil
	o.count = 0
	o.bytes = 0
}

// Free 释放 Outbox 中的所有节点并重置队列。
func (o *Outbox) Free() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.head = nil
	o.tail = nil
	o.count = 0
	o.bytes = 0
}

// Enqueue 将一个数据包追加到队列尾部。
// 超出容量限制（包数或字节数）时静默丢弃。
func (o *Outbox) Enqueue(packet []byte) {
	if len(packet) == 0 {
		return
	}

	n := &OutboxNode{packet: packet}

	o.mu.Lock()
	defer o.mu.Unlock()
	if o.count >= outboxMaxPackets ||
		len(packet) > outboxMaxBytes ||
		o.bytes > outboxMaxBytes-len(packet) {
		return
	}

	if o.tail != nil {
		o.tail.next = n
	} else {
		o.head = n
	}
	o.tail = n
	o.count++
	o.bytes += len(packet)
}

// Drain 取出队列中的所有节点并清空队列，返回链表头指针。
func (o *Outbox) Drain() *OutboxNode {
	o.mu.Lock()
	defer o.mu.Unlock()

	list := o.head
	o.head = nil
	o.tail = nil
	o.count = 0
	o.bytes = 0
	return list
}

// PushFrontList 将一条链表整体插入队列头部（用于发送失败时回退未发送的包）。
func (o *Outbox) PushFrontList(list *OutboxNode) {
	if list == nil {
		return
	}

	tail := list
	count := 1
	bytes := len(tail.packet)
	for tail.next != nil {
		tail = tail.next
		count++
		bytes += len(tail.packet)
	}

	o.mu.Lock()
	defer o.mu.Unlock()
	tail.next = o.head
	o.head = list
	if o.tail == nil {
		o.tail = tail
	}
	o.count += count
	o.bytes += bytes
}
