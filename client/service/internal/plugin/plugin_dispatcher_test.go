package plugin

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"irisclient/service/internal/transport"
)

// dispatchTestServer 构造一个 httptest server，按 handler 返回内容。
// 返回的 base 已去掉尾斜杠，方便拼路径。
func dispatchTestServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv
}

func TestDispatchBeaconCommandSuccess(t *testing.T) {
	srv := dispatchTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		// 校验请求路径与头
		if r.URL.Path != "/api/v1/beacon/command" {
			t.Errorf("path = %q, want /api/v1/beacon/command", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("Authorization = %q, want Bearer tok", r.Header.Get("Authorization"))
		}
		w.WriteHeader(200)
		_, _ = io.WriteString(w, `{"ok":true}`)
	})

	err := dispatchBeaconCommand(context.Background(), srv.URL, "tok", "beacon-1", 70, nil)
	if err != nil {
		t.Fatalf("expected nil error on success, got %v", err)
	}
}

func TestDispatchBeaconCommandBusinessError(t *testing.T) {
	srv := dispatchTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = io.WriteString(w, `{"ok":false,"message":"boom"}`)
	})

	err := dispatchBeaconCommand(context.Background(), srv.URL, "tok", "beacon-1", 70, nil)
	if err == nil {
		t.Fatal("expected error for ok:false, got nil")
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Fatalf("error should carry business message, got %v", err)
	}
}

func TestDispatchBeaconCommandErrorField(t *testing.T) {
	srv := dispatchTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = io.WriteString(w, `{"error":"invalid command"}`)
	})

	err := dispatchBeaconCommand(context.Background(), srv.URL, "tok", "beacon-1", 70, nil)
	if err == nil {
		t.Fatal("expected error for error field, got nil")
	}
	if !strings.Contains(err.Error(), "invalid command") {
		t.Fatalf("error should carry 'invalid command', got %v", err)
	}
}

func TestDispatchBeaconCommandUnauthorized(t *testing.T) {
	srv := dispatchTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = io.WriteString(w, `{"ok":false,"error":"unauthorized"}`)
	})

	err := dispatchBeaconCommand(context.Background(), srv.URL, "tok", "beacon-1", 70, nil)
	if err == nil {
		t.Fatal("expected error on 401, got nil")
	}
	if !errors.Is(err, ErrDispatchUnauthorized) {
		t.Fatalf("expected ErrDispatchUnauthorized, got %v", err)
	}
}

func TestDispatchBeaconCommandServer5xx(t *testing.T) {
	srv := dispatchTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = io.WriteString(w, "Bad Gateway")
	})

	err := dispatchBeaconCommand(context.Background(), srv.URL, "tok", "beacon-1", 70, nil)
	if err == nil {
		t.Fatal("expected error on 5xx, got nil")
	}
	if !errors.Is(err, ErrDispatchServerFailed) {
		t.Fatalf("expected ErrDispatchServerFailed, got %v", err)
	}
	if !strings.Contains(err.Error(), "status=500") {
		t.Errorf("error should mention status code, got %v", err)
	}
}

func TestDispatchBeaconCommandHTMLResponse(t *testing.T) {
	// teamserver 返回了 HTML（路径错误或反向代理拦截），应识别为 unexpected html
	srv := dispatchTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		_, _ = io.WriteString(w, "<html><body>Not Found</body></html>")
	})

	err := dispatchBeaconCommand(context.Background(), srv.URL, "tok", "beacon-1", 70, nil)
	if err == nil {
		t.Fatal("expected error on HTML response, got nil")
	}
	if !errors.Is(err, ErrDispatchUnexpectedHTML) {
		t.Fatalf("expected ErrDispatchUnexpectedHTML, got %v", err)
	}
}

func TestDispatchBeaconCommandNetworkFailure(t *testing.T) {
	// 连一个不存在的端口，触发网络层失败
	err := dispatchBeaconCommand(context.Background(), "http://127.0.0.1:1", "tok", "beacon-1", 70, nil)
	if err == nil {
		t.Fatal("expected network error, got nil")
	}
	if !errors.Is(err, ErrDispatchNetworkFailure) {
		t.Fatalf("expected ErrDispatchNetworkFailure, got %v", err)
	}
}

func TestDispatchBeaconCommandContextCancelled(t *testing.T) {
	// 用显式 done channel 控制 handler 退出，避免 httptest.Server.Close 等待活跃连接。
	// 若改用 r.Context().Done()，客户端 RST 后 server 端 ctx 才触发，srv.Close 仍会卡 5s+。
	handlerDone := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-handlerDone:
		case <-time.After(30 * time.Second):
		}
	}))
	defer func() {
		close(handlerDone)
		srv.Close()
	}()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	start := time.Now()
	err := dispatchBeaconCommand(ctx, srv.URL, "tok", "beacon-1", 70, nil)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected error on cancelled ctx, got nil")
	}
	// ctx 取消会先被 DoRequestWithStatus 编码为 transport.ProxyResult{Status:0}，
	// 再由 classifyDispatchResult 识别为 ErrDispatchNetworkFailure
	if !errors.Is(err, ErrDispatchNetworkFailure) {
		t.Fatalf("expected ErrDispatchNetworkFailure for cancelled ctx, got %v", err)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("dispatch did not return promptly after ctx cancel: %v", elapsed)
	}
}

func TestClassifyDispatchResultEmptyBody2xx(t *testing.T) {
	// 2xx + 空 body：不应判错（部分 teamserver 接口 200 无返回体）
	err := classifyDispatchResult(transport.ProxyResult{Status: 200, Body: ""})
	if err != nil {
		t.Fatalf("expected nil for 2xx empty body, got %v", err)
	}
}

func TestClassifyDispatchResultNonJSON2xx(t *testing.T) {
	// 2xx + 非 JSON 非 HTML：不应判错（teamserver 可能返回纯文本 ack）
	err := classifyDispatchResult(transport.ProxyResult{Status: 200, Body: "OK"})
	if err != nil {
		t.Fatalf("expected nil for 2xx non-JSON text, got %v", err)
	}
}
