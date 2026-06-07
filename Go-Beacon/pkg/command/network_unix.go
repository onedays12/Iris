//go:build !windows && !darwin && !linux

package command

import (
	"encoding/hex"
	"net"
	"os"
	"strconv"
	"strings"
)

func listNetworkConnections() ([]NetworkConnection, error) {
	var connections []NetworkConnection
	for _, table := range []struct {
		path     string
		protocol string
		ipv6     bool
	}{
		{path: "/proc/net/tcp", protocol: "tcp", ipv6: false},
		{path: "/proc/net/tcp6", protocol: "tcp6", ipv6: true},
		{path: "/proc/net/udp", protocol: "udp", ipv6: false},
		{path: "/proc/net/udp6", protocol: "udp6", ipv6: true},
	} {
		parsed, err := parseProcNetTable(table.path, table.protocol, table.ipv6)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		connections = append(connections, parsed...)
	}
	return connections, nil
}

func parseProcNetTable(path string, protocol string, ipv6 bool) ([]NetworkConnection, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(data), "\n")
	connections := make([]NetworkConnection, 0, len(lines))
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		localAddr, localPort, err := parseProcAddress(fields[1], ipv6)
		if err != nil {
			continue
		}
		remoteAddr, remotePort, err := parseProcAddress(fields[2], ipv6)
		if err != nil {
			continue
		}

		connections = append(connections, NetworkConnection{
			Protocol:      protocol,
			LocalAddress:  localAddr,
			LocalPort:     localPort,
			RemoteAddress: remoteAddr,
			RemotePort:    remotePort,
			State:         procNetStateName(protocol, fields[3]),
			PID:           0,
		})
	}
	return connections, nil
}

func parseProcAddress(value string, ipv6 bool) (string, uint32, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return "", 0, strconv.ErrSyntax
	}

	port, err := strconv.ParseUint(parts[1], 16, 32)
	if err != nil {
		return "", 0, err
	}
	if ipv6 {
		return parseProcIPv6(parts[0]), uint32(port), nil
	}
	return parseProcIPv4(parts[0]), uint32(port), nil
}

func parseProcIPv4(value string) string {
	raw, err := strconv.ParseUint(value, 16, 32)
	if err != nil {
		return value
	}
	return net.IPv4(byte(raw), byte(raw>>8), byte(raw>>16), byte(raw>>24)).String()
}

func parseProcIPv6(value string) string {
	raw, err := hex.DecodeString(value)
	if err != nil || len(raw) != net.IPv6len {
		return value
	}

	// /proc/net/tcp6 stores each 32-bit word in little-endian order.
	for i := 0; i < len(raw); i += 4 {
		raw[i], raw[i+3] = raw[i+3], raw[i]
		raw[i+1], raw[i+2] = raw[i+2], raw[i+1]
	}
	return net.IP(raw).String()
}

func procNetStateName(protocol string, state string) string {
	if strings.HasPrefix(protocol, "udp") {
		switch strings.ToUpper(state) {
		case "07":
			return "UNCONN"
		case "0A":
			return "LISTEN"
		default:
			return "UNKNOWN"
		}
	}

	switch strings.ToUpper(state) {
	case "01":
		return "ESTABLISHED"
	case "02":
		return "SYN_SENT"
	case "03":
		return "SYN_RECV"
	case "04":
		return "FIN_WAIT1"
	case "05":
		return "FIN_WAIT2"
	case "06":
		return "TIME_WAIT"
	case "07":
		return "CLOSE"
	case "08":
		return "CLOSE_WAIT"
	case "09":
		return "LAST_ACK"
	case "0A":
		return "LISTEN"
	case "0B":
		return "CLOSING"
	default:
		return "UNKNOWN"
	}
}
