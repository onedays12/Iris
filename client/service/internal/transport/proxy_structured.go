package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// ProxyResult is the structured response returned by DoRequestWithStatus.
// It always carries the HTTP status code so the frontend can distinguish
// 401 (auth expired), 5xx (server error), and network failures (status=0).
type ProxyResult struct {
	Status int    `json:"status"`
	Body   string `json:"body"`
	Error  string `json:"error,omitempty"`
}

// maxProxyResponseBody 限制 HTTP 响应体大小，防止不可信 TeamServer 响应耗尽内存。
// 与 FileService 的 50MB 单读上限、WebSocketService 的 64MB ReadLimit 对齐。
// var 而非 const：单测可临时调小以验证超限路径。
var maxProxyResponseBody int64 = 64 * 1024 * 1024

// readBodyLimited 读取响应体，最多读到 maxProxyResponseBody+1 字节。
// tooLarge 报告响应体是否超过上限（超限时不返回数据）。
func readBodyLimited(r io.Reader) (data []byte, tooLarge bool, err error) {
	limited := io.LimitReader(r, maxProxyResponseBody+1)
	data, err = io.ReadAll(limited)
	if err != nil {
		return nil, false, err
	}
	if int64(len(data)) > maxProxyResponseBody {
		return nil, true, nil
	}
	return data, false, nil
}

// DoRequestWithStatus executes a forwarded request and returns a structured
// JSON string containing the HTTP status code, response body, and optional error.
//
// HTTP-level failures (4xx/5xx) never produce a Go error: everything is encoded
// into ProxyResult so the frontend can handle status codes programmatically.
//
// Network-level failures (DNS, connection refused, timeout) return status=0
// with the error field populated. The Go error return is reserved for cases
// where the method cannot produce a valid JSON response.
func (p *ProxyService) DoRequestWithStatus(ctx context.Context, method string, url string, payload string, headersMap map[string]string) (string, error) {
	var bodyReader io.Reader
	if payload != "" {
		bodyReader = bytes.NewBufferString(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		out, _ := json.Marshal(ProxyResult{Status: 0, Error: fmt.Sprintf("failed to create request: %v", err)})
		return string(out), nil
	}

	for k, v := range headersMap {
		req.Header.Set(k, v)
	}

	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := p.client.Do(req)
	if err != nil {
		// Network error: status=0 signals "no response received"
		out, _ := json.Marshal(ProxyResult{Status: 0, Error: err.Error()})
		return string(out), nil
	}
	defer resp.Body.Close()

	respBody, tooLarge, err := readBodyLimited(resp.Body)
	if err != nil {
		out, _ := json.Marshal(ProxyResult{Status: resp.StatusCode, Error: fmt.Sprintf("read body: %v", err)})
		return string(out), nil
	}
	if tooLarge {
		out, _ := json.Marshal(ProxyResult{Status: resp.StatusCode, Error: fmt.Sprintf("response body exceeds %d bytes limit", maxProxyResponseBody)})
		return string(out), nil
	}

	out, _ := json.Marshal(ProxyResult{
		Status: resp.StatusCode,
		Body:   string(respBody),
	})
	return string(out), nil
}
