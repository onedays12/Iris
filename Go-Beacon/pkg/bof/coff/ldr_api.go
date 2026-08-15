//go:build windows && amd64

package coff

import (
	"encoding/binary"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

// currentPEB 由汇编实现（peb_windows_amd64.s），返回当前线程的 PEB 地址
func currentPEB() uintptr

// listEntry 对应 Windows LIST_ENTRY 双向链表节点
type listEntry struct {
	Flink uintptr // 指向下一个节点
	Blink uintptr // 指向上一个节点
}

// unicodeString 对应 Windows UNICODE_STRING 结构体
type unicodeString struct {
	Length        uint16  // 字符串实际长度（字节）
	MaximumLength uint16  // buffer 最大长度（字节）
	Buffer        uintptr // 宽字符 buffer 地址
}

// peb 对应 Windows PEB（Process Environment Block）的部分字段
type peb struct {
	Reserved [0x18]byte
	Ldr      *pebLdrData // PEB_LDR_DATA 指针
}

// pebLdrData 对应 Windows PEB_LDR_DATA 结构体
type pebLdrData struct {
	Length                  uint32
	Initialized             byte
	Reserved1               [3]byte
	SsHandle                uintptr
	InLoadOrderModuleList   listEntry // 按加载顺序排列的模块链表
	InMemoryOrderModuleList listEntry // 按内存地址排列的模块链表
	InInitOrderModuleList   listEntry // 按初始化顺序排列的模块链表
}

// ldrDataTableEntry 对应 Windows LDR_DATA_TABLE_ENTRY 结构体
type ldrDataTableEntry struct {
	InLoadOrderLinks           listEntry
	InMemoryOrderLinks         listEntry
	InInitializationOrderLinks listEntry
	DllBase                    uintptr       // DLL 加载基地址
	EntryPoint                 uintptr       // DLL 入口点
	SizeOfImage                uint32        // 映像大小
	FullDllName                unicodeString // 完整路径
	BaseDllName                unicodeString // 基本文件名
}

// ldrAPITable 缓存常用 Win32 API 函数地址，避免重复 PEB 遍历
type ldrAPITable struct {
	CloseHandle                       uintptr
	GetProcessHeap                    uintptr
	HeapAlloc                         uintptr
	HeapFree                          uintptr
	MultiByteToWideChar               uintptr
	RtlAddVectoredExceptionHandler    uintptr
	RtlAddFunctionTable               uintptr
	RtlDeleteFunctionTable            uintptr
	RtlExitUserThread                 uintptr
	RtlRemoveVectoredExceptionHandler uintptr
	GetCurrentThreadId                uintptr
	GetThreadId                       uintptr
	VirtualAlloc                      uintptr
	VirtualFree                       uintptr
	VirtualProtect                    uintptr
	LdrLoadDll                        uintptr
	NtCreateThreadEx                  uintptr
	NtGetContextThread                uintptr
	NtResumeThread                    uintptr
	NtSetContextThread                uintptr
	NtWaitForSingleObject             uintptr
}

var (
	ldrLoadDLLAddr uintptr            // LdrLoadDll 地址（按需加载 DLL 用）
	ldrAPI         = mustInitLdrAPI() // 初始化时填充所有 API 地址
)

// mustInitLdrAPI 从 PEB 中定位 kernel32.dll 和 ntdll.dll，解析所有需要的导出函数
func mustInitLdrAPI() ldrAPITable {
	kernel32 := getModuleByPEBName("kernel32.dll")
	ntdll := getModuleByPEBName("ntdll.dll")
	if kernel32 == 0 || ntdll == 0 {
		panic("failed to locate kernel32.dll or ntdll.dll from PEB")
	}

	ldrLoadDLLAddr = mustExport(ntdll, "LdrLoadDll")
	api := ldrAPITable{
		// kernel32.dll 导出
		CloseHandle:         mustExport(kernel32, "CloseHandle"),
		GetProcessHeap:      mustExport(kernel32, "GetProcessHeap"),
		HeapAlloc:           mustExport(kernel32, "HeapAlloc"),
		HeapFree:            mustExport(kernel32, "HeapFree"),
		MultiByteToWideChar: mustExport(kernel32, "MultiByteToWideChar"),
		VirtualAlloc:        mustExport(kernel32, "VirtualAlloc"),
		VirtualFree:         mustExport(kernel32, "VirtualFree"),
		VirtualProtect:      mustExport(kernel32, "VirtualProtect"),
		LdrLoadDll:          ldrLoadDLLAddr,
		// ntdll.dll 导出
		NtCreateThreadEx:                  mustExport(ntdll, "NtCreateThreadEx"),
		NtGetContextThread:                mustExport(ntdll, "NtGetContextThread"),
		NtResumeThread:                    mustExport(ntdll, "NtResumeThread"),
		NtSetContextThread:                mustExport(ntdll, "NtSetContextThread"),
		NtWaitForSingleObject:             mustExport(ntdll, "NtWaitForSingleObject"),
		RtlAddVectoredExceptionHandler:    mustExport(ntdll, "RtlAddVectoredExceptionHandler"),
		RtlAddFunctionTable:               mustExport(ntdll, "RtlAddFunctionTable"),
		RtlDeleteFunctionTable:            mustExport(ntdll, "RtlDeleteFunctionTable"),
		RtlExitUserThread:                 mustExport(ntdll, "RtlExitUserThread"),
		RtlRemoveVectoredExceptionHandler: mustExport(ntdll, "RtlRemoveVectoredExceptionHandler"),
		GetCurrentThreadId:                mustExport(kernel32, "GetCurrentThreadId"),
		GetThreadId:                       mustExport(kernel32, "GetThreadId"),
	}
	return api
}

// mustExport 解析导出函数，失败时 panic
func mustExport(module uintptr, name string) uintptr {
	addr := resolveExportByName(module, name)
	if addr == 0 {
		panic("failed to resolve export: " + name)
	}
	return addr
}

// getModuleByPEBName 通过遍历 PEB 的 InMemoryOrderModuleList 查找已加载的 DLL 基地址
func getModuleByPEBName(name string) uintptr {
	pebAddr := currentPEB()
	if pebAddr == 0 {
		return 0
	}

	p := (*peb)(unsafe.Pointer(pebAddr))
	if p.Ldr == nil {
		return 0
	}

	// 遍历 InMemoryOrderModuleList 链表
	head := uintptr(unsafe.Pointer(&p.Ldr.InMemoryOrderModuleList))
	current := p.Ldr.InMemoryOrderModuleList.Flink
	offset := unsafe.Offsetof(ldrDataTableEntry{}.InMemoryOrderLinks)

	for current != 0 && current != head {
		entry := (*ldrDataTableEntry)(unsafe.Pointer(current - offset))
		if entry.DllBase != 0 {
			baseName := readUTF16String(entry.BaseDllName.Buffer, int(entry.BaseDllName.Length/2))
			if strings.EqualFold(baseName, name) {
				return entry.DllBase
			}
		}
		current = (*listEntry)(unsafe.Pointer(current)).Flink
	}
	return 0
}

// resolveExportByName 通过 PE 导出表按名称查找函数地址
func resolveExportByName(module uintptr, name string) uintptr {
	addr, _, _ := resolveExportByNameDepth(module, name, 0)
	return addr
}

// resolveExportByNameDepth 递归解析导出函数（支持 forwarded export）
func resolveExportByNameDepth(module uintptr, name string, depth int) (uintptr, uint32, uint32) {
	if module == 0 || depth > 8 {
		return 0, 0, 0
	}

	// 获取导出目录 RVA 和大小
	exportsRVA, exportsSize := exportDirectory(module)
	if exportsRVA == 0 {
		return 0, 0, 0
	}

	exportDir := module + uintptr(exportsRVA)
	numberOfNames := readU32(exportDir + 0x18)
	addressOfFunctions := module + uintptr(readU32(exportDir+0x1c))
	addressOfNames := module + uintptr(readU32(exportDir+0x20))
	addressOfNameOrdinals := module + uintptr(readU32(exportDir+0x24))

	// 按名称遍历导出表
	for i := uint32(0); i < numberOfNames; i++ {
		funcName := readCString(module + uintptr(readU32(addressOfNames+uintptr(i*4))))
		if funcName != name {
			continue
		}

		ordinal := readU16(addressOfNameOrdinals + uintptr(i*2))
		funcRVA := readU32(addressOfFunctions + uintptr(ordinal)*4)
		funcAddr := module + uintptr(funcRVA)

		// 检测 forwarded export（RVA 落在导出目录范围内）
		if funcRVA >= exportsRVA && funcRVA < exportsRVA+exportsSize {
			return resolveForwardedExport(readCString(funcAddr), depth+1)
		}
		return funcAddr, exportsRVA, exportsSize
	}

	return 0, exportsRVA, exportsSize
}

// resolveForwardedExport 解析转发导出（如 "ntdll.RtlAllocateHeap"）
func resolveForwardedExport(forwarder string, depth int) (uintptr, uint32, uint32) {
	dot := strings.LastIndexByte(forwarder, '.')
	if dot <= 0 || dot == len(forwarder)-1 {
		return 0, 0, 0
	}

	moduleName := forwarder[:dot]
	procName := forwarder[dot+1:]
	if !strings.Contains(moduleName, ".") {
		moduleName += ".dll"
	}

	module := getOrLoadModule(moduleName)
	if module == 0 || strings.HasPrefix(procName, "#") {
		return 0, 0, 0
	}
	return resolveExportByNameDepth(module, procName, depth)
}

// getOrLoadModule 先从 PEB 查找模块，找不到则通过 LdrLoadDll 加载
func getOrLoadModule(name string) uintptr {
	if module := getModuleByPEBName(name); module != 0 {
		return module
	}
	module, _ := ldrLoadDLL(name)
	return module
}

// ldrLoadDLL 通过 LdrLoadDll 系统调用加载 DLL
func ldrLoadDLL(name string) (uintptr, uint32) {
	if ldrLoadDLLAddr == 0 {
		return 0, 0xC0000135 // STATUS_DLL_NOT_FOUND
	}

	// 转换为 UTF-16 字符串
	wide := utf16.Encode([]rune(name + "\x00"))
	us := unicodeString{
		Length:        uint16((len(wide) - 1) * 2),
		MaximumLength: uint16(len(wide) * 2),
		Buffer:        uintptr(unsafe.Pointer(&wide[0])),
	}

	var module uintptr
	status, _, _ := syscall.SyscallN(ldrLoadDLLAddr, 0, 0, uintptr(unsafe.Pointer(&us)), uintptr(unsafe.Pointer(&module)))
	return module, uint32(status)
}

// exportDirectory 从 PE 头中提取导出目录的 RVA 和大小
func exportDirectory(module uintptr) (uint32, uint32) {
	// 验证 MZ 签名
	if readU16(module) != 0x5A4D {
		return 0, 0
	}

	// 定位 PE 签名
	nt := module + uintptr(readU32(module+0x3c))
	if readU32(nt) != 0x00004550 { // "PE\0\0"
		return 0, 0
	}

	// 根据 Optional Header Magic 定位数据目录
	optional := nt + 0x18
	magic := readU16(optional)
	dataDirectory := uintptr(0)
	switch magic {
	case 0x20b: // PE32+ (64-bit)
		dataDirectory = optional + 0x70
	case 0x10b: // PE32 (32-bit)
		dataDirectory = optional + 0x60
	default:
		return 0, 0
	}

	return readU32(dataDirectory), readU32(dataDirectory + 4)
}

// readUTF16String 从内存读取 UTF-16 字符串并转换为 Go string
func readUTF16String(ptr uintptr, length int) string {
	if ptr == 0 || length <= 0 {
		return ""
	}
	buf := unsafe.Slice((*uint16)(unsafe.Pointer(ptr)), length)
	return string(utf16.Decode(buf))
}

// readU16 从内存地址读取 16-bit 小端值
func readU16(ptr uintptr) uint16 {
	return binary.LittleEndian.Uint16(unsafe.Slice((*byte)(unsafe.Pointer(ptr)), 2))
}

// readU32 从内存地址读取 32-bit 小端值
func readU32(ptr uintptr) uint32 {
	return binary.LittleEndian.Uint32(unsafe.Slice((*byte)(unsafe.Pointer(ptr)), 4))
}

// resolveAPI 从指定 DLL 中查找导出函数
func resolveAPI(moduleName string, procName string) uintptr {
	module := getOrLoadModule(moduleName)
	if module == 0 {
		return 0
	}
	return resolveExportByName(module, procName)
}

// resolveAPIFromCommonModules 从常用系统 DLL 中查找导出函数
func resolveAPIFromCommonModules(procName string) uintptr {
	for _, module := range []string{"kernel32.dll", "kernelbase.dll", "user32.dll", "advapi32.dll", "msvcrt.dll"} {
		if addr := resolveAPI(module, procName); addr != 0 {
			return addr
		}
	}
	return 0
}
