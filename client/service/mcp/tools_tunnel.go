package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// 隧道/代理穿透工具:对齐 GUI「代理与穿透」页的 REST 面
// (契约见 docs/TUNNEL_FRONTEND_API.md)。TUNNEL_* 事件同样进事件缓冲,
// 可用 wait_for_event(type_prefix=TUNNEL) 确认状态迁移。

type tunnelSummary struct {
	TunnelID     string `json:"tunnel_id" jsonschema:"隧道 id"`
	Mode         string `json:"mode" jsonschema:"socks5 | port_forward | reverse_port_map"`
	BeaconID     string `json:"beacon_id,omitempty" jsonschema:"承载 beacon"`
	Status       string `json:"status" jsonschema:"running | paused | stopped | error"`
	BindHost     string `json:"bind_host,omitempty" jsonschema:"TeamServer 本地监听地址"`
	BindPort     int    `json:"bind_port,omitempty" jsonschema:"本地监听端口"`
	RemoteHost   string `json:"remote_host,omitempty" jsonschema:"转发目标地址(port_forward 等)"`
	RemotePort   int    `json:"remote_port,omitempty" jsonschema:"转发目标端口"`
	SocksAuth    string `json:"socks_auth_mode,omitempty" jsonschema:"SOCKS5 认证模式(no_auth/username_password)"`
	SocksUDP     bool   `json:"socks_udp_associate,omitempty" jsonschema:"SOCKS5 是否启用 UDP ASSOCIATE"`
	ActiveChans  int    `json:"active_channels,omitempty" jsonschema:"活跃信道数"`
	BytesIn      int64  `json:"bytes_in,omitempty" jsonschema:"累计流入字节"`
	BytesOut     int64  `json:"bytes_out,omitempty" jsonschema:"累计流出字节"`
	ErrorMessage string `json:"error_message,omitempty" jsonschema:"运行期异常原因(status=error)"`
}

type listTunnelsIn struct {
	Page     int `json:"page,omitempty" jsonschema:"页码,默认 1"`
	PageSize int `json:"page_size,omitempty" jsonschema:"每页条数,默认 20,最大 100"`
}

type listTunnelsOut struct {
	Total   int             `json:"total" jsonschema:"记录总数"`
	Tunnels []tunnelSummary `json:"tunnels"`
}

type createTunnelIn struct {
	BeaconID          string `json:"beacon_id" jsonschema:"承载 beacon id(级联 beacon 亦可,流量经其链路)"`
	Mode              string `json:"mode" jsonschema:"socks5 | port_forward | reverse_port_map"`
	BindHost          string `json:"bind_host,omitempty" jsonschema:"本地监听地址,如 127.0.0.1 或 0.0.0.0"`
	BindPort          int    `json:"bind_port,omitempty" jsonschema:"本地监听端口"`
	RemoteHost        string `json:"remote_host,omitempty" jsonschema:"port_forward/reverse_port_map:目标地址"`
	RemotePort        int    `json:"remote_port,omitempty" jsonschema:"port_forward/reverse_port_map:目标端口"`
	SocksAuthMode     string `json:"socks_auth_mode,omitempty" jsonschema:"socks5 必填显式传入: no_auth | username_password"`
	SocksUsername     string `json:"socks_username,omitempty" jsonschema:"socks_auth_mode 为 username_password 时必填"`
	SocksPassword     string `json:"socks_password,omitempty" jsonschema:"socks_auth_mode 为 username_password 时必填"`
	SocksUdpAssociate *bool  `json:"socks_udp_associate,omitempty" jsonschema:"socks5 必填显式传入:是否启用 UDP ASSOCIATE"`
}

type controlTunnelIn struct {
	TunnelID string `json:"tunnel_id" jsonschema:"隧道 id"`
	Action   string `json:"action" jsonschema:"pause 暂停(关本地监听) | resume 恢复 | stop 终止(保留记录) | delete 终止并彻底清除记录(破坏性,不可恢复)"`
}

type listTunnelChannelsIn struct {
	TunnelID string `json:"tunnel_id" jsonschema:"隧道 id"`
	Page     int    `json:"page,omitempty" jsonschema:"页码,默认 1"`
	PageSize int    `json:"page_size,omitempty" jsonschema:"每页条数,默认 20,最大 100"`
}

func registerTunnelTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "list_tunnels",
		Description: "列出代理/穿透隧道(SOCKS5、端口转发、反向映射)及状态、活跃信道数与流量计数。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in listTunnelsIn) (*msdk.CallToolResult, any, error) {
		page, size := in.Page, in.PageSize
		if page < 1 {
			page = 1
		}
		if size < 1 {
			size = 20
		}
		if size > 100 {
			size = 100
		}
		_, data, err := s.ts.Do(ctx, "GET", fmt.Sprintf("/api/v1/tunnels?page=%d&page_size=%d", page, size), nil)
		if err != nil {
			return nil, nil, err
		}
		return nil, normalizeTunnelList(data), nil
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "create_tunnel",
		Description: "在 beacon 链路上建立隧道并在 TeamServer 本地监听。" +
			"socks5 需显式 socks_auth_mode 与 socks_udp_associate;" +
			"port_forward/reverse_port_map 需 remote_host/remote_port。" +
			"创建成功即开始监听(失败直接报错);状态迁移可 wait_for_event(type_prefix=TUNNEL)。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in createTunnelIn) (*msdk.CallToolResult, any, error) {
		body, err := buildTunnelCreateBody(in)
		if err != nil {
			return nil, nil, err
		}
		_, data, err := s.ts.Do(ctx, "POST", "/api/v1/tunnels", body)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "control_tunnel",
		Description: "控制隧道状态:pause 暂停(关本地监听)、resume 恢复、stop 终止(保留记录)、delete 终止并彻底清除记录(破坏性,不可恢复)。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in controlTunnelIn) (*msdk.CallToolResult, any, error) {
		id := strings.TrimSpace(in.TunnelID)
		if id == "" {
			return nil, nil, fmt.Errorf("tunnel_id 必填")
		}
		var method, path string
		switch strings.ToLower(strings.TrimSpace(in.Action)) {
		case "pause":
			method, path = "POST", fmt.Sprintf("/api/v1/tunnels/%s/pause", id)
		case "resume":
			method, path = "POST", fmt.Sprintf("/api/v1/tunnels/%s/resume", id)
		case "stop":
			method, path = "POST", fmt.Sprintf("/api/v1/tunnels/%s/stop", id)
		case "delete":
			method, path = "DELETE", fmt.Sprintf("/api/v1/tunnels/%s", id)
		default:
			return nil, nil, fmt.Errorf("未知 action %q;可用 pause|resume|stop|delete", in.Action)
		}
		_, data, err := s.ts.Do(ctx, method, path, nil)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "list_tunnel_channels",
		Description: "列出隧道信道(pending/active/closed/timeout/failed),含目标地址与字节计数,用于排查链路通断。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in listTunnelChannelsIn) (*msdk.CallToolResult, any, error) {
		id := strings.TrimSpace(in.TunnelID)
		if id == "" {
			return nil, nil, fmt.Errorf("tunnel_id 必填")
		}
		page, size := in.Page, in.PageSize
		if page < 1 {
			page = 1
		}
		if size < 1 {
			size = 20
		}
		if size > 100 {
			size = 100
		}
		_, data, err := s.ts.Do(ctx, "GET", fmt.Sprintf("/api/v1/tunnels/%s/channels?page=%d&page_size=%d", id, page, size), nil)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})
}

// buildTunnelCreateBody 按模式组装创建请求体;SOCKS5 的认证与 UDP 开关
// 契约为"必须显式传入",缺失即报错(与前端同款校验,不留后端静默默认)。
func buildTunnelCreateBody(in createTunnelIn) (map[string]any, error) {
	beaconID := strings.TrimSpace(in.BeaconID)
	mode := strings.ToLower(strings.TrimSpace(in.Mode))
	if beaconID == "" {
		return nil, fmt.Errorf("beacon_id 必填")
	}
	body := map[string]any{"beacon_id": beaconID, "mode": mode}
	switch mode {
	case "socks5":
		if in.SocksAuthMode != "no_auth" && in.SocksAuthMode != "username_password" {
			return nil, fmt.Errorf("socks5 必须显式传 socks_auth_mode=no_auth|username_password")
		}
		if in.SocksUdpAssociate == nil {
			return nil, fmt.Errorf("socks5 必须显式传 socks_udp_associate=true|false")
		}
		body["bind_host"] = firstNonEmpty(in.BindHost, "127.0.0.1")
		body["bind_port"] = in.BindPort
		body["socks_auth_mode"] = in.SocksAuthMode
		body["socks_udp_associate"] = *in.SocksUdpAssociate
		if in.SocksAuthMode == "username_password" {
			if in.SocksUsername == "" || in.SocksPassword == "" {
				return nil, fmt.Errorf("socks_auth_mode=username_password 时 socks_username/socks_password 必填")
			}
			body["socks_username"] = in.SocksUsername
			body["socks_password"] = in.SocksPassword
		}
	case "port_forward", "reverse_port_map":
		if in.RemoteHost == "" || in.RemotePort == 0 {
			return nil, fmt.Errorf("%s 必须传 remote_host 与 remote_port", mode)
		}
		body["bind_host"] = firstNonEmpty(in.BindHost, "127.0.0.1")
		body["bind_port"] = in.BindPort
		body["remote_host"] = in.RemoteHost
		body["remote_port"] = in.RemotePort
	default:
		return nil, fmt.Errorf("未知 mode %q;可用 socks5|port_forward|reverse_port_map", in.Mode)
	}
	return body, nil
}

// normalizeTunnelList 归一化分页列表(data 可为数组或 {tunnels|data|items:[...], total} 包装)。
func normalizeTunnelList(data []byte) listTunnelsOut {
	out := listTunnelsOut{Tunnels: []tunnelSummary{}}
	var records []map[string]any
	if err := json.Unmarshal(data, &records); err != nil {
		var wrapper map[string]any
		if err2 := json.Unmarshal(data, &wrapper); err2 == nil {
			for _, key := range []string{"tunnels", "data", "items"} {
				if raw, ok := wrapper[key]; ok {
					if blob, err3 := json.Marshal(raw); err3 == nil {
						_ = json.Unmarshal(blob, &records)
					}
					break
				}
			}
			out.Total = recInt(wrapper, "total")
		}
	}
	for _, rec := range records {
		out.Tunnels = append(out.Tunnels, tunnelSummary{
			TunnelID:     recStr(rec, "tunnel_id"),
			Mode:         recStr(rec, "mode"),
			BeaconID:     recStr(rec, "beacon_id"),
			Status:       recStr(rec, "status"),
			BindHost:     recStr(rec, "bind_host"),
			BindPort:     recInt(rec, "bind_port"),
			RemoteHost:   recStr(rec, "remote_host"),
			RemotePort:   recInt(rec, "remote_port"),
			SocksAuth:    recStr(rec, "socks_auth_mode"),
			SocksUDP:     recBool(rec, "socks_udp_associate"),
			ActiveChans:  recInt(rec, "active_channels"),
			BytesIn:      int64FromAny(rec["bytes_in"]),
			BytesOut:     int64FromAny(rec["bytes_out"]),
			ErrorMessage: recStr(rec, "error_message"),
		})
	}
	if out.Total == 0 {
		out.Total = len(out.Tunnels)
	}
	return out
}

func int64FromAny(v any) int64 {
	if f, ok := v.(float64); ok {
		return int64(f)
	}
	return 0
}
