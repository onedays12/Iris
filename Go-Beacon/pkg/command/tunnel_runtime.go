package command

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

const MaxTunnelChannels = 64
const (
	maxTunnelControlPackets = 256
	maxTunnelDataPackets    = 1000
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
}

func (ch *TunnelChannel) Close() {
	if ch.Closed.CompareAndSwap(false, true) {
		if ch.Cancel != nil {
			ch.Cancel()
		}
		ch.writeMu.Lock()
		defer ch.writeMu.Unlock()
		if ch.TargetConn != nil {
			ch.TargetConn.Close()
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
	return ch.TargetConn.Write(data)
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
	channels       map[string]*TunnelChannel
	controlPackets [][]byte // 待回传的控制面 FinalPacket
	dataPackets    [][]byte // 待回传的数据面 FinalPacket
	janitorOnce    sync.Once
	closeJanitor   chan struct{}
}

func NewTunnelRuntime() *TunnelRuntime {
	return &TunnelRuntime{
		channels:     make(map[string]*TunnelChannel),
		closeJanitor: make(chan struct{}),
	}
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
	delete(rt.channels, tunnelKey(tunnelID, channelID))
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

func appendBoundedPacket(queue [][]byte, pkt []byte, limit int) [][]byte {
	if len(pkt) == 0 {
		return queue
	}
	if limit <= 0 {
		return append(queue, pkt)
	}
	if len(queue) >= limit {
		copy(queue, queue[1:])
		queue[len(queue)-1] = pkt
		return queue
	}
	return append(queue, pkt)
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

// PushDataPacket 将数据面数据包推入待发送队列。
func (rt *TunnelRuntime) PushDataPacket(pkt []byte) {
	if len(pkt) == 0 {
		return
	}
	rt.mu.Lock()
	defer rt.mu.Unlock()

	rt.dataPackets = appendBoundedPacket(rt.dataPackets, pkt, maxTunnelDataPackets)
}

// GetPendingPackets 获取所有待发送的数据包并清空队列，控制包优先于数据包。
func (rt *TunnelRuntime) GetPendingPackets() [][]byte {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	total := len(rt.controlPackets) + len(rt.dataPackets)
	if total == 0 {
		return nil
	}

	pkts := make([][]byte, 0, total)
	pkts = append(pkts, rt.controlPackets...)
	pkts = append(pkts, rt.dataPackets...)
	rt.controlPackets = make([][]byte, 0)
	rt.dataPackets = make([][]byte, 0)
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
	rt.dataPackets = nil
	rt.mu.Unlock()

	for _, ch := range channels {
		ch.Close()
	}
}
