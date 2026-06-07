// +build windows

package sysinfo

import (
	"os"
	"syscall"
)

var (
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	getACP   = kernel32.NewProc("GetACP")
)

// getACPCode 获取系统活动代码页 (ANSI Code Page)
func getACPCode() int {
	r, _, _ := getACP.Call()
	return int(r)
}

// checkIsAdmin 检查当前进程是否具有管理员权限
func checkIsAdmin() bool {
	// 尝试打开物理驱动器是一个简单有效的权限检测方法
	f, err := os.Open("\\\\.\\PHYSICALDRIVE0")
	if err != nil {
		return false
	}
	f.Close()
	return true
}
