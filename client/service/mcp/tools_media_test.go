package mcp

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

// 回归:未传 quality 时 SDK 解码出字面量 0,曾把 0 直发 TeamServer
// 导致 "quality 越界 [1,100]: 0"。缺省必须落到命令层默认 80。
func TestRequestScreenshotDefaultQuality(t *testing.T) {
	var gotBody atomic.Value
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		blob, _ := io.ReadAll(r.Body)
		gotBody.Store(string(blob))
		writeEnvelope(w, `{"task_id":1}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(2)}

	out := mcpCallTool(t, deps, "request_screenshot", map[string]any{"beacon_id": "b-x"})
	if _, perr := extractToolText(out); perr != nil {
		t.Fatalf("缺省 quality 调用被拒: %v 原始=%s", perr, truncateForLog([]byte(out)))
	}

	var body struct {
		Command int       `json:"command"`
		Args    []wireArg `json:"args"`
	}
	if err := json.Unmarshal([]byte(gotBody.Load().(string)), &body); err != nil {
		t.Fatalf("请求体解析: %v", err)
	}
	if body.Command != CommandID["SCREENSHOT"] {
		t.Fatalf("command = %d, want SCREENSHOT(%d)", body.Command, CommandID["SCREENSHOT"])
	}
	if len(body.Args) != 2 || body.Args[0].Kind != argKindInt32 || body.Args[1].Kind != argKindInt32 {
		t.Fatalf("args 形状错误: %+v", body.Args)
	}
	if q, ok := body.Args[1].Value.(float64); !ok || int(q) != 80 {
		t.Fatalf("quality 默认值错误: got %#v want 80", body.Args[1].Value)
	}
	if m, ok := body.Args[0].Value.(float64); !ok || int(m) != 0 {
		t.Fatalf("monitor_id 默认值错误: got %#v want 0(全部)", body.Args[0].Value)
	}
}

func TestRequestScreenshotExplicitQualityAndReject(t *testing.T) {
	var gotBody atomic.Value
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		blob, _ := io.ReadAll(r.Body)
		gotBody.Store(string(blob))
		writeEnvelope(w, `{"task_id":1}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(2)}

	out := mcpCallTool(t, deps, "request_screenshot",
		map[string]any{"beacon_id": "b-x", "monitor_id": 1, "quality": 95})
	if _, perr := extractToolText(out); perr != nil {
		t.Fatalf("显式 quality=95 被拒: %v", perr)
	}
	var body struct {
		Args []wireArg `json:"args"`
	}
	_ = json.Unmarshal([]byte(gotBody.Load().(string)), &body)
	if len(body.Args) != 2 || fmt.Sprint(body.Args[1].Value) != "95" || fmt.Sprint(body.Args[0].Value) != "1" {
		t.Fatalf("显式参数透传错误: %+v", body.Args)
	}

	rej := mcpCallTool(t, deps, "request_screenshot",
		map[string]any{"beacon_id": "b-x", "quality": 300})
	if _, perr := extractToolText(rej); perr == nil {
		t.Fatalf("quality=300 应被本地拒绝")
	} else if !strings.Contains(perr.Error(), "越界") {
		t.Fatalf("拒绝理由不符: %v", perr)
	}
}
