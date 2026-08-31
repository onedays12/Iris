package core

import (
	"beacon/pkg/command"
	"beacon/pkg/utils/crypt"
	"beacon/pkg/utils/packet"
	"bytes"
	"testing"
)

// TestFlushOutboxBatchSendsAllPacketsInOneExchange 验证批量回传：
// 多个 outbox 包拼接为一次加密负载、一次 Exchange 发送，且内容完整。
func TestFlushOutboxBatchSendsAllPacketsInOneExchange(t *testing.T) {
	ctx := &Context{
		SessionKey: bytes.Repeat([]byte{0x41}, sessionKeySize),
	}
	ctx.Outbox.Init()

	handler := command.NewHandler(0)
	defer handler.Close()

	heartbeat := []byte("heartbeat-envelope")
	pktA := packet.MakeFinalPacket(1, command.CommandWhoami, []byte("result-a"))
	pktB := packet.MakeFinalPacket(2, command.CommandWhoami, []byte("result-b"))
	pktC := packet.MakeFinalPacket(3, command.CommandWhoami, []byte("result-c"))
	ctx.Outbox.Enqueue(pktA)
	ctx.Outbox.Enqueue(pktB)
	ctx.Outbox.Enqueue(pktC)

	transport := &stubTransport{}
	agent := &Agent{
		Ctx:     ctx,
		client:  transport,
		handler: handler,
	}

	agent.flushOutbox(heartbeat)

	if transport.calls != 1 {
		t.Fatalf("exchange calls = %d, want 1 (batched)", transport.calls)
	}
	if !bytes.Equal(transport.metadata[0], heartbeat) {
		t.Fatalf("metadata = %q, want %q", transport.metadata[0], heartbeat)
	}

	sentPlain, err := crypt.DecryptResult(ctx.SessionKey, transport.payloads[0])
	if err != nil {
		t.Fatalf("decrypt sent result: %v", err)
	}
	want := append(append(append([]byte(nil), pktA...), pktB...), pktC...)
	if !bytes.Equal(sentPlain, want) {
		t.Fatalf("batched plain mismatch: got %d bytes, want %d", len(sentPlain), len(want))
	}

	if pending := ctx.Outbox.Drain(); pending != nil {
		t.Fatalf("outbox not empty after successful batch flush")
	}
}

// TestFlushOutboxBatchRequeuesOnSendFailure 验证批量发送失败时整批回塞队列头部，
// 不丢包（下一 tick 重试）。
func TestFlushOutboxBatchRequeuesOnSendFailure(t *testing.T) {
	ctx := &Context{
		SessionKey: bytes.Repeat([]byte{0x41}, sessionKeySize),
	}
	ctx.Outbox.Init()

	handler := command.NewHandler(0)
	defer handler.Close()

	pktA := packet.MakeFinalPacket(1, command.CommandWhoami, []byte("result-a"))
	pktB := packet.MakeFinalPacket(2, command.CommandWhoami, []byte("result-b"))
	ctx.Outbox.Enqueue(pktA)
	ctx.Outbox.Enqueue(pktB)

	transport := &failTransport{}
	agent := &Agent{
		Ctx:     ctx,
		client:  transport,
		handler: handler,
	}

	agent.flushOutbox([]byte("heartbeat-envelope"))

	pending := ctx.Outbox.Drain()
	count := 0
	got := make([][]byte, 0)
	for cur := pending; cur != nil; cur = cur.next {
		count++
		got = append(got, cur.packet)
	}
	if count != 2 {
		t.Fatalf("requeued packets = %d, want 2", count)
	}
	if !bytes.Equal(got[0], pktA) || !bytes.Equal(got[1], pktB) {
		t.Fatalf("requeued order/content mismatch")
	}
}

type failTransport struct{}

func (s *failTransport) Exchange(metadata []byte, payload []byte) ([]byte, error) {
	return nil, bytes.ErrTooLarge
}
