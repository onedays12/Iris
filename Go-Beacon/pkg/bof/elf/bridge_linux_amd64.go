//go:build linux && amd64 && cgo

package elf

/*
#cgo linux LDFLAGS: -ldl
#include <stdint.h>
#include <stdlib.h>

// C 桥接函数声明（实现在 bridge_linux_amd64.c 中）
void elfbof_call_go(void* entry, char* args, int len, uintptr_t runtime_id);
void* elfbof_dlsym(char* name);

// Beacon API 函数指针获取器
void* elfbof_ptr_BeaconOutput(void);
void* elfbof_ptr_BeaconPrintf(void);
void* elfbof_ptr_BeaconDataParse(void);
void* elfbof_ptr_BeaconDataInt(void);
void* elfbof_ptr_BeaconDataShort(void);
void* elfbof_ptr_BeaconDataLength(void);
void* elfbof_ptr_BeaconDataExtract(void);
void* elfbof_ptr_BeaconFormatAlloc(void);
void* elfbof_ptr_BeaconFormatReset(void);
void* elfbof_ptr_BeaconFormatFree(void);
void* elfbof_ptr_BeaconFormatAppend(void);
void* elfbof_ptr_BeaconFormatPrintf(void);
void* elfbof_ptr_BeaconFormatToString(void);
void* elfbof_ptr_BeaconFormatInt(void);
void* elfbof_ptr_BeaconGetStopJobEvent(void);
void* elfbof_ptr_BeaconWakeup(void);
void* elfbof_ptr_BeaconIsAdmin(void);
void* elfbof_ptr_BeaconAddValue(void);
void* elfbof_ptr_BeaconGetValue(void);
void* elfbof_ptr_BeaconRemoveValue(void);
void* elfbof_ptr_getEnviron(void);
void* elfbof_ptr_getOSName(void);
*/
import "C"

import (
	"strings"
	"sync"
	"sync/atomic"
	"unsafe"
)

// bofRuntime 持有单次 BOF 执行的上下文，通过 runtimeID 与 C 桥接层关联
type bofRuntime struct {
	id     uintptr      // 唯一标识，用于 C→Go 回调时查找
	stopFD uintptr      // killjob 用的 eventfd
	emit   func(string) // 实时输出回调
}

var (
	runtimeSeq atomic.Uint64   // 递增的 runtime ID 生成器
	runtimes   sync.Map        // map[uintptr]*bofRuntime，存放所有活跃 runtime
)

// newRuntime 创建并注册一个新的 BOF 运行时上下文
func newRuntime(stopFD uintptr, emit func(string)) *bofRuntime {
	id := uintptr(runtimeSeq.Add(1))
	if id == 0 {
		id = uintptr(runtimeSeq.Add(1)) // 跳过 0（保留值）
	}
	rt := &bofRuntime{id: id, stopFD: stopFD, emit: emit}
	runtimes.Store(id, rt)
	return rt
}

// deleteRuntime 从注册表中移除 runtime
func deleteRuntime(id uintptr) {
	runtimes.Delete(id)
}

// lookupRuntime 根据 ID 查找 runtime（C 回调时使用）
func lookupRuntime(id uintptr) *bofRuntime {
	if v, ok := runtimes.Load(id); ok {
		if rt, ok := v.(*bofRuntime); ok {
			return rt
		}
	}
	return nil
}

// callEntry 通过 CGO 调用 BOF 的入口函数
func callEntry(entry uintptr, args []byte, runtimeID uintptr) {
	C.elfbof_call_go(unsafe.Pointer(entry), (*C.char)(unsafe.Pointer(&args[0])), C.int(len(args)), C.uintptr_t(runtimeID))
}

// elfbofEmit 是 C 桥接层调用的输出回调（由 C 端 elfbof_emit 调用）
//
//export elfbofEmit
func elfbofEmit(runtimeID C.uintptr_t, data *C.char, length C.int) {
	if data == nil || length <= 0 {
		return
	}
	rt := lookupRuntime(uintptr(runtimeID))
	if rt == nil || rt.emit == nil {
		return
	}
	buf := C.GoBytes(unsafe.Pointer(data), length)
	rt.emit(string(buf))
}

// elfbofGetStopFD 返回当前 runtime 的 stop eventfd（由 C 端调用）
//
//export elfbofGetStopFD
func elfbofGetStopFD(runtimeID C.uintptr_t) C.uintptr_t {
	rt := lookupRuntime(uintptr(runtimeID))
	if rt == nil {
		return 0
	}
	return C.uintptr_t(rt.stopFD)
}

// resolveExternalSymbol 解析外部符号地址。
// 优先查找 Beacon 内置 API，然后尝试去掉下划线前缀，最后回退到 dlsym。
func resolveExternalSymbol(name string) uintptr {
	// 先匹配 Beacon API
	if addr := resolveBeaconSymbol(name); addr != 0 {
		return addr
	}

	// 去掉 ELF 符号的下划线前缀再试一次
	if strings.HasPrefix(name, "_") {
		if addr := resolveBeaconSymbol(name[1:]); addr != 0 {
			return addr
		}
	}

	// 回退到 dlsym（从 libc 等动态库中查找）
	cName := C.CString(name)
	defer C.free(unsafe.Pointer(cName))
	return uintptr(C.elfbof_dlsym(cName))
}

// resolveBeaconSymbol 将 Beacon API 名称映射为 C 桥接函数返回的函数指针
func resolveBeaconSymbol(name string) uintptr {
	switch name {
	case "BeaconOutput":
		return uintptr(C.elfbof_ptr_BeaconOutput())
	case "BeaconPrintf":
		return uintptr(C.elfbof_ptr_BeaconPrintf())
	case "BeaconDataParse":
		return uintptr(C.elfbof_ptr_BeaconDataParse())
	case "BeaconDataInt":
		return uintptr(C.elfbof_ptr_BeaconDataInt())
	case "BeaconDataShort":
		return uintptr(C.elfbof_ptr_BeaconDataShort())
	case "BeaconDataLength":
		return uintptr(C.elfbof_ptr_BeaconDataLength())
	case "BeaconDataExtract":
		return uintptr(C.elfbof_ptr_BeaconDataExtract())
	case "BeaconFormatAlloc":
		return uintptr(C.elfbof_ptr_BeaconFormatAlloc())
	case "BeaconFormatReset":
		return uintptr(C.elfbof_ptr_BeaconFormatReset())
	case "BeaconFormatFree":
		return uintptr(C.elfbof_ptr_BeaconFormatFree())
	case "BeaconFormatAppend":
		return uintptr(C.elfbof_ptr_BeaconFormatAppend())
	case "BeaconFormatPrintf":
		return uintptr(C.elfbof_ptr_BeaconFormatPrintf())
	case "BeaconFormatToString":
		return uintptr(C.elfbof_ptr_BeaconFormatToString())
	case "BeaconFormatInt":
		return uintptr(C.elfbof_ptr_BeaconFormatInt())
	case "BeaconGetStopJobEvent":
		return uintptr(C.elfbof_ptr_BeaconGetStopJobEvent())
	case "BeaconWakeup":
		return uintptr(C.elfbof_ptr_BeaconWakeup())
	case "BeaconIsAdmin":
		return uintptr(C.elfbof_ptr_BeaconIsAdmin())
	case "BeaconAddValue":
		return uintptr(C.elfbof_ptr_BeaconAddValue())
	case "BeaconGetValue":
		return uintptr(C.elfbof_ptr_BeaconGetValue())
	case "BeaconRemoveValue":
		return uintptr(C.elfbof_ptr_BeaconRemoveValue())
	case "getEnviron":
		return uintptr(C.elfbof_ptr_getEnviron())
	case "getOSName":
		return uintptr(C.elfbof_ptr_getOSName())
	default:
		return 0
	}
}
