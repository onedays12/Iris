// Package service 是 Wails 应用的服务入口层。
//
// 4 个 Service 通过指针内嵌 internal 子包的 struct 获得方法(Go 方法提升),
// 保持 New*Service() 签名与 Wails binding 路径(irisclient/service)不变,
// 使 main.go 与前端零改动。
//
// 指针内嵌而非值内嵌,避免拷贝 transport.WebSocketService 内部的 sync.Mutex
// (Go vet 禁止值拷贝锁)。
//
// 实际逻辑分布在:
//   - internal/file:      本地文件读写
//   - internal/plugin:    插件生命周期与派发
//   - internal/transport: HTTP/WS 转发
package service

import (
	"irisclient/service/internal/file"
	"irisclient/service/internal/plugin"
	"irisclient/service/internal/transport"
)

// FileService 内嵌 internal/file.FileService 的指针,获得其全部 Wails 方法。
type FileService struct {
	*file.FileService
}

// NewFileService 构造 FileService(main.go 用 &service.FileService{} 也能工作,
// 因 *file.FileService 为 nil 时方法提升不可用——故 main.go 改用 NewFileService)。
func NewFileService() *FileService { return &FileService{FileService: &file.FileService{}} }

// PluginService 内嵌 internal/plugin.PluginService 的指针,获得其全部 Wails 方法。
type PluginService struct {
	*plugin.PluginService
}

// NewPluginService 构造 PluginService。
func NewPluginService() *PluginService {
	return &PluginService{PluginService: plugin.NewPluginService()}
}

// ProxyService 内嵌 internal/transport.ProxyService 的指针,获得其全部 Wails 方法。
type ProxyService struct {
	*transport.ProxyService
}

// NewProxyService 构造 ProxyService。
func NewProxyService() *ProxyService {
	return &ProxyService{ProxyService: transport.NewProxyService()}
}

// WebSocketService 内嵌 internal/transport.WebSocketService 的指针,获得其全部 Wails 方法。
type WebSocketService struct {
	*transport.WebSocketService
}

// NewWebSocketService 构造 WebSocketService(默认 Wails 事件出口)。
func NewWebSocketService() *WebSocketService {
	return &WebSocketService{WebSocketService: transport.NewWebSocketService()}
}

// NewWebSocketServiceWithOpts 构造带定制项的 WebSocketService(main.go 用于
// 组装 FanoutEmitter 与 MCP 凭据钩子)。internal 包类型无法越过 internal/
// 可见性边界直达根包,故在此透传所需的构造项与出口。
func NewWebSocketServiceWithOpts(opts ...transport.WebSocketOption) *WebSocketService {
	return &WebSocketService{WebSocketService: transport.NewWebSocketService(opts...)}
}

// 以下为 transport 包构建项到 service 层的透传别名(main.go 组装 MCP 扇出用):
type WebSocketOption = transport.WebSocketOption

func WithEventEmitter(e transport.EventEmitter) WebSocketOption {
	return transport.WithEventEmitter(e)
}

func WithConnectHook(fn func(apiBase, token string)) WebSocketOption {
	return transport.WithConnectHook(fn)
}

type EventEmitter = transport.EventEmitter

func NewFanoutEmitter(emitters ...EventEmitter) EventEmitter {
	return transport.NewFanoutEmitter(emitters...)
}

func NewWailsEventEmitter() EventEmitter { return transport.NewWailsEventEmitter() }
