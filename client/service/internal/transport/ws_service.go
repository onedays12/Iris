package transport

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v3/pkg/application"

	"irisclient/service/internal/tls"
)

const (
	websocketEventMessage = "teamserver:ws:message"
	websocketEventStatus  = "teamserver:ws:status"
	websocketEventError   = "teamserver:ws:error"
)

type websocketStatusEvent struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	URL     string `json:"url,omitempty"`
}

type websocketMessageEvent struct {
	Data string `json:"data"`
}

type websocketErrorEvent struct {
	Message string `json:"message"`
}

// EventEmitter 把服务端事件推送给前端 UI。
// 窄接口使 transport 不依赖 Wails 全局单例,可独立注入测试替身。
type EventEmitter interface {
	Emit(name string, data ...any)
}

// wailsEventEmitter 是生产环境的默认出口,转发给 Wails 应用事件总线。
// transport 中对 Wails 的依赖收敛在此处一个类型内。
type wailsEventEmitter struct{}

func (wailsEventEmitter) Emit(name string, data ...any) {
	app := application.Get()
	if app == nil || app.Event == nil {
		return
	}
	app.Event.Emit(name, data...)
}

// NewWailsEventEmitter 返回生产环境默认出口(转发给 Wails 应用事件总线)。
// main.go 组装 FanoutEmitter 时使用;transport 内部对 Wails 的依赖仍收敛在类型上。
func NewWailsEventEmitter() EventEmitter { return wailsEventEmitter{} }

// WebSocketOption 定制 WebSocketService 构造参数。
type WebSocketOption func(*WebSocketService)

// WithEventEmitter 注入自定义事件出口,须在首次 Connect 前使用。
func WithEventEmitter(e EventEmitter) WebSocketOption {
	return func(s *WebSocketService) { s.emitter = e }
}

// WithConnectHook 注册连接钩子:每次 Connect 通过空 token 校验后、拨号前,
// 以 (apiBase, token) 回调。MCP 服务经此同步 GUI 会话凭据;fn 为 nil 安全忽略。
func WithConnectHook(fn func(apiBase, token string)) WebSocketOption {
	return func(s *WebSocketService) {
		s.mu.Lock()
		s.connectHook = fn
		s.mu.Unlock()
	}
}

type WebSocketService struct {
	mu          sync.Mutex
	emitter     EventEmitter // 构造期固定;nil 时静默丢弃事件
	connectHook func(apiBase, token string)
	conn        *websocket.Conn
	cancel      context.CancelFunc
	status      string
	session     uint64
}

func NewWebSocketService(opts ...WebSocketOption) *WebSocketService {
	s := &WebSocketService{
		emitter: wailsEventEmitter{},
		status:  "closed",
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func (s *WebSocketService) Connect(apiBase string, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("missing websocket token")
	}

	wsURL, err := buildWebSocketURL(apiBase, token)
	if err != nil {
		return err
	}

	s.mu.Lock()
	hook := s.connectHook
	s.mu.Unlock()
	if hook != nil {
		hook(apiBase, token)
	}

	ctx, cancel := context.WithCancel(context.Background())

	// 持锁: session 自增 + 取出旧 conn(不在此锁内关,避免 WriteControl 阻塞 1s)
	s.mu.Lock()
	s.session++
	session := s.session
	staleConn := s.resetLocked()
	s.cancel = cancel
	s.status = "connecting"
	s.mu.Unlock()

	// 锁外: 关闭被替换的旧 conn
	closeConn(staleConn)

	s.emitStatus("connecting", "", wsURL)

	dialCtx, dialCancel := context.WithTimeout(ctx, 10*time.Second)
	defer dialCancel()

	dialer := websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 10 * time.Second,
		TLSClientConfig:  tls.NewTLSConfig(),
	}

	requestHeader := http.Header{}
	if origin, originErr := websocketOrigin(wsURL); originErr == nil {
		requestHeader.Set("Origin", origin)
	}

	conn, resp, err := dialer.DialContext(dialCtx, wsURL, requestHeader)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
		}
		dialErr := err
		if status > 0 {
			dialErr = fmt.Errorf("%w (status %d)", err, status)
		}
		s.finishConnectFailure(session, dialErr)
		return fmt.Errorf("websocket dial failed: %w", dialErr)
	}

	if ctx.Err() != nil {
		_ = conn.Close()
		return ctx.Err()
	}

	conn.SetReadLimit(64 * 1024 * 1024)

	s.mu.Lock()
	if session != s.session {
		s.mu.Unlock()
		_ = conn.Close()
		return errors.New("websocket connection superseded")
	}
	s.conn = conn
	s.status = "open"
	s.mu.Unlock()

	s.emitStatus("open", "", wsURL)
	go s.readLoop(ctx, session, conn)

	return nil
}

func (s *WebSocketService) Disconnect() error {
	// 持锁: session 自增 + 取出 conn,锁外再关
	s.mu.Lock()
	s.session++
	conn := s.resetLocked()
	s.status = "closed"
	s.mu.Unlock()

	// 锁外: 关闭 conn,WriteControl 最多等 1s,不阻塞 s.mu
	closeConn(conn)

	s.emitStatus("closed", "client disconnected", "")
	return nil
}

func (s *WebSocketService) Status() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.status
}

func (s *WebSocketService) readLoop(ctx context.Context, session uint64, conn *websocket.Conn) {
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			s.finishReadFailure(session, err)
			return
		}

		s.emit(websocketEventMessage, websocketMessageEvent{Data: string(message)})
	}
}

func (s *WebSocketService) finishConnectFailure(session uint64, err error) {
	s.mu.Lock()
	if session != s.session {
		s.mu.Unlock()
		return
	}
	conn := s.resetLocked()
	s.status = "error"
	s.mu.Unlock()

	// 锁外关闭,避免阻塞 s.mu
	closeConn(conn)

	s.emit(websocketEventError, websocketErrorEvent{Message: err.Error()})
}

func (s *WebSocketService) finishReadFailure(session uint64, err error) {
	s.mu.Lock()
	if session != s.session {
		s.mu.Unlock()
		return
	}
	conn := s.resetLocked()
	s.status = "closed"
	s.mu.Unlock()

	// 锁外关闭,避免阻塞 s.mu
	closeConn(conn)

	s.emitStatus("closed", err.Error(), "")
}

// resetLocked 把当前 conn 与 cancel 取出并置空,返回需要锁外关闭的 conn。
// 必须在持 s.mu 锁时调用。cancel 在锁内同步执行(轻量),conn 的 WriteControl/Close
// 可能阻塞 1s,留给调用方在锁外用 closeConn 执行。
func (s *WebSocketService) resetLocked() *websocket.Conn {
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	conn := s.conn
	s.conn = nil
	return conn
}

// closeConn 在锁外执行 conn 的优雅关闭。
// WriteControl(CloseMessage) 最多等 1s 对端回 close frame,然后强制 Close。
// 移出锁外是为了避免对端不响应时阻塞 s.mu 1s,拖住 Connect/Status 等调用。
func closeConn(conn *websocket.Conn) {
	if conn == nil {
		return
	}
	_ = conn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "client closing"),
		time.Now().Add(time.Second),
	)
	_ = conn.Close()
}

func (s *WebSocketService) emitStatus(status string, message string, wsURL string) {
	s.emit(websocketEventStatus, websocketStatusEvent{
		Status:  status,
		Message: message,
		URL:     wsURL,
	})
}

func (s *WebSocketService) emit(name string, data any) {
	if s.emitter == nil {
		return
	}
	s.emitter.Emit(name, data)
}

func buildWebSocketURL(apiBase string, token string) (string, error) {
	apiBase = strings.TrimSpace(apiBase)
	if apiBase == "" {
		apiBase = "https://127.0.0.1:8080"
	}
	if !strings.Contains(apiBase, "://") {
		apiBase = "https://" + apiBase
	}

	parsed, err := url.Parse(apiBase)
	if err != nil {
		return "", fmt.Errorf("invalid api base: %w", err)
	}
	if parsed.Host == "" {
		return "", errors.New("invalid api base: missing host")
	}

	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported api base scheme: %s", parsed.Scheme)
	}

	parsed.Path = "/api/v1/connect"
	parsed.RawQuery = url.Values{"token": []string{token}}.Encode()
	parsed.Fragment = ""

	return parsed.String(), nil
}

func websocketOrigin(wsURL string) (string, error) {
	parsed, err := url.Parse(wsURL)
	if err != nil {
		return "", err
	}

	switch parsed.Scheme {
	case "wss":
		parsed.Scheme = "https"
	case "ws":
		parsed.Scheme = "http"
	default:
		return "", fmt.Errorf("unsupported websocket scheme: %s", parsed.Scheme)
	}

	parsed.Path = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}
