package mcp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

// ─── 测试夹具:真机抓取的 COMMAND 事件帧形 ─────────────────────────────────
// payload = {type:"COMMAND_EVENT", data:{beacon_id, client, command_id, data:{text}}}
// 经 Sink.Emit(eventMessageName, {"data": <内层 JSON 字符串>}) 进入环形缓冲。

func emitCommandFrame(t *testing.T, sink *EventSink, inner string) {
	t.Helper()
	sink.Emit(eventMessageName, map[string]any{"data": inner})
}

func commandInner(beaconID string, commandID int, body string) string {
	return fmt.Sprintf(`{"type":"COMMAND_EVENT","beacon_id":%q,"client":"admin","command_id":%d,"data":%s}`,
		beaconID, commandID, body)
}

func mustSendOut(t *testing.T, resp string) sendCommandOut {
	t.Helper()
	text, err := extractToolText(resp)
	if err != nil {
		t.Fatalf("send_beacon_command 失败: %v 原始=%s", err, truncateForLog([]byte(resp)))
	}
	var out sendCommandOut
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("解析 send_beacon_command 输出: %v 原始=%s", err, truncateForLog([]byte(text)))
	}
	return out
}

// ─── wait_for_event:beacon_id / command_id 过滤必须真正生效 ─────────────────

func TestWaitForEventHonorsBeaconAndCommandFilters(t *testing.T) {
	sink := NewEventSink(16)
	emitCommandFrame(t, sink, commandInner("beacon-b1", 53, `{"text":"NETSTAT output of b1"}`))
	emitCommandFrame(t, sink, commandInner("beacon-b2", 99, `{"text":"SLEEP ack of b2"}`))
	emitCommandFrame(t, sink, commandInner("beacon-b2", 21, `{"text":"LS output of b2"}`))

	deps := Deps{Sess: NewSessionState(), Sink: sink}
	resp := mcpCallTool(t, deps, "wait_for_event", map[string]any{
		"type_prefix": "COMMAND",
		"beacon_id":   "beacon-b2",
		"command_id":  "21",
		"timeout_ms":  1000,
	})
	text, err := extractToolText(resp)
	if err != nil {
		t.Fatalf("wait_for_event 失败: %v", err)
	}
	if !strings.Contains(text, "LS output of b2") {
		t.Fatalf("应精确命中 b2 的 LS 帧, got: %s", truncateForLog([]byte(text)))
	}
	if strings.Contains(text, "NETSTAT") || strings.Contains(text, "SLEEP ack") {
		t.Fatalf("过滤失效,命中了别的 beacon/命令的帧: %s", truncateForLog([]byte(text)))
	}
}

func TestWaitForEventBeaconFilterMissTimesOut(t *testing.T) {
	sink := NewEventSink(4)
	emitCommandFrame(t, sink, commandInner("beacon-b1", 21, `{"text":"b1 only"}`))

	deps := Deps{Sess: NewSessionState(), Sink: sink}
	resp := mcpCallTool(t, deps, "wait_for_event", map[string]any{
		"type_prefix": "COMMAND",
		"beacon_id":   "beacon-other",
		"timeout_ms":  150,
	})
	if _, err := extractToolText(resp); err == nil {
		t.Fatalf("beacon 不匹配时应超时报错, got: %s", truncateForLog([]byte(resp)))
	}
}

// ─── send_beacon_command:下发即等结果 ──────────────────────────────────────

func TestSendBeaconCommandReturnsResultDirectly(t *testing.T) {
	sink := NewEventSink(16)
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/beacon/command" || r.Method != http.MethodPost {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			return
		}
		writeEnvelope(w, `{}`)
		// beacon 在 ack 后回传结果帧:必须是本次调用能等到的那一帧。
		emitCommandFrame(t, sink, commandInner("beacon-c1", 21, `{"text":"Listing directory: C:\\\ndrwxrwxrwx  Windows/"}`))
	})
	deps := Deps{Sess: sess, Sink: sink}

	out := mustSendOut(t, mcpCallTool(t, deps, "send_beacon_command", map[string]any{
		"beacon_id": "beacon-c1",
		"command":   "LS",
		"args":      []any{"c:\\"},
	}))
	if out.Status != "completed" {
		t.Fatalf("status = %q (%s), want completed", out.Status, out.Error)
	}
	if !strings.Contains(out.Text, "Listing directory") {
		t.Fatalf("结果文本缺失: %q", out.Text)
	}
	if out.ResultSeq == 0 || out.ResultSeq <= out.SinceSeq {
		t.Fatalf("结果帧游标异常: result_seq=%d since_seq=%d", out.ResultSeq, out.SinceSeq)
	}
}

func TestSendBeaconCommandSurfacesErrorFrame(t *testing.T) {
	sink := NewEventSink(8)
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, `{}`)
		emitCommandFrame(t, sink, commandInner("beacon-e1", 21, `{"status":"error","error":"ReadDir failed: 3"}`))
	})
	deps := Deps{Sess: sess, Sink: sink}

	out := mustSendOut(t, mcpCallTool(t, deps, "send_beacon_command", map[string]any{
		"beacon_id": "beacon-e1",
		"command":   21,
	}))
	if out.Status != "error" {
		t.Fatalf("status = %q, want error", out.Status)
	}
	if !strings.Contains(out.Error, "ReadDir failed") {
		t.Fatalf("错误原因缺失: %q", out.Error)
	}
}

func TestSendBeaconCommandTimeoutKeepsCursor(t *testing.T) {
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, `{}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}

	out := mustSendOut(t, mcpCallTool(t, deps, "send_beacon_command", map[string]any{
		"beacon_id": "beacon-slow",
		"command":   "SHELL",
		"args":      []any{"cmd /c timeout 60"},
		"wait_ms":   120,
	}))
	if out.Status != "timeout" {
		t.Fatalf("status = %q, want timeout", out.Status)
	}
	if !strings.Contains(out.Error, fmt.Sprintf("since_seq=%d", out.SinceSeq)) {
		t.Fatalf("超时提示应携带续查游标: %q", out.Error)
	}
}

func TestSendBeaconCommandNoWaitKeepsLegacyFlow(t *testing.T) {
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, `{"task":"queued"}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}

	out := mustSendOut(t, mcpCallTool(t, deps, "send_beacon_command", map[string]any{
		"beacon_id": "beacon-nw",
		"command":   "WHOAMI",
		"wait_ms":   -1,
	}))
	if out.Status != "sent" {
		t.Fatalf("status = %q, want sent", out.Status)
	}
	if out.Text != "" || out.ResultSeq != 0 {
		t.Fatalf("no-wait 模式不应携带结果: %+v", out)
	}
}

// ─── list_beacons:归一化全字段 + 在线推断 + 级联链路 ─────────────────────────

func TestListBeaconsNormalization(t *testing.T) {
	now := time.Now()
	fresh := now.Format(time.RFC3339Nano)
	stale := now.Add(-10 * time.Minute).Format(time.RFC3339Nano)
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/beacon/list" || r.Method != http.MethodGet {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			return
		}
		records := fmt.Sprintf(`[
			{"beacon_id":"b-direct","hostname":"HOST-A","username":"Administrator","os":"Windows 10.0.22631",
			 "arch":"x64","process_name":"beacon.exe","pid":123,"internal_ip":"198.18.0.1","external_ip":"192.168.18.1",
			 "listener":"123","sleep":5,"jitter":20,"acp":936,"is_admin":true,
			 "parent_id":"","gateway_id":"b-direct","depth":0,"last_seen":%s},
			{"beacon_id":"b-child","hostname":"HOST-B","username":"user","os":"Windows 10","arch":"x64",
			 "process_name":"Notepad.exe","pid":456,"sleep":3,"acp":65001,
			 "parent_id":"b-direct","gateway_id":"b-direct","depth":1,
			 "link_protocol":"smb","link_state":"connected","link_addr":"198.18.0.1:4444","last_seen":%s}
		]`, jsonQuote(fresh), jsonQuote(stale))
		writeEnvelope(w, records)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}

	resp := mcpCallTool(t, deps, "list_beacons", map[string]any{})
	text, err := extractToolText(resp)
	if err != nil {
		t.Fatalf("list_beacons 失败: %v", err)
	}
	var out listBeaconsOut
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("解析 list_beacons 输出: %v 原始=%s", err, truncateForLog([]byte(text)))
	}

	if out.Count != 2 || out.Online != 1 {
		t.Fatalf("count=%d online=%d, want 2/1", out.Count, out.Online)
	}
	direct := out.Beacons[0]
	if !direct.Online || !direct.Direct || !direct.IsAdmin || direct.ACP != 936 || direct.SleepSec != 5 {
		t.Fatalf("直连 beacon 归一化不符: %+v", direct)
	}
	if direct.Username != "Administrator" || direct.PID != 123 || direct.AgeSeconds < 0 || direct.AgeSeconds > 5 {
		t.Fatalf("直连 beacon 字段/年龄不符: %+v", direct)
	}
	child := out.Beacons[1]
	if child.Online {
		t.Fatalf("10 分钟无心跳不应判在线: %+v", child)
	}
	if child.Direct || child.ParentID != "b-direct" || child.Depth != 1 || child.LinkProto != "smb" {
		t.Fatalf("级联链路字段不符: %+v", child)
	}
}

func TestBeaconOnlineThresholdRespectsSleep(t *testing.T) {
	// sleep=60 → 阈值 360s:5 分钟无心跳仍在线;sleep=5 → 30s 起步,31s 即离线。
	if !beaconOnline(300, 60) {
		t.Fatal("sleep=60 时 300s 应判在线")
	}
	if beaconOnline(31, 5) {
		t.Fatal("sleep=5 时 31s 应判离线")
	}
	if beaconOnline(-1, 60) {
		t.Fatal("last_seen 无法解析时应判离线")
	}
}

// ─── 级联 beacon 在线判定:link_state 权威于滞后心跳 ─────────────────────────

func TestListBeaconsCascadeLinkOnline(t *testing.T) {
	// 复刻真机场景:深度 1 TCP 链,sleep=5 但 51s 无 last_seen 更新,链路 online。
	stale := time.Now().Add(-51 * time.Second).Format(time.RFC3339Nano)
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, fmt.Sprintf(`[
			{"beacon_id":"b3afc64e","hostname":"HOST-C","sleep":5,"parent_id":"5c1f3a6f",
			 "gateway_id":"5c1f3a6f","depth":1,"link_protocol":"tcp","link_state":"online","last_seen":%s},
			{"beacon_id":"b-dead","hostname":"HOST-D","sleep":5,"parent_id":"5c1f3a6f",
			 "depth":1,"link_protocol":"tcp","link_state":"lost","last_seen":%s}
		]`, jsonQuote(stale), jsonQuote(stale)))
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}
	resp := mcpCallTool(t, deps, "list_beacons", map[string]any{})
	text, err := extractToolText(resp)
	if err != nil {
		t.Fatalf("list_beacons 失败: %v", err)
	}
	var out listBeaconsOut
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(out.Beacons) != 2 {
		t.Fatalf("count = %d, want 2", len(out.Beacons))
	}
	if !out.Beacons[0].Online {
		t.Fatalf("link_state=online 的级联 beacon 应判在线(心跳年龄 %ds): %+v", out.Beacons[0].AgeSeconds, out.Beacons[0])
	}
	if out.Beacons[1].Online {
		t.Fatalf("link_state=lost 且心跳过期应判离线: %+v", out.Beacons[1])
	}
}

// ─── 隧道工具:list / create / control / channels ────────────────────────────

func TestListTunnelsNormalization(t *testing.T) {
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/tunnels" || r.URL.Query().Get("page") != "1" {
			t.Errorf("unexpected %s %s", r.Method, r.URL.RequestURI())
			return
		}
		writeEnvelope(w, `{"tunnels":[
			{"tunnel_id":"t1","mode":"socks5","beacon_id":"b1","status":"running",
			 "bind_host":"127.0.0.1","bind_port":1080,"socks_auth_mode":"username_password",
			 "socks_udp_associate":true,"active_channels":3,"bytes_in":1024,"bytes_out":2048},
			{"tunnel_id":"t2","mode":"port_forward","beacon_id":"b2","status":"error",
			 "bind_host":"0.0.0.0","bind_port":8888,"remote_host":"10.0.0.5","remote_port":3389,
			 "error_message":"SOCKS5 listener exited"}
		],"total":2}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}
	resp := mcpCallTool(t, deps, "list_tunnels", map[string]any{})
	text, err := extractToolText(resp)
	if err != nil {
		t.Fatalf("list_tunnels 失败: %v", err)
	}
	var out listTunnelsOut
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("解析失败: %v 原始=%s", err, truncateForLog([]byte(text)))
	}
	if out.Total != 2 || len(out.Tunnels) != 2 {
		t.Fatalf("total=%d len=%d, want 2/2", out.Total, len(out.Tunnels))
	}
	if out.Tunnels[0].SocksAuth != "username_password" || !out.Tunnels[0].SocksUDP || out.Tunnels[0].BytesOut != 2048 {
		t.Fatalf("socks5 字段归一化不符: %+v", out.Tunnels[0])
	}
	if out.Tunnels[1].RemotePort != 3389 || out.Tunnels[1].ErrorMessage == "" {
		t.Fatalf("port_forward 字段归一化不符: %+v", out.Tunnels[1])
	}
}

func TestCreateTunnelValidatesSocksContract(t *testing.T) {
	cases := []struct {
		name string
		args map[string]any
		want string
	}{
		{"缺 socks_auth_mode", map[string]any{"beacon_id": "b1", "mode": "socks5", "bind_port": 1080}, "socks_auth_mode"},
		{"缺 socks_udp_associate", map[string]any{"beacon_id": "b1", "mode": "socks5", "socks_auth_mode": "no_auth"}, "socks_udp_associate"},
		{"用户名密码缺失", map[string]any{"beacon_id": "b1", "mode": "socks5", "socks_auth_mode": "username_password", "socks_udp_associate": false}, "socks_username"},
		{"port_forward 缺目标", map[string]any{"beacon_id": "b1", "mode": "port_forward", "bind_port": 8888}, "remote_host"},
		{"未知 mode", map[string]any{"beacon_id": "b1", "mode": "http_proxy"}, "未知 mode"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sess, _, _ := newFakeTS(t, nil)
			deps := Deps{Sess: sess, Sink: NewEventSink(4)}
			resp := mcpCallTool(t, deps, "create_tunnel", c.args)
			if _, err := extractToolText(resp); err == nil {
				t.Fatalf("应校验失败, got: %s", truncateForLog([]byte(resp)))
			} else if !strings.Contains(err.Error(), c.want) {
				t.Fatalf("错误应含 %q, got: %v", c.want, err)
			}
		})
	}
}

func TestCreateTunnelPassesSocksBody(t *testing.T) {
	var gotBody map[string]any
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		writeEnvelope(w, `{"tunnel_id":"t-new","mode":"socks5","status":"running"}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}
	resp := mcpCallTool(t, deps, "create_tunnel", map[string]any{
		"beacon_id": "b1", "mode": "socks5", "bind_host": "127.0.0.1", "bind_port": 1080,
		"socks_auth_mode": "username_password", "socks_username": "op", "socks_password": "pw",
		"socks_udp_associate": true,
	})
	if _, err := extractToolText(resp); err != nil {
		t.Fatalf("创建失败: %v", err)
	}
	if gotBody["socks_auth_mode"] != "username_password" || gotBody["socks_udp_associate"] != true || gotBody["socks_username"] != "op" {
		t.Fatalf("请求体字段透传不符: %+v", gotBody)
	}
}

func TestControlTunnelActions(t *testing.T) {
	cases := []struct {
		action string
		method string
		path   string
	}{
		{"pause", "POST", "/api/v1/tunnels/t9/pause"},
		{"resume", "POST", "/api/v1/tunnels/t9/resume"},
		{"stop", "POST", "/api/v1/tunnels/t9/stop"},
		{"delete", "DELETE", "/api/v1/tunnels/t9"},
	}
	for _, c := range cases {
		t.Run(c.action, func(t *testing.T) {
			sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
				if r.Method != c.method || r.URL.Path != c.path {
					t.Errorf("got %s %s, want %s %s", r.Method, r.URL.Path, c.method, c.path)
				}
				writeEnvelope(w, `{"ok":true}`)
			})
			deps := Deps{Sess: sess, Sink: NewEventSink(4)}
			resp := mcpCallTool(t, deps, "control_tunnel", map[string]any{"tunnel_id": "t9", "action": c.action})
			if _, err := extractToolText(resp); err != nil {
				t.Fatalf("%s 失败: %v", c.action, err)
			}
		})
	}
}

func TestListTunnelChannelsPassthrough(t *testing.T) {
	sess, _, _ := newFakeTS(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/tunnels/t1/channels" {
			t.Errorf("unexpected path %s", r.URL.Path)
			return
		}
		writeEnvelope(w, `{"channels":[{"channel_id":"ch1","status":"active","target_address":"10.0.0.5:3389","bytes_in":1}]}`)
	})
	deps := Deps{Sess: sess, Sink: NewEventSink(4)}
	text, err := extractToolText(mcpCallTool(t, deps, "list_tunnel_channels", map[string]any{"tunnel_id": "t1"}))
	if err != nil {
		t.Fatalf("list_tunnel_channels 失败: %v", err)
	}
	if !strings.Contains(text, "ch1") || !strings.Contains(text, "10.0.0.5:3389") {
		t.Fatalf("信道列表未透传: %s", truncateForLog([]byte(text)))
	}
}
