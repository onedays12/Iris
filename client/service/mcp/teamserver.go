package mcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"irisclient/service/internal/transport"
)

// TSClient 是 TeamServer REST 的进程内封装:复用 SharedProxyService 的共享
// HTTP 客户端(TLS 配置与前端代理路径一致),自动携带 GUI 会话 Bearer,
// 并把 httpClient.ts 的 {ok,data,error} 信封语义在服务端完成解包。
type TSClient struct {
	sess *SessionState
}

func NewTSClient(sess *SessionState) *TSClient {
	return &TSClient{sess: sess}
}

// apiBase 返回去除尾部斜杠的基址。
func (t *TSClient) apiBase() (string, error) {
	base, _, ready := t.sess.Credentials()
	if !ready {
		return "", fmt.Errorf("client GUI 未登录或凭据未同步(先在 Iris Client 登录一次)")
	}
	return strings.TrimRight(base, "/"), nil
}

// tsEnvelope 是 TeamServer 统一响应信封,镜像 httpClient.parseApiResponse。
type tsEnvelope struct {
	Ok      bool            `json:"ok"`
	Data    json.RawMessage `json:"data"`
	Message string          `json:"message"`
	Error   string          `json:"error"`
}

// Do 发起一次 REST 调用。body 非 nil 时序列化为 JSON。
// 返回 HTTP 状态码与 data 字段;业务失败(ok=false/error)转为可读错误。
func (t *TSClient) Do(ctx context.Context, method, path string, body any) (int, json.RawMessage, error) {
	base, err := t.apiBase()
	if err != nil {
		return 0, nil, err
	}
	url := base + path

	payload := ""
	if body != nil {
		blob, err := json.Marshal(body)
		if err != nil {
			return 0, nil, fmt.Errorf("iris-mcp: encode request %s %s: %w", method, path, err)
		}
		payload = string(blob)
	}

	_, token, _ := t.sess.Credentials()
	headers := map[string]string{"Authorization": "Bearer " + token}

	raw, err := transport.SharedProxyService().DoRequestWithStatus(ctx, method, url, payload, headers)
	if err != nil {
		return 0, nil, fmt.Errorf("iris-mcp: proxy invoke failed: %w", err)
	}
	var pr transport.ProxyResult
	if err := json.Unmarshal([]byte(raw), &pr); err != nil {
		return 0, nil, fmt.Errorf("iris-mcp: decode ProxyResult: %w", err)
	}
	if pr.Status == 0 {
		return 0, nil, fmt.Errorf("teamserver 网络错误(%s%s): %s", method, path, pr.Error)
	}

	var env tsEnvelope
	unmarshalErr := json.Unmarshal([]byte(pr.Body), &env)
	if unmarshalErr == nil {
		if !env.Ok || env.Error != "" {
			msg := firstNonEmpty(env.Error, env.Message)
			return pr.Status, nil, fmt.Errorf("teamserver %d(%s%s): %s", pr.Status, method, path, msg)
		}
		return pr.Status, env.Data, nil
	}
	// 非信封响应(如裸二进制端点)原样返回
	if pr.Status >= 400 {
		snippet := pr.Body
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return pr.Status, nil, fmt.Errorf("teamserver %d(%s%s): %s", pr.Status, method, path, snippet)
	}
	return pr.Status, json.RawMessage(pr.Body), nil
}

// UploadBinary 以 multipart 形式上传(base64 解码后传输),返回原始响应体。
func (t *TSClient) UploadBinary(ctx context.Context, path, fileName, b64 string) (json.RawMessage, error) {
	base, err := t.apiBase()
	if err != nil {
		return nil, err
	}
	_, token, _ := t.sess.Credentials()
	headers := map[string]string{"Authorization": "Bearer " + token}

	respBody, err := transport.SharedProxyService().UploadFileBase64(ctx, base+path, fileName, b64, headers)
	if err != nil {
		return nil, fmt.Errorf("上传失败(%s): %w", path, err)
	}
	var env tsEnvelope
	if json.Unmarshal([]byte(respBody), &env) == nil {
		if !env.Ok || env.Error != "" {
			return nil, fmt.Errorf("teamserver(%s): %s", path, firstNonEmpty(env.Error, env.Message))
		}
		return env.Data, nil
	}
	return json.RawMessage(respBody), nil
}

// DownloadBytes 拉取任意二进制端点并返回解码后的字节。
func (t *TSClient) DownloadBytes(ctx context.Context, path string) ([]byte, error) {
	base, err := t.apiBase()
	if err != nil {
		return nil, err
	}
	_, token, _ := t.sess.Credentials()
	headers := map[string]string{"Authorization": "Bearer " + token}

	b64, err := transport.SharedProxyService().DownloadFileBase64(ctx, base+path, headers)
	if err != nil {
		return nil, fmt.Errorf("下载失败(%s): %w", path, err)
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("iris-mcp: decode download: %w", err)
	}
	return data, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
