package mcp

import (
	"context"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerSessionTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "get_client_status",
		Description: "查询 Iris Client 自身状态:GUI 登录态、TeamServer api_base、WebSocket 连接状态。" +
			"其他工具在凭据未就绪时会统一报错,可先用本工具判断是否需要人工登录。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in struct{}) (*msdk.CallToolResult, struct{}, error) {
		apiBase, _, ready := s.deps.Sess.Credentials()
		out := map[string]any{
			"server_version": ServerVersion,
			"logged_in":      ready,
			"api_base":       apiBase,
			"ws_status":      s.wsStatusSafe(),
			"creds_updated_at": s.deps.Sess.UpdatedAt().Format(
				"2006-01-02T15:04:05Z07:00"),
		}
		return textResult(out)
	})
}
