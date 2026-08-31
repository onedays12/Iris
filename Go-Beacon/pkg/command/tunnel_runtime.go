package command

import (
	"context"
	"errors"
	"fmt"
	"net"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

const MaxTunnelChannels = 64
const (
	maxTunnelControlPackets = 256
)

// 阶段 2（对齐 C 版 tunnel_server.c）：per-channel 数据队列与公平轮询
const (
	// channelDataQueueMax 每通道数据队列上限（包，≈4MB）；满时 worker 阻塞背压
	channelDataQueueMax = 256
	// tunnelPollChannelMaxPackets 每通道每轮排空上限（包，≈1MB）
	tunnelPollChannelMaxPackets = 64
	// tunnelPollBatchMaxBytes 单次回传总字节上限（大通道不独占整批）
	tunnelPollBatchMaxBytes = 1024 * 1024
)

var (
	errTunnelChannelLimit     = errors.New("too many tunnel channels")
	errTunnelChannelDuplicate = errors.New("duplicate tunnel channel")
)

// TunnelChannel 代表一个活跃的转发通道
type TunnelChannel struct {
	OriginalTaskID uint32
	TunnelID       string
	ChannelID      string
	Mode           string
	Proto          string
	TargetAddress  string

	TargetConn net.Conn

	Cancel    context.CancelFunc
	CreatedAt time.Time
	lastSeen  atomic.Int64
	Paused    atomic.Bool

	BytesIn  int64
	BytesOut int64

	Closed  atomic.Bool
	writeMu sync.Mutex

	// per-channel 数据队列：worker 入队，满时阻塞等待主循环排空（背压）。
	// 仅 rt.mu 锁内访问。
	dataPackets [][]byte
	// rt 用于关闭时广播唤醒阻塞在队列满等待中的 worker。
	rt *TunnelRuntime
}

func (ch *TunnelChannel) Close() {
	if ch.Closed.CompareAndSwap(false, true) {
		if ch.Cancel != nil {
			ch.Cancel()
		}
		ch.writeMu.Lock()
		if ch.TargetConn != nil {
			ch.TargetConn.Close()
		}
		ch.writeMu.Unlock()
		// 唤醒可能阻塞在队列满等待中的 worker（per-channel 背压）。
		if ch.rt != nil {
			ch.rt.cond.Broadcast()
		}
	}
}

func (ch *TunnelChannel) Write(data []byte) (int, error) {
	ch.writeMu.Lock()
	defer ch.writeMu.Unlock()

	if ch.Closed.Load() {
		return 0, net.ErrClosed
	}
	if ch.TargetConn == nil {
		return 0, net.ErrClosed
	}
	n, err := ch.TargetConn.Write(data)
	if n > 0 && ch.rt != nil {
		// 下行写入计数（同 tick 收割判定用，对齐 C 版 tm->wrote_bytes）。
		ch.rt.MarkWroteBytes(int64(n))
	}
	return n, err
}

// TouchLastSeen 刷新通道最后活跃时间。
func (ch *TunnelChannel) TouchLastSeen(t time.Time) {
	ch.lastSeen.Store(t.UnixNano())
}

// LastSeen 返回通道最后活跃时间。
func (ch *TunnelChannel) LastSeen() time.Time {
	nanos := ch.lastSeen.Load()
	if nanos == 0 {
		return time.Time{}
	}
	return time.Unix(0, nanos)
}

// SetPaused 切换通道的暂停状态。
func (ch *TunnelChannel) SetPaused(paused bool) {
	ch.Paused.Store(paused)
}

// IsPaused 返回通道是否处于暂停状态。
func (ch *TunnelChannel) IsPaused() bool {
	return ch.Paused.Load()
}

// TunnelRuntime 全局隧道管理器
type TunnelRuntime struct {
	mu             sync.RWMutex
	cond           *sync.Cond       // 数据队列满时 worker 阻塞/排空唤醒（基于 mu）
	channels       map[string]*TunnelChannel
	controlPackets [][]byte         // 待回传的控制面 FinalPacket（全量排空）
	dataCount      int              // 聚合计数（各通道数据队列之和，harvest 判定用）
	pollRotate     uint64           // 公平轮询游标：下一 tick 从该序号的通道开始
	wroteBytes     atomic.Int64     // 本 tick 已成功写出的下行字节（harvest 标志）
	pendingStart   atomic.Int32     // 本 tick 是否启动了新通道（harvest 标志）
	janitorOnce    sync.Once
	closeJanitor   chan struct{}
}

func NewTunnelRuntime() *TunnelRuntime {
	rt := &TunnelRuntime{
		channels:     make(map[string]*TunnelChannel),
		closeJanitor: make(chan struct{}),
	}
	rt.cond = sync.NewCond(&rt.mu)
	return rt
}

func tunnelKey(tunnelID, channelID string) string {
	return fmt.Sprintf("%s\x00%s", tunnelID, channelID)
}

func (rt *TunnelRuntime) Add(ch *TunnelChannel) error {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if len(rt.channels) >= MaxTunnelChannels {
		return errTunnelChannelLimit
	}

	key := tunnelKey(ch.TunnelID, ch.ChannelID)
	if _, exists := rt.channels[key]; exists {
		return errTunnelChannelDuplicate
	}

	ch.rt = rt
	rt.channels[key] = ch
	return nil
}

func (rt *TunnelRuntime) Get(tunnelID, channelID string) (*TunnelChannel, bool) {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	ch, ok := rt.channels[tunnelKey(tunnelID, channelID)]
	return ch, ok
}

func (rt *TunnelRuntime) Remove(tunnelID, channelID string) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	key := tunnelKey(tunnelID, channelID)
	ch, ok := rt.channels[key]
	if !ok {
		return
	}
	if len(ch.dataPackets) > 0 {
		// 仍有已排队数据：保持通道在表中（closed 状态），由下一次
		// GetPendingPackets 排空后移除，避免最后一个数据块被丢弃
		// （worker 退出前的最后一批数据是真实数据，不能丢）。
		return
	}
	delete(rt.channels, key)
}

func (rt *TunnelRuntime) Stop(tunnelID, channelID string, reason string) {
	if ch, ok := rt.Get(tunnelID, channelID); ok {
		ch.Close()
		rt.Remove(tunnelID, channelID)
	}
}

func (rt *TunnelRuntime) StopTunnel(tunnelID string, reason string) {
	rt.mu.RLock()
	var toStop []*TunnelChannel
	for _, ch := range rt.channels {
		if ch.TunnelID == tunnelID {
			toStop = append(toStop, ch)
		}
	}
	rt.mu.RUnlock()

	for _, ch := range toStop {
		sendControlPacket(rt, ch.TunnelID, ch.ChannelID, "close", TunnelReasonTimeout, nil)
		ch.Close()
		rt.Remove(ch.TunnelID, ch.ChannelID)
	}
}

// PauseTunnel 暂停指定 tunnel 或指定 channel。
func (rt *TunnelRuntime) PauseTunnel(tunnelID, channelID string) int {
	channels := rt.selectChannels(tunnelID, channelID)
	for _, ch := range channels {
		ch.SetPaused(true)
	}
	return len(channels)
}

// ResumeTunnel 恢复指定 tunnel 或指定 channel。
func (rt *TunnelRuntime) ResumeTunnel(tunnelID, channelID string) int {
	channels := rt.selectChannels(tunnelID, channelID)
	for _, ch := range channels {
		ch.SetPaused(false)
	}
	return len(channels)
}

// CloseTunnel 关闭指定 tunnel 或指定 channel。
func (rt *TunnelRuntime) CloseTunnel(tunnelID, channelID string) int {
	channels := rt.selectChannels(tunnelID, channelID)
	for _, ch := range channels {
		ch.Close()
		rt.Remove(ch.TunnelID, ch.ChannelID)
	}
	return len(channels)
}

func (rt *TunnelRuntime) selectChannels(tunnelID, channelID string) []*TunnelChannel {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	channels := make([]*TunnelChannel, 0)
	for _, ch := range rt.channels {
		if tunnelID != "" && ch.TunnelID != tunnelID {
			continue
		}
		if channelID != "" && ch.ChannelID != channelID {
			continue
		}
		channels = append(channels, ch)
	}
	return channels
}

// CleanupExpired 清理超过活跃时间的通道
func (rt *TunnelRuntime) CleanupExpired(maxIdle time.Duration) {
	now := time.Now()
	rt.mu.RLock()
	var toStop []*TunnelChannel
	for _, ch := range rt.channels {
		lastSeen := ch.LastSeen()
		if lastSeen.IsZero() || now.Sub(lastSeen) > maxIdle {
			toStop = append(toStop, ch)
		}
	}
	rt.mu.RUnlock()

	for _, ch := range toStop {
		sendControlPacket(rt, ch.TunnelID, ch.ChannelID, "close", TunnelReasonTimeout, nil)
		ch.Close()
		rt.Remove(ch.TunnelID, ch.ChannelID)
	}
}

// PushControlPacket 将控制面数据包推入高优先级待发送队列。
func (rt *TunnelRuntime) PushControlPacket(pkt []byte) {
	if len(pkt) == 0 {
		return
	}
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if len(rt.controlPackets) >= maxTunnelControlPackets {
		return
	}
	rt.controlPackets = append(rt.controlPackets, pkt)
}

// PushDataPacket 将数据面数据包推入指定通道的数据队列（worker 线程调用）。
// per-channel 有界队列：满时阻塞等待主循环排空（背压传导到目标 socket，
// TCP 窗口自然限速），不再全局丢最旧；通道已关闭时丢弃本次数据包。
// 注意：阻塞发生在调用方 goroutine（worker），主循环排空不受影响。
func (rt *TunnelRuntime) PushDataPacket(tunnelID, channelID string, pkt []byte) {
	if len(pkt) == 0 {
		return
	}
	rt.mu.Lock()
	key := tunnelKey(tunnelID, channelID)
	ch, ok := rt.channels[key]
	if !ok || ch.Closed.Load() {
		rt.mu.Unlock()
		return
	}
	for !ch.Closed.Load() && len(ch.dataPackets) >= channelDataQueueMax {
		rt.cond.Wait()
	}
	if ch.Closed.Load() {
		rt.mu.Unlock()
		return
	}
	ch.dataPackets = append(ch.dataPackets, pkt)
	rt.dataCount++
	rt.mu.Unlock()
}

// queuedLocked 返回当前待回传的数据包总数（控制 + 数据聚合），持有锁时调用。
func (rt *TunnelRuntime) queuedLocked() int {
	return len(rt.controlPackets) + rt.dataCount
}

// GetPendingPackets 获取所有待发送的数据包并清空队列，控制包优先于数据包。
// 数据包按通道公平轮询排空：每通道每轮最多 tunnelPollChannelMaxPackets 包，
// 单次回传总量不超过 tunnelPollBatchMaxBytes（大通道不独占整批回传）；
// pollRotate 记录下一 tick 的起始通道序号，实现跨 tick 轮转公平。
// 已关闭通道的残留数据直接丢弃（对端已不可达），并唤醒满队列阻塞的 worker。
func (rt *TunnelRuntime) GetPendingPackets() [][]byte {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	total := len(rt.controlPackets) + rt.dataCount
	if total == 0 {
		return nil
	}

	pkts := make([][]byte, 0, total)
	pkts = append(pkts, rt.controlPackets...)
	rt.controlPackets = make([][]byte, 0)

	if rt.dataCount > 0 {
		// 通道快照，按 key 排序保证确定性；从 pollRotate 序号处轮转开始。
		keys := make([]string, 0, len(rt.channels))
		for k, ch := range rt.channels {
			if len(ch.dataPackets) > 0 {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		start := int(rt.pollRotate % uint64(len(keys)))
		order := make([]string, 0, len(keys))
		order = append(order, keys[start:]...)
		order = append(order, keys[:start]...)

		batchBytes := 0
		for _, key := range order {
			ch := rt.channels[key]
			if ch == nil {
				continue
			}
			// 注意：closed 通道的已排队数据照常交付（worker 退出前推入的
			// 最后一个数据块是真实数据，不能丢）；closed 只阻止新入队。
			popped := 0
			for len(ch.dataPackets) > 0 && popped < tunnelPollChannelMaxPackets &&
				batchBytes < tunnelPollBatchMaxBytes {
				pkts = append(pkts, ch.dataPackets[0])
				ch.dataPackets = ch.dataPackets[1:]
				rt.dataCount--
				batchBytes += len(pkts[len(pkts)-1])
				popped++
			}
			// closed 通道的数据排空后即可从表中移除（延迟移除的收尾）。
			if ch.Closed.Load() && len(ch.dataPackets) == 0 {
				delete(rt.channels, key)
			}
			if batchBytes >= tunnelPollBatchMaxBytes {
				break
			}
		}
		// 轮转：下一 tick 从本次起始通道之后开始。
		rt.pollRotate++
	}

	// 唤醒满队列阻塞的 worker（排空释放了空间）。
	rt.cond.Broadcast()
	return pkts
}

// StartTunnelJanitor 启动后台清理器
func (rt *TunnelRuntime) StartJanitor() {
	if rt == nil {
		return
	}
	rt.janitorOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					rt.CleanupExpired(5 * time.Minute)
				case <-rt.closeJanitor:
					return
				}
			}
		}()
	})
}

func (rt *TunnelRuntime) Close() {
	if rt == nil {
		return
	}
	select {
	case <-rt.closeJanitor:
	default:
		close(rt.closeJanitor)
	}

	rt.mu.Lock()
	channels := rt.channels
	rt.channels = make(map[string]*TunnelChannel)
	rt.controlPackets = nil
	for _, ch := range channels {
		// 丢弃残留队列并修正聚合计数
		if len(ch.dataPackets) > 0 {
			rt.dataCount -= len(ch.dataPackets)
			ch.dataPackets = nil
		}
	}
	rt.dataCount = 0
	rt.mu.Unlock()

	for _, ch := range channels {
		ch.Close()
	}
}

// HarvestWait 同 tick 收割：当本 tick 有下行写入或新通道启动，且待回传队列
// 为空时，短暂等待 worker 完成 recv/入队，使响应能落回本 tick 的回传批次，
// 避免交互延迟多等一个 sleep 周期（对齐 C 版 TunnelHarvestWait）。
func (rt *TunnelRuntime) HarvestWait() {
	if rt == nil {
		return
	}
	bytes := rt.wroteBytes.Swap(0)
	started := rt.pendingStart.Swap(0)
	if started == 0 && bytes <= 0 {
		return
	}
	if started == 0 && bytes > tunnelHarvestBulkBytes {
		return
	}
	rt.mu.RLock()
	queued := rt.queuedLocked()
	rt.mu.RUnlock()
	if queued > 0 {
		return
	}

	// 让 worker 有机会 recv/入队；不做事件同步，避免额外内核对象。
	runtime.Gosched()
	time.Sleep(tunnelHarvestWait)
}

// MarkWroteBytes 记录下行写入字节数（由通道写入路径调用，harvest 判定用）。
func (rt *TunnelRuntime) MarkWroteBytes(n int64) {
	if rt == nil || n <= 0 {
		return
	}
	rt.wroteBytes.Add(n)
}

// MarkPendingStart 标记本 tick 启动了新通道（harvest 判定用）。
func (rt *TunnelRuntime) MarkPendingStart() {
	if rt == nil {
		return
	}
	rt.pendingStart.Store(1)
}
