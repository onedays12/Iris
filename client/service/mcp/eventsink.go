package mcp

import (
	"context"
	"errors"
	"sync"
	"time"
)

// ErrWaitTimeout 是 wait_for_event 未在限时内命中时返回的错误。
var ErrWaitTimeout = errors.New("wait_for_event timeout")

// Filter 描述一次事件扫描/等待的过滤条件。SinceSeq 之后(不含)才可见;
// TypePrefix 同时作用于解析出的内层类型与事件名(见 matchPrefix)。
// BeaconID/CommandID 匹配 payload 中的 id 别名字段(见 parse_frame.go 的键列表)。
type Filter struct {
	SinceSeq   uint64 `json:"since_seq,omitempty"`
	TypePrefix string `json:"type_prefix,omitempty"`
	BeaconID   string `json:"beacon_id,omitempty"`
	CommandID  string `json:"command_id,omitempty"`
}

// EventSink 是事件的进程内订阅面:由 main.go 作为 FanoutEmitter 的一个出口
// 挂到 WebSocketService 上,把每条 teamserver:ws:* 事件以环形缓冲暂存,
// 供 MCP 工具 list_recent_events / wait_for_event 确定性消费。
// EventSink 自身只追加与读取,不改写原始负载。
type EventSink struct {
	mu     sync.Mutex
	buf    []FrameRecord // 定长环形
	next   int           // 下一个写入槽位
	seq    uint64        // 已分配的最大序号;0 表示尚未有事件
	notify chan struct{} // cap=1 非阻塞广播:Append 后唤醒所有 Wait
}

func NewEventSink(capacity int) *EventSink {
	if capacity < 1 {
		capacity = 1
	}
	return &EventSink{
		buf:    make([]FrameRecord, capacity),
		notify: make(chan struct{}, 1),
	}
}

// Append 实现 EventEmitter 接口的事件接收端;永不 panic 阻断扇出链路。
func (s *EventSink) Emit(name string, data ...any) {
	var payload any
	if len(data) > 0 {
		payload = data[0]
	}
	rec := normalizeFrame(name, payload)

	s.mu.Lock()
	slot := s.next
	rec.Seq = s.seq + 1
	s.buf[slot] = rec
	s.next = (s.next + 1) % len(s.buf)
	s.seq = rec.Seq
	s.mu.Unlock()

	select {
	case s.notify <- struct{}{}:
	default:
	}
}

// List 导出符合过滤条件的记录快照(按 Seq 升序)。
func (s *EventSink) List(f Filter) []FrameRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]FrameRecord, 0, len(s.buf))
	for i := 0; i < len(s.buf); i++ {
		rec := s.buf[(s.next+i)%len(s.buf)]
		if rec.Seq == 0 || rec.Seq <= f.SinceSeq {
			continue
		}
		if matchFilters(rec, f) {
			out = append(out, rec)
		}
	}
	return out
}

// LastSeq 返回当前最大序号(无事件为 0),客户端用于分页游标初始化。
func (s *EventSink) LastSeq() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.seq
}

// Wait 阻塞直到出现一条命中条件的记录或超时;ctx 取消优先于超时。
func (s *EventSink) Wait(ctx context.Context, f Filter, timeout time.Duration) (*FrameRecord, error) {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	if hit := s.scan(f); hit != nil {
		return hit, nil
	}
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timer.C:
			return nil, ErrWaitTimeout
		case <-s.notify:
			if hit := s.scan(f); hit != nil {
				return hit, nil
			}
		}
	}
}

// scan 在持锁下做一次全量条件检查并返回首个命中的副本。
func (s *EventSink) scan(f Filter) *FrameRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := 0; i < len(s.buf); i++ {
		rec := s.buf[(s.next+i)%len(s.buf)]
		if rec.Seq == 0 || rec.Seq <= f.SinceSeq {
			continue
		}
		if matchFilters(rec, f) {
			copyRec := rec
			return &copyRec
		}
	}
	return nil
}

// WaitFunc 用任意谓词阻塞等待记录——供内部自包含工具(如预览)精确匹配;
// MCP wait_for_event 公开工具走结构化的 Wait。ctx 取消优先于超时。
func (s *EventSink) WaitFunc(ctx context.Context, pred func(FrameRecord) bool, timeout time.Duration) (*FrameRecord, error) {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	if hit := s.scanFunc(pred); hit != nil {
		return hit, nil
	}
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timer.C:
			return nil, ErrWaitTimeout
		case <-s.notify:
			if hit := s.scanFunc(pred); hit != nil {
				return hit, nil
			}
		}
	}
}

// scanFunc 在持锁下按谓词做一次全量检查并返回首个命中的副本。
func (s *EventSink) scanFunc(pred func(FrameRecord) bool) *FrameRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := 0; i < len(s.buf); i++ {
		rec := s.buf[(s.next+i)%len(s.buf)]
		if rec.Seq == 0 {
			continue
		}
		if pred(rec) {
			copyRec := rec
			return &copyRec
		}
	}
	return nil
}
