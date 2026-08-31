package mcp

import (
	"fmt"
	"math"
	"strings"
)

// 本文件镜像 frontend/src/constants/commands.ts(命令 ID 表)与
// features/beacon/api/commandArgs.ts(按命令的参数类型化构建)。
// 两端必须同步增删,commands_snapshot_test.go 会对 commands.ts 做机械比对。

// CommandID 镜像 COMMAND_ID;键名与 TS 完全一致以便快照测试。
var CommandID = map[string]int{
	// 通用控制 (1-9)
	"SLEEP": 1,
	"EXIT":  2,
	// 基础执行 (10-19)
	"SHELL":      10,
	"POWERSHELL": 11,
	// 文件系统 (20-39)
	"CD":    20,
	"LS":    21,
	"PWD":   22,
	"CAT":   23,
	"MKDIR": 24,
	"RM":    25,
	"MV":    26,
	"CP":    27,
	// 数据传输
	"DOWNLOAD": 28,
	"UPLOAD":   29,
	"SETATTR":  31,
	"ZIP":      32,
	// 进程与令牌 / 网络 / 截图 (40-59)
	"PS":          40,
	"KILLJOB":     41,
	"KILL":        42,
	"STEAL_TOKEN": 43,
	"JOBS":        44,
	"WHOAMI":      50,
	"SCREENSHOT":  51,
	"NETINFO":     52,
	"NETSTAT":     53,
	// Cascade 级联 (80-87)
	"CASCADE_CONNECT_TCP": 80,
	"CONNECT":             80,
	"CASCADE_LINK_SMB":    81,
	"LINK":                81,
	"CASCADE_ROUTE":       82,
	"CASCADE_CLOSE":       83,
	"CASCADE_OPEN":        84,
	"CASCADE_READ":        85,
	"CASCADE_DEAD":        86,
	"CASCADE_PING":        87,
	// 执行与注入 (70+):插件动作与 BOF 工件链路
	"EXECUTION_BOF": 70,
	// Post-Ex (90,93)
	"POSTEX":            90,
	"POSTEX_SPAWN_DLL":  90,
	"POSTEX_INJECT_DLL": 90,
	"POSTEX_EVENT":      93,
	// Migrate (100)
	"MIGRATE":        100,
	"SPAWNTO":        100,
	"MIGRATE_SPAWN":  100,
	"MIGRATE_INJECT": 100,
}

// argKind 字面量集合,镜像 commandArgs.ts ARG_KIND。
const (
	argKindString = "string"
	argKindInt32  = "int32"
	argKindShort  = "short"
	argKindBool   = "bool"
	argKindBytes  = "bytes"
)

// wireArg 是发往 TeamServer 的类型化参数。
type wireArg struct {
	Kind  string `json:"kind"`
	Value any    `json:"value"`
}

// 分块/心跳默认值,镜像 commandArgs.ts 头部常量。
const (
	fileChunkSizeDefault      = 524288
	fileChunkSizeMin          = 65536
	fileChunkSizeMax          = 1048576
	chunksPerHeartbeatDefault = 3
	chunksPerHeartbeatMax     = 5
)

// buildBeaconCommandArgs 把原始入参转换为 {kind,value} 列表,
// 行为逐条镜像 commandArgs.ts 的 switch(commandId)。
func buildBeaconCommandArgs(commandID int, source []any) ([]wireArg, error) {
	switch commandID {
	case CommandID["EXIT"]:
		return nil, nil

	case CommandID["SHELL"], CommandID["POWERSHELL"]:
		if len(source) != 1 {
			return nil, argErr(commandID, "恰好 1 个 raw command 字符串")
		}
		return []wireArg{mustStringArg(source[0])}, nil

	case CommandID["CD"], CommandID["CAT"], CommandID["MKDIR"], CommandID["RM"]:
		return countedStringArgs(commandID, source, 1)

	case CommandID["MV"], CommandID["CP"]:
		return countedStringArgs(commandID, source, 2)

	case CommandID["LS"]:
		if len(source) == 0 || isNilish(source[0]) {
			return nil, nil
		}
		return []wireArg{mustStringArg(source[0])}, nil

	case CommandID["PWD"], CommandID["PS"], CommandID["JOBS"],
		CommandID["WHOAMI"], CommandID["NETINFO"], CommandID["NETSTAT"]:
		return nil, nil

	case CommandID["SLEEP"]:
		if len(source) < 1 || len(source) > 2 {
			return nil, argErr(commandID, "1~2 个参数:sleep_ms [jitter]")
		}
		ms, err := int32RangeArg(source[0], "sleep_ms", 1, math.MaxInt32)
		if err != nil {
			return nil, err
		}
		var jitter int64
		if len(source) == 2 && !isNilish(source[1]) {
			jitter, err = int32RangeArg(source[1], "jitter", 0, math.MaxInt32)
			if err != nil {
				return nil, err
			}
		}
		return []wireArg{{argKindInt32, ms}, {argKindInt32, jitter}}, nil

	case CommandID["DOWNLOAD"]:
		if len(source) < 1 || len(source) > 3 {
			return nil, argErr(commandID, "1~3 个参数:remote_path [chunk_size] [chunks_per_heartbeat]")
		}
		return []wireArg{
			mustStringArg(source[0]),
			{argKindInt32, chunkSizeArg(source, 1)},
			{argKindInt32, chunksPerHeartbeatArg(source, 2)},
		}, nil

	case CommandID["UPLOAD"]:
		if len(source) < 2 || len(source) > 3 {
			return nil, argErr(commandID, "2~3 个参数:source_file remote_path [chunk_size]")
		}
		return []wireArg{
			mustStringArg(source[0]),
			mustStringArg(source[1]),
			{argKindInt32, chunkSizeArg(source, 2)},
		}, nil

	case CommandID["KILLJOB"]:
		if len(source) != 1 {
			return nil, argErr(commandID, "恰 1 个 job_id")
		}
		jobID, err := int32RangeArg(source[0], "job_id", 0, math.MaxInt32)
		if err != nil {
			return nil, err
		}
		return []wireArg{{argKindInt32, jobID}}, nil

	case CommandID["KILL"], CommandID["STEAL_TOKEN"]:
		if len(source) != 1 {
			return nil, argErr(commandID, "恰 1 个 pid")
		}
		pid, err := int32RangeArg(source[0], "pid", 1, math.MaxInt32)
		if err != nil {
			return nil, err
		}
		return []wireArg{{argKindInt32, pid}}, nil

	case CommandID["SCREENSHOT"]:
		if len(source) > 2 {
			return nil, argErr(commandID, "至多 2 个参数:monitor_id quality")
		}
		var monitor int64
		var err error
		if len(source) >= 1 && !isNilish(source[0]) {
			monitor, err = int32RangeArg(source[0], "monitor_id", 0, math.MaxInt32)
			if err != nil {
				return nil, err
			}
		}
		quality := int64(80)
		if len(source) == 2 && !isNilish(source[1]) {
			quality, err = int32RangeArg(source[1], "quality", 1, 100)
			if err != nil {
				return nil, err
			}
		}
		return []wireArg{{argKindInt32, monitor}, {argKindInt32, quality}}, nil

	case CommandID["EXECUTION_BOF"]:
		if len(source) < 1 {
			return nil, argErr(commandID, "至少 1 个参数:BOF 工件({kind:bytes,...} 显式对象)+ 可选显示参数")
		}
		first, ok := source[0].(map[string]any)
		if !ok || first["kind"] != argKindBytes || first["value"] == nil {
			return nil, fmt.Errorf("BOF 工件必须以 {\"kind\":\"bytes\",\"value\":...} 显式对象传参")
		}
		out := []wireArg{{argKindBytes, first["value"]}}
		for i, item := range source[1:] {
			normal, err := normalizeTyped(kindOfAny(item), item, fmt.Sprintf("BOF 显示参数 #%d", i))
			if err != nil {
				return nil, err
			}
			out = append(out, normal)
		}
		return out, nil

	case CommandID["ZIP"]:
		if len(source) < 2 || len(source) > 4 {
			return nil, argErr(commandID, "2~4 个参数:source_path zip_path [overwrite=0] [include_root=1]")
		}
		overwrite := int64(0)
		if binaryFlag(source, 2, false) {
			overwrite = 1
		}
		includeRoot := int64(0)
		if binaryFlag(source, 3, true) {
			includeRoot = 1
		}
		return []wireArg{mustStringArg(source[0]), mustStringArg(source[1]),
			{argKindInt32, overwrite}, {argKindInt32, includeRoot}}, nil

	default:
		// 复杂家族(SETATTR/CASCADE_*/POSTEX*/MIGRATE*)与未知命令:
		// 与前端 default 分支一致——接受显式 {kind,value} 对象原样透传;
		// 纯值形式不做猜测,报错引导。
		return typedExplicitArgs(commandID, source)
	}
}

// typedExplicitArgs 实现 normalizeBeaconArg 映射:允许 {"kind","value"} 对象;
// bool/int32/short 会做数值校验;纯值一律拒绝并给出指引。
func typedExplicitArgs(commandID int, source []any) ([]wireArg, error) {
	out := make([]wireArg, 0, len(source))
	for i, item := range source {
		obj, ok := item.(map[string]any)
		if ok {
			kind, _ := obj["kind"].(string)
			value, hasValue := obj["value"]
			if kind == "" || !hasValue {
				return nil, fmt.Errorf("命令 %d 第 %d 个参数不合法:显式参数必须是 {kind,value} 对象(kind ∈ string|int32|short|bool|bytes)", commandID, i+1)
			}
			normal, err := normalizeTyped(kind, value, fmt.Sprintf("命令 %d 第 %d 参数", commandID, i+1))
			if err != nil {
				return nil, err
			}
			out = append(out, normal)
			continue
		}
		return nil, fmt.Errorf("命令 %d 属于复杂/未细分命令:请以 {kind,value} 显式对象传参(kind ∈ string|int32|short|bool|bytes)", commandID)
	}
	return out, nil
}

func normalizeTyped(kind string, value any, label string) (wireArg, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case argKindBool:
		b, err := boolArg(value, label)
		if err != nil {
			return wireArg{}, err
		}
		return wireArg{argKindBool, b}, nil
	case argKindInt32:
		n, err := int32Arg(value, label)
		if err != nil {
			return wireArg{}, err
		}
		return wireArg{argKindInt32, n}, nil
	case argKindShort:
		fv, err := toFloat(value)
		if err != nil || fv < -32768 || fv > 32767 {
			return wireArg{}, fmt.Errorf("%s 必须是 short 范围整数", label)
		}
		return wireArg{argKindShort, int64(fv)}, nil
	case argKindBytes:
		return wireArg{argKindBytes, value}, nil
	default:
		s, err := stringValue(value)
		if err != nil {
			return wireArg{}, fmt.Errorf("%s 无法转 string", label)
		}
		return wireArg{argKindString, s}, nil
	}
}

// ─── 数值/布尔助手(语义对齐 commandArgs.ts 同名函数) ───

func isNilish(v any) bool { return v == nil }

func toFloat(v any) (float64, error) {
	switch n := v.(type) {
	case float64:
		return n, nil
	case int:
		return float64(n), nil
	case int64:
		return float64(n), nil
	case bool:
		if n {
			return 1, nil
		}
		return 0, nil
	case string:
		var f float64
		text := strings.TrimSpace(n)
		if _, err := fmt.Sscanf(text, "%g", &f); err == nil {
			return f, nil
		}
		return 0, fmt.Errorf("非数值 %q", n)
	default:
		return 0, fmt.Errorf("非数值类型 %T", v)
	}
}

func int32Arg(v any, label string) (int64, error) {
	f, err := toFloat(v)
	if err != nil || f != math.Trunc(f) || f < math.MinInt32 || f > math.MaxInt32 {
		return 0, fmt.Errorf("%s 必须是 int32 整数", label)
	}
	return int64(f), nil
}

func int32RangeArg(v any, label string, min, max int64) (int64, error) {
	n, err := int32Arg(v, label)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", label, err)
	}
	if n < min || n > max {
		return 0, fmt.Errorf("%s 越界 [%d,%d]: %d", label, min, max, n)
	}
	return n, nil
}

func stringValue(v any) (string, error) {
	if s, ok := v.(string); ok {
		return s, nil
	}
	return "", fmt.Errorf("必须是字符串,收到 %T", v)
}

func mustStringArg(v any) wireArg {
	s, err := stringValue(v)
	if err != nil {
		return wireArg{argKindString, fmt.Sprint(v)}
	}
	return wireArg{argKindString, s}
}

func countedStringArgs(commandID int, source []any, count int) ([]wireArg, error) {
	if len(source) < count {
		return nil, argErr(commandID, fmt.Sprintf("至少 %d 个字符串参数", count))
	}
	out := make([]wireArg, 0, count)
	for i := 0; i < count; i++ {
		out = append(out, mustStringArg(source[i]))
	}
	return out, nil
}

func boolArg(v any, label string) (bool, error) {
	if b, ok := v.(bool); ok {
		return b, nil
	}
	text := strings.ToLower(strings.TrimSpace(fmt.Sprint(v)))
	switch text {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off", "":
		return false, nil
	default:
		return false, fmt.Errorf("%s 必须是布尔值", label)
	}
}

func binaryFlag(source []any, idx int, dft bool) bool {
	if idx >= len(source) || isNilish(source[idx]) {
		return dft
	}
	b, err := boolArg(source[idx], fmt.Sprintf("arg[%d]", idx))
	if err != nil {
		return dft
	}
	return b
}

func chunkSizeArg(source []any, idx int) int64 {
	if idx >= len(source) || isNilish(source[idx]) {
		return fileChunkSizeDefault
	}
	n, err := int32Arg(source[idx], "chunk_size")
	if err != nil || n <= 0 {
		return fileChunkSizeDefault
	}
	if n < fileChunkSizeMin {
		return fileChunkSizeMin
	}
	if n > fileChunkSizeMax {
		return fileChunkSizeMax
	}
	return n
}

func chunksPerHeartbeatArg(source []any, idx int) int64 {
	if idx >= len(source) || isNilish(source[idx]) {
		return chunksPerHeartbeatDefault
	}
	n, err := int32Arg(source[idx], "chunks_per_heartbeat")
	if err != nil || n <= 0 {
		return chunksPerHeartbeatDefault
	}
	if n > chunksPerHeartbeatMax {
		return chunksPerHeartbeatMax
	}
	return n
}

func argErr(commandID int, want string) error {
	name := "unknown"
	for k, id := range CommandID {
		if id == commandID {
			name = k
			break
		}
	}
	return fmt.Errorf("命令 %s(%d) 需要 %s", name, commandID, want)
}

func kindOfAny(v any) string {
	if obj, ok := v.(map[string]any); ok {
		if k, _ := obj["kind"].(string); k != "" {
			return k
		}
	}
	switch v.(type) {
	case bool:
		return argKindBool
	case float64, int, int64:
		return argKindInt32
	default:
		return argKindString
	}
}
