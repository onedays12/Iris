package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

type listBeaconsIn struct{}

// beaconSummary 是面向操作员/Agent 的 beacon 会话归一化视图:
// 字段取自 GET /api/v1/beacon/list(真机全量字段),Online/AgeSeconds 为推断值。
type beaconSummary struct {
	BeaconID   string `json:"beacon_id" jsonschema:"beacon 会话 id"`
	Hostname   string `json:"hostname,omitempty" jsonschema:"主机名"`
	Username   string `json:"username,omitempty" jsonschema:"回连用户"`
	OS         string `json:"os,omitempty" jsonschema:"操作系统版本"`
	Arch       string `json:"arch,omitempty" jsonschema:"进程架构(x64/x86)"`
	Process    string `json:"process_name,omitempty" jsonschema:"承载进程名"`
	PID        int    `json:"pid,omitempty" jsonschema:"进程 pid"`
	InternalIP string `json:"internal_ip,omitempty" jsonschema:"内网 IP"`
	ExternalIP string `json:"external_ip,omitempty" jsonschema:"出口 IP"`
	Listener   string `json:"listener,omitempty" jsonschema:"接入监听器名"`
	SleepSec   int    `json:"sleep_sec,omitempty" jsonschema:"心跳睡眠(秒)"`
	Jitter     int    `json:"jitter,omitempty" jsonschema:"睡眠抖动百分比"`
	IsAdmin    bool   `json:"is_admin,omitempty" jsonschema:"是否管理员权限"`
	ACP        int    `json:"acp,omitempty" jsonschema:"被控机代码页(936=GBK,65001=UTF-8)"`
	Online     bool   `json:"online" jsonschema:"是否在线:直连按心跳年龄(阈值 max(30, sleep*6) 秒);级联 beacon 的心跳经父级多跳,last_seen 滞后,故 link_state=online 即判在线"`
	AgeSeconds int    `json:"age_seconds" jsonschema:"距最后心跳秒数;-1 表示时间无法解析"`
	LastSeen   string `json:"last_seen,omitempty" jsonschema:"最后心跳时间(RFC3339)"`
	Direct     bool   `json:"direct" jsonschema:"是否直连(true=非级联;级联 beacon 经父级多跳回连)"`
	ParentID   string `json:"parent_id,omitempty" jsonschema:"父级 beacon id(级联上游;直连为空)"`
	GatewayID  string `json:"gateway_id,omitempty" jsonschema:"流量出口网关 beacon id"`
	Depth      int    `json:"depth,omitempty" jsonschema:"级联深度(0=直连)"`
	LinkProto  string `json:"link_protocol,omitempty" jsonschema:"与父级间的链接协议"`
	LinkState  string `json:"link_state,omitempty" jsonschema:"链接状态"`
	LinkAddr   string `json:"link_addr,omitempty" jsonschema:"链接地址"`
}

type listBeaconsOut struct {
	Count   int             `json:"count" jsonschema:"记录总数"`
	Online  int             `json:"online" jsonschema:"在线数量"`
	Beacons []beaconSummary `json:"beacons"`
}

type sendCommandIn struct {
	BeaconID string `json:"beacon_id" jsonschema:"目标 beacon id"`
	Command  any    `json:"command" jsonschema:"命令名(如 WHOAMI/SHELL/SLEEP/LS/SCREENSHOT)或数字 ID"`
	Args     []any  `json:"args,omitempty" jsonschema:"原始参数列表;复杂命令需传 {kind,value} 显式对象"`
	WaitMs   int    `json:"wait_ms,omitempty" jsonschema:"下发后等待结果的最长毫秒数;省略或 0=默认 15000;-1=只下发不等待(配合 wait_for_event 自行取结果)"`
}

type sendCommandOut struct {
	BeaconID  string `json:"beacon_id" jsonschema:"目标 beacon id"`
	CommandID int    `json:"command_id" jsonschema:"数字命令 ID"`
	Status    string `json:"status" jsonschema:"completed 表示已拿到结果; error 表示 beacon/服务端报错; timeout 表示限时内未回传; sent 表示只下发未等待"`
	Text      string `json:"text,omitempty" jsonschema:"结果文本(status=completed)"`
	Error     string `json:"error,omitempty" jsonschema:"失败原因(status=error/timeout)"`
	SinceSeq  uint64 `json:"since_seq" jsonschema:"下发前的缓冲游标;timeout 时用 list_recent_events(since_seq=该值,type_prefix=COMMAND,beacon_id=同值) 续查"`
	ResultSeq uint64 `json:"result_seq,omitempty" jsonschema:"命中结果帧的 seq"`
}

// defaultCmdWaitMs 是 send_beacon_command 缺省的结果等待窗。
const defaultCmdWaitMs = 15000

func registerBeaconTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "list_beacons",
		Description: "列出全部 beacon 会话(全字段:主机/用户/系统/进程/网络/睡眠/代码页/级联链路)," +
			"并附按心跳周期推断的 online 状态与 last_seen 年龄。选目标发命令前先调用本工具。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in listBeaconsIn) (*msdk.CallToolResult, any, error) {
		_, data, err := s.ts.Do(ctx, "GET", "/api/v1/beacon/list", nil)
		if err != nil {
			return nil, nil, err
		}
		out := normalizeBeaconList(data)
		return nil, out, nil
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "send_beacon_command",
		Description: "向 beacon 下发任务并默认阻塞等待执行结果(直连与级联 beacon 一致,无需再去事件缓冲翻找)。" +
			"command 接受符号名或数字 ID;args 按前端同款规则自动类型化(如 SHELL 收 1 个字符串、SLEEP 收 sleep_ms [jitter]、" +
			"WHOAMI 无参;SETATTR/CASCADE/MIGRATE 等复杂命令请传 {kind,value} 对象)。" +
			"长任务(SHELL 后台 Job 等)若限时内只回执了启动确认,可加大 wait_ms 或用 wait_for_event/list_recent_events 续查。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in sendCommandIn) (*msdk.CallToolResult, any, error) {
		id, err := resolveCommandID(in.Command)
		if err != nil {
			return nil, nil, err
		}
		beaconID := strings.TrimSpace(in.BeaconID)
		if beaconID == "" {
			return nil, nil, fmt.Errorf("beacon_id 必填")
		}
		wire, err := buildBeaconCommandArgs(id, in.Args)
		if err != nil {
			return nil, nil, err
		}

		out := sendCommandOut{BeaconID: beaconID, CommandID: id}
		// 游标先取再下发:结果帧必须 seq>该值,避免命中同命令的历史帧。
		out.SinceSeq = s.deps.Sink.LastSeq()

		if _, err := s.postBeaconCommand(ctx, beaconID, id, wire); err != nil {
			return nil, nil, err
		}

		if in.WaitMs < 0 { // 只下发不等待(旧行为)
			out.Status = "sent"
			return nil, out, nil
		}
		wait := msToDuration(in.WaitMs)
		if in.WaitMs == 0 {
			wait = time.Duration(defaultCmdWaitMs) * time.Millisecond
		}
		rec, err := s.deps.Sink.WaitFunc(ctx, func(rec FrameRecord) bool {
			return rec.Seq > out.SinceSeq &&
				matchFilters(rec, Filter{TypePrefix: "COMMAND", BeaconID: beaconID, CommandID: strconv.Itoa(id)})
		}, wait)
		if err != nil {
			out.Status = "timeout"
			out.Error = fmt.Sprintf("限时 %s 内未回传结果;缓冲续查游标 since_seq=%d", wait, out.SinceSeq)
			return nil, out, nil
		}
		out.ResultSeq = rec.Seq
		status, text, errMsg := commandFrameDetails(rec.Payload)
		switch {
		case status == "error":
			out.Status = "error"
			out.Error = firstNonEmpty(errMsg, text, "beacon 回报执行失败")
		default:
			out.Status = firstNonEmpty(status, "completed")
			out.Text = text
		}
		return nil, out, nil
	})
}

// postBeaconCommand 组装 POST /api/v1/beacon/command 请求体并下发,返回原始 data。
func (s *Server) postBeaconCommand(ctx context.Context, beaconID string, commandID int, wire []wireArg) (json.RawMessage, error) {
	body := map[string]any{
		"beacon_id": beaconID,
		"command":   commandID,
		"args":      wire,
	}
	_, data, err := s.ts.Do(ctx, "POST", "/api/v1/beacon/command", body)
	return data, err
}

// callBeaconCommand 下发并返回服务器 ack。request_screenshot 等包装工具复用本方法。
func (s *Server) callBeaconCommand(ctx context.Context, beaconID string, commandID int, wire []wireArg) (*msdk.CallToolResult, any, error) {
	data, err := s.postBeaconCommand(ctx, beaconID, commandID, wire)
	if err != nil {
		return nil, nil, err
	}
	return rawResult(data)
}

// commandFrameDetails 从 COMMAND 事件负载提取 (status, text, error)。
// 帧形(真机抓取): payload = {data:{beacon_id, client, command_id, status?, error?, data:{text|output|...}}}。
// 顶层与嵌套 data 各查一遍,兼容 flat 历史。
func commandFrameDetails(payload any) (status, text, errMsg string) {
	sub, _ := payload.(map[string]any)
	inner, _ := sub["data"].(map[string]any)
	if sub == nil && inner == nil {
		return "", "", ""
	}
	if v, _ := sub["status"].(string); v != "" {
		status = v
	} else if v, _ := sub["phase"].(string); v != "" {
		status = v
	}
	errMsg = firstNonEmpty(str(sub["error"]), str(inner["error"]), str(inner["error_message"]))
	if status == "" && errMsg != "" {
		status = "error"
	}
	text = firstNonEmpty(str(inner["text"]), str(inner["output"]), str(inner["content"]), str(sub["text"]))
	return status, text, errMsg
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

// normalizeBeaconList 把 /beacon/list 的 data(数组或 {data|beacons|items:[...]})归一化为全字段视图。
func normalizeBeaconList(data json.RawMessage) listBeaconsOut {
	out := listBeaconsOut{Beacons: []beaconSummary{}}
	var records []map[string]any
	if err := json.Unmarshal(data, &records); err != nil {
		var wrapper map[string]json.RawMessage
		if err2 := json.Unmarshal(data, &wrapper); err2 == nil {
			for _, key := range []string{"data", "beacons", "items"} {
				if raw, ok := wrapper[key]; ok {
					_ = json.Unmarshal(raw, &records)
					break
				}
			}
		}
	}
	now := time.Now()
	for _, rec := range records {
		summary := beaconSummary{
			BeaconID:   recStr(rec, "beacon_id"),
			Hostname:   recStr(rec, "hostname"),
			Username:   recStr(rec, "username"),
			OS:         recStr(rec, "os"),
			Arch:       recStr(rec, "arch"),
			Process:    recStr(rec, "process_name"),
			PID:        recInt(rec, "pid"),
			InternalIP: recStr(rec, "internal_ip"),
			ExternalIP: recStr(rec, "external_ip"),
			Listener:   recStr(rec, "listener"),
			SleepSec:   recInt(rec, "sleep"),
			Jitter:     recInt(rec, "jitter"),
			IsAdmin:    recBool(rec, "is_admin"),
			ACP:        recInt(rec, "acp"),
			LastSeen:   recStr(rec, "last_seen"),
			ParentID:   recStr(rec, "parent_id"),
			GatewayID:  recStr(rec, "gateway_id"),
			Depth:      recInt(rec, "depth"),
			LinkProto:  recStr(rec, "link_protocol"),
			LinkState:  recStr(rec, "link_state"),
			LinkAddr:   recStr(rec, "link_addr"),
		}
		summary.AgeSeconds = beaconAgeSeconds(summary.LastSeen, now)
		summary.Online = beaconOnline(summary.AgeSeconds, summary.SleepSec) ||
			// 级联 beacon 的心跳经父级多跳聚合,last_seen 天然滞后(实测 sleep=5 也会滞后 50s+),
			// 链路状态 online 是权威存活信号;lost/空仍按心跳年龄判定。
			(!summary.Direct && strings.EqualFold(summary.LinkState, "online"))
		summary.Direct = summary.ParentID == ""
		out.Beacons = append(out.Beacons, summary)
		if summary.Online {
			out.Online++
		}
	}
	out.Count = len(out.Beacons)
	return out
}

// beaconAgeSeconds 计算距 last_seen 的秒数;解析失败返回 -1。
func beaconAgeSeconds(lastSeen string, now time.Time) int {
	if lastSeen == "" {
		return -1
	}
	ts, err := time.Parse(time.RFC3339Nano, lastSeen)
	if err != nil {
		return -1
	}
	age := int(now.Sub(ts) / time.Second)
	if age < 0 {
		age = 0
	}
	return age
}

// beaconOnline 判定在线:last_seen 年龄不超过 max(30, sleep*6) 秒;
// sleep 缺失(=0,SDK 省略 int 同 0)按 30 秒兜底。与 mcp-operator-sim 的存活启发式一致。
func beaconOnline(ageSeconds, sleepSec int) bool {
	if ageSeconds < 0 {
		return false
	}
	threshold := 30
	if sleepSec > 0 && sleepSec*6 > threshold {
		threshold = sleepSec * 6
	}
	return ageSeconds <= threshold
}

func recStr(rec map[string]any, key string) string {
	return str(rec[key])
}

func recInt(rec map[string]any, key string) int {
	if v, ok := rec[key].(float64); ok {
		return int(v)
	}
	return 0
}

func recBool(rec map[string]any, key string) bool {
	v, _ := rec[key].(bool)
	return v
}

// resolveCommandID 兼容符号名(大小写不敏感)与数字 ID。
func resolveCommandID(raw any) (int, error) {
	switch v := raw.(type) {
	case float64:
		if v == math.Trunc(v) && v >= 0 && v <= math.MaxInt32 {
			return int(v), nil
		}
		return 0, fmt.Errorf("非法命令 ID %v", v)
	case string:
		key := strings.ToUpper(strings.TrimSpace(v))
		if id, ok := CommandID[key]; ok {
			return id, nil
		}
		return 0, fmt.Errorf("未知命令名 %q;可用名称见 constants/commands.ts 镜像表(SLEEP/SHELL/LS/…)", v)
	default:
		return 0, fmt.Errorf("command 字段必须是命令名或数字 ID")
	}
}

// rawResult 把 TeamServer 的 data 字段作为结构化 JSON 文本块返回给 Agent。
func rawResult(data json.RawMessage) (*msdk.CallToolResult, any, error) {
	text := string(data)
	if !json.Valid(data) || data == nil {
		text = "{}"
	}
	return &msdk.CallToolResult{
		Content: []msdk.Content{&msdk.TextContent{Text: text}},
	}, nil, nil
}
