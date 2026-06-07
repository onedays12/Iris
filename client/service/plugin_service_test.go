package service

import "testing"

func TestNormalizeManifestCommandArgsKeepsShort(t *testing.T) {
	got, err := normalizeManifestCommandArgs([]BeaconCommandArg{
		{Kind: "int32", Value: 1234},
		{Kind: "short", Value: 77},
		{Kind: "int16", Value: "-9"},
		{Kind: "string", Value: "hello-elf-bof"},
	})
	if err != nil {
		t.Fatalf("normalizeManifestCommandArgs returned error: %v", err)
	}
	if len(got) != 4 {
		t.Fatalf("expected 4 args, got %d", len(got))
	}
	if got[0].Kind != "int32" || got[0].Value != int32(1234) {
		t.Fatalf("unexpected int32 arg: %#v", got[0])
	}
	if got[1].Kind != "short" || got[1].Value != int16(77) {
		t.Fatalf("unexpected short arg: %#v", got[1])
	}
	if got[2].Kind != "short" || got[2].Value != int16(-9) {
		t.Fatalf("unexpected int16 alias arg: %#v", got[2])
	}
	if got[3].Kind != "string" || got[3].Value != "hello-elf-bof" {
		t.Fatalf("unexpected string arg: %#v", got[3])
	}
}
