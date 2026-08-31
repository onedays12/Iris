package mcp

import (
	"context"
	"fmt"
	"strings"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// 监听器 DTO 镜像 frontend/src/features/listener/api/types.ts 的四个联合分支。
// 采用扁平超集:字段全部 omitempty,TeamServer 侧负责严格校验,
// 本工具负责把 encrypt_key/profile 自动补全到前端等价行为。

type listenerCreateIn struct {
	Name         string `json:"name" jsonschema:"监听器名称,唯一"`
	Protocol     string `json:"protocol" jsonschema:"http | https | tcp | smb"`
	ListenerType string `json:"listener_type" jsonschema:"external | internal"`

	EncryptKey string `json:"encrypt_key,omitempty" jsonschema:"留空则自动生成 32 位 hex(与前端的生成策略一致)"`
	Profile    string `json:"profile,omitempty" jsonschema:"external 分支的 C2 profile;留空自动推断 http-default(有 stager 则 http-stager)"`

	// external (http/https/tcp)
	Host         string          `json:"host,omitempty" jsonschema:"external: 对外声明地址"`
	Port         int             `json:"port,omitempty" jsonschema:"external: 对外声明端口"`
	CallbackHost string          `json:"callback_host,omitempty"`
	CallbackPort int             `json:"callback_port,omitempty"`
	SSL          bool            `json:"ssl,omitempty" jsonschema:"external tcp: 是否启用 SSL"`
	SSLCert      string          `json:"ssl_cert,omitempty"`
	SSLKey       string          `json:"ssl_key,omitempty"`
	Stager       *listenerStager `json:"stager,omitempty"`
	// internal (tcp/smb)
	BindHost       string `json:"bind_host,omitempty" jsonschema:"internal: 绑定地址"`
	BindPort       int    `json:"bind_port,omitempty" jsonschema:"internal: 绑定端口"`
	PipeName       string `json:"pipe_name,omitempty" jsonschema:"internal smb: 管道名"`
	ConnectTimeout int    `json:"connect_timeout,omitempty"`
}

type listenerStager struct {
	BindHost     string `json:"bind_host,omitempty"`
	BindPort     int    `json:"bind_port,omitempty"`
	CallbackHost string `json:"callback_host,omitempty"`
	CallbackPort int    `json:"callback_port,omitempty"`
}

type listenerNameIn struct {
	Name string `json:"name" jsonschema:"目标监听器名称"`
}

func registerListenerTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "list_listeners",
		Description: "列出 TeamServer 上全部监听器(含 id/name/protocol/bind/status 等)。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in struct{}) (*msdk.CallToolResult, any, error) {
		_, data, err := s.ts.Do(ctx, "GET", "/api/v1/listener/list", nil)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "create_listener",
		Description: "创建监听器。encrypt_key 留空自动生成;external 分支 profile 留空自动推断。" +
			"以 TeamServer 返回为准回传结果。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in listenerCreateIn) (*msdk.CallToolResult, any, error) {
		if strings.TrimSpace(in.Name) == "" {
			return nil, nil, fmt.Errorf("name 必填")
		}
		if err := fillListenerDefaults(&in); err != nil {
			return nil, nil, err
		}
		_, data, err := s.ts.Do(ctx, "POST", "/api/v1/listener/create", in)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})

	for _, item := range []struct {
		name string
		path string
		warn string
	}{
		{"pause_listener", "/api/v1/listener/pause", ""},
		{"resume_listener", "/api/v1/listener/resume", ""},
		{"remove_listener", "/api/v1/listener/remove", "破坏性操作:移除后不可恢复。"},
	} {
		item := item
		msdk.AddTool(s.srv, &msdk.Tool{
			Name:        item.name,
			Description: fmt.Sprintf("对指定名称的监听器执行 %s 操作。%s", strings.TrimSuffix(strings.TrimPrefix(item.name, "mcp_"), "_listener"), item.warn),
		}, func(ctx context.Context, req *msdk.CallToolRequest, in listenerNameIn) (*msdk.CallToolResult, any, error) {
			if strings.TrimSpace(in.Name) == "" {
				return nil, nil, fmt.Errorf("name 必填")
			}
			_, data, err := s.ts.Do(ctx, "POST", item.path, in)
			if err != nil {
				return nil, nil, err
			}
			return rawResult(data)
		})
	}

	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "edit_listener",
		Description: "编辑既有监听器配置,入参结构同 create_listener(name 指定目标)。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in listenerCreateIn) (*msdk.CallToolResult, any, error) {
		if strings.TrimSpace(in.Name) == "" {
			return nil, nil, fmt.Errorf("name 必填")
		}
		if err := fillListenerDefaults(&in); err != nil {
			return nil, nil, err
		}
		_, data, err := s.ts.Do(ctx, "POST", "/api/v1/listener/edit", in)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})
}

// fillListenerDefaults 复刻前端行为:encrypt_key 自动生成 + profile 推断。
func fillListenerDefaults(in *listenerCreateIn) error {
	in.Name = strings.TrimSpace(in.Name)
	switch strings.ToLower(in.Protocol) {
	case "http", "https", "tcp", "smb":
	default:
		return fmt.Errorf("protocol 仅支持 http|https|tcp|smb,收到 %q", in.Protocol)
	}
	switch strings.ToLower(in.ListenerType) {
	case "external", "internal":
	default:
		return fmt.Errorf("listener_type 仅支持 external|internal,收到 %q", in.ListenerType)
	}
	if in.EncryptKey == "" {
		key, err := generateHexKey()
		if err != nil {
			return fmt.Errorf("生成 encrypt_key 失败: %w", err)
		}
		in.EncryptKey = key
	}
	if strings.EqualFold(in.ListenerType, "external") && in.Profile == "" {
		if in.Stager != nil {
			in.Profile = "http-stager"
		} else {
			in.Profile = "http-default"
		}
	}
	return nil
}
