package mcp

import (
	"context"
	"fmt"
	"time"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

type listEventsIn struct {
	SinceSeq   uint64 `json:"since_seq,omitempty" jsonschema:"只返回 seq 大于该值的事件;0 表示从头开始"`
	TypePrefix string `json:"type_prefix,omitempty" jsonschema:"按类型前缀过滤,如 BEACON、COMMAND、TUNNEL"`
}

type listEventsOut struct {
	Events  []FrameRecord `json:"events"`
	LastSeq uint64        `json:"last_seq"`
}

type waitForEventIn struct {
	TypePrefix string `json:"type_prefix" jsonschema:"等待的事件类型前缀,如 BEACON_REGISTERED 或 COMMAND_"`
	SinceSeq   uint64 `json:"since_seq,omitempty" jsonschema:"只等待 seq 大于该值的事件(用 list_recent_events 的 last_seq 作基线)"`
	TimeoutMs  int    `json:"timeout_ms,omitempty" jsonschema:"最长等待毫秒数,默认 10000"`
	BeaconID   string `json:"beacon_id,omitempty" jsonschema:"限定只匹配属于该 beacon 的事件(beacon_id/beaconId/id 任一命中)"`
	CommandID  string `json:"command_id,omitempty" jsonschema:"限定只匹配携带该任务号的结果事件(task_id/command_id 任一命中)"`
}

type waitForEventOut struct {
	Matched FrameRecord `json:"matched"`
}

func registerEventTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "list_recent_events",
		Description: "导出 Client 进程捕获的 TeamServer WebSocket 事件环形缓冲(beacon 上线/心跳、" +
			"命令下发回执/结果、隧道事件等)。配合 since_seq 做增量轮询。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in listEventsIn) (*msdk.CallToolResult, listEventsOut, error) {
		events := s.deps.Sink.List(Filter{SinceSeq: in.SinceSeq, TypePrefix: in.TypePrefix})
		return nil, listEventsOut{Events: events, LastSeq: s.deps.Sink.LastSeq()}, nil
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "wait_for_event",
		Description: "阻塞等待下一条命中条件的事件出现(beacon 上线确认、命令结果等)," +
			"是 E2E 剧本中把异步 WS 结果变为确定性步骤的核心工具。超时返回 ErrWaitTimeout 类错误。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in waitForEventIn) (*msdk.CallToolResult, waitForEventOut, error) {
		// beacon_id/command_id 必须真正下传:此前声明了入参却未进 Filter,
		// 多 beacon 并发时 wait 会命中别的 beacon 的同前缀帧(2026-08 操作员实测踩坑)。
		rec, err := s.deps.Sink.Wait(ctx, Filter{
			TypePrefix: in.TypePrefix,
			SinceSeq:   in.SinceSeq,
			BeaconID:   in.BeaconID,
			CommandID:  in.CommandID,
		}, msToDuration(in.TimeoutMs))
		if err != nil {
			return nil, waitForEventOut{}, fmt.Errorf("wait_for_event(%s): %w", in.TypePrefix, err)
		}
		return nil, waitForEventOut{Matched: *rec}, nil
	})
}

const defaultWait = 10 * time.Second

func msToDuration(ms int) time.Duration {
	if ms <= 0 {
		return defaultWait
	}
	return time.Duration(ms) * time.Millisecond
}
