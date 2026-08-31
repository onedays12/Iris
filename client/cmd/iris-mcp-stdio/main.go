// iris-mcp-stdio 是 Iris Client 内嵌 MCP Server 的 stdio 兼容入口。
//
// 动机:部分 Agent 工具(如 Codex CLI)只支持以 stdio 方式拉起 MCP 服务;
// 本包装器作为该工具的子进程运行,把 stdin/stdout 上的 MCP JSON-RPC 消息
// 逐条转发到常驻 client 进程的 Streamable HTTP 端口(默认 127.0.0.1:9333),
// 从而让同一套工具实现覆盖双传输模式——架构与 Playwright MCP 同款。
//
// 协议要点(MCP stdio 传输):
//   - 消息以单个换行分隔的 UTF-8 JSON 文本帧读入;
//   - 响应按接收顺序写回 stdout,天然与请求 id 对应;
//   - initialize 时从 HTTP 响应头捕获 Mcp-Session-Id 并在后续请求中携带。
package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
)

const defaultAddr = "http://127.0.0.1:9333"

func main() {
	base := strings.TrimRight(addrFromEnv(), "/")
	if err := proxy(base, os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "[iris-mcp-stdio]", err)
		os.Exit(1)
	}
}

func addrFromEnv() string {
	if v := strings.TrimSpace(os.Getenv("IRIS_MCP_ADDR")); v != "" {
		return v
	}
	return defaultAddr
}

// proxy 主循环:逐行读取 → POST 转发 → 剥掉 SSE/信封后原样回写 JSON-RPC 帧。
// 单协程顺序处理即可满足 stdio 客户端典型用法;mu 保护 stdout 写入顺序。
func proxy(base string, in io.Reader, out io.Writer) error {
	var (
		mu      sync.Mutex
		sid     string
		client  = &http.Client{}
		scanner = bufio.NewScanner(in)
	)
	scanner.Buffer(make([]byte, 0, 1024*1024), 64*1024*1024)

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 || line[0] != '{' {
			continue // 忽略空行与非对象行
		}
		resp, body, err := forward(client, base, &sid, line)
		if err != nil {
			// 网络类失败转成 JSON-RPC 错误响应,保证客户端能收到可解析结果
			id := extractID(line)
			io.WriteString(out, rpcErrorFrame(id, -32000, err.Error())+"\n")
			continue
		}
		mu.Lock()
		out.Write(body)
		out.Write([]byte("\n"))
		mu.Unlock()
		_ = resp
	}
	return scanner.Err()
}

// forward 发送一条 JSON-RPC 消息;SSE 形式的响应合并出 data 行还原为纯 JSON。
// 返回 response 供调用方读取状态头(sid 已就地更新)。
func forward(client *http.Client, base string, sid *string, payload []byte) (*http.Response, []byte, error) {
	req, err := http.NewRequest(http.MethodPost, base+"/", bytes.NewReader(payload))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if *sid != "" {
		req.Header.Set("Mcp-Session-Id", *sid)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if h := resp.Header.Get("Mcp-Session-Id"); h != "" {
		*sid = h
	}
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotFound {
		errFrame := rpcErrorFrame(extractID(payload), -32000,
			fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(string(body))))
		return resp, []byte(errFrame), nil
	}
	text := strings.TrimSpace(string(body))
	if strings.HasPrefix(text, "event:") || strings.Contains(text, "\ndata:") {
		var sb strings.Builder
		for _, ln := range strings.Split(text, "\n") {
			ln = strings.TrimRight(ln, "\r")
			if after, ok := strings.CutPrefix(ln, "data: "); ok {
				sb.WriteString(after)
			}
		}
		text = sb.String()
	}
	if text == "" { // 通知类消息可能无响应体,不产生输出帧
		return resp, nil, nil
	}
	if !jsonLike(text) {
		return resp, nil, fmt.Errorf("非 JSON 响应: %s", truncate(text))
	}
	return resp, []byte(text), nil
}

func jsonLike(s string) bool {
	t := strings.TrimSpace(s)
	return strings.HasPrefix(t, "{") || strings.HasPrefix(t, "[")
}

// extractID 尽力提取请求 id 用于错误帧回填;失败返回 null 字面量。
func extractID(frame []byte) string {
	s := string(frame)
	if i := strings.Index(s, `"id":`); i >= 0 {
		rest := s[i+5:]
		end := strings.IndexAny(rest, ",}")
		if end > 0 {
			return strings.TrimSpace(rest[:end])
		}
	}
	return "null"
}

func rpcErrorFrame(id string, code int, msg string) string {
	return fmt.Sprintf(`{"jsonrpc":"2.0","id":%s,"error":{"code":%d,"message":%s}}`,
		id, code, jsonQuote(msg))
}

func jsonQuote(s string) string {
	q := strings.ReplaceAll(s, `\`, `\\`)
	q = strings.ReplaceAll(q, `"`, `\"`)
	q = strings.ReplaceAll(q, "\n", "\\n")
	q = strings.ReplaceAll(q, "\r", "")
	q = strings.ReplaceAll(q, "\t", "\\t")
	return `"` + q + `"`
}

func truncate(s string) string {
	if len(s) > 200 {
		return s[:200] + "...(截断)"
	}
	return s
}
