//go:build darwin

package command

import (
	"encoding/binary"
	"fmt"
	"syscall"
	"unsafe"
)

// sysctl MIB levels for socket connection enumeration.
// TCP: CTL_NET, AF_INET, IPPROTO_TCP, TCPCTL_PCBLIST(11)
// UDP: CTL_NET, AF_INET, IPPROTO_UDP, UDPCTL_PCBLIST(5)
//
// On macOS, IPv6 connections are included in the AF_INET results;
// the inp_vflag field distinguishes IPv4 vs IPv6.
const (
	ctlNet      = 4
	afInet      = 2
	ipprotoTCP  = 6
	ipprotoUDP  = 17
	tcpPCBList  = 11
	udpPCBList  = 5
)

// inpcb struct field offsets within the entry (verified via cgo on macOS arm64/amd64).
//
// Each entry starts with a uint32 length field, followed by the inpcb struct
// at a fixed offset. The layout:
//
//	entry[0:4]     = entry length (uint32 LE)
//	entry[4:]      = inpcb starts here (xt_inp / xi_inp offset)
//	  inpcb+16     = inp_fport  (uint16 BE)
//	  inpcb+18     = inp_lport  (uint16 BE)
//	  inpcb+76     = inp_vflag  (uint8: 0x1=IPv4, 0x2=IPv6)
//	  inpcb+80     = in6p_faddr (16 bytes IPv6)
//	  inpcb+92     = inp_faddr  (4 bytes IPv4)
//	  inpcb+96     = in6p_laddr (16 bytes IPv6)
//	  inpcb+108    = inp_laddr  (4 bytes IPv4)
const (
	entryLenOff  = 0
	inpcbOff     = 4

	inpFportOff  = 16
	inpLportOff  = 18
	inpVflagOff  = 76
	inp6FaddrOff = 80
	inpFaddrOff  = 92
	inp6LaddrOff = 96
	inpLaddrOff  = 108
)

// inp_vflag bits
const (
	inpIPv4 = 0x1
	inpIPv6 = 0x2
)

// listNetworkConnections enumerates TCP and UDP connections on macOS
// using sysctl kern.ipc.pcblist — the same mechanism netstat(1) uses.
func listNetworkConnections() ([]NetworkConnection, error) {
	var conns []NetworkConnection

	// TCP connections (includes both IPv4 and IPv6)
	tcpConns, err := parsePCBList(ipprotoTCP, tcpPCBList)
	if err == nil {
		conns = append(conns, tcpConns...)
	}

	// UDP connections
	udpConns, err := parsePCBList(ipprotoUDP, udpPCBList)
	if err == nil {
		conns = append(conns, udpConns...)
	}

	return conns, nil
}

// parsePCBList calls sysctl and parses the PCB list for the given protocol.
func parsePCBList(proto, level int) ([]NetworkConnection, error) {
	mib := []int32{ctlNet, afInet, int32(proto), int32(level)}
	buf, err := sysctlRawDarwin(mib)
	if err != nil {
		return nil, err
	}
	if len(buf) < 24 {
		return nil, nil
	}

	// xinpgen/xunpgen header: {uint32 len, uint32 count, uint64 gen, uint64 sogen}
	hdrLen := int(binary.LittleEndian.Uint32(buf[0:4]))
	count := int(binary.LittleEndian.Uint32(buf[4:8]))

	var conns []NetworkConnection
	offset := hdrLen

	protoName := "tcp"
	if proto == ipprotoUDP {
		protoName = "udp"
	}

	for i := 0; i < int(count) && offset+4 <= len(buf); i++ {
		entryLen := int(binary.LittleEndian.Uint32(buf[offset:]))
		if entryLen <= 0 || offset+entryLen > len(buf) {
			break
		}

		conn, ok := parsePCBEntry(buf[offset:offset+entryLen], protoName)
		if ok {
			conns = append(conns, conn)
		}

		offset += entryLen
	}

	return conns, nil
}

// parsePCBEntry extracts connection info from a single PCB entry.
func parsePCBEntry(entry []byte, proto string) (NetworkConnection, bool) {
	var conn NetworkConnection

	if len(entry) < inpcbOff+inpLaddrOff+4 {
		return conn, false
	}

	base := inpcbOff // inpcb starts at offset 4

	vflag := entry[base+inpVflagOff]
	lport := binary.BigEndian.Uint16(entry[base+inpLportOff:])
	fport := binary.BigEndian.Uint16(entry[base+inpFportOff:])

	if lport == 0 {
		return conn, false
	}

	var localAddr, remoteAddr string

	if vflag&inpIPv6 != 0 {
		// IPv6 connection
		laddr := entry[base+inp6LaddrOff : base+inp6LaddrOff+16]
		localAddr = formatIPv6(laddr)
		if fport > 0 {
			faddr := entry[base+inp6FaddrOff : base+inp6FaddrOff+16]
			remoteAddr = formatIPv6(faddr)
		}
	} else {
		// IPv4 connection
		laddr := binary.BigEndian.Uint32(entry[base+inpLaddrOff:])
		localAddr = formatIPv4(laddr)
		if fport > 0 {
			faddr := binary.BigEndian.Uint32(entry[base+inpFaddrOff:])
			remoteAddr = formatIPv4(faddr)
		}
	}

	conn = NetworkConnection{
		Protocol:     proto,
		LocalAddress: localAddr,
		LocalPort:    uint32(lport),
		PID:          0, // PID not available from this sysctl
	}

	if fport > 0 {
		conn.RemoteAddress = remoteAddr
		conn.RemotePort = uint32(fport)
		conn.State = "ESTABLISHED"
	} else {
		conn.State = "LISTEN"
	}

	return conn, true
}

// formatIPv4 formats a big-endian uint32 as an IPv4 string.
func formatIPv4(addr uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d", (addr>>24)&0xff, (addr>>16)&0xff, (addr>>8)&0xff, addr&0xff)
}

// formatIPv6 formats 16 bytes as an IPv6 string with :: abbreviation.
func formatIPv6(addr []byte) string {
	if len(addr) < 16 {
		return "::"
	}

	groups := [8]uint16{
		binary.BigEndian.Uint16(addr[0:2]),
		binary.BigEndian.Uint16(addr[2:4]),
		binary.BigEndian.Uint16(addr[4:6]),
		binary.BigEndian.Uint16(addr[6:8]),
		binary.BigEndian.Uint16(addr[8:10]),
		binary.BigEndian.Uint16(addr[10:12]),
		binary.BigEndian.Uint16(addr[12:14]),
		binary.BigEndian.Uint16(addr[14:16]),
	}

	// Find longest zero run for :: abbreviation.
	bestStart, bestLen := -1, 0
	curStart, curLen := -1, 0
	for i := 0; i < 8; i++ {
		if groups[i] == 0 {
			if curStart < 0 {
				curStart = i
				curLen = 1
			} else {
				curLen++
			}
		} else {
			if curLen > bestLen {
				bestStart = curStart
				bestLen = curLen
			}
			curStart = -1
			curLen = 0
		}
	}
	if curLen > bestLen {
		bestStart = curStart
		bestLen = curLen
	}
	if bestLen < 2 {
		bestStart = -1
	}

	var buf []byte
	for i := 0; i < 8; i++ {
		if i == bestStart {
			buf = append(buf, ':')
			if i == 0 {
				buf = append(buf, ':')
			}
			i += bestLen - 1
			continue
		}
		if i > 0 {
			buf = append(buf, ':')
		}
		buf = appendUint16Hex(buf, groups[i])
	}
	if bestStart+bestLen == 8 {
		buf = append(buf, ':')
	}
	return string(buf)
}

func appendUint16Hex(buf []byte, v uint16) []byte {
	if v == 0 {
		return append(buf, '0')
	}
	const hex = "0123456789abcdef"
	start := len(buf)
	for v > 0 {
		buf = append(buf, hex[v&0xf])
		v >>= 4
	}
	// Reverse
	for i, j := start, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return buf
}

// sysctlRawDarwin performs a raw sysctl(2) call.
func sysctlRawDarwin(mib []int32) ([]byte, error) {
	mibPtr := unsafe.Pointer(&mib[0])
	mibLen := uintptr(len(mib))

	var bufLen uintptr
	_, _, errno := syscall.Syscall6(
		syscall.SYS___SYSCTL,
		uintptr(mibPtr), mibLen,
		0, uintptr(unsafe.Pointer(&bufLen)),
		0, 0,
	)
	if errno != 0 {
		return nil, errno
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
		return nil, errno
	}
	return buf[:bufLen], nil
}
