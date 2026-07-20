package command

import (
	"beacon/pkg/cascade"
	"beacon/pkg/utils/packet"
	"net"
	"testing"
	"time"
)

func waitForCascadePackets(t *testing.T, manager *CascadeManager) [][]byte {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if pkts := manager.GetPendingPackets(); len(pkts) > 0 {
			return pkts
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for cascade packets")
	return nil
}

func TestCascadeConnectTCPQueuesOpenAndRouteWritesTask(t *testing.T) {
	manager := NewCascadeManager()
	defer manager.Close()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	taskSeen := make(chan []byte, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		helloBody, _ := packet.PackArray([]any{
			"child-1",
			packet.PackBytes([]byte("hello-heartbeat")),
		})
		_ = cascade.WriteFrame(conn, cascade.FrameHello, helloBody)

		cmd, body, err := cascade.ReadFrame(conn)
		if err != nil || cmd != cascade.FrameTask {
			return
		}
		taskSeen <- body

		_ = cascade.WriteFrame(conn, cascade.FrameResult, []byte("child-result"))
	}()

	connectPayload, err := packet.PackArray([]any{
		int32(3),
		"requested-child",
		"127.0.0.1",
		int32(ln.Addr().(*net.TCPAddr).Port),
	})
	if err != nil {
		t.Fatalf("pack connect payload: %v", err)
	}
	if _, err := manager.ConnectTCP(packet.CreateParser(connectPayload)); err != nil {
		t.Fatalf("ConnectTCP returned error: %v", err)
	}

	pkts := waitForCascadePackets(t, manager)
	if len(pkts) != 1 {
		t.Fatalf("pending packets = %d, want 1", len(pkts))
	}
	commandID, payload := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandCascadeOpen {
		t.Fatalf("command id = %d, want %d", commandID, CommandCascadeOpen)
	}
	p := packet.CreateParser(payload)
	childID := p.ParseString()
	proto := p.ParseString()
	hint := p.ParseString()
	heartbeat := p.ParseBytes()
	if p.HasError() {
		t.Fatalf("parse cascade open payload: %v", p.Error())
	}
	if childID != "child-1" || proto != "tcp" || hint == "" || string(heartbeat) != "hello-heartbeat" {
		t.Fatalf("unexpected open payload: child=%q proto=%q hint=%q heartbeat=%q", childID, proto, hint, string(heartbeat))
	}

	routePayload, err := packet.PackArray([]any{
		"child-1",
		packet.PackBytes([]byte("task-body")),
	})
	if err != nil {
		t.Fatalf("pack route payload: %v", err)
	}
	if _, err := manager.Route(packet.CreateParser(routePayload)); err != nil {
		t.Fatalf("Route returned error: %v", err)
	}

	select {
	case body := <-taskSeen:
		if string(body) != "task-body" {
			t.Fatalf("task body = %q, want task-body", string(body))
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for routed task")
	}

	pkts = waitForCascadePackets(t, manager)
	commandID, payload = parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandCascadeRead {
		t.Fatalf("command id = %d, want %d", commandID, CommandCascadeRead)
	}
	p = packet.CreateParser(payload)
	childID = p.ParseString()
	result := p.ParseBytes()
	if p.HasError() {
		t.Fatalf("parse cascade read payload: %v", p.Error())
	}
	if childID != "child-1" || string(result) != "child-result" {
		t.Fatalf("unexpected read payload: child=%q result=%q", childID, string(result))
	}
}

func TestCascadeConnectTCPSupportsHostPortOnly(t *testing.T) {
	manager := NewCascadeManager()
	defer manager.Close()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		helloBody, _ := packet.PackArray([]any{
			"child-2",
			packet.PackBytes([]byte("heartbeat-2")),
		})
		_ = cascade.WriteFrame(conn, cascade.FrameHello, helloBody)
	}()

	connectPayload, err := packet.PackArray([]any{
		int32(2),
		"127.0.0.1",
		int32(ln.Addr().(*net.TCPAddr).Port),
	})
	if err != nil {
		t.Fatalf("pack connect payload: %v", err)
	}
	if _, err := manager.ConnectTCP(packet.CreateParser(connectPayload)); err != nil {
		t.Fatalf("ConnectTCP returned error: %v", err)
	}

	pkts := waitForCascadePackets(t, manager)
	if len(pkts) != 1 {
		t.Fatalf("pending packets = %d, want 1", len(pkts))
	}
	commandID, payload := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandCascadeOpen {
		t.Fatalf("command id = %d, want %d", commandID, CommandCascadeOpen)
	}

	p := packet.CreateParser(payload)
	childID := p.ParseString()
	proto := p.ParseString()
	hint := p.ParseString()
	heartbeat := p.ParseBytes()
	if p.HasError() {
		t.Fatalf("parse cascade open payload: %v", p.Error())
	}
	if childID != "child-2" || proto != "tcp" || hint == "" || string(heartbeat) != "heartbeat-2" {
		t.Fatalf("unexpected open payload: child=%q proto=%q hint=%q heartbeat=%q", childID, proto, hint, string(heartbeat))
	}
}

func TestCascadeConnectTCPRequiresHello(t *testing.T) {
	manager := NewCascadeManager()
	defer manager.Close()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_ = cascade.WriteFrame(conn, cascade.FramePing, []byte("not-hello"))
	}()

	port := ln.Addr().(*net.TCPAddr).Port
	connectPayload, err := packet.PackArray([]any{
		int32(3),
		"child-bad",
		"127.0.0.1",
		int32(port),
	})
	if err != nil {
		t.Fatalf("pack connect payload: %v", err)
	}
	out, err := manager.ConnectTCP(packet.CreateParser(connectPayload))
	if err != nil {
		t.Fatalf("ConnectTCP returned error: %v", err)
	}

	msg := string(out)
	if msg != "cascade child did not send HELLO" {
		t.Fatalf("response = %q, want HELLO error", msg)
	}
	if got := len(manager.GetPendingPackets()); got != 0 {
		t.Fatalf("pending packets = %d, want 0", got)
	}
}

func TestCascadeRegisterChannelSupportsSMBProtocol(t *testing.T) {
	manager := NewCascadeManager()
	defer manager.Close()

	parent, child := net.Pipe()
	defer parent.Close()
	defer child.Close()

	go func() {
		helloBody, _ := packet.PackArray([]any{
			"child-smb",
			packet.PackBytes([]byte("smb-heartbeat")),
		})
		_ = cascade.WriteFrame(child, cascade.FrameHello, helloBody)
	}()

	out, err := manager.registerChannel("requested-smb", cascade.ProtocolSMB, "smb", `\\.\pipe\beacon_internal`, parent)
	if err != nil {
		t.Fatalf("registerChannel returned error: %v", err)
	}
	if string(out) != "cascade child connected" {
		t.Fatalf("response = %q, want cascade child connected", out)
	}

	pkts := waitForCascadePackets(t, manager)
	commandID, payload := parseFinalPacketForTest(t, pkts[0])
	if commandID != CommandCascadeOpen {
		t.Fatalf("command id = %d, want %d", commandID, CommandCascadeOpen)
	}

	p := packet.CreateParser(payload)
	childID := p.ParseString()
	proto := p.ParseString()
	hint := p.ParseString()
	heartbeat := p.ParseBytes()
	if p.HasError() {
		t.Fatalf("parse cascade open payload: %v", p.Error())
	}
	if childID != "child-smb" || proto != "smb" || hint != `\\.\pipe\beacon_internal` || string(heartbeat) != "smb-heartbeat" {
		t.Fatalf("unexpected open payload: child=%q proto=%q hint=%q heartbeat=%q", childID, proto, hint, string(heartbeat))
	}
}

func TestCascadeRegisterChannelAllowsEmptyRequestedSMBChildID(t *testing.T) {
	manager := NewCascadeManager()
	defer manager.Close()

	parent, child := net.Pipe()
	defer parent.Close()
	defer child.Close()

	go func() {
		helloBody, _ := packet.PackArray([]any{
			"real-smb-child",
			packet.PackBytes([]byte("smb-heartbeat")),
		})
		_ = cascade.WriteFrame(child, cascade.FrameHello, helloBody)
	}()

	out, err := manager.registerChannel("", cascade.ProtocolSMB, "smb", `\\.\pipe\beacon_internal`, parent)
	if err != nil {
		t.Fatalf("registerChannel returned error: %v", err)
	}
	if string(out) != "cascade child connected" {
		t.Fatalf("response = %q, want cascade child connected", out)
	}

	pkts := waitForCascadePackets(t, manager)
	_, payload := parseFinalPacketForTest(t, pkts[0])
	p := packet.CreateParser(payload)
	childID := p.ParseString()
	if p.HasError() {
		t.Fatalf("parse cascade open payload: %v", p.Error())
	}
	if childID != "real-smb-child" {
		t.Fatalf("child id = %q, want real-smb-child", childID)
	}
}
