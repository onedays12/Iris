package mcp

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// ─── 测试用最小 MCP 客户端(复刻探活流程:initialize→initialized→调用) ───

type testMCPSession struct {
	t    *testing.T
	base string
	sid  string
	next int
}

// startTestMCP 把 Server 起在随机回环端口并完成协议握手。
func startTestMCP(t *testing.T, deps Deps) *testMCPSession {
	t.Helper()
	srv := NewServer(deps)
	if err := srv.Start("127.0.0.1:0"); err != nil {
		t.Fatalf("start mcp server: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = srv.Stop(ctx)
	})
	s := &testMCPSession{t: t, base: "http://" + srv.Addr()}
	s.initialize()
	return s
}

func (s *testMCPSession) postRaw(payload string) ([]byte, *http.Response) {
	s.t.Helper()
	req, err := http.NewRequest(http.MethodPost, s.base+"/", strings.NewReader(payload))
	if err != nil {
		s.t.Fatalf("build req: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if s.sid != "" {
		req.Header.Set("Mcp-Session-Id", s.sid)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		s.t.Fatalf("read body: %v", err)
	}
	if v := resp.Header.Get("Mcp-Session-Id"); v != "" {
		s.sid = v
	}
	return body, resp
}

func (s *testMCPSession) initialize() {
	body, resp := s.postRaw(`{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"go-test","version":"0"}}}`)
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), "iris-client") {
		s.t.Fatalf("initialize 失败: %d %s", resp.StatusCode, truncateForLog(body))
	}
	s.next = 1
	s.postRaw(`{"jsonrpc":"2.0","method":"notifications/initialized"}`)
}

// CallTool 调用一个工具并把响应(JSON 或 SSE data 行合并后)以字符串返回。
func (s *testMCPSession) CallTool(name string, argsJSON string) string {
	s.t.Helper()
	params := fmt.Sprintf(`{"name":%q,"arguments":%s}`, name, argsJSON)
	payload := fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":%s}`, s.next, params)
	s.next++
	body, _ := s.postRaw(payload)
	text := string(bytes.TrimSpace(body))
	if !strings.HasPrefix(text, "event:") && !strings.Contains(text, "\ndata:") {
		return text
	}
	var sb strings.Builder
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if after, ok := strings.CutPrefix(line, "data: "); ok {
			sb.WriteString(after)
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

func (s *testMCPSession) ListTools() string {
	s.t.Helper()
	payload := fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/list"}`, s.next)
	s.next++
	body, _ := s.postRaw(payload)
	return string(body)
}

// ─── 断言小工具 ───

func mcpCallTool(t *testing.T, deps Deps, name string, args map[string]any) string {
	t.Helper()
	blob, err := json.Marshal(args)
	if err != nil {
		t.Fatalf("marshal args: %v", err)
	}
	return startTestMCP(t, deps).CallTool(name, string(blob))
}

func jsonQuote(s string) string {
	blob, _ := json.Marshal(s)
	return string(blob)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func truncateForLog(b []byte) string {
	s := string(b)
	if len(s) > 300 {
		s = s[:300] + "..."
	}
	return s
}

func ctxBG() context.Context    { return context.Background() }
func timeSecond() time.Duration { return time.Second }
func timeMillis() time.Duration { return 50 * time.Millisecond }

// extractToolText 从工具调用响应(JSON 或 SSE data 行)中提取首个 content[].text。
func extractToolText(resp string) (string, error) {
	text := strings.TrimSpace(resp)
	if strings.HasPrefix(text, "event:") || strings.Contains(text, "\ndata:") {
		var sb strings.Builder
		for _, line := range strings.Split(text, "\n") {
			line = strings.TrimRight(line, "\r")
			if after, ok := strings.CutPrefix(line, "data: "); ok {
				sb.WriteString(after)
			}
		}
		text = sb.String()
	}
	var env struct {
		Result *struct {
			IsError bool `json:"isError"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(text), &env); err != nil {
		return "", fmt.Errorf("非 JSON-RPC 响应: %w", err)
	}
	if env.Error != nil {
		return "", fmt.Errorf("协议层错误: %s", env.Error.Message)
	}
	// go-sdk 把工具处理器返回的 error 转成 result.isError 帧(而非 JSON-RPC error),必须显式识别。
	if env.Result != nil && env.Result.IsError {
		msg := ""
		if len(env.Result.Content) > 0 {
			msg = env.Result.Content[0].Text
		}
		return "", fmt.Errorf("工具错误: %s", msg)
	}
	if env.Result == nil || len(env.Result.Content) == 0 {
		return "", fmt.Errorf("空工具结果")
	}
	return env.Result.Content[0].Text, nil
}
