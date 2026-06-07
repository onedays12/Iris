//go:build linux && amd64 && cgo

package elf

import (
	"debug/elf"
	"encoding/binary"
	"fmt"
	"math"
	"unsafe"
)

// ApplyRelocations 遍历所有 SHT_RELA section，逐条应用重定位。
func (l *Loader) ApplyRelocations() error {
	for _, sec := range l.file.Sections {
		if sec.Type != elf.SHT_RELA {
			continue
		}

		// sec.Info 指向被重定位的目标 section
		targetIdx := int(sec.Info)
		if targetIdx < 0 || targetIdx >= len(l.sections) || l.sections[targetIdx].addr == 0 {
			continue
		}

		data, err := sec.Data()
		if err != nil {
			return fmt.Errorf("read relocation section %s: %w", sec.Name, err)
		}
		if len(data)%relaEntSize != 0 {
			return fmt.Errorf("invalid RELA section size for %s", sec.Name)
		}

		target := l.sections[targetIdx]
		for off := 0; off < len(data); off += relaEntSize {
			// 解析 Elf64_Rela 结构体
			rOffset := binary.LittleEndian.Uint64(data[off : off+8])
			rInfo := binary.LittleEndian.Uint64(data[off+8 : off+16])
			rAddend := int64(binary.LittleEndian.Uint64(data[off+16 : off+24]))
			symIndex := uint32(rInfo >> 32)   // 高 32 位 = 符号索引
			relocType := elf.R_X86_64(uint32(rInfo)) // 低 32 位 = 重定位类型

			if rOffset >= target.size {
				return fmt.Errorf("relocation offset 0x%x out of section %s (size=0x%x)", rOffset, target.name, target.size)
			}

			// patch = 要修改的内存地址
			patch := target.addr + uintptr(rOffset)

			sym, symIdx, err := l.symbolByRelocIndex(symIndex)
			if err != nil {
				return fmt.Errorf("section %s reloc offset 0x%x: %w", sec.Name, rOffset, err)
			}
			if err := l.applyRelocation(sec.Name, target.name, patch, sym, symIdx, relocType, rAddend, rOffset); err != nil {
				return err
			}
		}
	}
	return nil
}

// applyRelocation 根据重定位类型计算并写入修正值。
func (l *Loader) applyRelocation(relSection string, targetSection string, patch uintptr, sym elf.Symbol, symIndex uint32, relocType elf.R_X86_64, addend int64, relocOffset uint64) error {
	switch relocType {

	case elf.R_X86_64_NONE:
		// 无操作
		return nil

	case elf.R_X86_64_64:
		// 绝对 64-bit 地址: S + A
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		*(*uint64)(unsafe.Pointer(patch)) = uint64(int64(s) + addend)

	case elf.R_X86_64_PC32, elf.R_X86_64_PLT32:
		// PC-relative 32-bit: S + A - P
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		val := int64(s) + addend - int64(patch)
		if val < math.MinInt32 || val > math.MaxInt32 {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch,
				fmt.Errorf("PC-relative relocation overflow: delta=0x%x", val))
		}
		*(*int32)(unsafe.Pointer(patch)) = int32(val)

	case elf.R_X86_64_GOTPCREL, elf.R_X86_64_GOTPCRELX, elf.R_X86_64_REX_GOTPCRELX:
		// GOT PC-relative: G + A - P（通过 GOT 间接引用）
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		got, err := l.gotFor(symIndex, sym.Name, s)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		val := int64(got) + addend - int64(patch)
		if val < math.MinInt32 || val > math.MaxInt32 {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch,
				fmt.Errorf("GOTPCREL relocation overflow: delta=0x%x", val))
		}
		*(*int32)(unsafe.Pointer(patch)) = int32(val)

	case elf.R_X86_64_32:
		// 绝对 32-bit（零扩展）: S + A
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		val := int64(s) + addend
		if val < 0 || val > math.MaxUint32 {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch,
				fmt.Errorf("R_X86_64_32 overflow: val=0x%x", val))
		}
		*(*uint32)(unsafe.Pointer(patch)) = uint32(val)

	case elf.R_X86_64_32S:
		// 绝对 32-bit（符号扩展）: S + A
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		val := int64(s) + addend
		if val < math.MinInt32 || val > math.MaxInt32 {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch,
				fmt.Errorf("R_X86_64_32S overflow: val=0x%x", val))
		}
		*(*int32)(unsafe.Pointer(patch)) = int32(val)

	case elf.R_X86_64_PC64:
		// PC-relative 64-bit: S + A - P
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		*(*int64)(unsafe.Pointer(patch)) = int64(s) + addend - int64(patch)

	case elf.R_X86_64_GOTOFF64:
		// GOT-relative 64-bit 偏移: S + A - GOT
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		gotBase := l.got.base
		*(*uint64)(unsafe.Pointer(patch)) = uint64(int64(s) + addend - int64(gotBase))

	case elf.R_X86_64_GOTPC64:
		// GOT base PC-relative 64-bit: GOT + A - P
		gotBase := l.got.base
		*(*int64)(unsafe.Pointer(patch)) = int64(gotBase) + addend - int64(patch)

	case elf.R_X86_64_GOT64:
		// GOT entry 64-bit: G + A
		s, err := l.symbolAddress(sym, symIndex, relocType)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		got, err := l.gotFor(symIndex, sym.Name, s)
		if err != nil {
			return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch, err)
		}
		*(*uint64)(unsafe.Pointer(patch)) = uint64(int64(got) + addend)

	default:
		return relError(relSection, targetSection, relocOffset, sym, symIndex, relocType, addend, patch,
			fmt.Errorf("unsupported relocation type %s", relocType))
	}

	return nil
}

// relError 构建包含完整诊断上下文的重定位错误信息
func relError(relSection string, targetSection string, relocOffset uint64, sym elf.Symbol, symIndex uint32, relocType elf.R_X86_64, addend int64, patch uintptr, cause error) error {
	symName := sym.Name
	if symName == "" {
		symName = "<anonymous>"
	}
	return fmt.Errorf(
		"relocation failed: section=%s target=%s offset=0x%x sym=%q[%d] type=%s addend=0x%x patch=0x%x: %w",
		relSection, targetSection, relocOffset,
		symName, symIndex, relocType, addend, patch,
		cause,
	)
}
