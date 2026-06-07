package command

import (
	"beacon/pkg/utils/packet"
	"net"
	"testing"
	"time"
)

func resetTunnelRuntimeForTest() {
	tunnelRuntime.mu.Lock()
	defer tunnelRuntime.mu.Unlock()
	tunnelRuntime.channels = make(map[string]*TunnelChannel)
	tunnelRuntime.controlPackets = nil
	tunnelRuntime.dataPackets = nil
}

func parseFinalPacketForTest(t *testing.T, pkt []byte) (uint32, []byte) {
	t.Helper()
	outer := packet.CreateParser(pkt)
	body := outer.ParseBytes()
	if outer.HasError() {
		t.Fatalf("parse outer final packet: %v", outer.Error())
	}

	inner := packet.CreateParser(body)
	_ = inner.ParseInt32()
	commandID := inner.ParseInt32()
	payload := inner.ParseBytes()
	if inner.HasError() {
		t.Fatalf("parse inner final packet: %v", inner.Error())
	}
	return commandID, payload
}

func waitForPendingPackets(t *testing.T) [][]byte {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if pkts := tunnelRuntime.GetPendingPackets(); len(pkts) > 0 {
			return pkts
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for pending tunnel packet")
	return nil
}

func TestTunnelStartRoundTripPreservesUDPProto(t *testing.T) {
	payload, err := PackTunnelStart(TunnelStart{
		Mode:             TunnelModeSOCKS5,
		TunnelID:         "tunnel-1",
		ChannelID:        "channel-1",
		Proto:            "udp",
		TargetAddress:    "127.0.0.1:53",
		ConnectTimeoutMS: 1500,
	})
	if err != nil {
		t.Fatalf("PackTunnelStart returned error: %v", err)
	}

	got, err := ParseTunnelStart(packet.CreateParser(payload))
	if err != nil {
		t.Fatalf("ParseTunnelStart returned error: %v", err)
	}
	if got.Proto != "udp" {
		t.Fatalf("proto = %q, want udp", got.Proto)
	}
	if got.TargetAddress != "127.0.0.1:53" {
		t.Fatalf("target = %q, want 127.0.0.1:53", got.TargetAddress)
	}
}

func TestTunnelRuntimeKeysByTunnelAndChannel(t *testing.T) {
	resetTunnelRuntimeForTest()
	a1, b1 := net.Pipe()
	defer b1.Close()
	a2, b2 := net.Pipe()
	defer b2.Close()

	ch1 := &TunnelChannel{
		TunnelID:   "tunnel-a",
		ChannelID:  "shared-channel",
		Proto:      "tcp",
		TargetConn: a1,
		CreatedAt:  time.Now(),
	}
	ch2 := &TunnelChannel{
		TunnelID:   "tunnel-b",
		ChannelID:  "shared-channel",
		Proto:      "tcp",
		TargetConn: a2,
		CreatedAt:  time.Now(),
	}

	if err := tunnelRuntime.Add(ch1); err != nil {
		t.Fatalf("add ch1: %v", err)
	}
	if err := tunnelRuntime.Add(ch2); err != nil {
		t.Fatalf("add ch2 with same channel id in another tunnel: %v", err)
	}
	if _, ok := tunnelRuntime.Get("tunnel-a", "shared-channel"); !ok {
		t.Fatalf("expected tunnel-a/shared-channel")
	}
	if _, ok := tunnelRuntime.Get("wrong-tunnel", "shared-channel"); ok {
		t.Fatalf("lookup must include tunnel id")
	}
	if err := tunnelRuntime.Add(&TunnelChannel{TunnelID: "tunnel-a", ChannelID: "shared-channel"}); err != errTunnelChannelDuplicate {
		t.Fatalf("duplicate same tunnel/channel error = %v", err)
	}
}

func TestTunnelPendingPacketsControlBeforeData(t *testing.T) {
	resetTunnelRuntimeForTest()

	sendDataPacket("tunnel-1", "channel-1", []byte("payload"))
	sendControlPacket("tunnel-1", "channel-1", "close", TunnelReasonCanceled, nil)

	pkts := tunnelRuntime.GetPendingPackets()
	if len(pkts) != 2 {
		t.Fatalf("pending packets = %d, want 2", len(pkts))
	}
	commandID, _ := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandTunnelControl {
		t.Fatalf("first pending command id = %d, want control", commandID)
	}
	commandID, _ = parseFinalPacketForTest(t, pkts[1])
	if commandID != CommandTunnelData {
		t.Fatalf("second pending command id = %d, want data", commandID)
	}
}

func TestCancelTunnelJobRemovesChannelAndSendsClose(t *testing.T) {
	resetTunnelRuntimeForTest()
	a, b := net.Pipe()
	defer b.Close()

	ch := &TunnelChannel{
		OriginalTaskID: 9001,
		TunnelID:       "tunnel-1",
		ChannelID:      "channel-1",
		Proto:          "tcp",
		TargetConn:     a,
		CreatedAt:      time.Now(),
	}
	if err := tunnelRuntime.Add(ch); err != nil {
		t.Fatalf("add tunnel channel: %v", err)
	}

	msg, ok := CancelTunnelJob(9001)
	if !ok || msg == "" {
		t.Fatalf("cancel tunnel job failed: ok=%v msg=%q", ok, msg)
	}
	if _, ok := tunnelRuntime.Get("tunnel-1", "channel-1"); ok {
		t.Fatalf("channel still exists after cancel")
	}

	pkts := tunnelRuntime.GetPendingPackets()
	if len(pkts) != 1 {
		t.Fatalf("pending packets = %d, want 1", len(pkts))
	}
	commandID, payload := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandTunnelControl {
		t.Fatalf("command id = %d, want control", commandID)
	}
	ctrl, err := ParseTunnelControl(packet.CreateParser(payload))
	if err != nil {
		t.Fatalf("ParseTunnelControl: %v", err)
	}
	if ctrl.Action != "close" || ctrl.Reason != "error_8" {
		t.Fatalf("control = %#v, want close/error_8", ctrl)
	}
}

func TestPipeMultiplexedUDPStopsAfterFirstDatagram(t *testing.T) {
	resetTunnelRuntimeForTest()
	targetSide, writerSide := net.Pipe()
	defer writerSide.Close()

	ch := &TunnelChannel{
		TunnelID:   "tunnel-1",
		ChannelID:  "channel-1",
		Proto:      "udp",
		TargetConn: targetSide,
		CreatedAt:  time.Now(),
	}
	ch.TouchLastSeen(time.Now())

	done := make(chan struct{})
	go func() {
		pipeMultiplexed(t.Context(), ch)
		close(done)
	}()

	if _, err := writerSide.Write([]byte("udp-response")); err != nil {
		t.Fatalf("write udp response: %v", err)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("pipeMultiplexed did not stop after first UDP datagram")
	}

	pkts := waitForPendingPackets(t)
	commandID, payload := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandTunnelData {
		t.Fatalf("command id = %d, want %d", commandID, CommandTunnelData)
	}
	data, err := ParseTunnelData(packet.CreateParser(payload))
	if err != nil {
		t.Fatalf("ParseTunnelData returned error: %v", err)
	}
	if string(data.Data) != "udp-response" {
		t.Fatalf("data = %q, want udp-response", string(data.Data))
	}
}

func TestPipeMultiplexedUDPIdleTimeoutSendsClose(t *testing.T) {
	resetTunnelRuntimeForTest()
	targetSide, writerSide := net.Pipe()
	defer writerSide.Close()

	ch := &TunnelChannel{
		TunnelID:   "tunnel-1",
		ChannelID:  "channel-1",
		Proto:      "udp",
		TargetConn: targetSide,
		CreatedAt:  time.Now(),
	}
	ch.TouchLastSeen(time.Now().Add(-tunnelUDPIdleTimeout - time.Second))

	done := make(chan struct{})
	go func() {
		pipeMultiplexed(t.Context(), ch)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("pipeMultiplexed did not stop after UDP idle timeout")
	}

	pkts := waitForPendingPackets(t)
	commandID, payload := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandTunnelControl {
		t.Fatalf("command id = %d, want %d", commandID, CommandTunnelControl)
	}
	ctrl, err := ParseTunnelControl(packet.CreateParser(payload))
	if err != nil {
		t.Fatalf("ParseTunnelControl returned error: %v", err)
	}
	if ctrl.Action != "close" || ctrl.Reason != "error_4" {
		t.Fatalf("control = %#v, want close/error_4", ctrl)
	}
}
