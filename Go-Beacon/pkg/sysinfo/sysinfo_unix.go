// +build !windows

package sysinfo

import "os"

// getACPCode 在 Unix 系统上默认返回 UTF-8 (65001)
func getACPCode() int {
	return 65001
}

// checkIsAdmin 检查当前进程是否具有 root 权限
func checkIsAdmin() bool {
	return os.Geteuid() == 0
}
