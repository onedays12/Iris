//go:build !windows
// +build !windows

package command

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

func listWindowsDrives() ([]any, error) {
	// Unix 系统下不列出盘符，返回空结果
	return []any{}, nil
}

func isFileHidden(path string) bool {
	// 在 Unix 下，以 . 开头的文件视为隐藏
	name := filepath.Base(path)
	return len(name) > 0 && name[0] == '.'
}

func getFileOwner(path string) string {
	// 在 Unix 下实现简单的 UID 获取
	info, err := os.Stat(path)
	if err != nil {
		return "unknown"
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return fmt.Sprintf("%d", stat.Uid)
	}
	return "unknown"
}

// applyPlatformAttributes 执行 Unix 特有的属性修改
func applyPlatformAttributes(path string, flag int, cTime int64, winAttrs uint32, linuxMode uint32, mTime, aTime int64) error {
	// 1. 设置 Unix 权限 (LinuxMode) - Bit 32
	if flag&32 != 0 {
		if err := os.Chmod(path, os.FileMode(linuxMode)); err != nil {
			return err
		}
	}

	// 注：Unix 下通常不支持在用户态直接修改文件创建时间（CTime 通常指 Change Time），
	// 且 Windows 专有属性在此处会被忽略。
	return nil
}
