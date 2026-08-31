package mcp

import (
	"sync/atomic"
	"testing"
	"time"

	"irisclient/service/internal/transport"
)

type countingEmitter struct{ calls atomic.Int32 }

func (c *countingEmitter) Emit(string, ...any) { c.calls.Add(1) }

// TestFanoutIntoMCPEventSink 跨包冒烟:Fanout 一条 message 帧,
// 前端出口计数 +1 且 EventSink 捕获到可解析的类型帧。
func TestFanoutIntoMCPEventSink(t *testing.T) {
	sink := NewEventSink(8)
	wails := &countingEmitter{}
	f := transport.NewFanoutEmitter(wails, sink)

	f.Emit("teamserver:ws:message", map[string]string{
		"data": `{"type":"BEACON_REGISTERED","beacon_id":"b9"}`,
	})

	if wails.calls.Load() != 1 {
		t.Fatalf("wails side calls=%d", wails.calls.Load())
	}
	rec, err := sink.Wait(ctxBG(), Filter{TypePrefix: "BEACON_REGISTERED"}, time.Second)
	if err != nil || rec.Type != "BEACON_REGISTERED" {
		t.Fatalf("sink did not capture fanned-out frame: rec=%+v err=%v", rec, err)
	}
}
