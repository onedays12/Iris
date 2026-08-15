//go:build windows && amd64

package coff

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
	"unsafe"

	"github.com/RIscRIpt/pecoff"
	"github.com/RIscRIpt/pecoff/binutil"
	"github.com/RIscRIpt/pecoff/windef"
)

func TestWriteRelocADDR64Absolute(t *testing.T) {
	var mem [8]byte
	addr := uintptr(unsafe.Pointer(&mem[0]))
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_ADDR64, 0x1000, 0); err != nil {
		t.Fatalf("writeReloc: %v", err)
	}
	if got := *(*uint64)(unsafe.Pointer(&mem[0])); got != 0x1000 {
		t.Fatalf("ADDR64 = 0x%X, want 0x1000", got)
	}
}

func TestWriteRelocADDR64KeepsAddend(t *testing.T) {
	var mem [8]byte
	*(*uint64)(unsafe.Pointer(&mem[0])) = 7
	addr := uintptr(unsafe.Pointer(&mem[0]))
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_ADDR64, 0x1000, 0); err != nil {
		t.Fatalf("writeReloc: %v", err)
	}
	if got := *(*uint64)(unsafe.Pointer(&mem[0])); got != 0x1007 {
		t.Fatalf("ADDR64 = 0x%X, want 0x1007", got)
	}
}

// TestWriteRelocADDR32NBAbsolute 验证 ADDR32NB 写入 RVA（target-imageBase）。
// 修复前对 BSS 符号写入的是 PC-relative 位移（bssAddr-(relocAddr+4)），语义错误。
func TestWriteRelocADDR32NBAbsolute(t *testing.T) {
	var mem [4]byte
	addr := uintptr(unsafe.Pointer(&mem[0]))
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_ADDR32NB, 0x6000, 0x5000); err != nil {
		t.Fatalf("writeReloc: %v", err)
	}
	if got := *(*uint32)(unsafe.Pointer(&mem[0])); got != 0x1000 {
		t.Fatalf("ADDR32NB = 0x%X, want 0x1000", got)
	}
}

func TestWriteRelocREL32WithAddend(t *testing.T) {
	var mem [4]byte
	*(*uint32)(unsafe.Pointer(&mem[0])) = 8
	addr := uintptr(unsafe.Pointer(&mem[0]))
	target := addr + 0x100
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_REL32, target, 0); err != nil {
		t.Fatalf("writeReloc: %v", err)
	}
	if got := *(*uint32)(unsafe.Pointer(&mem[0])); got != 0x104 {
		t.Fatalf("REL32 = 0x%X, want 0x104", got)
	}
}

func TestWriteRelocREL32Negative(t *testing.T) {
	var mem [4]byte
	*(*uint32)(unsafe.Pointer(&mem[0])) = 0
	addr := uintptr(unsafe.Pointer(&mem[0]))
	target := addr - 0x100
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_REL32, target, 0); err != nil {
		t.Fatalf("writeReloc: %v", err)
	}
	wantVal := int64(target) - int64(addr) - 4
	want := uint32(wantVal)
	if got := *(*uint32)(unsafe.Pointer(&mem[0])); got != want {
		t.Fatalf("REL32 = 0x%X, want 0x%X", got, want)
	}
}

func TestWriteRelocREL32Overflow(t *testing.T) {
	var mem [4]byte
	addr := uintptr(unsafe.Pointer(&mem[0]))
	target := uintptr(1) << 33
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_REL32, target, 0); err == nil {
		t.Fatalf("expected overflow error")
	}
}

func TestWriteRelocUnsupportedType(t *testing.T) {
	var mem [4]byte
	addr := uintptr(unsafe.Pointer(&mem[0]))
	if err := writeReloc(addr, windef.IMAGE_REL_AMD64_SECTION, 0, 0); err == nil {
		t.Fatalf("expected unsupported type error")
	}
}

// TestApplyRelocationsOutOfRangeSymbolIndex 验证越界符号索引返回错误而非 panic。
func TestApplyRelocationsOutOfRangeSymbolIndex(t *testing.T) {
	data := buildTestCOFF(t, windef.IMAGE_REL_AMD64_REL32, 5)
	p := parseTestCoffee(t, data)
	if len(p.Symbols) != 1 {
		t.Fatalf("expected 1 symbol, got %d", len(p.Symbols))
	}

	var mem [64]byte
	base := uintptr(unsafe.Pointer(&mem[0]))
	p.SecMap[0] = SectionMap{Ptr: base, Size: 8}
	p.ImageBase = base
	p.GOT = base + 8
	p.BSS = base + 16

	err := applyRelocations(p, &bofRuntime{})
	if err == nil {
		t.Fatalf("expected out-of-range error, got nil")
	}
	if !strings.Contains(err.Error(), "out of range") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestApplyRelocationsUnsupportedType 验证未支持的重定位类型终止加载而非静默忽略。
func TestApplyRelocationsUnsupportedType(t *testing.T) {
	data := buildTestCOFF(t, windef.IMAGE_REL_AMD64_SECREL, 0)
	p := parseTestCoffee(t, data)

	var mem [64]byte
	base := uintptr(unsafe.Pointer(&mem[0]))
	p.SecMap[0] = SectionMap{Ptr: base, Size: 8}
	p.ImageBase = base
	p.GOT = base + 8
	p.BSS = base + 16

	err := applyRelocations(p, &bofRuntime{})
	if err == nil {
		t.Fatalf("expected unsupported reloc error, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported relocation type") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// buildTestCOFF 构造最小 AMD64 COFF 对象：1 个 .text 节、1 条重定位、1 个符号。
// 符号 "extsym" 为内部符号（section 1，value 0x10），重定位引用它。
// TestShouldRedirectExceptionAddrInRange 异常地址落在 BOF 范围内应重定向。
func TestShouldRedirectExceptionAddrInRange(t *testing.T) {
	registerActiveBofRange(0x1000, 0x1000)
	defer unregisterActiveBofRange(0x1000)

	if !shouldRedirectException(0x1500, 0xAAAA) {
		t.Fatalf("address in BOF range should redirect")
	}
	if !shouldRedirectException(0x1000, 0xAAAA) {
		t.Fatalf("range start should redirect")
	}
	if shouldRedirectException(0x2000, 0xAAAA) {
		t.Fatalf("range end (exclusive) should not redirect")
	}
	if shouldRedirectException(0x0FFF, 0xAAAA) {
		t.Fatalf("address before range should not redirect")
	}
}

// TestShouldRedirectExceptionThreadID BOF 执行线程的栈溢出等异常应重定向。
func TestShouldRedirectExceptionThreadID(t *testing.T) {
	registerActiveBofThread(0x1234)
	defer unregisterActiveBofThread(0x1234)

	if !shouldRedirectException(0xFFFFFFFFFFF0, 0x1234) {
		t.Fatalf("BOF thread exception should redirect")
	}
	if shouldRedirectException(0xFFFFFFFFFFF0, 0x9999) {
		t.Fatalf("non-BOF thread should not redirect")
	}
}

// TestShouldRedirectExceptionUnrelated 与 BOF 无关的异常不应被吞掉（修复目标）。
func TestShouldRedirectExceptionUnrelated(t *testing.T) {
	if shouldRedirectException(0x7000, 0x9999) {
		t.Fatalf("unrelated exception should not redirect")
	}
}

// TestShouldRedirectExceptionConcurrentRanges 并发注册多个 BOF 范围互不干扰。
func TestShouldRedirectExceptionConcurrentRanges(t *testing.T) {
	registerActiveBofRange(0x1000, 0x1000)
	registerActiveBofRange(0x3000, 0x2000)
	defer unregisterActiveBofRange(0x1000)
	defer unregisterActiveBofRange(0x3000)

	if !shouldRedirectException(0x3100, 0) {
		t.Fatalf("second range not matched")
	}
	if shouldRedirectException(0x2800, 0) {
		t.Fatalf("gap between ranges should not redirect")
	}
}
func buildTestCOFF(t *testing.T, relocType uint16, symIndex uint32) []byte {
	t.Helper()

	buf := new(bytes.Buffer)
	writeU16 := func(v uint16) { binary.Write(buf, binary.LittleEndian, v) }
	writeU32 := func(v uint32) { binary.Write(buf, binary.LittleEndian, v) }

	// File header (20 bytes)
	writeU16(0x8664) // Machine: AMD64
	writeU16(1)      // NumberOfSections
	writeU32(0)      // TimeDateStamp
	writeU32(78)     // PointerToSymbolTable (20+40+8+10)
	writeU32(1)      // NumberOfSymbols
	writeU16(0)      // SizeOfOptionalHeader
	writeU16(0)      // Characteristics

	// Section header .text (40 bytes)
	buf.WriteString(".text")
	buf.Write([]byte{0, 0, 0}) // pad name to 8
	writeU32(8)                // VirtualSize
	writeU32(0)                // VirtualAddress
	writeU32(8)                // SizeOfRawData
	writeU32(60)               // PointerToRawData
	writeU32(68)               // PointerToRelocations
	writeU32(0)                // PointerToLinenumbers
	writeU16(1)                // NumberOfRelocations
	writeU16(0)                // NumberOfLinenumbers
	writeU32(0x60000020)       // Characteristics

	// Raw data (8 bytes)
	writeU32(0)
	writeU32(0)

	// Relocation (10 bytes)
	writeU32(0) // VirtualAddress
	writeU32(symIndex)
	writeU16(relocType)

	// Symbol table (18 bytes)
	buf.WriteString("extsym")
	buf.Write([]byte{0, 0}) // pad name to 8
	writeU32(0x10)          // Value
	writeU16(1)             // SectionNumber
	writeU16(0)             // Type
	buf.WriteByte(2)        // StorageClass: EXTERNAL
	buf.WriteByte(0)        // NumberOfAuxSymbols

	// String table (4 bytes)
	writeU32(4)

	return buf.Bytes()
}

// parseTestCoffee 用与 loader 相同的流程解析测试 COFF 字节。
func parseTestCoffee(t *testing.T, data []byte) *Coffee {
	t.Helper()

	parsed := pecoff.Explore(binutil.WrapByteSlice(data))
	parsed.ReadAll()
	parsed.Seal()
	if parsed.FileHeader == nil {
		t.Fatalf("missing COFF file header")
	}

	return &Coffee{
		Data:     data,
		Symbols:  parsed.Symbols,
		Sections: parsed.Sections.Array(),
		SecMap:   make([]SectionMap, parsed.Sections.Len()),
	}
}
