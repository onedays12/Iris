// Package tls 提供 ProxyService / WebSocketService 共享的 TLS 配置。
package tls

import (
	"crypto/tls"
	"os"
	"strings"
	"sync"
)

// tlsSkipVerify 控制 ProxyService / WebSocketService 是否跳过 TLS 证书校验。
//
// 默认 true: C2 客户端连自家 teamserver,通常用自签证书,跳过校验是合理默认。
// 设为 false 时启用严格校验,适用于企业内网 CA 签发证书的场景。
//
// 通过环境变量 IRIS_TLS_SKIP_VERIFY 配置:
//   - "false"/"0"/"no"/"off" → false(严格校验)
//   - 其他值或未设置        → true(跳过校验,兼容现状)
var (
	tlsSkipVerifyOnce sync.Once
	tlsSkipVerify     bool
)

// ParseTLSSkipVerify 把环境变量原始值解析为是否跳过 TLS 校验。
// 抽成纯函数以便单元测试(sync.Once 不可重置,无法直接测 LoadTLSSkipVerify)。
func ParseTLSSkipVerify(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "false", "0", "no", "off":
		return false
	default:
		return true
	}
}

// LoadTLSSkipVerify 从环境变量加载 TLS 跳过校验开关,仅初始化一次。
func LoadTLSSkipVerify() bool {
	tlsSkipVerifyOnce.Do(func() {
		tlsSkipVerify = ParseTLSSkipVerify(os.Getenv("IRIS_TLS_SKIP_VERIFY"))
	})
	return tlsSkipVerify
}

// NewTLSConfig 返回共享语义的 TLS 配置。
// ProxyService 的 http.Transport 与 WebSocketService 的 Dialer 共用此配置,
// 由 IRIS_TLS_SKIP_VERIFY 环境变量统一控制。
func NewTLSConfig() *tls.Config {
	return &tls.Config{InsecureSkipVerify: LoadTLSSkipVerify()}
}


