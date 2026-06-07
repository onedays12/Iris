//go:build windows
package system

import (
	"os"
	"syscall"
	"unsafe"
)

var (
	modkernel32              = syscall.NewLazyDLL("kernel32.dll")
	procProcessIdToSessionId = modkernel32.NewProc("ProcessIdToSessionId")
)

func getCurrentSessionId() (int, error) {
	var sessionId uint32
	pid := uint32(os.Getpid())
	r, _, err := procProcessIdToSessionId.Call(uintptr(pid), uintptr(unsafe.Pointer(&sessionId)))
	if r == 0 {
		return 0, err
	}
	return int(sessionId), nil
}
