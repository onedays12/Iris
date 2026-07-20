package main

import (
	"encoding/binary"
	"testing"
)

func TestBuildTLVIncludesHTTPTransform(t *testing.T) {
	tlv := buildTLV(config{})

	found := false
	for off := 0; off+8 <= len(tlv); {
		tag := binary.BigEndian.Uint16(tlv[off : off+2])
		valueType := tlv[off+2]
		valueLen := int(binary.BigEndian.Uint32(tlv[off+4 : off+8]))
		off += 8
		if off+valueLen > len(tlv) {
			t.Fatalf("invalid tlv length at tag %d", tag)
		}

		if tag == cfgHTTPTransform {
			found = true
			if valueType != cfgValueBytes {
				t.Fatalf("cfgHTTPTransform value type = %d", valueType)
			}
			if valueLen < 2 {
				t.Fatalf("cfgHTTPTransform length too small: %d", valueLen)
			}
			version := binary.BigEndian.Uint16(tlv[off : off+2])
			if version != httpTransformVersion {
				t.Fatalf("cfgHTTPTransform version = %d", version)
			}
		}

		off += valueLen
	}

	if !found {
		t.Fatal("cfgHTTPTransform not found")
	}
}
