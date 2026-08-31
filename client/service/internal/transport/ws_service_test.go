package transport

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
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

// ─── readLoop(真实 gorilla WS 服务器 + 注入式事件出口) ───

// eventRecorder 实现 EventEmitter,收集事件供断言,替代 Wails 总线。
type eventRecorder struct {
	mu     sync.Mutex
	events []recordedEvent
}

type recordedEvent struct {
	name string
	data any
}

func (r *eventRecorder) Emit(name string, data ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var payload any
	if len(data) > 0 {
		payload = data[0]
	}
	r.events = append(r.events, recordedEvent{name: name, data: payload})
}

func (r *eventRecorder) snapshot() []recordedEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]recordedEvent(nil), r.events...)
}

// waitFor 轮询直到条件成立或超时。
func waitFor(timeout time.Duration, cond func() bool) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

// dialTestWS 对 httptest 服务器拨一条 ws 连接。
func dialTestWS(t *testing.T, srvURL string) *websocket.Conn {
	t.Helper()
	wsURL := strings.Replace(srvURL, "http://", "ws://", 1)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", wsURL, err)
	}
	return conn
}

func TestReadLoopEmitsMessageEvents(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for _, msg := range []string{"hello-1", "hello-2"} {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
				return
			}
		}
		// 阻塞读保持连接,直到客户端侧关闭
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer srv.Close()

	rec := &eventRecorder{}
	s := NewWebSocketService(WithEventEmitter(rec))
	conn := dialTestWS(t, srv.URL)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 收齐 2 条消息后取消 ctx 并关 conn,让同步运行的 readLoop 确定性返回;
	// 无论条件是否达成都必须执行收尾,避免测试挂死。
	go func() {
		waitFor(2*time.Second, func() bool { return len(rec.snapshot()) >= 2 })
		cancel()
		closeConn(conn)
	}()

	s.readLoop(ctx, 1, conn)

	events := rec.snapshot()
	if len(events) != 2 {
		t.Fatalf("expected exactly 2 message events, got %d: %+v", len(events), events)
	}
	want := []websocketMessageEvent{{Data: "hello-1"}, {Data: "hello-2"}}
	for i, w := range want {
		if events[i].name != websocketEventMessage {
			t.Errorf("event[%d] name = %q, want %q", i, events[i].name, websocketEventMessage)
		}
		if events[i].data != w {
			t.Errorf("event[%d] data = %+v, want %+v", i, events[i].data, w)
		}
	}
}

func TestReadLoopUnexpectedCloseEmitsStatusClosed(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// 不发 close frame 直接断开 → 客户端 ReadMessage 报异常关闭错误
		_ = conn.Close()
	}))
	defer srv.Close()

	rec := &eventRecorder{}
	s := NewWebSocketService(WithEventEmitter(rec))
	s.session = 5
	s.status = "open"
	conn := dialTestWS(t, srv.URL)

	// Background ctx 未取消 → 走 finishReadFailure 分支而非静默返回
	s.readLoop(context.Background(), 5, conn)

	if got := s.Status(); got != "closed" {
		t.Fatalf("status after abrupt close = %q, want closed", got)
	}

	events := rec.snapshot()
	if len(events) != 1 {
		t.Fatalf("expected exactly 1 status event, got %d: %+v", len(events), events)
	}
	if events[0].name != websocketEventStatus {
		t.Errorf("event name = %q, want %q", events[0].name, websocketEventStatus)
	}
	st, ok := events[0].data.(websocketStatusEvent)
	if !ok {
		t.Fatalf("event data type = %T, want websocketStatusEvent", events[0].data)
	}
	if st.Status != "closed" {
		t.Errorf("status payload = %q, want closed", st.Status)
	}
	if st.Message == "" {
		t.Error("status payload should carry the read failure message")
	}
}

func TestReadLoopCtxCancelExitsSilently(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer srv.Close()

	rec := &eventRecorder{}
	s := NewWebSocketService(WithEventEmitter(rec))
	conn := dialTestWS(t, srv.URL)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 先取消 ctx 再关 conn 解除 ReadMessage 阻塞 → 应静默退出、不发任何事件
	go func() {
		cancel()
		closeConn(conn)
	}()

	start := time.Now()
	s.readLoop(ctx, 9, conn)
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("readLoop took too long to exit after ctx cancel: %v", elapsed)
	}

	if events := rec.snapshot(); len(events) != 0 {
		t.Fatalf("ctx-cancelled readLoop should emit nothing, got %+v", events)
	}
}

func TestReadLoopStaleSessionEmitsNothing(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		_ = conn.Close()
	}))
	defer srv.Close()

	rec := &eventRecorder{}
	s := NewWebSocketService(WithEventEmitter(rec))
	s.session = 99 // 当前 session 已被新连接取代
	s.status = "open"
	conn := dialTestWS(t, srv.URL)

	// 传入旧 session 5:读失败应被守卫拦截——状态不变、零事件
	s.readLoop(context.Background(), 5, conn)

	if got := s.Status(); got != "open" {
		t.Fatalf("stale-session failure should not change status, got %q", got)
	}
	if events := rec.snapshot(); len(events) != 0 {
		t.Fatalf("stale-session failure should emit nothing, got %+v", events)
	}
}
