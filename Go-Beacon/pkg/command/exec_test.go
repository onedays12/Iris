package command

import (
	"beacon/pkg/utils/packet"
	"strings"
	"testing"
)

func TestReadRawCommandPreservesQuotes(t *testing.T) {
	raw := `Copy-Item -LiteralPath "C:\Users\Administrator\Desktop\inject (2).exe" -Destination "C:\Users\Administrator\Desktop\message111.exe"`
	payload, err := packet.PackArray([]any{uint32(1), raw})
	if err != nil {
		t.Fatalf("pack payload: %v", err)
	}

	got, err := readRawCommand(packet.CreateParser(payload), "powershell")
	if err != nil {
		t.Fatalf("readRawCommand failed: %v", err)
	}
	if got != raw {
		t.Fatalf("raw command changed:\nwant %q\n got %q", raw, got)
	}
}

func TestReadRawCommandRejectsSplitArgs(t *testing.T) {
	payload, err := packet.PackArray([]any{uint32(2), "whoami", "/all"})
	if err != nil {
		t.Fatalf("pack payload: %v", err)
	}

	_, err = readRawCommand(packet.CreateParser(payload), "shell")
	if err == nil || !strings.Contains(err.Error(), "exactly 1 raw command") {
		t.Fatalf("expected fixed raw command error, got %v", err)
	}
}
