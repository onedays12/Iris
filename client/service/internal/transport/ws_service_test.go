package transport

import (
	"errors"
	"strings"
	"testing"
)

// ─── buildWebSocketURL ───

func TestBuildWebSocketURLDefaults(t *testing.T) {
	got, err := buildWebSocketURL("", "abc")
	if err != nil {
		t.Fatalf("buildWebSocketURL returned error: %v", err)
	}
	if !strings.HasPrefix(got, "wss://127.0.0.1:8080/api/v1/connect") {
		t.Fatalf("expected default wss url, got %s", got)
	}
	if !strings.Contains(got, "token=abc") {
		t.Fatalf("expected token in query, got %s", got)
	}
}

func TestBuildWebSocketURLSchemeConversion(t *testing.T) {
	cases := []struct {
		apiBase string
		want    string
	}{
		{"https://host:8443", "wss://host:8443/api/v1/connect"},
		{"http://host:8080", "ws://host:8080/api/v1/connect"},
		{"wss://host", "wss://host/api/v1/connect"},
		{"ws://host", "ws://host/api/v1/connect"},
		{"host:8443", "wss://host:8443/api/v1/connect"}, // 无 scheme 自动补 https
	}
	for _, c := range cases {
		got, err := buildWebSocketURL(c.apiBase, "t")
		if err != nil {
			t.Fatalf("buildWebSocketURL(%q) error: %v", c.apiBase, err)
		}
		// 只校验前缀(token query 由别的 case 覆盖)
		if !strings.HasPrefix(got, c.want) {
			t.Errorf("buildWebSocketURL(%q) = %q, want prefix %q", c.apiBase, got, c.want)
		}
	}
}

func TestBuildWebSocketURLUnsupportedScheme(t *testing.T) {
	_, err := buildWebSocketURL("ftp://host", "t")
	if err == nil || !strings.Contains(err.Error(), "unsupported api base scheme") {
		t.Fatalf("expected unsupported scheme error, got %v", err)
	}
}

func TestBuildWebSocketURLMissingHost(t *testing.T) {
	_, err := buildWebSocketURL("https://", "t")
	if err == nil || !strings.Contains(err.Error(), "missing host") {
		t.Fatalf("expected missing host error, got %v", err)
	}
}

func TestBuildWebSocketURLSetsPathAndQuery(t *testing.T) {
	got, err := buildWebSocketURL("https://host/path", "tok")
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	// path 应被固定为 /api/v1/connect,不应保留原 /path
	if !strings.Contains(got, "/api/v1/connect?token=tok") {
		t.Fatalf("expected fixed path + token query, got %s", got)
	}
}

// ─── websocketOrigin ───

func TestWebsocketOriginSchemeConversion(t *testing.T) {
	cases := []struct {
		wsURL string
		want  string
	}{
		{"wss://host:8443/path", "https://host:8443"},
		{"ws://host:8080/path", "http://host:8080"},
	}
	for _, c := range cases {
		got, err := websocketOrigin(c.wsURL)
		if err != nil {
			t.Fatalf("websocketOrigin(%q) error: %v", c.wsURL, err)
		}
		if got != c.want {
			t.Errorf("websocketOrigin(%q) = %q, want %q", c.wsURL, got, c.want)
		}
	}
}

func TestWebsocketOriginStripsPathQueryFragment(t *testing.T) {
	got, err := websocketOrigin("wss://host:8443/api/v1/connect?token=x#frag")
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if got != "https://host:8443" {
		t.Fatalf("expected origin without path/query/fragment, got %s", got)
	}
}

func TestWebsocketOriginUnsupportedScheme(t *testing.T) {
	_, err := websocketOrigin("http://host")
	if err == nil || !strings.Contains(err.Error(), "unsupported websocket scheme") {
		t.Fatalf("expected unsupported scheme error, got %v", err)
	}
}

// ─── Connect token 校验 ───

func TestConnectRejectsEmptyToken(t *testing.T) {
	s := NewWebSocketService()
	for _, token := range []string{"", "   ", "\t\n"} {
		err := s.Connect("https://127.0.0.1:8080", token)
		if err == nil || !strings.Contains(err.Error(), "missing websocket token") {
			t.Fatalf("Connect with token %q should fail, got %v", token, err)
		}
	}
}

// ─── Disconnect / 状态机 ───

func TestNewWebSocketServiceInitialStatus(t *testing.T) {
	s := NewWebSocketService()
	if got := s.Status(); got != "closed" {
		t.Fatalf("initial status = %q, want closed", got)
	}
}

func TestDisconnectSetsClosedStatus(t *testing.T) {
	s := NewWebSocketService()
	if err := s.Disconnect(); err != nil {
		t.Fatalf("Disconnect error: %v", err)
	}
	if got := s.Status(); got != "closed" {
		t.Fatalf("status after disconnect = %q, want closed", got)
	}
}

func TestDisconnectIncrementsSession(t *testing.T) {
	s := NewWebSocketService()
	before := s.session
	_ = s.Disconnect()
	after := s.session
	if after <= before {
		t.Fatalf("session should increment on disconnect: before=%d after=%d", before, after)
	}
}

// ─── finishConnectFailure session 守卫 ───

func TestFinishConnectFailureGuardsSession(t *testing.T) {
	s := NewWebSocketService()
	// 模拟一个旧 session 被新的取代
	s.session = 10
	s.status = "open"

	// 用旧 session 调用,应被守卫拦截,不改状态
	s.finishConnectFailure(5, errors.New("old failure"))
	if s.Status() != "open" {
		t.Fatalf("finishConnectFailure with stale session should not change status, got %s", s.Status())
	}

	// 用当前 session 调用,应改状态为 error
	s.finishConnectFailure(10, errors.New("new failure"))
	if s.Status() != "error" {
		t.Fatalf("finishConnectFailure with current session should set error, got %s", s.Status())
	}
}

// ─── finishReadFailure session 守卫 ───

func TestFinishReadFailureGuardsSession(t *testing.T) {
	s := NewWebSocketService()
	s.session = 7
	s.status = "open"

	// 旧 session,应被拦截
	s.finishReadFailure(3, errors.New("old"))
	if s.Status() != "open" {
		t.Fatalf("finishReadFailure with stale session should not change status, got %s", s.Status())
	}

	// 当前 session,应改状态为 closed
	s.finishReadFailure(7, errors.New("new"))
	if s.Status() != "closed" {
		t.Fatalf("finishReadFailure with current session should set closed, got %s", s.Status())
	}
}

// ─── resetLocked + closeConn 幂等 ───

func TestResetLockedNoOpWhenEmpty(t *testing.T) {
	s := NewWebSocketService()
	// 无 conn 无 cancel,resetLocked 应返回 nil 且不 panic
	s.mu.Lock()
	conn := s.resetLocked()
	s.mu.Unlock()

	if conn != nil {
		t.Fatal("resetLocked should return nil when no conn")
	}
	if s.cancel != nil {
		t.Fatal("cancel should remain nil")
	}
	if s.conn != nil {
		t.Fatal("conn should remain nil")
	}
	// closeConn(nil) 应是 no-op,不 panic
	closeConn(nil)
}

// ─── Connect 失败路径(session 递增 + 状态) ───

func TestConnectFailureSetsErrorStatus(t *testing.T) {
	s := NewWebSocketService()
	// 拨一个不可达地址,应失败
	err := s.Connect("https://127.0.0.1:1", "valid-token")
	if err == nil {
		t.Fatal("Connect to unreachable host should fail")
	}
	// 拨号失败后 finishConnectFailure 把 status 设为 error
	if got := s.Status(); got != "error" {
		t.Fatalf("status after failed connect = %q, want error", got)
	}
}

// readLoop 的真实路径需 ws server 配合,留作后续集成测试。

