package mcp

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// ServerVersion 与 client 各发布面的版本保持同步(见 chore: bump version 提交惯例)。
var ServerVersion = "0.4.0"

const (
	// DefaultListenAddr 为 MCP HTTP 入口默认地址(避开 CDP 的 9222)。
	DefaultListenAddr = "127.0.0.1:9333"
	// ListenAddrEnv 允许运维改端口;安全策略仅允许回环地址(见 Start)。
	ListenAddrEnv = "IRIS_MCP_LISTEN"
)

// Deps 汇集工具面依赖;全部由 main.go 组装注入。
type Deps struct {
	Sess     *SessionState
	Sink     *EventSink
	WSStatus func() string // WebSocketService.Status 的读代理
}

// Server 封装 SDK server 与其 HTTP 承载。
type Server struct {
	deps Deps
	ts   *TSClient
	srv  *msdk.Server
	http *http.Server
	addr string
}

func NewServer(d Deps) *Server {
	s := &Server{deps: d, ts: NewTSClient(d.Sess)}
	s.srv = msdk.NewServer(
		&msdk.Implementation{Name: "iris-client", Version: ServerVersion},
		nil,
	)
	registerTools(s)
	return s
}

// ListenAddr 解析生效监听地址:环境变量 IRIS_MCP_LISTEN 覆盖默认值。
func ListenAddr() string {
	if v := strings.TrimSpace(os.Getenv(ListenAddrEnv)); v != "" {
		return v
	}
	return DefaultListenAddr
}

// Start 启动 HTTP 监听并立即返回(Serve 转入后台 goroutine)。
// 安全红线:拒绝非回环地址——该端口等价于把控制面交给本机任意调用方,
// 绑到对外网卡等于远程开放控制通道。
func (s *Server) Start(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("iris-mcp: invalid listen addr %q: %w", addr, err)
	}
	if host != "localhost" && host != "" { // "" 意味着通配,靠 IP 判定兜底
		if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
			return fmt.Errorf("iris-mcp: refusing non-loopback listen addr %q (仅允许回环)", addr)
		}
	} else if host == "" {
		return fmt.Errorf("iris-mcp: refusing wildcard listen addr %q", addr)
	}

	handler := msdk.NewStreamableHTTPHandler(func(*http.Request) *msdk.Server { return s.srv }, nil)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	s.addr = ln.Addr().String()
	s.http = &http.Server{Handler: handler}
	go func() { _ = s.http.Serve(ln) }()
	return nil
}

// Addr 返回实际绑定地址(测试用 :0 分配后取真实端口)。
func (s *Server) Addr() string { return s.addr }

// Stop 收敛 HTTP 服务;进程退出路径也可直接依赖 OS 清理。
func (s *Server) Stop(ctx context.Context) error {
	if s.http == nil {
		return nil
	}
	return s.http.Shutdown(ctx)
}
