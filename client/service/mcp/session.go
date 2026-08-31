// Package mcp 在 Client 进程内嵌一个本地 MCP Server,
// 把 Client 的控制面能力(监听器/beacon 命令/载荷生成/文件/事件流)
// 以细粒度工具的形式暴露给外部 Agent(Codex/ClaudeCode/ZCode),
// 用于 TeamServer→Beacon 全链路 E2E 自动化测试。
//
// 设计文档:D:\code\go\docs\mcp-server-execution-plan.md
package mcp

import (
	"sync"
	"time"
)

// SessionState 保存 MCP 工具面访问 TeamServer 所需的 GUI 会话凭据。
// 凭据由 WebSocketService.Connect 钩子推送(main.go 组装),MCP 不接触账密;
// 与 GUI 会话同生命周期:GUI 重登/静默重登会覆盖,进程重启即失效。
type SessionState struct {
	mu        sync.RWMutex
	apiBase   string
	token     string
	updatedAt time.Time
}

func NewSessionState() *SessionState {
	return &SessionState{}
}

// SetCredentials 由 Connect 钩子在每次连接尝试时调用(拨号成败不影响凭据有效性判断)。
// apiBase 为空时保留旧值——Connect 允许空 base(内部回退默认),不必抹掉已知信息。
func (s *SessionState) SetCredentials(apiBase, token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if apiBase != "" {
		s.apiBase = apiBase
	}
	s.token = token
	s.updatedAt = time.Now()
}

// Credentials 返回当前快照;ready=false 表示尚未从 GUI 收到任何 token。
func (s *SessionState) Credentials() (apiBase, token string, ready bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.apiBase, s.token, s.token != ""
}

// UpdatedAt 最近一次凭据同步时间(零值表示从未同步)。
func (s *SessionState) UpdatedAt() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.updatedAt
}
