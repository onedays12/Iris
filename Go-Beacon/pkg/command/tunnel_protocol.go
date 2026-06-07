package command

import (
	"beacon/pkg/utils/packet"
	"fmt"
	"strings"
)

const (
	TunnelModeSOCKS5         = "socks5"
	TunnelModePortForward    = "port_forward"
	TunnelModeReversePortMap = "reverse_port_map"
	TunnelModeHTTPProxy      = "http_proxy"
	TunnelModeUDPProxy       = "udp_proxy"

	DefaultTunnelProto            = "tcp"
	DefaultTunnelConnectTimeoutMS = 10000
)

// Tunnel 错误原因码
const (
	TunnelReasonNone               int32 = 0
	TunnelReasonUnknown            int32 = 1
	TunnelReasonAuthFailed         int32 = 2
	TunnelReasonNetworkUnreachable int32 = 3
	TunnelReasonTimeout            int32 = 4
	TunnelReasonConnectionRefused  int32 = 5
	TunnelReasonDNSFailed          int32 = 6
	TunnelReasonGatewayFailed      int32 = 7
	TunnelReasonCanceled           int32 = 8
	TunnelReasonQueueFull          int32 = 9
	TunnelReasonUnsupportedProto   int32 = 10
	TunnelReasonDuplicateChannel   int32 = 11
	TunnelReasonPeerClosed         int32 = 12
	TunnelReasonConnectionReset    int32 = 13
	TunnelReasonBrokenPipe         int32 = 14
	TunnelReasonConnectionAborted  int32 = 15
)

// TunnelStart 解析后的结构
type TunnelStart struct {
	Mode             string
	TunnelID         string
	ChannelID        string
	Proto            string
	TargetAddress    string
	ConnectTimeoutMS int
}

// TunnelControl 解析后的控制结构 (仅控制面)。
type TunnelControl struct {
	TunnelID  string
	ChannelID string
	Action    string // "pause", "resume", "close"
	Reason    string
}

// TunnelData 解析后的数据结构 (数据面)。
type TunnelData struct {
	TunnelID  string
	ChannelID string
	Data      []byte
}

// NormalizeTunnelStart 校验并补齐 tunnel 启动参数。
func NormalizeTunnelStart(req TunnelStart) (TunnelStart, error) {
	req.Mode = strings.ToLower(strings.TrimSpace(req.Mode))
	req.TunnelID = strings.TrimSpace(req.TunnelID)
	req.ChannelID = strings.TrimSpace(req.ChannelID)
	req.Proto = strings.ToLower(strings.TrimSpace(req.Proto))
	req.TargetAddress = strings.TrimSpace(req.TargetAddress)

	if req.Mode == "" {
		req.Mode = TunnelModePortForward
	}
	if req.TunnelID == "" {
		return TunnelStart{}, fmt.Errorf("tunnel_id is required")
	}
	if req.ChannelID == "" {
		return TunnelStart{}, fmt.Errorf("channel_id is required")
	}
	if req.Proto == "" {
		if req.Mode == TunnelModeUDPProxy {
			req.Proto = "udp"
		} else {
			req.Proto = DefaultTunnelProto
		}
	}
	if req.Proto != "tcp" && req.Proto != "udp" {
		return TunnelStart{}, fmt.Errorf("unsupported tunnel proto: %s", req.Proto)
	}
	if req.TargetAddress == "" {
		return TunnelStart{}, fmt.Errorf("target_address is required")
	}
	if req.ConnectTimeoutMS <= 0 {
		req.ConnectTimeoutMS = DefaultTunnelConnectTimeoutMS
	}
	return req, nil
}

// ParseTunnelStart 解析 TunnelStart 任务负载。
func ParseTunnelStart(p *packet.Parser) (TunnelStart, error) {
	req := TunnelStart{
		Mode:             p.ParseString(),
		TunnelID:         p.ParseString(),
		ChannelID:        p.ParseString(),
		Proto:            p.ParseString(),
		TargetAddress:    p.ParseString(),
		ConnectTimeoutMS: int(p.ParseInt32()),
	}
	if p.HasError() {
		return TunnelStart{}, p.Error()
	}
	return NormalizeTunnelStart(req)
}

// PackTunnelStart 将 tunnel 启动参数打包为原始载荷。
func PackTunnelStart(req TunnelStart) ([]byte, error) {
	normalized, err := NormalizeTunnelStart(req)
	if err != nil {
		return nil, err
	}
	return packet.PackArray([]any{
		normalized.Mode,
		normalized.TunnelID,
		normalized.ChannelID,
		normalized.Proto,
		normalized.TargetAddress,
		int32(normalized.ConnectTimeoutMS),
	})
}

// NormalizeTunnelControl 校验并补齐 tunnel 控制参数。
func NormalizeTunnelControl(req TunnelControl) (TunnelControl, error) {
	req.TunnelID = strings.TrimSpace(req.TunnelID)
	req.ChannelID = strings.TrimSpace(req.ChannelID)
	req.Action = strings.ToLower(strings.TrimSpace(req.Action))
	if req.TunnelID == "" {
		return TunnelControl{}, fmt.Errorf("tunnel_id is required")
	}
	return req, nil
}

// ParseTunnelControl 解析 tunnel 控制任务负载。
func ParseTunnelControl(p *packet.Parser) (TunnelControl, error) {
	req := TunnelControl{
		TunnelID:  p.ParseString(),
		ChannelID: p.ParseString(),
		Action:    p.ParseString(),
		Reason:    p.ParseString(),
	}
	if p.HasError() {
		return TunnelControl{}, p.Error()
	}
	return NormalizeTunnelControl(req)
}

// PackTunnelControl 将 tunnel 控制参数打包为原始载荷。
func PackTunnelControl(req TunnelControl) ([]byte, error) {
	normalized, err := NormalizeTunnelControl(req)
	if err != nil {
		return nil, err
	}
	return packet.PackArray([]any{
		normalized.TunnelID,
		normalized.ChannelID,
		normalized.Action,
		normalized.Reason,
	})
}

// ParseTunnelData 解析 tunnel 数据任务负载。
func ParseTunnelData(p *packet.Parser) (TunnelData, error) {
	req := TunnelData{
		TunnelID:  p.ParseString(),
		ChannelID: p.ParseString(),
		Data:      p.ParseBytes(),
	}
	if p.HasError() {
		return TunnelData{}, p.Error()
	}
	return req, nil
}

// PackTunnelData 将 tunnel 数据打包为原始载荷。
func PackTunnelData(req TunnelData) ([]byte, error) {
	return packet.PackArray([]any{
		req.TunnelID,
		req.ChannelID,
		packet.PackBytes(req.Data),
	})
}
