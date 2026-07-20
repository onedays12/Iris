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
	tlv = appendTLV(tlv, cfgListenerType, []byte("internal\x00"))
	tlv = appendTLV(tlv, cfgProtocol, []byte("tcp\x00"))
	tlv = appendTLV(tlv, cfgTCPBindHost, []byte("127.0.0.1\x00"))
	tlv = appendTLV(tlv, cfgTCPBindPort, u32(4445))
	tlv = appendTLV(tlv, cfgTCPConnectTimeout, u32(12000))
	tlv = appendTLV(tlv, cfgSMBPipeName, []byte(`\\.\pipe\go_beacon`+"\x00"))
	tlv = appendTLV(tlv, cfgSMBConnectTimeout, u32(13000))
	tlv = appendTLVWithType(tlv, cfgHTTPTransform, cfgValueBytes, buildTestHTTPTransformBlock())
	tlv = appendTLV(tlv, cfgSleepImageLayout, buildSleepLayoutValue(0x4000, 0x1000, 0x600, 0x20))

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
	if p.EncryptKey != "secret-key" {
		t.Fatalf("unexpected common encrypt key: %q", p.EncryptKey)
	}
	if p.HTTP.SleepTime != 9000 || p.Jitter != 7 {
		t.Fatalf("unexpected sleep/jitter: %d/%d", p.HTTP.SleepTime, p.Jitter)
	}
	if p.ListenerType != "internal" || p.Protocol != "tcp" {
		t.Fatalf("unexpected listener: type=%q protocol=%q", p.ListenerType, p.Protocol)
	}
	if p.TCPInternal.BindHost != "127.0.0.1" ||
		p.TCPInternal.BindPort != 4445 ||
		p.TCPInternal.ConnectTimeoutMS != 12000 {
		t.Fatalf("unexpected tcp internal profile: %+v", p.TCPInternal)
	}
	if p.SMBInternal.PipeName != `\\.\pipe\go_beacon` ||
		p.SMBInternal.ConnectTimeoutMS != 13000 {
		t.Fatalf("unexpected smb internal profile: %+v", p.SMBInternal)
	}
	if !p.SleepLayout.Valid || p.SleepLayout.ImageSize != 0x4000 ||
		p.SleepLayout.TextRVA != 0x1000 || p.SleepLayout.TextSize != 0x600 ||
		p.SleepLayout.TextProtect != 0x20 {
		t.Fatalf("unexpected sleep layout: %+v", p.SleepLayout)
	}
	if !p.HTTP.Transform.Present || p.HTTP.Transform.Version != httpTransformVersion {
		t.Fatalf("unexpected transform header: %+v", p.HTTP.Transform)
	}
	if p.HTTP.Transform.Post.Metadata.Name != "Cookie" ||
		p.HTTP.Transform.Post.Metadata.Prefix != "JSESSION=" ||
		p.HTTP.Transform.Post.StageOutput.Encoding != httpTransformEncBase64 ||
		p.HTTP.Transform.Post.ServerOutput.OutputMode != httpTransformOutPrint {
		t.Fatalf("unexpected post transform: %+v", p.HTTP.Transform.Post)
	}
}

func appendTLV(dst []byte, tag uint16, value []byte) []byte {
	return appendTLVWithType(dst, tag, 0, value)
}

func appendTLVWithType(dst []byte, tag uint16, valueType uint8, value []byte) []byte {
	var hdr [8]byte
	binary.BigEndian.PutUint16(hdr[0:2], tag)
	hdr[2] = valueType
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

func buildSleepLayoutValue(imageSize, textRVA, textSize, textProtect uint32) []byte {
	var b [16]byte
	binary.BigEndian.PutUint32(b[0:4], imageSize)
	binary.BigEndian.PutUint32(b[4:8], textRVA)
	binary.BigEndian.PutUint32(b[8:12], textSize)
	binary.BigEndian.PutUint32(b[12:16], textProtect)
	return b[:]
}

func buildTestHTTPTransformBlock() []byte {
	var out []byte
	out = appendU16(out, httpTransformVersion)

	out = appendHTTPDataTransform(out, 1, httpTransformLocHeader, httpTransformEncBase64, 0, "Cookie", "SESSIONID=", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncRaw, httpTransformOutBinary, "", "", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncRaw, httpTransformOutBinary, "", "", "")

	out = appendHTTPDataTransform(out, 1, httpTransformLocHeader, httpTransformEncBase64, 0, "Cookie", "JSESSION=", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncBase64, httpTransformOutPrint, "", "", "")
	out = appendHTTPDataTransform(out, 1, httpTransformLocBody, httpTransformEncBase64, httpTransformOutPrint, "", "", "")
	return out
}

func appendHTTPDataTransform(out []byte, present, location, encoding, outputMode uint8, name, prefix, suffix string) []byte {
	out = append(out, present, location, encoding, outputMode)
	out = appendStringU16(out, name)
	out = appendStringU16(out, prefix)
	out = appendStringU16(out, suffix)
	return out
}

func appendStringU16(out []byte, value string) []byte {
	out = appendU16(out, uint16(len(value)))
	out = append(out, value...)
	return out
}

func appendU16(out []byte, value uint16) []byte {
	var b [2]byte
	binary.BigEndian.PutUint16(b[:], value)
	out = append(out, b[:]...)
	return out
}
