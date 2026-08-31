package mcp

import (
	"encoding/json"
	"fmt"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// registerTools 把 P1 工具注册到 SDK server。
// 约定:输出统一为单个 JSON 文本块;业务错误直接 return error,
// SDK 会包装为 IsError=true 的工具结果,Agent 可读文本即为错误信息。
func registerTools(s *Server) {
	registerSessionTools(s)
	registerEventTools(s)
	registerListenerTools(s)
	registerBeaconTools(s)
	registerTunnelTools(s)
	registerPayloadTools(s)
	registerUploadTool(s)
	registerDownloadTools(s)
	registerScreenshotTools(s)
	registerPreviewTools(s)
}

// textResult 把任意值序列化为唯一一个 JSON 文本内容块返回。
func textResult(v any) (*msdk.CallToolResult, struct{}, error) {
	blob, err := json.Marshal(v)
	if err != nil {
		return nil, struct{}{}, fmt.Errorf("iris-mcp: marshal result: %w", err)
	}
	return &msdk.CallToolResult{
		Content: []msdk.Content{&msdk.TextContent{Text: string(blob)}},
	}, struct{}{}, nil
}

// requireSession 是所有需访问 TeamServer 工具的公共前置校验。
func requireSession(s *Server) (apiBase, token string, err error) {
	apiBase, token, ready := s.deps.Sess.Credentials()
	if !ready {
		return "", "", fmt.Errorf("client GUI 未登录或凭据未同步(先在 Iris Client 登录一次); ws_status=%s", s.wsStatusSafe())
	}
	return apiBase, token, nil
}

func (s *Server) wsStatusSafe() string {
	if s.deps.WSStatus == nil {
		return "unknown"
	}
	st := s.deps.WSStatus()
	if st == "" {
		return "unknown"
	}
	return st
}
