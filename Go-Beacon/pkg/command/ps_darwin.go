//go:build darwin

package command

import (
	"debug/macho"
	"fmt"
	"os"
	"os/user"
	"runtime"
	"strconv"
	"syscall"
	"unsafe"

	"golang.org/x/sys/unix"
)

// sysctl constants for KERN_PROCARGS2.
const (
	ctlKern       = 1
	kernProcargs2 = 49 // KERN_PROCARGS2: returns argc + executable path + argv
)

// sysctlRaw performs a raw sysctl(3) call and returns the result buffer.
func sysctlRaw(mib []int32) ([]byte, error) {
	mibPtr := unsafe.Pointer(&mib[0])
	mibLen := uintptr(len(mib))

	// First call: get required buffer size.
	var bufLen uintptr
	_, _, errno := syscall.Syscall6(
		syscall.SYS___SYSCTL,
		uintptr(mibPtr), mibLen,
		0, uintptr(unsafe.Pointer(&bufLen)),
		0, 0,
	)
	if errno != 0 {
		return nil, fmt.Errorf("sysctl size: %v", errno)
	}
	if bufLen == 0 {
		return []byte{}, nil
	}

	buf := make([]byte, bufLen)
	_, _, errno = syscall.Syscall6(
		syscall.SYS___SYSCTL,
		uintptr(mibPtr), mibLen,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&bufLen)),
		0, 0,
	)
	if errno != 0 {
		return nil, fmt.Errorf("sysctl read: %v", errno)
	}
	return buf[:bufLen], nil
}

// listProcesses enumerates all processes on macOS via sysctl kern.proc.all.
func listProcesses(acp int) ([]ProcessInfo, error) {
	procs, err := unix.SysctlKinfoProcSlice("kern.proc.all")
	if err != nil {
		return nil, fmt.Errorf("sysctl kern.proc.all: %w", err)
	}

	uidCache := make(map[string]string)
	results := make([]ProcessInfo, 0, len(procs))

	for _, kp := range procs {
		pid := uint32(kp.Proc.P_pid)
		if pid == 0 {
			continue // kernel_task, skip
		}
		ppid := uint32(kp.Eproc.Ppid)
		uid := kp.Eproc.Ucred.Uid
		pgid := uint32(kp.Eproc.Pgid)

		comm := readCStringBytes(kp.Proc.P_comm[:])
		userName := lookupUIDNameDarwin(strconv.FormatUint(uint64(uid), 10), uidCache)

		// 通过 KERN_PROCARGS2 获取可执行文件路径（系统进程可能失败）
		path, _ := procPidpathViaSysctl(int(pid))

		// 路径获取失败时，尝试在常见目录中搜索
		if path == "" && comm != "" {
			path = findExecutableByComm(comm)
		}

		// 读取可执行文件 header 获取架构；Universal binary 优先匹配当前 Beacon 架构。
		arch := readMachOArch(path)

		results = append(results, ProcessInfo{
			PID:       pid,
			PPID:      ppid,
			Name:      comm,
			Path:      path,
			User:      userName,
			Arch:      arch,
			SessionID: pgid,
		})
	}

	return results, nil
}

func readCStringBytes(b []byte) string {
	end := len(b)
	for i := 0; i < len(b); i++ {
		if b[i] == 0 {
			end = i
			break
		}
	}
	return string(b[:end])
}

func lookupUIDNameDarwin(uid string, cache map[string]string) string {
	if uid == "" || uid == "0" {
		return "root"
	}
	if name, ok := cache[uid]; ok {
		return name
	}
	u, err := user.LookupId(uid)
	if err != nil {
		cache[uid] = uid
		return uid
	}
	name := u.Username
	if name == "" {
		name = uid
	}
	cache[uid] = name
	return name
}

// procPidpathViaSysctl 通过 KERN_PROCARGS2 sysctl 获取进程的可执行文件路径。
// 响应格式：[argc int32][executable_path null-terminated][argv...]
func procPidpathViaSysctl(pid int) (string, error) {
	mib := []int32{ctlKern, kernProcargs2, int32(pid)}
	buf, err := sysctlRaw(mib)
	if err != nil {
		return "", err
	}
	if len(buf) < 5 {
		return "", fmt.Errorf("procargs2 too short (%d bytes)", len(buf))
	}

	// 跳过前 4 字节（argc），读取 null 结尾的可执行文件路径
	path := buf[4:]
	for i, b := range path {
		if b == 0 {
			return string(path[:i]), nil
		}
	}
	return string(path), nil
}

// readMachOArch 读取可执行文件 header，返回进程架构。
// 支持简单 Mach-O 和 FAT/universal binary 格式；FAT 文件优先选择当前 Beacon 架构对应的 slice。
// 当前 ps 协议按 Windows x86/x64 枚举显示，Darwin arm64 先折叠为 64-bit，避免被旧客户端误判为 x86。
// 返回值：0=x86, 1=64-bit，读取失败时返回 -1。
func readMachOArch(path string) int32 {
	if path == "" {
		return -1
	}

	if ff, err := macho.OpenFat(path); err == nil {
		defer ff.Close()
		fallback := int32(-1)
		preferred := currentMachOArch()
		for _, arch := range ff.Arches {
			value := machoCPUToArch(arch.Cpu)
			if value == preferred {
				return value
			}
			if fallback == -1 && value != -1 {
				fallback = value
			}
		}
		return fallback
	}

	f, err := macho.Open(path)
	if err != nil {
		return -1
	}
	defer f.Close()
	return machoCPUToArch(f.Cpu)
}

// currentMachOArch 返回当前 Beacon 运行架构对应的枚举值。
func currentMachOArch() int32 {
	switch runtime.GOARCH {
	case "386":
		return 0
	case "amd64", "arm64":
		return 1
	default:
		return -1
	}
}

// machoCPUToArch 将 Mach-O CPU 类型映射为架构值。
func machoCPUToArch(cpu macho.Cpu) int32 {
	switch cpu {
	case macho.Cpu386:
		return 0 // x86
	case macho.CpuAmd64:
		return 1 // x64 / 64-bit
	case macho.CpuArm64:
		return 1 // arm64 is represented as 64-bit in the current ps protocol
	default:
		return -1
	}
}

// findExecutableByComm 在常见目录中按进程名搜索可执行文件路径。
// 用于 KERN_PROCARGS2 失败时的回退（如系统进程）。
func findExecutableByComm(comm string) string {
	if comm == "" {
		return ""
	}
	candidates := []string{
		"/sbin/" + comm,
		"/usr/sbin/" + comm,
		"/usr/bin/" + comm,
		"/usr/libexec/" + comm,
		"/System/Library/CoreServices/" + comm,
	}
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

func terminateProcess(pid int) (string, error) {
	process, err := os.FindProcess(pid)
	if err != nil {
		return "", err
	}
	err = process.Kill()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Process %d terminated", pid), nil
}

func stealTokenLogic(pid int) (string, error) {
	return "", fmt.Errorf("StealToken is only supported on Windows")
}

func whoamiLogic() (string, error) {
	hostname, _ := os.Hostname()
	username := "unknown"
	if u := os.Getenv("USER"); u != "" {
		username = u
	} else if u := os.Getenv("LOGNAME"); u != "" {
		username = u
	}
	return fmt.Sprintf("%s\\%s (User)", hostname, username), nil
}
