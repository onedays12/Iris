package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestDoRequestWithStatusContextCancel 验证结构化路径受 ctx 控制。
// DoRequestWithStatus 对网络错误返回 status=0 + error 字段，不返回 Go error。
func TestDoRequestWithStatusContextCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(30 * time.Second):
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	p := NewProxyService()
	start := time.Now()
	got, _ := p.DoRequestWithStatus(ctx, "GET", srv.URL, "", nil)
	elapsed := time.Since(start)

	if elapsed > 2*time.Second {
		t.Fatalf("DoRequestWithStatus did not return promptly after ctx cancel: %v", elapsed)
	}

	// 结构化结果应为 status=0 + error 字段（网络层失败语义）
	var result ProxyResult
	if err := json.Unmarshal([]byte(got), &result); err != nil {
		t.Fatalf("failed to parse ProxyResult: %v", err)
	}
	if result.Status != 0 {
		t.Errorf("status = %d, want 0 for cancelled request", result.Status)
	}
	if result.Error == "" {
		t.Error("error field should be populated for cancelled request")
	}
}
