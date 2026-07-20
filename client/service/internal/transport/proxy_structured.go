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

// DoRequestWithStatus executes a forwarded request and returns a structured
// JSON string containing the HTTP status code, response body, and optional error.
//
// Unlike DoRequest, this method never returns a Go error for HTTP-level failures
// (4xx/5xx). Instead, it encodes everything into ProxyResult so the frontend can
// handle status codes programmatically.
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

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		out, _ := json.Marshal(ProxyResult{Status: resp.StatusCode, Error: fmt.Sprintf("read body: %v", err)})
		return string(out), nil
	}

	out, _ := json.Marshal(ProxyResult{
		Status: resp.StatusCode,
		Body:   string(respBody),
	})
	return string(out), nil
}
