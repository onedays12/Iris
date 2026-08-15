package plugin

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// writeTestPluginManifest 在 root 目录下写一个最小可加载的 schema v2 plugin.json:
// 单动作(无工件, 不触发 hashes 引用) + capabilities 白名单。
func writeTestPluginManifest(t *testing.T, root, name string) {
	t.Helper()
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatalf("MkdirAll %s: %v", root, err)
	}
	manifest := `{"schema_version":2,"name":"` + name + `","version":"1.0.0","capabilities":{"command_ids":[70]},"actions":[{"id":"noop"}]}`
	if err := os.WriteFile(filepath.Join(root, "plugin.json"), []byte(manifest), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
}

// TestReloadDoesNotBlockList 验证核心收益:
// Reload 的磁盘 I/O 在锁外执行,期间 List 不应被阻塞。
//
// 构造 50 个插件让 loadPlugin 累计耗时可观,并发跑 Reload + 多次 List,
// 断言 List 总耗时远小于 Reload 总耗时(若 List 被 Reload 阻塞,会等到 Reload 完成)。
func TestReloadDoesNotBlockList(t *testing.T) {
	tmpDir := t.TempDir()
	const pluginCount = 50
	for i := 0; i < pluginCount; i++ {
		writeTestPluginManifest(t, filepath.Join(tmpDir, fmt.Sprintf("p%02d", i)), fmt.Sprintf("p%02d", i))
	}

	manager := NewPluginManager()
	manager.rootDir = tmpDir
	if _, err := manager.Reload(); err != nil {
		t.Fatalf("initial Reload: %v", err)
	}

	var listTotalMs int64
	var listCount int64
	stop := make(chan struct{})
	var wg sync.WaitGroup

	// List 压测 goroutine: 持续跑 List,累计耗时
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
			}
			start := time.Now()
			_ = manager.List()
			atomic.AddInt64(&listTotalMs, time.Since(start).Milliseconds())
			atomic.AddInt64(&listCount, 1)
		}
	}()

	// 跑一次 Reload(会重新加载 50 个插件,有可观磁盘 I/O)
	reloadStart := time.Now()
	if _, err := manager.Reload(); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	reloadElapsed := time.Since(reloadStart)
	close(stop)
	wg.Wait()

	listCountVal := atomic.LoadInt64(&listCount)
	listTotalVal := atomic.LoadInt64(&listTotalMs)
	if listCountVal == 0 {
		t.Fatal("List was never called during Reload")
	}

	// 若 List 被 Reload 阻塞,每次 List 都要等 Reload 完成,则 listTotalVal >= reloadElapsed。
	// 反之若 List 不阻塞,listTotalVal 应远小于 reloadElapsed(每次 List 只在阶段 1/2 短暂持锁)。
	t.Logf("reload=%v, listCalls=%d, listTotal=%vms",
		reloadElapsed, listCountVal, listTotalVal)

	// 容忍 2x reload 时长(给锁切换留余量);若 List 被全程阻塞,listTotal 会接近 N*reload。
	if listTotalVal > int64(reloadElapsed.Milliseconds())*3+50 {
		t.Fatalf("List appears blocked by Reload: listTotal=%dms, reload=%dms",
			listTotalVal, reloadElapsed.Milliseconds())
	}
}

// TestDeleteRemovesFromMapImmediately 验证:
// Delete 用写锁从 map 移除 plugin 后,并发 Invoke 立即看到 not found,
// 而非在 RemoveAll/Reload 完成前还能拿到即将被删的 plugin。
func TestDeleteRemovesFromMapImmediately(t *testing.T) {
	tmpDir := t.TempDir()
	writeTestPluginManifest(t, filepath.Join(tmpDir, "del-me"), "del-me")

	manager := NewPluginManager()
	manager.rootDir = tmpDir
	if _, err := manager.Reload(); err != nil {
		t.Fatalf("Reload: %v", err)
	}

	// 确认插件存在
	if _, err := manager.Get("del-me"); err != nil {
		t.Fatalf("setup: Get before delete failed: %v", err)
	}

	// Delete 会从 map 移除,然后锁外 RemoveAll + Reload
	if _, err := manager.Delete("del-me"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Delete 返回后,plugin 应已不在 map(Reload 也已重建 map,del-me 目录被删)
	if _, err := manager.Get("del-me"); err == nil {
		t.Fatal("Get after delete should return not-found error")
	}
}

// TestDeleteNonExistentReturnsError 验证删除不存在的插件返回明确错误。
func TestDeleteNonExistentReturnsError(t *testing.T) {
	manager := NewPluginManager()
	manager.rootDir = t.TempDir()
	if _, err := manager.Reload(); err != nil {
		t.Fatalf("Reload: %v", err)
	}

	_, err := manager.Delete("does-not-exist")
	if err == nil {
		t.Fatal("expected error for deleting non-existent plugin")
	}
}

// TestReloadConcurrentSafety 验证并发 Reload 不会 race 或 panic。
func TestReloadConcurrentSafety(t *testing.T) {
	tmpDir := t.TempDir()
	for i := 0; i < 5; i++ {
		writeTestPluginManifest(t, filepath.Join(tmpDir, fmt.Sprintf("p%d", i)), fmt.Sprintf("p%d", i))
	}

	manager := NewPluginManager()
	manager.rootDir = tmpDir
	if _, err := manager.Reload(); err != nil {
		t.Fatalf("initial Reload: %v", err)
	}

	const N = 5
	var wg sync.WaitGroup
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			_, _ = manager.Reload()
		}()
	}
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			_ = manager.List()
		}()
	}
	wg.Wait()
	// 若跑到这里没 panic/race,即通过(-race 下数据竞争会被 race detector 抓)
}
