//go:build windows

package command

import (
	"net"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	afInet              = 2
	tcpTableOwnerPIDAll = 5
	udpTableOwnerPID    = 1
)

var (
	modiphlpapi             = windows.NewLazySystemDLL("iphlpapi.dll")
	procGetExtendedTCPTable = modiphlpapi.NewProc("GetExtendedTcpTable")
	procGetExtendedUDPTable = modiphlpapi.NewProc("GetExtendedUdpTable")
)

type mibTCPRowOwnerPID struct {
	State      uint32
	LocalAddr  uint32
	LocalPort  uint32
	RemoteAddr uint32
	RemotePort uint32
	OwningPID  uint32
}

type mibUDPRowOwnerPID struct {
	LocalAddr uint32
	LocalPort uint32
	OwningPID uint32
}

func listNetworkConnections() ([]NetworkConnection, error) {
	tcp, err := listWindowsTCPConnections()
	if err != nil {
		return nil, err
	}
	udp, err := listWindowsUDPConnections()
	if err != nil {
		return nil, err
	}
	return append(tcp, udp...), nil
}

func listWindowsTCPConnections() ([]NetworkConnection, error) {
	buf, err := loadWindowsTCPTable()
	if err != nil {
		return nil, err
	}
	if len(buf) < 4 {
		return []NetworkConnection{}, nil
	}

	count := *(*uint32)(unsafe.Pointer(&buf[0]))
	rowSize := unsafe.Sizeof(mibTCPRowOwnerPID{})
	connections := make([]NetworkConnection, 0, count)
	for i := uint32(0); i < count; i++ {
		offset := uintptr(4) + uintptr(i)*rowSize
		if int(offset+rowSize) > len(buf) {
			break
		}
		row := (*mibTCPRowOwnerPID)(unsafe.Pointer(&buf[int(offset)]))
		connections = append(connections, NetworkConnection{
			Protocol:      "tcp",
			LocalAddress:  ipv4FromDWORD(row.LocalAddr),
			LocalPort:     portFromDWORD(row.LocalPort),
			RemoteAddress: ipv4FromDWORD(row.RemoteAddr),
			RemotePort:    portFromDWORD(row.RemotePort),
			State:         tcpStateName(row.State),
			PID:           row.OwningPID,
		})
	}
	return connections, nil
}

func listWindowsUDPConnections() ([]NetworkConnection, error) {
	buf, err := loadWindowsUDPTable()
	if err != nil {
		return nil, err
	}
	if len(buf) < 4 {
		return []NetworkConnection{}, nil
	}

	count := *(*uint32)(unsafe.Pointer(&buf[0]))
	rowSize := unsafe.Sizeof(mibUDPRowOwnerPID{})
	connections := make([]NetworkConnection, 0, count)
	for i := uint32(0); i < count; i++ {
		offset := uintptr(4) + uintptr(i)*rowSize
		if int(offset+rowSize) > len(buf) {
			break
		}
		row := (*mibUDPRowOwnerPID)(unsafe.Pointer(&buf[int(offset)]))
		connections = append(connections, NetworkConnection{
			Protocol:     "udp",
			LocalAddress: ipv4FromDWORD(row.LocalAddr),
			LocalPort:    portFromDWORD(row.LocalPort),
			State:        "UNCONN",
			PID:          row.OwningPID,
		})
	}
	return connections, nil
}

func loadWindowsTCPTable() ([]byte, error) {
	var size uint32
	procGetExtendedTCPTable.Call(0, uintptr(unsafe.Pointer(&size)), 0, afInet, tcpTableOwnerPIDAll, 0)
	if size == 0 {
		return []byte{}, nil
	}
	buf := make([]byte, size)
	ret, _, err := procGetExtendedTCPTable.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		0,
		afInet,
		tcpTableOwnerPIDAll,
		0,
	)
	if ret != 0 {
		return nil, err
	}
	return buf, nil
}

func loadWindowsUDPTable() ([]byte, error) {
	var size uint32
	procGetExtendedUDPTable.Call(0, uintptr(unsafe.Pointer(&size)), 0, afInet, udpTableOwnerPID, 0)
	if size == 0 {
		return []byte{}, nil
	}
	buf := make([]byte, size)
	ret, _, err := procGetExtendedUDPTable.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		0,
		afInet,
		udpTableOwnerPID,
		0,
	)
	if ret != 0 {
		return nil, err
	}
	return buf, nil
}

func ipv4FromDWORD(v uint32) string {
	return net.IPv4(byte(v), byte(v>>8), byte(v>>16), byte(v>>24)).String()
}

func portFromDWORD(v uint32) uint32 {
	port := uint16(v)
	return uint32(port>>8 | port<<8)
}

func tcpStateName(state uint32) string {
	switch state {
	case 1:
		return "CLOSED"
	case 2:
		return "LISTEN"
	case 3:
		return "SYN_SENT"
	case 4:
		return "SYN_RECEIVED"
	case 5:
		return "ESTABLISHED"
	case 6:
		return "FIN_WAIT_1"
	case 7:
		return "FIN_WAIT_2"
	case 8:
		return "CLOSE_WAIT"
	case 9:
		return "CLOSING"
	case 10:
		return "LAST_ACK"
	case 11:
		return "TIME_WAIT"
	case 12:
		return "DELETE_TCB"
	default:
		return "UNKNOWN"
	}
}
