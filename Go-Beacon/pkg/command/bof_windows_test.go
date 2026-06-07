//go:build windows && amd64

package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/packet"
	"strings"
	"testing"
	"time"
)

func TestStartBOFJobRunsAsynchronouslyAndEmitsError(t *testing.T) {
	payload, err := packet.PackArray([]any{
		packet.PackBytes([]byte("bad-coff")),
		packet.PackBytes(nil),
	})
	if err != nil {
		t.Fatalf("pack bof payload: %v", err)
	}

	manager := jobs.NewManager()
	defer manager.Close()

	out := make(chan []byte, 1)
	ack, err := StartBOFJob(manager, func(pkt []byte) {
		out <- pkt
	}, 7001, CommandExecutionBOF, packet.CreateParser(payload), 65001)
	if err != nil {
		t.Fatalf("StartBOFJob failed: %v", err)
	}
	if !strings.Contains(string(ack), "BOF job 7001 started") {
		t.Fatalf("unexpected ack: %q", string(ack))
	}

	select {
	case pkt := <-out:
		taskID, commandID, body := parseFinalPacket(t, pkt)
		if taskID != 7001 || commandID != CommandExecutionBOF {
			t.Fatalf("unexpected final metadata: task=%d command=%d", taskID, commandID)
		}
		if !strings.Contains(string(body), "missing COFF file header") {
			t.Fatalf("unexpected bof output: %q", string(body))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for async BOF output")
	}
}
