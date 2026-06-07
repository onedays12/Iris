//go:build windows && amd64

package coff

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"runtime/debug"
	"strings"
	"syscall"
	"unsafe"

	"github.com/RIscRIpt/pecoff"
	"github.com/RIscRIpt/pecoff/binutil"
	"github.com/RIscRIpt/pecoff/windef"
)

// --- Win32 常量 ---
const (
	memCommit             = 0x1000
	memReserve            = 0x2000
	memRelease            = 0x8000
	memTopDown            = 0x100000
	pageExecuteReadWrite  = 0x40
	pageReadWrite         = 0x04
	imageScnMemExecute    = 0x20000000
	contextAMD64          = 0x100000
	contextAll            = contextAMD64 | 0x1 | 0x2 | 0x4 | 0x8 | 0x10
	exceptionContinue     = 0xFFFFFFFF
	threadAllAccess       = 0x001F0FFF
	threadCreateSuspended = 0x00000001
)

// vehCallback 是 VEH 的 syscall 回调地址
var vehCallback = syscall.NewCallback(vectoredExceptionHandler)

// SectionMap 存储映射后的节区信息
type SectionMap struct {
	Ptr  uintptr // 节区在内存中的地址
	Size uint32  // 节区原始数据大小
}

// Coffee 是 Windows COFF BOF 加载器的核心结构体
type Coffee struct {
	Data      []byte           // 原始 COFF 文件内容
	Symbols   []*pecoff.Symbol // COFF 符号表
	Sections  []*pecoff.Section // COFF 节区列表
	SecMap    []SectionMap      // 节区内存映射
	ImageBase uintptr          // 分配的内存基地址
	TotalSize uintptr          // 内存总大小
	GOT       uintptr          // GOT 表地址（__imp_ 符号间接跳转）
	BSS       uintptr          // BSS 区地址（未初始化全局变量）
	GOTSize   uint32           // GOT 区大小
	BSSSize   uint32           // BSS 区大小
}

// m128a 对应 Windows M128A 结构体（用于 CONTEXT 中的 XMM 寄存器）
type m128a struct {
	Low  uint64
	High int64
}

// threadContext 对应 Windows CONTEXT 结构体（x86_64），用于线程上下文操纵
type threadContext struct {
	P1Home uint64
	P2Home uint64
	P3Home uint64
	P4Home uint64
	P5Home uint64
	P6Home uint64

	ContextFlags uint32
	MxCsr        uint32

	SegCs  uint16
	SegDs  uint16
	SegEs  uint16
	SegFs  uint16
	SegGs  uint16
	SegSs  uint16
	EFlags uint32

	Dr0 uint64
	Dr1 uint64
	Dr2 uint64
	Dr3 uint64
	Dr6 uint64
	Dr7 uint64

	Rax uint64
	Rcx uint64
	Rdx uint64
	Rbx uint64
	Rsp uint64
	Rbp uint64
	Rsi uint64
	Rdi uint64
	R8  uint64
	R9  uint64
	R10 uint64
	R11 uint64
	R12 uint64
	R13 uint64
	R14 uint64
	R15 uint64
	Rip uint64

	Header               [2]m128a
	Legacy               [8]m128a
	Xmm0                 m128a
	Xmm1                 m128a
	Xmm2                 m128a
	Xmm3                 m128a
	Xmm4                 m128a
	Xmm5                 m128a
	Xmm6                 m128a
	Xmm7                 m128a
	Xmm8                 m128a
	Xmm9                 m128a
	Xmm10                m128a
	Xmm11                m128a
	Xmm12                m128a
	Xmm13                m128a
	Xmm14                m128a
	Xmm15                m128a
	VectorRegister       [26]m128a
	VectorControl        uint64
	DebugControl         uint64
	LastBranchToRip      uint64
	LastBranchFromRip    uint64
	LastExceptionToRip   uint64
	LastExceptionFromRip uint64
}

// exceptionPointers 对应 Windows EXCEPTION_POINTERS 结构体
type exceptionPointers struct {
	ExceptionRecord uintptr
	ContextRecord   *threadContext
}

// alignUp 将地址向上对齐到 4KB 页边界
func alignUp(val uintptr) uintptr {
	return (val + 0xFFF) &^ 0xFFF
}

// winVirtualAlloc 封装 VirtualAlloc 系统调用
func winVirtualAlloc(address uintptr, size uintptr, allocationType uint32, protect uint32) (uintptr, error) {
	ret, _, err := syscall.SyscallN(ldrAPI.VirtualAlloc, address, size, uintptr(allocationType), uintptr(protect))
	if ret == 0 {
		return 0, err
	}
	return ret, nil
}

// winVirtualFree 封装 VirtualFree 系统调用（释放整块内存）
func winVirtualFree(address uintptr) error {
	if address == 0 {
		return nil
	}
	ret, _, err := syscall.SyscallN(ldrAPI.VirtualFree, address, 0, uintptr(memRelease))
	if ret == 0 {
		return err
	}
	return nil
}

// vectoredExceptionHandler 是 COFF BOF 的崩溃恢复处理器。
// 当 BOF 代码触发异常时，将 RIP 重定向到 RtlExitUserThread 以安全退出线程，
// 而不是崩溃整个 Beacon 进程。
func vectoredExceptionHandler(exceptionInfo uintptr) uintptr {
	if exceptionInfo == 0 {
		return 0
	}
	info := (*exceptionPointers)(unsafe.Pointer(exceptionInfo))
	if info.ContextRecord == nil {
		return 0
	}

	// 将 RIP 改为 RtlExitUserThread，线程会安全退出而非崩溃
	info.ContextRecord.Rip = uint64(ldrAPI.RtlExitUserThread)
	info.ContextRecord.Rcx = 0 // 退出码 = 0

	// 清除硬件调试寄存器
	info.ContextRecord.Dr0 = 0
	info.ContextRecord.Dr1 = 0
	info.ContextRecord.Dr2 = 0
	info.ContextRecord.Dr3 = 0

	return exceptionContinue
}

// addVectoredExceptionHandler 注册 VEH（优先级最高）
func addVectoredExceptionHandler() (uintptr, error) {
	ret, _, err := syscall.SyscallN(ldrAPI.RtlAddVectoredExceptionHandler, 1, vehCallback)
	if ret == 0 {
		return 0, err
	}
	return ret, nil
}

// removeVectoredExceptionHandler 移除 VEH
func removeVectoredExceptionHandler(handle uintptr) {
	if handle != 0 {
		syscall.SyscallN(ldrAPI.RtlRemoveVectoredExceptionHandler, handle)
	}
}

// alignedContextBuffer 分配 16 字节对齐的 CONTEXT 缓冲区
func alignedContextBuffer() ([]byte, *threadContext) {
	size := unsafe.Sizeof(threadContext{})
	buf := make([]byte, size+16)
	ptr := (uintptr(unsafe.Pointer(&buf[0])) + 15) &^ 15 // 16-byte 对齐
	return buf, (*threadContext)(unsafe.Pointer(ptr))
}

func printf(format string, a ...interface{}) {
	fmt.Printf(format, a...)
}

// PackArgs 将 BOF 参数序列化为 Cobalt Strike 格式。
// 格式: [总长度(4B)] [参数1长度(4B)] [参数1数据] [参数2长度(4B)] [参数2数据] ...
func PackArgs(args []interface{}) []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, uint32(0)) // 占位：总长度

	for _, arg := range args {
		switch v := arg.(type) {
		case uint32:
			binary.Write(buf, binary.LittleEndian, uint32(4))
			binary.Write(buf, binary.LittleEndian, v)
		case int:
			binary.Write(buf, binary.LittleEndian, uint32(4))
			binary.Write(buf, binary.LittleEndian, uint32(v))
		case string:
			strBytes := append([]byte(v), 0) // null-terminated
			binary.Write(buf, binary.LittleEndian, uint32(len(strBytes)))
			buf.Write(strBytes)
		case []byte:
			binary.Write(buf, binary.LittleEndian, uint32(len(v)))
			buf.Write(v)
		}
	}

	result := buf.Bytes()
	binary.LittleEndian.PutUint32(result, uint32(len(result))) // 回填总长度
	return result
}

// isSpecialSymbol 判断是否为特殊符号（EXTERNAL + section 0，即未定义或 COMMON）
func isSpecialSymbol(sym *pecoff.Symbol) bool {
	return sym.StorageClass == windef.IMAGE_SYM_CLASS_EXTERNAL && sym.SectionNumber == 0
}

// isImportSymbol 判断是否为 __imp_ 导入符号
func isImportSymbol(sym *pecoff.Symbol) bool {
	return strings.HasPrefix(sym.NameString(), "__imp_")
}

// stripStdcallSuffix 去除 stdcall 后缀（如 CreateFileA@20 → CreateFileA）
func stripStdcallSuffix(name string) string {
	if idx := strings.Index(name, "@"); idx != -1 {
		return name[:idx]
	}
	return name
}

// amd64RelocName 返回 AMD64 重定位类型的可读名称
func amd64RelocName(relocType uint16) string {
	if name, ok := windef.MAP_IMAGE_REL_AMD64[relocType]; ok {
		return name
	}
	return fmt.Sprintf("0x%X", relocType)
}

// resolveSymbolAddress 解析 COFF 符号地址。
// 处理顺序: 去前缀 → 内置 API → library$function 格式 → 通用模块查找
func resolveSymbolAddress(symbolName string, rt *bofRuntime) uintptr {
	// 去除 __imp_ 和 _ 前缀
	if strings.HasPrefix(symbolName, "__imp_") {
		symbolName = symbolName[6:]
	}
	if strings.HasPrefix(symbolName, "_") {
		symbolName = symbolName[1:]
	}
	symbolName = stripStdcallSuffix(symbolName)

	// 先匹配 Beacon 内置 API
	if addr := resolveInternalAPI(symbolName, rt); addr != 0 {
		return addr
	}

	// 处理 library$function 格式的显式导入
	libName := ""
	procName := ""
	if parts := strings.Split(symbolName, "$"); len(parts) == 2 {
		libName, procName = parts[0], parts[1]
	} else {
		procName = symbolName
		// 尝试从常用模块中查找
		if addr := resolveAPIFromCommonModules(procName); addr != 0 {
			return addr
		}
		return 0
	}

	// 确保库名有 .dll 后缀
	if !strings.Contains(libName, ".") {
		libName += ".dll"
	}
	return resolveAPI(libName, procName)
}

// Load 加载默认方法 "go"
func Load(coffBytes []byte, argBytes []byte) (string, error) {
	return LoadWithMethod(coffBytes, argBytes, "go")
}

// LoadWithMethod 加载指定方法并执行
func LoadWithMethod(coffBytes []byte, argBytes []byte, method string) (string, error) {
	var resultBuilder strings.Builder
	err := LoadWithMethodOutput(coffBytes, argBytes, method, func(s string) {
		resultBuilder.WriteString(s)
		if !strings.HasSuffix(s, "\n") {
			resultBuilder.WriteByte('\n')
		}
	})
	if err != nil {
		return "", err
	}
	return resultBuilder.String(), nil
}

// LoadWithMethodOutput 加载指定方法并执行，BOF 输出会实时交给 emit。
func LoadWithMethodOutput(coffBytes []byte, argBytes []byte, method string, emit func(string)) error {
	return LoadWithMethodOutputStopEvent(coffBytes, argBytes, method, 0, emit)
}

// LoadWithMethodOutputStopEvent 是 COFF BOF 加载的完整入口。
// 流程: 解析 COFF → 分配内存 → 拷贝节区 → 重定位 → 注册异常表 → 执行入口
func LoadWithMethodOutputStopEvent(coffBytes []byte, argBytes []byte, method string, stopEvent uintptr, emit func(string)) error {
	outputChan := make(chan interface{})
	rt := &bofRuntime{
		output:    outputChan,
		stopEvent: stopEvent,
	}

	// 解析 COFF 文件结构
	parsed := pecoff.Explore(binutil.WrapByteSlice(coffBytes))
	parsed.ReadAll()
	parsed.Seal()

	if parsed.FileHeader == nil {
		return fmt.Errorf("missing COFF file header")
	}
	if parsed.FileHeader.Machine != windef.IMAGE_FILE_MACHINE_AMD64 {
		return fmt.Errorf("only AMD64 is supported")
	}

	// 初始化 Coffee 结构体
	pCoffee := &Coffee{
		Data:     coffBytes,
		Symbols:  parsed.Symbols,
		Sections: parsed.Sections.Array(),
		SecMap:   make([]SectionMap, parsed.Sections.Len()),
	}

	// 预计算 GOT 和 BSS 大小
	for _, sym := range pCoffee.Symbols {
		if isSpecialSymbol(sym) {
			if isImportSymbol(sym) {
				pCoffee.GOTSize += 8 // 每个 __imp_ 符号需要一个指针槽
			} else {
				pCoffee.BSSSize += sym.Value + 8 // 普通外部符号占用 BSS
			}
		}
	}

	// 计算总内存大小: sections + GOT + BSS
	var currentSize uintptr
	for _, sec := range pCoffee.Sections {
		if sec.SizeOfRawData > 0 {
			currentSize += alignUp(uintptr(sec.SizeOfRawData))
		}
	}
	gotOffset := currentSize
	currentSize += alignUp(uintptr(pCoffee.GOTSize))
	bssOffset := currentSize
	currentSize += alignUp(uintptr(pCoffee.BSSSize))
	pCoffee.TotalSize = currentSize

	// 分配 RWX 内存（memTopDown 从高地址分配，减少堆碎片）
	baseAddr, err := winVirtualAlloc(0, pCoffee.TotalSize, memCommit|memReserve|memTopDown, pageReadWrite)
	if err != nil {
		return err
	}
	pCoffee.ImageBase = baseAddr
	defer winVirtualFree(baseAddr)

	printf("[+] Allocated BOF buffer at %p (Size: %d)\n", unsafe.Pointer(baseAddr), pCoffee.TotalSize)

	// 拷贝各节区数据到分配的内存
	pNextBase := baseAddr
	for i, sec := range pCoffee.Sections {
		if sec.SizeOfRawData == 0 {
			continue
		}
		pCoffee.SecMap[i] = SectionMap{Ptr: pNextBase, Size: sec.SizeOfRawData}
		copy((*[1 << 30]byte)(unsafe.Pointer(pNextBase))[:sec.SizeOfRawData], sec.RawData())
		pNextBase += alignUp(uintptr(sec.SizeOfRawData))
	}
	pCoffee.GOT = baseAddr + gotOffset
	pCoffee.BSS = baseAddr + bssOffset

	// 重定位处理
	gotIndex := 0
	bssIdx := 0
	gotMap := make(map[string]uintptr) // __imp_ 符号 → GOT 槽地址
	bssMap := make(map[int]uintptr)    // 符号索引 → BSS 地址

	for i, sec := range pCoffee.Sections {
		if sec.SizeOfRawData == 0 {
			continue
		}
		secAddr := pCoffee.SecMap[i].Ptr

		for _, reloc := range sec.Relocations() {
			sym := pCoffee.Symbols[reloc.SymbolTableIndex]
			// 跳过无效符号和绝对重定位
			if sym.StorageClass > 3 || reloc.Type == windef.IMAGE_REL_AMD64_ABSOLUTE {
				continue
			}

			var funcSlot uintptr   // GOT 槽地址（外部函数）
			var symbolSecAddr uintptr // 符号所在 section 的基地址
			var bssAddr uintptr    // BSS 中的地址（外部数据）
			relocAddr := secAddr + uintptr(reloc.VirtualAddress)

			if isSpecialSymbol(sym) {
				if isImportSymbol(sym) {
					// __imp_ 符号: 填充 GOT 表项
					rawName := sym.NameString()
					if slot, ok := gotMap[rawName]; ok {
						funcSlot = slot // 已分配过
					} else {
						extAddr := resolveSymbolAddress(rawName, rt)
						if extAddr == 0 {
							return fmt.Errorf("failed to resolve: %s", rawName)
						}
						funcSlot = pCoffee.GOT + uintptr(gotIndex*8)
						*(*uintptr)(unsafe.Pointer(funcSlot)) = extAddr // 写入实际地址
						gotMap[rawName] = funcSlot
						gotIndex++
					}
				} else {
					// 普通外部符号: 在 BSS 中分配空间
					symIndex := int(reloc.SymbolTableIndex)
					if addr, ok := bssMap[symIndex]; ok {
						bssAddr = addr
					} else {
						bssAddr = pCoffee.BSS + uintptr(bssIdx) + 4
						bssMap[symIndex] = bssAddr
						bssIdx += int(sym.Value)
					}
				}
			} else {
				// 内部符号: 获取其所在 section 的基地址
				if sym.SectionNumber <= 0 || int(sym.SectionNumber) > len(pCoffee.SecMap) {
					return fmt.Errorf("invalid section idx")
				}
				symbolSecAddr = pCoffee.SecMap[int(sym.SectionNumber-1)].Ptr
			}

			// 应用重定位修正
			if funcSlot != 0 {
				// 外部函数: 写入 PC-relative 偏移到 GOT 槽
				offset := uint32(funcSlot - relocAddr - 4)
				*(*uint32)(unsafe.Pointer(relocAddr)) = offset
			} else {
				// 根据重定位类型计算修正值
				if reloc.Type >= windef.IMAGE_REL_AMD64_REL32 && reloc.Type <= windef.IMAGE_REL_AMD64_REL32_5 {
					var offset uint32
					disp := uintptr(reloc.Type - 4)
					if bssAddr != 0 {
						offset = uint32(bssAddr - disp - (relocAddr + 4))
					} else if (sym.StorageClass == windef.IMAGE_SYM_CLASS_STATIC && sym.Value != 0) || (sym.StorageClass == windef.IMAGE_SYM_CLASS_EXTERNAL && sym.SectionNumber != 0) {
						offset = uint32(uintptr(sym.Value) + symbolSecAddr - relocAddr - 4 - disp)
					} else {
						orig := *(*uint32)(unsafe.Pointer(relocAddr))
						offset = uint32(uintptr(orig) + symbolSecAddr - relocAddr - 4 - disp)
					}
					*(*uint32)(unsafe.Pointer(relocAddr)) = offset
				} else if reloc.Type == windef.IMAGE_REL_AMD64_ADDR32NB {
					var offset uint32
					if bssAddr != 0 {
						offset = uint32(bssAddr - (relocAddr + 4))
					} else if (sym.StorageClass == windef.IMAGE_SYM_CLASS_STATIC && sym.Value != 0) || (sym.StorageClass == windef.IMAGE_SYM_CLASS_EXTERNAL && sym.SectionNumber != 0) {
						offset = uint32(uintptr(sym.Value) + symbolSecAddr - relocAddr - 4)
					} else {
						orig := *(*uint32)(unsafe.Pointer(relocAddr))
						offset = uint32(uintptr(orig) + symbolSecAddr - relocAddr - 4)
					}
					*(*uint32)(unsafe.Pointer(relocAddr)) = offset
				} else if reloc.Type == windef.IMAGE_REL_AMD64_ADDR64 {
					var val uint64
					if bssAddr != 0 {
						val = uint64(bssAddr - (relocAddr + 4))
					} else if (sym.StorageClass == windef.IMAGE_SYM_CLASS_STATIC && sym.Value != 0) || (sym.StorageClass == windef.IMAGE_SYM_CLASS_EXTERNAL && sym.SectionNumber != 0) {
						val = uint64(uintptr(sym.Value) + symbolSecAddr)
					} else {
						orig := *(*uint64)(unsafe.Pointer(relocAddr))
						val = uint64(uintptr(orig) + symbolSecAddr)
					}
					*(*uint64)(unsafe.Pointer(relocAddr)) = val
				}
			}
		}

		// 可执行节区设置 PAGE_EXECUTE_READWRITE 保护
		if sec.Characteristics&imageScnMemExecute != 0 {
			var oldProtect uint32
			syscall.SyscallN(ldrAPI.VirtualProtect, secAddr, uintptr(sec.SizeOfRawData), uintptr(pageExecuteReadWrite), uintptr(unsafe.Pointer(&oldProtect)))
		}
	}

	// 注册 .pdata 异常处理表（用于 VEH 和 Windows 异常展开）
	functionTable, err := registerFunctionTable(pCoffee)
	if err != nil {
		return err
	}
	defer unregisterFunctionTable(functionTable)

	// 在新线程中执行 BOF 入口
	go executeCoffeeMethod(pCoffee, method, argBytes, outputChan)

	// 从 outputChan 接收输出并转发给 emit
	for msg := range outputChan {
		if s, ok := msg.(string); ok {
			if emit != nil {
				emit(s)
			}
		}
	}
	return nil
}

// registerFunctionTable 注册 COFF 的 .pdata 节区为 Windows 异常处理函数表
func registerFunctionTable(pCoffee *Coffee) (uintptr, error) {
	if pCoffee == nil || pCoffee.ImageBase == 0 {
		return 0, nil
	}

	for i, sec := range pCoffee.Sections {
		if sec.NameString() != ".pdata" || pCoffee.SecMap[i].Size < 12 {
			continue
		}

		count := uintptr(pCoffee.SecMap[i].Size / 12) // 每个 RUNTIME_FUNCTION 12 字节
		ret, _, err := syscall.SyscallN(
			ldrAPI.RtlAddFunctionTable,
			pCoffee.SecMap[i].Ptr,
			count,
			pCoffee.ImageBase,
		)
		if ret == 0 {
			return 0, fmt.Errorf("RtlAddFunctionTable failed: %v", err)
		}
		return pCoffee.SecMap[i].Ptr, nil
	}
	return 0, nil
}

// unregisterFunctionTable 移除之前注册的异常处理函数表
func unregisterFunctionTable(functionTable uintptr) {
	if functionTable != 0 {
		syscall.SyscallN(ldrAPI.RtlDeleteFunctionTable, functionTable)
	}
}

// executeCoffeeMethod 在新线程中查找并执行 COFF BOF 的指定入口函数
func executeCoffeeMethod(pCoffee *Coffee, methodName string, args []byte, out chan<- interface{}) {
	defer close(out)
	defer func() {
		if r := recover(); r != nil {
			out <- fmt.Sprintf("[!] Exception: %v\n%s", r, debug.Stack())
		}
	}()

	// 在符号表中查找入口函数
	var entry uintptr
	found := false
	for _, sym := range pCoffee.Symbols {
		if sym.NameString() == methodName {
			secIdx := int(sym.SectionNumber - 1)
			entry = pCoffee.SecMap[secIdx].Ptr + uintptr(sym.Value)
			found = true
			break
		}
	}

	if !found {
		out <- fmt.Sprintf("[-] Entry point '%s' not found", methodName)
		return
	}

	if len(args) == 0 {
		args = make([]byte, 1)
	}

	// 通过线程上下文操纵执行入口
	if err := hitCoffeeEntryPointWithThread(entry, uintptr(unsafe.Pointer(&args[0])), uintptr(len(args))); err != nil {
		out <- fmt.Sprintf("[-] Execution failed: %v", err)
	}
}

// hitCoffeeEntryPointWithThread 通过创建挂起线程 → 修改 RIP/RCX/RDX → 恢复执行的方式调用 BOF 入口。
// 这种方式比直接调用更安全：BOF 崩溃时 VEH 会捕获异常并安全退出线程。
func hitCoffeeEntryPointWithThread(entry uintptr, pArg uintptr, argLen uintptr) error {
	// 注册 VEH 以捕获 BOF 中的异常
	veh, err := addVectoredExceptionHandler()
	if err != nil {
		return err
	}
	defer removeVectoredExceptionHandler(veh)

	// 创建挂起线程（初始 RIP = RtlExitUserThread，作为安全返回点）
	var hThread uintptr
	ret, _, _ := syscall.SyscallN(
		ldrAPI.NtCreateThreadEx,
		uintptr(unsafe.Pointer(&hThread)),
		uintptr(threadAllAccess),
		0,
		uintptr(^uintptr(0)),         // 最大地址
		ldrAPI.RtlExitUserThread,     // 初始入口（安全退出点）
		0,
		uintptr(threadCreateSuspended), // 创建后挂起
		0, 0, 0, 0,
	)
	if ret != 0 {
		return fmt.Errorf("NtCreateThreadEx error: 0x%X", ret)
	}
	defer syscall.SyscallN(ldrAPI.CloseHandle, hThread)

	// 获取线程上下文
	_, ctx := alignedContextBuffer()
	ctx.ContextFlags = contextAll
	ret, _, _ = syscall.SyscallN(ldrAPI.NtGetContextThread, hThread, uintptr(unsafe.Pointer(ctx)))
	if ret != 0 {
		return fmt.Errorf("NtGetContextThread error: 0x%X", ret)
	}

	// 修改上下文: RIP = BOF 入口, RCX = args 指针, RDX = args 长度
	ctx.Rip = uint64(entry)
	ctx.Rcx = uint64(pArg)
	ctx.Rdx = uint64(argLen)

	// 将 RtlExitUserThread 压入栈顶，作为 BOF 函数返回时的返回地址
	*(*uint64)(unsafe.Pointer(uintptr(ctx.Rsp))) = uint64(ldrAPI.RtlExitUserThread)

	// 设置上下文并恢复线程执行
	ret, _, _ = syscall.SyscallN(ldrAPI.NtSetContextThread, hThread, uintptr(unsafe.Pointer(ctx)))
	if ret != 0 {
		return fmt.Errorf("NtSetContextThread error: 0x%X", ret)
	}
	ret, _, _ = syscall.SyscallN(ldrAPI.NtResumeThread, hThread, 0)
	if ret != 0 {
		return fmt.Errorf("NtResumeThread error: 0x%X", ret)
	}

	// 等待 BOF 执行完毕
	ret, _, _ = syscall.SyscallN(ldrAPI.NtWaitForSingleObject, hThread, 0, 0)
	if ret != 0 {
		return fmt.Errorf("NtWaitForSingleObject error: 0x%X", ret)
	}

	return nil
}
