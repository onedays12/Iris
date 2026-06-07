package profile

import (
	"encoding/binary"
	"hash/crc32"
	"testing"
)

func TestParseProfileSlotV2XORCRC(t *testing.T) {
	tlv := appendTLV(nil, cfgHTTPCallbackHost, []byte("https://example.com/callback\x00"))
	tlv = appendTLV(tlv, cfgHTTPPort, u32(8443))
	tlv = appendTLV(tlv, cfgHTTPURI, []byte("stage\x00"))
	tlv = appendTLV(tlv, cfgHTTPEncryptKey, []byte("secret-key\x00"))
	tlv = appendTLV(tlv, cfgSleepTime, u32(9000))
	tlv = appendTLV(tlv, cfgJitter, u32(7))

	slot := buildTestSlot(t, tlv)
	p, err := parseProfileSlot(slot[:], defaultProfile())
	if err != nil {
		t.Fatalf("parseProfileSlot failed: %v", err)
	}
	finalizeProfile(&p)

	if p.HTTP.CallbackHost != "example.com:8443" {
		t.Fatalf("unexpected callback host: %q", p.HTTP.CallbackHost)
	}
	if !p.HTTP.SSL {
		t.Fatalf("expected SSL inferred from https callback host")
	}
	if p.HTTP.URI != "/stage" {
		t.Fatalf("unexpected uri: %q", p.HTTP.URI)
	}
	if p.HTTP.EncryptKey != "secret-key" {
		t.Fatalf("unexpected encrypt key: %q", p.HTTP.EncryptKey)
	}
	if p.HTTP.SleepTime != 9000 || p.Jitter != 7 {
		t.Fatalf("unexpected sleep/jitter: %d/%d", p.HTTP.SleepTime, p.Jitter)
	}
}

func appendTLV(dst []byte, tag uint16, value []byte) []byte {
	var hdr [8]byte
	binary.BigEndian.PutUint16(hdr[0:2], tag)
	binary.BigEndian.PutUint32(hdr[4:8], uint32(len(value)))
	dst = append(dst, hdr[:]...)
	dst = append(dst, value...)
	return dst
}

func buildTestSlot(t *testing.T, plain []byte) [configPatchSlotSize]byte {
	t.Helper()

	var slot [configPatchSlotSize]byte
	copy(slot[0:4], []byte("TSCF"))
	binary.BigEndian.PutUint16(slot[4:6], configPatchVersion)
	binary.BigEndian.PutUint16(slot[6:8], configPatchFlagXOR)
	binary.BigEndian.PutUint32(slot[8:12], uint32(len(plain)))
	binary.BigEndian.PutUint32(slot[12:16], crc32.ChecksumIEEE(plain))

	key := slot[16 : 16+configPatchKeySize]
	for i := range key {
		key[i] = byte(i + 1)
	}
	for i, b := range plain {
		slot[configPatchHeaderSize+i] = b ^ key[i%len(key)]
	}
	return slot
}

func u32(v uint32) []byte {
	var b [4]byte
	binary.BigEndian.PutUint32(b[:], v)
	return b[:]
}
