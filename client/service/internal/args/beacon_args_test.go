package args

import "testing"

func TestBuildBeaconCommandArgFileMapsToBytes(t *testing.T) {
	got, err := BuildBeaconCommandArg("file", "QQ==")
	if err != nil {
		t.Fatalf("BuildBeaconCommandArg(file): %v", err)
	}
	if got.Kind != "bytes" {
		t.Fatalf("kind = %q, want bytes", got.Kind)
	}
	if got.Value != "QQ==" {
		t.Fatalf("value = %#v, want QQ==", got.Value)
	}

	blank, err := BuildBeaconCommandArg("filepath", "")
	if err != nil {
		t.Fatalf("BuildBeaconCommandArg(filepath blank): %v", err)
	}
	if blank.Kind != "bytes" || blank.Value != "" {
		t.Fatalf("blank filepath = %+v, want kind=bytes value=\"\"", blank)
	}
}
