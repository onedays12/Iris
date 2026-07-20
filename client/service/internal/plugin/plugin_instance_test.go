package plugin

import (
	"errors"
	"sync/atomic"
	"testing"
)

// newTestPluginInstance 构造一个带可注册 cleanup 钩子的 PluginInstance,
// 用于测试 Close 的调度/聚合/幂等语义。
func newTestPluginInstance(cleanup ...func() error) *PluginInstance {
	p := &PluginInstance{
		ID:     "test-plugin",
		Status: "ready",
	}
	p.cleanup = append(p.cleanup, cleanup...)
	return p
}

func TestPluginInstanceCloseNoCleanupReturnsNil(t *testing.T) {
	// 无任何 cleanup 注册时,Close 是 no-op 且返回 nil
	p := newTestPluginInstance()
	if err := p.Close(); err != nil {
		t.Fatalf("Close with no cleanup should return nil, got %v", err)
	}
}

func TestPluginInstanceCloseInvokesAllCleanup(t *testing.T) {
	var callCount int32
	cleanupA := func() error { atomic.AddInt32(&callCount, 1); return nil }
	cleanupB := func() error { atomic.AddInt32(&callCount, 1); return nil }
	cleanupC := func() error { atomic.AddInt32(&callCount, 1); return nil }

	p := newTestPluginInstance(cleanupA, cleanupB, cleanupC)
	if err := p.Close(); err != nil {
		t.Fatalf("Close error: %v", err)
	}
	if got := atomic.LoadInt32(&callCount); got != 3 {
		t.Fatalf("expected all 3 cleanup funcs called, got %d", got)
	}
}

func TestPluginInstanceCloseAggregatesErrors(t *testing.T) {
	// 多个 cleanup 失败时,errors.Join 合并
	errA := errors.New("cleanup A failed")
	errB := errors.New("cleanup B failed")
	p := newTestPluginInstance(
		func() error { return errA },
		func() error { return nil }, // 混入一个成功,不应影响聚合
		func() error { return errB },
	)
	err := p.Close()
	if err == nil {
		t.Fatal("expected aggregated error, got nil")
	}
	if !errors.Is(err, errA) {
		t.Errorf("aggregated error should wrap errA, got %v", err)
	}
	if !errors.Is(err, errB) {
		t.Errorf("aggregated error should wrap errB, got %v", err)
	}
}

func TestPluginInstanceCloseIdempotent(t *testing.T) {
	// 重复调用 Close 不应重复执行 cleanup (幂等)
	var callCount int32
	p := newTestPluginInstance(
		func() error { atomic.AddInt32(&callCount, 1); return nil },
	)
	_ = p.Close()
	_ = p.Close()
	_ = p.Close()
	if got := atomic.LoadInt32(&callCount); got != 1 {
		t.Fatalf("cleanup should run exactly once across repeated Close calls, got %d", got)
	}
}

func TestPluginInstanceCloseSkipsNilEntries(t *testing.T) {
	// cleanup 切片里的 nil 项应被跳过而非 panic
	var called int32
	p := newTestPluginInstance(
		nil,
		func() error { atomic.AddInt32(&called, 1); return nil },
		nil,
	)
	if err := p.Close(); err != nil {
		t.Fatalf("Close error: %v", err)
	}
	if got := atomic.LoadInt32(&called); got != 1 {
		t.Fatalf("expected 1 real cleanup call, got %d", got)
	}
}

// TestPluginInstanceCloseConcurrent 验证 Close 在并发调用下的安全性。
// sync.Mutex + cleanup 清空保证只有一个调用能执行钩子,其余拿到 nil。
func TestPluginInstanceCloseConcurrent(t *testing.T) {
	var callCount int32
	p := newTestPluginInstance(
		func() error { atomic.AddInt32(&callCount, 1); return nil },
	)

	const N = 8
	errs := make(chan error, N)
	for i := 0; i < N; i++ {
		go func() {
			errs <- p.Close()
		}()
	}
	// 收集所有 error
	var errCount int
	for i := 0; i < N; i++ {
		if err := <-errs; err != nil {
			errCount++
		}
	}
	if got := atomic.LoadInt32(&callCount); got != 1 {
		t.Fatalf("cleanup should run exactly once under concurrent Close, got %d", got)
	}
	if errCount != 0 {
		t.Fatalf("all concurrent Close calls should return nil (no real cleanup error), got %d errors", errCount)
	}
}
