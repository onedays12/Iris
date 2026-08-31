package mcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// newFakeTS 起一个假 TeamServer,并返回已注入其地址的 SessionState。
// handler 收到的 Authorization 头会原样记录到 gotAuth 供断言。
func newFakeTS(t *testing.T, handler http.HandlerFunc) (*SessionState, *httptest.Server, *atomic.Value) {
	t.Helper()
	var gotAuth atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth.Store(r.Header.Get("Authorization"))
		if handler != nil {
			handler(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	sess := NewSessionState()
	sess.SetCredentials(srv.URL, "test-token")
	return sess, srv, &gotAuth
}

const okEnvelope = `{"ok":true,"data":%s}`

func writeEnvelope(w http.ResponseWriter, dataJSON string) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, strings.Replace(okEnvelope, "%s", dataJSON, 1))
}

func TestTSClientDoHappyPathAndBearer(t *testing.T) {
	sess, _, auth := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/beacon/list" || r.Method != http.MethodGet {
			t.Errorf("unexpected call %s %s", r.Method, r.URL.Path)
		}
		writeEnvelope(w, `[{"beacon_id":"b1"}]`)
	})
	ts := NewTSClient(sess)

	status, data, err := ts.Do(context.Background(), "GET", "/api/v1/beacon/list", nil)
	if err != nil || status != 200 {
		t.Fatalf("do: %d %v", status, err)
	}
	var beacons []map[string]any
	if err := json.Unmarshal(data, &beacons); err != nil || len(beacons) != 1 {
		t.Fatalf("data = %s err=%v", data, err)
	}
	if got := auth.Load(); got != "Bearer test-token" {
		t.Fatalf("Authorization header = %v", got)
	}
}

func TestTSClientDoBusinessErrorSurfaces(t *testing.T) {
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"ok":false,"error":"listener not found"}`)
	})
	ts := NewTSClient(sess)

	_, _, err := ts.Do(context.Background(), "POST", "/api/v1/listener/pause", map[string]any{"name": "x"})
	if err == nil || !strings.Contains(err.Error(), "listener not found") {
		t.Fatalf("业务错误应浮出可读信息: %v", err)
	}
}

func TestTSClientDoHTTPErrorWithoutEnvelope(t *testing.T) {
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})
	ts := NewTSClient(sess)
	_, _, err := ts.Do(context.Background(), "POST", "/api/v1/x", nil)
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("5xx 应转错误: %v", err)
	}
}

func TestTSClientNetworkFailureToDeadPort(t *testing.T) {
	sess := NewSessionState()
	sess.SetCredentials("http://127.0.0.1:1", "tok") // 无服务端口
	ts := NewTSClient(sess)
	_, _, err := ts.Do(context.Background(), "GET", "/api/v1/beacon/list", nil)
	if err == nil {
		t.Fatal("网络失败必须报错(status=0 路径)")
	}
}

func TestTSClientNotLoggedIn(t *testing.T) {
	ts := NewTSClient(NewSessionState())
	_, _, err := ts.Do(context.Background(), "GET", "/api/v1/x", nil)
	if err == nil || !strings.Contains(err.Error(), "未登录") {
		t.Fatalf("未登录应给可读错误: %v", err)
	}
}

// ─── send_beacon_command 端到端(经 SDK handler 的参数构建+外发 body 断言) ───

func TestSendCommandWireBody(t *testing.T) {
	var gotBody atomic.Value
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/beacon/command" {
			t.Errorf("path = %s", r.URL.Path)
		}
		blob, _ := io.ReadAll(r.Body)
		gotBody.Store(string(blob))
		writeEnvelope(w, `{"ok":true}`)
	})
	sink := NewEventSink(4)
	deps := Deps{Sess: sess, Sink: sink, WSStatus: func() string { return "open" }}
	srv := NewServer(deps)
	_ = srv

	out := mcpCallTool(t, deps, "send_beacon_command", map[string]any{
		"beacon_id": "b-77",
		"command":   "whoami",
	})
	if !strings.Contains(out, `"result"`) && !strings.Contains(out, "content") {
		t.Fatalf("工具应成功返回: %s", out)
	}
	if !strings.Contains(out, `"content":[{`) {
		t.Fatalf("工具返回了错误结果: %s", truncateForLog([]byte(out)))
	}
	loaded := gotBody.Load()
	if loaded == nil {
		t.Fatalf("假 TeamServer 未收到命令请求,实际响应: %s", truncateForLog([]byte(out)))
	}
	body := loaded.(string)
	var sent struct {
		BeaconID string `json:"beacon_id"`
		Command  int    `json:"command"`
		Args     []struct {
			Kind  string `json:"kind"`
			Value any    `json:"value"`
		} `json:"args"`
	}
	if err := json.Unmarshal([]byte(body), &sent); err != nil {
		t.Fatalf("body 非法: %s", body)
	}
	if sent.BeaconID != "b-77" || sent.Command != CommandID["WHOAMI"] || len(sent.Args) != 0 {
		t.Fatalf("wire body 错误: %s", body)
	}
}

func TestGenerateBeaconWritesArtifact(t *testing.T) {
	payload := []byte("MZ fake beacon binary \x00\x01")
	b64 := base64.StdEncoding.EncodeToString(payload)

	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, `{"payload":`+jsonQuote(b64)+`,"encoding":"base64","format":"exe","file_name":"beacon.exe"}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(2)}

	out := mcpCallTool(t, deps, "generate_beacon", map[string]any{
		"listener_id": "L-1", "os": "windows", "arch": "amd64", "format": "exe",
	})

	text, perr := extractToolText(out)
	if perr != nil {
		t.Fatalf("解析工具响应失败: %v 原始=%s", perr, truncateForLog([]byte(out)))
	}
	var fields generatePayloadOut
	if err := json.Unmarshal([]byte(text), &fields); err != nil {
		t.Fatalf("text 非法: %s", text)
	}
	if filepath.Dir(fields.Path) != payloadDir() {
		t.Errorf("落盘目录不符: %s", fields.Path)
	}
	if !strings.Contains(filepath.Base(fields.Path), "_beacon.exe") {
		t.Errorf("文件名应带时间戳前缀: %s", fields.Path)
	}
	got, err := os.ReadFile(fields.Path)
	if err != nil || string(got) != string(payload) {
		t.Fatalf("落盘内容不符: err=%v len=%d", err, len(got))
	}
	// sha256 一致性
	sum := sha256Hex(payload)
	if fields.SHA256 != sum {
		t.Errorf("sha256 = %s want %s", fields.SHA256, sum)
	}
	if fields.Size != int64(len(payload)) {
		t.Errorf("size = %d want %d", fields.Size, len(payload))
	}
}

func TestWaitForEventFiltersByTaskAlias(t *testing.T) {
	sink := NewEventSink(8)
	sink.Emit("teamserver:ws:message", map[string]any{
		"data": `{"type":"COMMAND_EVENT","task_id":42,"status":"running"}`,
	})
	rec, err := sink.Wait(ctxBG(), Filter{TypePrefix: "COMMAND", CommandID: "42"}, timeSecond())
	if err != nil || rec.Type != "COMMAND_EVENT" {
		t.Fatalf("task 过滤失败: %+v err=%v", rec, err)
	}
	if _, err := sink.Wait(ctxBG(), Filter{TypePrefix: "COMMAND", CommandID: "43"}, 50*timeMillis()); err == nil {
		t.Fatal("task 不匹配必须超时")
	}
}
