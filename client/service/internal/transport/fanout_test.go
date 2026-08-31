package transport

import (
	"sync"
	"sync/atomic"
	"testing"
)

// ─── FanoutEmitter ───

type countingEmitter struct {
	calls atomic.Int32
}

func (c *countingEmitter) Emit(name string, data ...any) { c.calls.Add(1) }

type panickingEmitter struct{}

func (panickingEmitter) Emit(string, ...any) { panic("boom") }

func TestFanoutDeliversToAllEmitters(t *testing.T) {
	a, b := &countingEmitter{}, &countingEmitter{}
	f := NewFanoutEmitter(a, b)
	f.Emit("evt")
	if a.calls.Load() != 1 || b.calls.Load() != 1 {
		t.Fatalf("a=%d b=%d, want 1/1", a.calls.Load(), b.calls.Load())
	}
}

func TestFanoutIsolatesPanic(t *testing.T) {
	a := panickingEmitter{}
	b := &countingEmitter{}
	f := NewFanoutEmitter(a, nil, b) // panic 出口夹在中间,nil 出口跳过
	f.Emit("evt")
	f.Emit("evt2") // 第一轮的 panic 不能污染后续
	if b.calls.Load() != 2 {
		t.Fatalf("b received %d events, want 2 (panic 必须被隔离)", b.calls.Load())
	}
}

// ─── WithConnectHook ───

func TestConnectHookFiresWithCredentials(t *testing.T) {
	type captured struct {
		mu             sync.Mutex
		apiBase, token string
	}
	cap := captured{}
	s := NewWebSocketService(WithConnectHook(func(apiBase, token string) {
		cap.mu.Lock()
		defer cap.mu.Unlock()
		cap.apiBase, cap.token = apiBase, token
	}))

	// 空 token 在钩子触发前即被拒绝
	if err := s.Connect("https://h", ""); err == nil {
		t.Fatal("empty token should still be rejected before hook")
	}
	if err := s.Connect("https://127.0.0.1:1", "tok-abc"); err == nil {
		t.Skipf("dial unexpectedly succeeded: %v", nil)
	}
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if cap.apiBase != "https://127.0.0.1:1" || cap.token != "tok-abc" {
		t.Fatalf("hook got apiBase=%q token=%q", cap.apiBase, cap.token)
	}
}

func TestConnectHookNilSafe(t *testing.T) {
	s := NewWebSocketService() // 未注册钩子
	_ = s.Connect("https://127.0.0.1:1", "tok")
}
