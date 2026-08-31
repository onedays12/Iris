package mcp

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
)

// eventMessageName 是 WebSocketService 发往前端的命令结果帧名。
// 该值为 ws_service.go 内常量 websocketEventMessage 的镜像,
// 由 connect 测试与真机验证共同保障一致性。
const eventMessageName = "teamserver:ws:message"

// frameTypeKeys 是 message 内层 JSON 中"事件类型"字段的可能键名。
// 规范键为小写 "type"(fieldMap.ts 破坏性收敛后的单键);其余为历史兼容兜底,
// 以 frontend/src/shared/protocol/fieldMap.ts 快照测试对齐后收敛。
var frameTypeKeys = []string{"type", "Type", "event_type", "eventType"}

// FrameRecord 是事件 sink 中对一条已捕获事件的展示形态。
type FrameRecord struct {
	Seq     uint64    `json:"seq"`
	Name    string    `json:"name"`
	Time    time.Time `json:"time"`
	Type    string    `json:"type,omitempty"` // 仅 message 帧有内层类型
	Payload any       `json:"payload,omitempty"`
}

// normalizeFrame 规范化一条进入 sink 的事件(见 EventSink.Append):
// message 帧剥壳存内层解码对象并提取类型字段,其余帧存包装对象。
func normalizeFrame(name string, data any) FrameRecord {
	rec := FrameRecord{Name: name, Time: time.Now()}
	blob, err := json.Marshal(data)
	if err != nil {
		rec.Payload = map[string]any{}
		return rec
	}
	var outer any
	if json.Unmarshal(blob, &outer) != nil {
		rec.Payload = map[string]any{}
		return rec
	}
	rec.Payload = outer

	if name == eventMessageName {
		if env, ok := outer.(map[string]any); ok {
			if rawStr, ok := env["data"].(string); ok && rawStr != "" {
				var inner any
				if json.Unmarshal([]byte(rawStr), &inner) == nil {
					rec.Payload = inner
					if obj, ok := inner.(map[string]any); ok {
						rec.Type = extractTypeFromMap(obj)
					}
				} else {
					rec.Payload = rawStr // 非法内层 JSON:保留字符串形式供排查
				}
			}
		}
	}
	return rec
}

// extractTypeFromMap 按 frameTypeKeys 顺序探测首个字符串类型字段。
func extractTypeFromMap(obj map[string]any) string {
	for _, key := range frameTypeKeys {
		if v, ok := obj[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

// matchPrefix 判断记录是否命中类型前缀过滤:优先比对解析出的 Type,
// 非 message 帧(无 Type)回退比对事件名。prefix 为空恒命中。
func matchPrefix(rec FrameRecord, prefix string) bool {
	if prefix == "" {
		return true
	}
	target := rec.Type
	if target == "" {
		target = rec.Name
	}
	return strings.HasPrefix(target, prefix)
}

// beaconIDKeys / taskIDKeys 是在事件负载中查找关联 id 时尝试的键别名。
// 规范键来自 TeamServer 原生帧(snake_case),camelCase 为前端 fieldMap 兼容兜底;
// 真机 E2E 验证后如有出入以实际帧为准调整并补快照测试。
var (
	beaconIDKeys = []string{"beacon_id", "beaconId", "id"}
	taskIDKeys   = []string{"task_id", "taskId", "command_id", "commandId"}
)

// matchFilters 是 wait/list 的总过滤器:类型前缀 + 可选的 beacon/task 关联匹配。
func matchFilters(rec FrameRecord, f Filter) bool {
	if !matchPrefix(rec, f.TypePrefix) {
		return false
	}
	if f.BeaconID != "" && !payloadFieldEquals(rec.Payload, f.BeaconID, beaconIDKeys) {
		return false
	}
	if f.CommandID != "" && !payloadFieldEquals(rec.Payload, f.CommandID, taskIDKeys) {
		return false
	}
	return true
}

// payloadFieldEquals 在负载顶层查找 keys 中第一个出现的字段,
// 值与 want 相等(字符串不区分大小写;数值按十进制文本比较)即命中。
func payloadFieldEquals(payload any, want string, keys []string) bool {
	obj, _ := payload.(map[string]any)
	if obj == nil {
		return false
	}
	// 实测帧形如 {type,data:{beacon_id,task_id,...}}:顶层与嵌套 data 各查一遍。
	candidates := []map[string]any{obj}
	if sub, ok := obj["data"].(map[string]any); ok {
		candidates = append(candidates, sub)
	}
	for _, m := range candidates {
		for _, key := range keys {
			v, ok := m[key]
			if !ok || v == nil {
				continue
			}
			switch tv := v.(type) {
			case string:
				if strings.EqualFold(tv, want) {
					return true
				}
			case float64:
				if tv == math.Trunc(tv) && strconv.FormatInt(int64(tv), 10) == strings.TrimSpace(want) {
					return true
				}
			}
		}
	}
	return false
}
