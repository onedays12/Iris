//go:build linux && amd64 && cgo

package elf

import (
	"bytes"
	"debug/elf"
	"encoding/binary"
	"errors"
	"fmt"
	goruntime "runtime"
	"runtime/debug"
	"strings"
	"unsafe"

	"golang.org/x/sys/unix"
)

// 内存布局常量
const (
	pageSize      = 0x1000 // 系统页大小，mprotect 对齐粒度
	relaEntSize   = 24     // Elf64_Rela 结构体大小 (offset=8 + info=8 + addend=8)
	gotEntrySize  = 8      // GOT 表项大小（单个 64-bit 地址）
	trampEntSize  = 16     // 跳板表项大小（12 字节代码 + 4 字节填充）
	trampCodeSize = 12     // 跳板指令长度: mov rax, imm64 (10B) + jmp rax (2B)
)

// sectionMap 记录每个 ELF section 映射到内存后的地址和属性
type sectionMap struct {
	addr uintptr // 映射后的内存地址
	size uint64  // section 原始大小
	name string  // section 名称（.text, .data 等）
	exec bool    // 是否可执行 (SHF_EXECINSTR)
	read bool    // 是否只读（非 SHF_WRITE，如 .rodata）
}

// slotTable 管理一块连续内存区域的分配（GOT / 跳板表 / COMMON 区）
type slotTable struct {
	base uintptr              // 区域起始地址
	next uintptr              // 下一个可分配位置
	size uintptr              // 区域总大小
	used map[uint32]uintptr  // 已分配的 slot，key = symbol index
}

// Loader 是 ELF BOF 加载器的核心结构体
type Loader struct {
	data       []byte        // 原始 ELF .o 文件内容
	file       *elf.File     // 解析后的 ELF 文件对象
	symbols    []elf.Symbol  // 符号表（.symtab）
	sections   []sectionMap  // 各 section 的内存映射信息
	memory     []byte        // mmap 分配的整块内存
	base       uintptr       // 内存块基地址
	totalSize  uintptr       // 内存块总大小
	got        slotTable     // GOT 表（外部符号间接跳转）
	trampoline slotTable     // 跳板表（PC-relative 外部调用）
	common     slotTable     // SHN_COMMON 符号区域
	runtime    *bofRuntime   // 当前 BOF 运行时上下文
}

// Load 加载默认入口 "go"。
func Load(objectBytes []byte, argBytes []byte) (string, error) {
	return LoadWithMethod(objectBytes, argBytes, "go")
}

// LoadWithMethod 加载指定入口并收集输出。
func LoadWithMethod(objectBytes []byte, argBytes []byte, method string) (string, error) {
	var result strings.Builder
	err := LoadWithMethodOutputStopEvent(objectBytes, argBytes, method, 0, func(s string) {
		result.WriteString(s)
		if !strings.HasSuffix(s, "\n") {
			result.WriteByte('\n')
		}
	})
	if err != nil {
		return "", err
	}
	return result.String(), nil
}

// LoadWithMethodOutputStopEvent 是 ELF BOF 加载的完整入口。
// 流程: 解析 → 映射 → 重定位 → 内存保护 → 查找入口 → 执行
func LoadWithMethodOutputStopEvent(objectBytes []byte, argBytes []byte, method string, stopFD uintptr, emit func(string)) error {
	// 创建运行时上下文，用于 CGO 回调时定位输出通道和 stopFD
	rt := newRuntime(stopFD, emit)
	defer deleteRuntime(rt.id)

	// 解析 ELF 文件头、符号表
	ldr, err := newLoader(objectBytes, rt)
	if err != nil {
		return err
	}
	defer ldr.Close()

	// 将所有 SHF_ALLOC section 映射到一块连续内存
	if err := ldr.MapSections(); err != nil {
		return err
	}

	// 处理所有 RELA 重定位条目
	if err := ldr.ApplyRelocations(); err != nil {
		return err
	}

	// 重定位完成后，按 section 属性设置 mprotect（RX/R/RW）
	if err := ldr.ProtectSections(); err != nil {
		return err
	}

	// 在符号表中查找入口函数地址
	entry, err := ldr.Entry(method)
	if err != nil {
		return err
	}

	// 空参数时给一个最小 buffer（避免空指针）
	if len(argBytes) == 0 {
		argBytes = make([]byte, 1)
	}

	// 捕获 BOF 代码中的 panic，防止崩溃 beacon 进程
	defer func() {
		if r := recover(); r != nil && emit != nil {
			emit(fmt.Sprintf("[!] ELF BOF panic: %v\n%s", r, debug.Stack()))
		}
	}()

	// 锁定 OS 线程：BOF 中的 TLS（g_runtime_id）只在当前线程有效
	goruntime.LockOSThread()
	defer goruntime.UnlockOSThread()

	// 通过 CGO 桥接调用 BOF 的入口函数
	callEntry(entry, argBytes, rt.id)
	return nil
}

// newLoader 解析 ELF .o 文件并验证格式（64-bit、小端、可重定位、x86_64）
func newLoader(objectBytes []byte, rt *bofRuntime) (*Loader, error) {
	if len(objectBytes) < 16 {
		return nil, errors.New("ELF object is too small")
	}

	f, err := elf.NewFile(bytes.NewReader(objectBytes))
	if err != nil {
		return nil, err
	}

	// 格式校验: ELFCLASS64 / ELFDATA2LSB / ET_REL / EM_X86_64
	if f.Class != elf.ELFCLASS64 {
		return nil, fmt.Errorf("unsupported ELF class: %s", f.Class)
	}
	if f.Data != elf.ELFDATA2LSB {
		return nil, fmt.Errorf("unsupported ELF endian: %s", f.Data)
	}
	if f.Type != elf.ET_REL {
		return nil, fmt.Errorf("unsupported ELF type: %s", f.Type)
	}
	if f.Machine != elf.EM_X86_64 {
		return nil, fmt.Errorf("unsupported ELF machine: %s", f.Machine)
	}

	// 读取符号表
	symbols, err := f.Symbols()
	if err != nil {
		return nil, err
	}
	if len(symbols) == 0 {
		return nil, errors.New("missing ELF symbol table")
	}

	return &Loader{
		data:     objectBytes,
		file:     f,
		symbols:  symbols,
		sections: make([]sectionMap, len(f.Sections)),
		runtime:  rt,
	}, nil
}

// Close 释放 mmap 的内存
func (l *Loader) Close() {
	if l != nil && l.memory != nil {
		_ = unix.Munmap(l.memory)
		l.memory = nil
	}
}

// MapSections 将所有 SHF_ALLOC section 映射到一块 RWX 内存中。
// 内存布局: [sections...] [GOT] [trampoline] [COMMON]
func (l *Loader) MapSections() error {
	// Phase 1: 计算总大小，每个区域都页对齐以满足 mprotect 要求
	var total uintptr

	for _, sec := range l.file.Sections {
		if !shouldMapSection(sec) {
			continue
		}
		total = pageAlign(total)
		total += uintptr(sec.Size)
	}

	// GOT 表: 每个符号一个 slot（用于 GOTPCREL 类重定位）
	total = pageAlign(total)
	gotBase := total
	gotSize := uintptr(len(l.symbols)) * gotEntrySize
	total += gotSize

	// 跳板表: 每个外部 PC-relative 符号一个跳板（mov rax, addr; jmp rax）
	total = pageAlign(total)
	trampBase := total
	trampSize := uintptr(len(l.symbols)) * trampEntSize
	total += trampSize

	// COMMON 区: 存放 SHN_COMMON 符号（未初始化全局变量）
	total = pageAlign(total)
	commonBase := total
	commonSize := l.computeCommonSize()
	total += commonSize

	if total == 0 {
		return errors.New("ELF object has no loadable sections")
	}
	total = pageAlign(total)

	// 分配一整块 RWX 内存（后续 ProtectSections 会收紧权限）
	mem, err := unix.Mmap(-1, 0, int(total), unix.PROT_READ|unix.PROT_WRITE|unix.PROT_EXEC, unix.MAP_PRIVATE|unix.MAP_ANON)
	if err != nil {
		return err
	}
	l.memory = mem
	l.base = uintptr(unsafe.Pointer(&mem[0]))
	l.totalSize = total

	// 初始化三个 slotTable
	l.got = slotTable{base: l.base + gotBase, next: l.base + gotBase, size: gotSize, used: make(map[uint32]uintptr)}
	l.trampoline = slotTable{base: l.base + trampBase, next: l.base + trampBase, size: trampSize, used: make(map[uint32]uintptr)}
	l.common = slotTable{base: l.base + commonBase, next: l.base + commonBase, size: commonSize, used: make(map[uint32]uintptr)}

	// Phase 2: 将 section 数据拷贝到对应地址
	offset := uintptr(0)
	for idx, sec := range l.file.Sections {
		if !shouldMapSection(sec) {
			continue
		}

		offset = pageAlign(offset)
		addr := l.base + offset
		isExec := sec.Flags&elf.SHF_EXECINSTR != 0
		isWrite := sec.Flags&elf.SHF_WRITE != 0
		l.sections[idx] = sectionMap{addr: addr, size: sec.Size, name: sec.Name, exec: isExec, read: !isWrite}

		// SHT_NOBITS（如 .bss）不拷贝数据，mmap 已清零
		if sec.Type != elf.SHT_NOBITS {
			data, err := sec.Data()
			if err != nil {
				return fmt.Errorf("read section %s: %w", sec.Name, err)
			}
			copy(unsafe.Slice((*byte)(unsafe.Pointer(addr)), len(data)), data)
		}

		offset += uintptr(sec.Size)
	}

	return nil
}

// computeCommonSize 预计算所有 SHN_COMMON 符号需要的总空间
func (l *Loader) computeCommonSize() uintptr {
	var total uintptr
	for _, sym := range l.symbols {
		if sym.Section != elf.SHN_COMMON {
			continue
		}

		// sym.Value = 对齐要求, sym.Size = 分配大小
		align := uintptr(sym.Value)
		if align == 0 {
			align = 1
		}
		total = (total + align - 1) &^ (align - 1)
		total += uintptr(sym.Size)
	}
	return total
}

// ProtectSections 在重定位完成后收紧内存保护:
// .text/.trampoline → RX, .rodata → R, .data/.bss/.got/.common → RW
func (l *Loader) ProtectSections() error {
	for _, sec := range l.sections {
		if sec.addr == 0 || sec.size == 0 {
			continue
		}

		prot := unix.PROT_READ
		if sec.exec {
			prot |= unix.PROT_EXEC
		} else if sec.read {
			// .rodata 等只读 section，保持 PROT_READ
		} else {
			prot |= unix.PROT_WRITE
		}

		if err := mprotectAligned(sec.addr, uintptr(sec.size), prot); err != nil {
			return fmt.Errorf("mprotect section %s: %w", sec.name, err)
		}
	}

	// GOT: 可读写（存放外部符号地址）
	if l.got.size > 0 {
		if err := mprotectAligned(l.got.base, l.got.size, unix.PROT_READ|unix.PROT_WRITE); err != nil {
			return fmt.Errorf("mprotect GOT: %w", err)
		}
	}

	// Trampoline: 可读可执行（存放跳板代码）
	if l.trampoline.size > 0 {
		if err := mprotectAligned(l.trampoline.base, l.trampoline.size, unix.PROT_READ|unix.PROT_EXEC); err != nil {
			return fmt.Errorf("mprotect trampoline: %w", err)
		}
	}

	// Common: 可读写（存放未初始化全局变量）
	if l.common.size > 0 {
		if err := mprotectAligned(l.common.base, l.common.size, unix.PROT_READ|unix.PROT_WRITE); err != nil {
			return fmt.Errorf("mprotect common: %w", err)
		}
	}

	return nil
}

// mprotectAligned 对齐地址后调用 mprotect
func mprotectAligned(addr uintptr, size uintptr, prot int) error {
	pageAddr := addr & ^(uintptr(pageSize - 1)) // 向下对齐到页边界
	end := pageAlign(addr + size)                // 向上对齐到页边界
	return unix.Mprotect(unsafe.Slice((*byte)(unsafe.Pointer(pageAddr)), end-pageAddr), prot)
}

// shouldMapSection 判断 section 是否需要映射（有内容且需要分配内存）
func shouldMapSection(sec *elf.Section) bool {
	if sec == nil || sec.Size == 0 || sec.Flags&elf.SHF_ALLOC == 0 {
		return false
	}
	return sec.Type == elf.SHT_PROGBITS || sec.Type == elf.SHT_NOBITS
}

// pageAlign 将地址向上对齐到页边界
func pageAlign(v uintptr) uintptr {
	return (v + uintptr(pageSize) - 1) &^ (uintptr(pageSize) - 1)
}

// Entry 在符号表中查找指定名称的入口函数并返回其内存地址
func (l *Loader) Entry(method string) (uintptr, error) {
	for i, sym := range l.symbols {
		if sym.Name != method {
			continue
		}
		if sym.Section == elf.SHN_UNDEF {
			return 0, fmt.Errorf("entry %s is undefined", method)
		}
		addr, err := l.internalSymbolAddress(sym, uint32(i))
		if err != nil {
			return 0, err
		}
		return addr, nil
	}
	return 0, fmt.Errorf("entry point %q not found", method)
}

// symbolByRelocIndex 根据重定位条目的符号索引查找符号。
// ELF 符号索引从 1 开始，0 表示空符号。
func (l *Loader) symbolByRelocIndex(index uint32) (elf.Symbol, uint32, error) {
	if index == 0 {
		return elf.Symbol{}, 0, errors.New("relocation references null symbol")
	}
	i := int(index - 1)
	if i < 0 || i >= len(l.symbols) {
		return elf.Symbol{}, 0, fmt.Errorf("relocation symbol index out of range: %d", index)
	}
	return l.symbols[i], uint32(i), nil
}

// internalSymbolAddress 计算内部符号的运行时地址
func (l *Loader) internalSymbolAddress(sym elf.Symbol, symIndex uint32) (uintptr, error) {
	switch sym.Section {
	case elf.SHN_ABS:
		// 绝对符号，sym.Value 即为地址
		return uintptr(sym.Value), nil
	case elf.SHN_COMMON:
		// COMMON 符号，在 common 区域分配空间
		return l.commonFor(symIndex, sym)
	case elf.SHN_UNDEF:
		return 0, fmt.Errorf("undefined symbol: %s", sym.Name)
	}

	// 普通符号: section 基地址 + 符号偏移
	idx := int(sym.Section)
	if idx < 0 || idx >= len(l.sections) || l.sections[idx].addr == 0 {
		return 0, fmt.Errorf("symbol %s points to unmapped section %d", sym.Name, sym.Section)
	}
	return l.sections[idx].addr + uintptr(sym.Value), nil
}

// commonFor 在 COMMON 区域为 SHN_COMMON 符号分配对齐空间。
// sym.Value = 对齐要求, sym.Size = 分配大小。
func (l *Loader) commonFor(symIndex uint32, sym elf.Symbol) (uintptr, error) {
	// 已分配过则直接返回
	if addr, ok := l.common.used[symIndex]; ok {
		return addr, nil
	}

	align := uintptr(sym.Value)
	if align == 0 {
		align = 1
	}
	size := uintptr(sym.Size)
	if size == 0 {
		size = 1
	}

	// 按对齐要求调整分配指针
	l.common.next = (l.common.next + align - 1) &^ (align - 1)
	if l.common.next+size > l.common.base+l.common.size {
		return 0, fmt.Errorf("COMMON area exhausted for symbol %s (size=%d align=%d)", sym.Name, sym.Size, sym.Value)
	}

	addr := l.common.next
	l.common.next += size
	l.common.used[symIndex] = addr
	return addr, nil
}

// symbolAddress 解析符号的运行时地址。
// 内部符号直接计算，外部符号通过 dlsym 解析。
// PC-relative 类重定位需要跳板（因为外部符号可能在 ±2GB 之外）。
func (l *Loader) symbolAddress(sym elf.Symbol, symIndex uint32, relocType elf.R_X86_64) (uintptr, error) {
	if sym.Section != elf.SHN_UNDEF {
		return l.internalSymbolAddress(sym, symIndex)
	}

	name := sym.Name
	if name == "" {
		return 0, errors.New("undefined anonymous symbol")
	}

	// 通过 CGO 桥接的 dlsym 解析外部符号
	addr := resolveExternalSymbol(name)
	if addr == 0 {
		return 0, fmt.Errorf("failed to resolve external symbol: %s", name)
	}

	switch relocType {
	case elf.R_X86_64_PC32, elf.R_X86_64_PLT32:
		// PC-relative 重定位需要跳板，因为目标可能超出 32-bit 偏移范围
		return l.trampolineFor(symIndex, name, addr)
	default:
		return addr, nil
	}
}

// gotFor 为符号分配 GOT 表项并写入目标地址
func (l *Loader) gotFor(symIndex uint32, name string, addr uintptr) (uintptr, error) {
	// 已分配过则直接返回
	if slot, ok := l.got.used[symIndex]; ok {
		return slot, nil
	}
	if l.got.next+gotEntrySize > l.got.base+l.got.size {
		return 0, errors.New("ELF GOT table exhausted")
	}

	slot := l.got.next
	*(*uint64)(unsafe.Pointer(slot)) = uint64(addr) // 写入目标地址
	l.got.used[symIndex] = slot
	l.got.next += gotEntrySize
	return slot, nil
}

// trampolineFor 为外部符号生成跳板代码。
// 跳板指令: mov rax, <absolute addr>; jmp rax
// 这样 PC-relative 重定位只需指向跳板即可，不受 ±2GB 限制。
func (l *Loader) trampolineFor(symIndex uint32, name string, addr uintptr) (uintptr, error) {
	// 已生成过则直接返回
	if slot, ok := l.trampoline.used[symIndex]; ok {
		return slot, nil
	}
	if l.trampoline.next+trampEntSize > l.trampoline.base+l.trampoline.size {
		return 0, errors.New("ELF trampoline table exhausted")
	}

	slot := l.trampoline.next
	code := unsafe.Slice((*byte)(unsafe.Pointer(slot)), trampCodeSize)
	code[0] = 0x48                    // REX.W prefix
	code[1] = 0xB8                    // mov rax, imm64
	binary.LittleEndian.PutUint64(code[2:10], uint64(addr))
	code[10] = 0xFF                   // jmp rax
	code[11] = 0xE0

	l.trampoline.used[symIndex] = slot
	l.trampoline.next += trampEntSize
	return slot, nil
}
