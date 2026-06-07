//go:build windows && amd64

package coff

import (
	"encoding/binary"
	"testing"
	"unicode/utf16"
	"unsafe"
)

// TestRenderCFormatWideString 验证 %ls 格式说明符的宽字符串渲染
func TestRenderCFormatWideString(t *testing.T) {
	value, keepAlive := utf16Pointer("用户名")
	_ = keepAlive

	got := renderCFormat("value=%ls", []uintptr{value})
	if got != "value=用户名" {
		t.Fatalf("renderCFormat() = %q", got)
	}
}

// TestRenderCFormatConsumesStarArguments 验证 %*s 宽度参数消耗
func TestRenderCFormatConsumesStarArguments(t *testing.T) {
	first, firstKeepAlive := cStringPointer("first")
	second, secondKeepAlive := cStringPointer("second")
	_, _ = firstKeepAlive, secondKeepAlive

	got := renderCFormat("%*s %s", []uintptr{10, first, second})
	if got != "first second" {
		t.Fatalf("renderCFormat() = %q", got)
	}
}

// TestRenderCFormatUint64 验证 %llu 64-bit 无符号整数渲染
func TestRenderCFormatUint64(t *testing.T) {
	got := renderCFormat("%llu", []uintptr{0x100000001})
	if got != "4294967297" {
		t.Fatalf("renderCFormat() = %q", got)
	}
}

// TestBeaconFormatAppendAndReset 验证 formatp 的追加和重置操作
func TestBeaconFormatAppendAndReset(t *testing.T) {
	buf := make([]byte, 16)
	data := []byte("abc")
	format := beaconFormat{
		Original: uintptr(unsafe.Pointer(&buf[0])),
		Buffer:   uintptr(unsafe.Pointer(&buf[0])),
		Size:     int32(len(buf)),
	}

	// 追加 "abc"
	beaconFormatAppend(&format, uintptr(unsafe.Pointer(&data[0])), int32(len(data)))
	if got := string(buf[:3]); got != "abc" {
		t.Fatalf("BeaconFormatAppend wrote %q", got)
	}
	if format.Length != 3 {
		t.Fatalf("BeaconFormatAppend length = %d", format.Length)
	}

	// 重置后 buffer 应清零
	beaconFormatReset(&format)
	if format.Buffer != format.Original || format.Length != 0 {
		t.Fatalf("BeaconFormatReset left format = %+v", format)
	}
	if buf[0] != 0 || buf[1] != 0 || buf[2] != 0 {
		t.Fatalf("BeaconFormatReset did not clear buffer: %v", buf[:3])
	}
}

// TestBeaconDataExtractRejectsOversizedLength 验证长度超限的数据提取被正确拒绝
func TestBeaconDataExtractRejectsOversizedLength(t *testing.T) {
	buf := make([]byte, 8)
	binary.LittleEndian.PutUint32(buf[0:], uint32(len(buf)))
	binary.LittleEndian.PutUint32(buf[4:], 100) // 声称 100 字节但实际只有 4 字节

	var parser beaconDataParser
	var size uint32 = 1
	beaconDataParse(&parser, uintptr(unsafe.Pointer(&buf[0])), int32(len(buf)))

	// 应返回 0（拒绝提取）
	if got := beaconDataExtract(&parser, uintptr(unsafe.Pointer(&size))); got != 0 {
		t.Fatalf("BeaconDataExtract returned %x", got)
	}
	if size != 0 {
		t.Fatalf("BeaconDataExtract size = %d", size)
	}
	if parser.Length != 0 {
		t.Fatalf("BeaconDataExtract parser.Length = %d", parser.Length)
	}
}

// TestBeaconGetStopJobEventUsesRuntimeHandle 验证 stop event 返回正确的句柄值
func TestBeaconGetStopJobEventUsesRuntimeHandle(t *testing.T) {
	fn := beaconGetStopJobEventForRuntime(&bofRuntime{stopEvent: 0x12345678})
	if got := fn(); got != 0x12345678 {
		t.Fatalf("BeaconGetStopJobEvent = 0x%x", got)
	}
}

// cStringPointer 将 Go 字符串转为 null-terminated C 字符串并返回其指针
func cStringPointer(value string) (uintptr, []byte) {
	buf := append([]byte(value), 0)
	return uintptr(unsafe.Pointer(&buf[0])), buf
}

// utf16Pointer 将 Go 字符串转为 null-terminated UTF-16 字符串并返回其指针
func utf16Pointer(value string) (uintptr, []uint16) {
	buf := append(utf16.Encode([]rune(value)), 0)
	return uintptr(unsafe.Pointer(&buf[0])), buf
}
