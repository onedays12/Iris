package command

import (
	"bytes"
	"net"
	"testing"
	"time"
)

// newChannelForQueueTest 构造一个已注册的测试通道。
func newChannelForQueueTest(t *testing.T, rt *TunnelRuntime, tunnelID, channelID string) *TunnelChannel {
	t.Helper()
	a, b := net.Pipe()
	t.Cleanup(func() { _ = b.Close() })
	ch := &TunnelChannel{
		TunnelID:   tunnelID,
		ChannelID:  channelID,
		Proto:      "tcp",
		TargetConn: a,
		CreatedAt:  time.Now(),
	}
	if err := rt.Add(ch); err != nil {
		t.Fatalf("add channel: %v", err)
	}
	return ch
}

// TestPushDataPacketBlocksWhenChannelQueueFull 验证 per-channel 队列满时
// PushDataPacket 阻塞（背压），排空后恢复。
func TestPushDataPacketBlocksWhenChannelQueueFull(t *testing.T) {
	rt := newTunnelRuntimeForTest()
	ch := newChannelForQueueTest(t, rt, "tunnel-1", "channel-1")

	// 填满队列（worker 视角：连续入队，超过上限即阻塞）
	pkt := []byte("p")
	done := make(chan struct{})
	go func() {
		// 填满后下一次 push 应阻塞等待排空
		for i := 0; i < channelDataQueueMax+1; i++ {
			rt.PushDataPacket(ch.TunnelID, ch.ChannelID, pkt)
		}
		close(done)
	}()

	// 等待阻塞发生：聚合计数达到上限且 goroutine 未完成
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		rt.mu.RLock()
		full := rt.dataCount == channelDataQueueMax
		rt.mu.RUnlock()
		if full {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	select {
	case <-done:
		t.Fatalf("push completed without blocking")
	default:
	}

	// 排空一包 → 阻塞的 push 恢复并完成
	rt.GetPendingPackets()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("push did not resume after drain")
	}
}

// TestGetPendingPacketsFairPollRespectsQuotaAndCap 验证公平轮询：
// 每通道每轮最多 tunnelPollChannelMaxPackets 包，总量不超过 1MB；
// 多通道都能取到数据（互不饿死）。
func TestGetPendingPacketsFairPollRespectsQuotaAndCap(t *testing.T) {
	rt := newTunnelRuntimeForTest()
	chA := newChannelForQueueTest(t, rt, "tunnel-a", "ch-a")
	chB := newChannelForQueueTest(t, rt, "tunnel-b", "ch-b")

	// 每通道灌 100 包（每包 1 字节，总 200 字节 < 1MB 上限，配额 64 生效）
	for i := 0; i < 100; i++ {
		rt.PushDataPacket(chA.TunnelID, chA.ChannelID, []byte("a"))
		rt.PushDataPacket(chB.TunnelID, chB.ChannelID, []byte("b"))
	}

	pkts := rt.GetPendingPackets()
	if len(pkts) != 2*tunnelPollChannelMaxPackets {
		t.Fatalf("pending = %d, want %d (64/channel)", len(pkts), 2*tunnelPollChannelMaxPackets)
	}
	// 两通道都取到了配额（排序确定：tunnel-a 在前）
	first := pkts[0]
	second := pkts[tunnelPollChannelMaxPackets]
	if !bytes.Equal(first, []byte("a")) {
		t.Fatalf("first batch should belong to tunnel-a")
	}
	if !bytes.Equal(second, []byte("b")) {
		t.Fatalf("second batch should belong to tunnel-b")
	}

	// 剩余数据下一轮可继续取（聚合计数正确）
	left := rt.GetPendingPackets()
	if len(left) != 2*(100-tunnelPollChannelMaxPackets) {
		t.Fatalf("remaining = %d, want %d", len(left), 2*(100-tunnelPollChannelMaxPackets))
	}

	// 大包场景：单包超过 1MB 上限时至少回传 1 包（不丢）
	big := make([]byte, 2*1024*1024)
	rt.PushDataPacket(chA.TunnelID, chA.ChannelID, big)
	one := rt.GetPendingPackets()
	if len(one) != 1 || len(one[0]) != len(big) {
		t.Fatalf("big packet roundtrip failed: got %d packets", len(one))
	}
}

// TestClosedChannelDataDeliveredThenRemoved 验证通道关闭后：
// 1) 已排队数据照常交付（不丢最后一个数据块）；2) 阻塞中的 push 被唤醒并退出；
// 3) 数据排空后通道从表中移除。
func TestClosedChannelDataDeliveredThenRemoved(t *testing.T) {
	rt := newTunnelRuntimeForTest()
	ch := newChannelForQueueTest(t, rt, "tunnel-1", "channel-1")

	for i := 0; i < channelDataQueueMax; i++ {
		rt.PushDataPacket(ch.TunnelID, ch.ChannelID, []byte("p"))
	}

	// worker 阻塞在满队列 push 中
	pushDone := make(chan struct{})
	go func() {
		rt.PushDataPacket(ch.TunnelID, ch.ChannelID, []byte("extra"))
		close(pushDone)
	}()

	time.Sleep(50 * time.Millisecond)
	select {
	case <-pushDone:
		t.Fatalf("push should be blocked on full queue")
	default:
	}

	// 关闭通道：唤醒阻塞 push（该数据包被丢弃，closed 阻止新入队）
	ch.Close()
	select {
	case <-pushDone:
	case <-time.After(2 * time.Second):
		t.Fatalf("blocked push did not wake after channel close")
	}

	// 已排队数据照常交付（每轮配额 64 包）
	first := rt.GetPendingPackets()
	if len(first) != tunnelPollChannelMaxPackets {
		t.Fatalf("delivered = %d, want %d", len(first), tunnelPollChannelMaxPackets)
	}
	// 通道仍在表中（还有残留数据）
	if _, ok := rt.Get("tunnel-1", "channel-1"); !ok {
		t.Fatalf("channel removed before data fully drained")
	}

	// 继续排空，直到全部交付后通道被移除
	total := len(first)
	for total < channelDataQueueMax {
		more := rt.GetPendingPackets()
		if len(more) == 0 {
			t.Fatalf("stalled at %d delivered", total)
		}
		total += len(more)
	}
	if total != channelDataQueueMax {
		t.Fatalf("delivered total = %d, want %d", total, channelDataQueueMax)
	}
	if _, ok := rt.Get("tunnel-1", "channel-1"); ok {
		t.Fatalf("channel not removed after data drained")
	}
	rt.mu.RLock()
	count := rt.dataCount
	rt.mu.RUnlock()
	if count != 0 {
		t.Fatalf("aggregate dataCount = %d, want 0", count)
	}
}

// TestHarvestWaitFlags 验证 harvest 标志：无活动直接返回；有下行写入且队列
// 非空时立即返回；有写入且队列空时执行等待。
func TestHarvestWaitFlags(t *testing.T) {
	rt := newTunnelRuntimeForTest()

	// 无活动：立即返回（无写入、无启动）
	start := time.Now()
	rt.HarvestWait()
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("idle HarvestWait took %v, want immediate", elapsed)
	}

	// 有下行写入且队列已有数据：不等待
	ch := newChannelForQueueTest(t, rt, "tunnel-1", "channel-1")
	rt.PushDataPacket(ch.TunnelID, ch.ChannelID, []byte("queued"))
	ch.rt.MarkWroteBytes(1024)
	start = time.Now()
	rt.HarvestWait()
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("HarvestWait with queued data took %v, want immediate", elapsed)
	}

	// 有写入且队列空：等待（≥ 等待时长）
	rt.GetPendingPackets()
	ch.rt.MarkWroteBytes(1024)
	start = time.Now()
	rt.HarvestWait()
	if elapsed := time.Since(start); elapsed < tunnelHarvestWait {
		t.Fatalf("HarvestWait with empty queue took %v, want >= %v", elapsed, tunnelHarvestWait)
	}
}
