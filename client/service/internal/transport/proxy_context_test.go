package transport

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestDoRequestContextCancel 验证 ctx 取消能立即中断在途 HTTP 请求，
// 而非等到 30s HTTP 超时。这是核心收益。
func TestDoRequestContextCancel(t *testing.T) {
	// server 故意阻塞 30s，模拟慢 teamserver
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(30 * time.Second):
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	// 在请求发出后立即取消 ctx
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	p := NewProxyService()
	start := time.Now()
	_, err := p.DoRequest(ctx, "GET", srv.URL, "", nil)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected error when ctx is cancelled, got nil")
	}
	// NewRequestWithContext 在 ctx 取消后返回 context.Canceled 或 net/http 的 "context canceled"
	if !errors.Is(err, context.Canceled) && !strings.Contains(err.Error(), "context canceled") {
		t.Fatalf("expected context.Canceled error, got %v", err)
	}
	// 必须在 2s 内返回，证明是 ctx 取消触发的，而非 30s HTTP 超时
	if elapsed > 2*time.Second {
		t.Fatalf("DoRequest did not return promptly after ctx cancel: %v", elapsed)
	}
}

// TestDoRequestWithStatusContextCancel 验证结构化路径同样受 ctx 控制。
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
