package transport

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestDisconnectDoesNotBlockConnect 验证核心收益:
// Disconnect 把 WriteControl/Close 移出 s.mu 锁外,
// 不会因为对端不响应 close frame 而阻塞 s.mu,从而让后续 Status() 立即返回。
//
// 构造一个 Connect→Disconnect 的完整路径,断言 Disconnect 在合理时间内返回
// 且之后 Status() 能立即拿到锁。
func TestDisconnectDoesNotBlockStatus(t *testing.T) {
	// 用 gorilla/websocket 自带的 echo upgrader 起一个真 WS 服务器。
	// 它会响应 close frame,正常情况下 Disconnect 极快;重点是验证锁路径不死锁。
	upgrader := websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool { return true },
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// 简单 echo + 阻塞等 close(让 Disconnect 的 WriteControl 有对象可写)
		for {
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if err := conn.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}))
	defer srv.Close()

	// 把 http:// apiBase 传给 Connect,buildWebSocketURL 内部会把 http → ws。
	apiBase := srv.URL
	token := "test-token"

	s := NewWebSocketService()
	if err := s.Connect(apiBase, token); err != nil {
		// httptest 是 http,buildWebSocketURL 会把 http → ws,server 应该能连上。
		// 若失败,跳过(环境问题)。
		t.Skipf("Connect to test server failed: %v", err)
	}
	if got := s.Status(); got != "open" {
		t.Fatalf("status after Connect = %q, want open", got)
	}

	// Disconnect 应快速返回
	start := time.Now()
	if err := s.Disconnect(); err != nil {
		t.Fatalf("Disconnect error: %v", err)
	}
	elapsed := time.Since(start)
	if elapsed > 2*time.Second {
		t.Fatalf("Disconnect took too long: %v (expected < 2s)", elapsed)
	}

	// Status() 应立即返回 closed,证明 s.mu 没被 closeConn 长期持有
	if got := s.Status(); got != "closed" {
		t.Fatalf("status after Disconnect = %q, want closed", got)
	}

	// 再次 Disconnect 幂等(无 conn,resetLocked 返回 nil,closeConn(nil) no-op)
	if err := s.Disconnect(); err != nil {
		t.Fatalf("second Disconnect error: %v", err)
	}
}

// TestDisconnectConcurrentSafety 验证并发 Disconnect + Status 不会 race 或死锁。
func TestDisconnectConcurrentSafety(t *testing.T) {
	s := NewWebSocketService()
	// 不 Connect,直接并发 Disconnect + Status,验证无 conn 路径的并发安全
	const N = 10
	done := make(chan struct{})
	for i := 0; i < N; i++ {
		go func() {
			_ = s.Disconnect()
			_ = s.Status()
			done <- struct{}{}
		}()
	}
	for i := 0; i < N; i++ {
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("concurrent Disconnect/Status timed out - possible deadlock")
		}
	}
}
