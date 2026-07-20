// Package args 提供 beacon 命令参数的解析与归一化工具。
//
// 抽成独立子包是因为这些纯函数被 internal/plugin 的多个文件
// (dispatcher、postex_args、manifest_lint 等)共享,放公共包可避免
// 符号可见性跨业务域泄漏。
package args

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// int 范围常量,供 parseInt32Value / parseInt16Value 做范围校验。
const (
	MinInt16Value = -1 << 15
	MaxInt16Value = 1<<15 - 1
	MinInt32Value = -1 << 31
	MaxInt32Value = 1<<31 - 1
)

// BeaconCommandArg 是 beacon 命令的单个参数。
// 放在本包因为 BuildBeaconCommandArg 等函数构造它,plugin 包通过 Args []BeaconCommandArg 引用。
type BeaconCommandArg struct {
	Kind  string `json:"kind"`
	Value any    `json:"value"`
}

// ContainsString 判断 value 是否在 items 中(忽略首尾空白)。
func ContainsString(items []string, value string) bool {
	for _, item := range items {
		if strings.TrimSpace(item) == value {
			return true
		}
	}
	return false
}

// NormalizeBeaconCommandArgs 把原始 JSON 数组归一化为 BeaconCommandArg 列表。
func NormalizeBeaconCommandArgs(raw any) ([]BeaconCommandArg, error) {
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("args must be an array")
	}

	out := make([]BeaconCommandArg, 0, len(items))
	for _, item := range items {
		arg, err := NormalizeBeaconCommandArg(item)
		if err != nil {
			return nil, err
		}
		out = append(out, arg)
	}
	return out, nil
}

// NormalizeManifestCommandArgs 把 manifest 声明的 args 归一化为标准列表。
func NormalizeManifestCommandArgs(items []BeaconCommandArg) ([]BeaconCommandArg, error) {
	out := make([]BeaconCommandArg, 0, len(items))
	for _, item := range items {
		arg, err := NormalizeBeaconCommandArg(item)
		if err != nil {
			return nil, err
		}
		out = append(out, arg)
	}
	return out, nil
}

// NormalizeBeaconCommandArg 把单个原始值归一化为 BeaconCommandArg。
func NormalizeBeaconCommandArg(raw any) (BeaconCommandArg, error) {
	switch typed := raw.(type) {
	case BeaconCommandArg:
		return BuildBeaconCommandArg(typed.Kind, typed.Value)
	case map[string]any:
		kind := strings.ToLower(strings.TrimSpace(PickString(typed, "kind", "Kind")))
		value := typed["value"]
		if kind == "" {
			return InferBeaconCommandArg(value)
		}
		return BuildBeaconCommandArg(kind, value)
	case string, bool, float64, float32, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64, json.Number:
		return InferBeaconCommandArg(typed)
	default:
		return BeaconCommandArg{}, fmt.Errorf("unsupported arg type %T", raw)
	}
}

// InferBeaconCommandArg 按值的 Go 类型推断 BeaconCommandArg(无显式 kind 时)。
func InferBeaconCommandArg(value any) (BeaconCommandArg, error) {
	switch typed := value.(type) {
	case nil:
		return BeaconCommandArg{Kind: "string", Value: ""}, nil
	case bool:
		return BeaconCommandArg{Kind: "bool", Value: typed}, nil
	case float64, float32, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64, json.Number:
		n, err := ParseInt32Value(typed)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "int32", Value: n}, nil
	default:
		return BeaconCommandArg{Kind: "string", Value: StringifyValue(value)}, nil
	}
}

// BuildBeaconCommandArg 按 kind 构造 BeaconCommandArg。
func BuildBeaconCommandArg(kind string, value any) (BeaconCommandArg, error) {
	if IsBlankValue(value) {
		switch strings.ToLower(strings.TrimSpace(kind)) {
		case "bool", "boolean", "checkbox":
			return BeaconCommandArg{Kind: "bool", Value: false}, nil
		case "int8", "int32":
			return BeaconCommandArg{Kind: "int32", Value: int32(0)}, nil
		case "short", "int16":
			return BeaconCommandArg{Kind: "short", Value: int16(0)}, nil
		case "bytes":
			return BeaconCommandArg{Kind: "bytes", Value: ""}, nil
		case "int64":
			return BeaconCommandArg{Kind: "string", Value: ""}, nil
		default:
			return BeaconCommandArg{Kind: "string", Value: ""}, nil
		}
	}

	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "bool", "boolean", "checkbox":
		b, err := ParseBoolValue(value)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "bool", Value: b}, nil
	case "bytes":
		return BeaconCommandArg{Kind: "bytes", Value: StringifyValue(value)}, nil
	case "short", "int16":
		n, err := ParseInt16Value(value)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "short", Value: n}, nil
	case "int8", "int32":
		n, err := ParseInt32Value(value)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "int32", Value: n}, nil
	case "int64":
		return BeaconCommandArg{Kind: "string", Value: StringifyValue(value)}, nil
	case "string", "textarea", "input", "select", "":
		return BeaconCommandArg{Kind: "string", Value: StringifyValue(value)}, nil
	default:
		return BeaconCommandArg{}, fmt.Errorf("unsupported arg kind: %s", kind)
	}
}

// IsBlankValue 判断值是否为空(nil 或空白字符串)。
func IsBlankValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(typed) == ""
	default:
		return false
	}
}

// IsBoolFieldKind 判断 kind 是否为布尔类。
func IsBoolFieldKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "bool", "boolean", "checkbox":
		return true
	default:
		return false
	}
}

// IsInt32FieldKind 判断 kind 是否为 int32 类。
func IsInt32FieldKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "int8", "int32":
		return true
	default:
		return false
	}
}

// IsStringFieldKind 判断 kind 是否为字符串类。
func IsStringFieldKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "", "string", "textarea", "input", "select":
		return true
	default:
		return false
	}
}

// ParseBoolValue 把任意值解析为 bool。
func ParseBoolValue(value any) (bool, error) {
	switch typed := value.(type) {
	case bool:
		return typed, nil
	case string:
		switch strings.ToLower(strings.TrimSpace(typed)) {
		case "1", "true", "yes", "on":
			return true, nil
		case "0", "false", "no", "off", "":
			return false, nil
		default:
			return false, fmt.Errorf("invalid boolean value %q", typed)
		}
	case json.Number:
		n, err := typed.Int64()
		if err != nil {
			return false, err
		}
		return n != 0, nil
	default:
		n, err := ToInteger(value)
		if err != nil {
			return false, fmt.Errorf("invalid boolean value %T", value)
		}
		return n != 0, nil
	}
}

// ToInteger 把所有 Go 数值类型归一到 int64。
// 不处理 string / json.Number / bool(由各自调用方处理)。
func ToInteger(value any) (int64, error) {
	switch typed := value.(type) {
	case int:
		return int64(typed), nil
	case int8:
		return int64(typed), nil
	case int16:
		return int64(typed), nil
	case int32:
		return int64(typed), nil
	case int64:
		return typed, nil
	case uint:
		return int64(typed), nil
	case uint8:
		return int64(typed), nil
	case uint16:
		return int64(typed), nil
	case uint32:
		return int64(typed), nil
	case uint64:
		if typed > uint64(1<<63-1) {
			return 0, fmt.Errorf("invalid integer value %v", typed)
		}
		return int64(typed), nil
	case float32:
		if typed != float32(int64(typed)) {
			return 0, fmt.Errorf("invalid integer value %v", typed)
		}
		return int64(typed), nil
	case float64:
		if typed != float64(int64(typed)) {
			return 0, fmt.Errorf("invalid integer value %v", typed)
		}
		return int64(typed), nil
	default:
		return 0, fmt.Errorf("invalid integer value %T", value)
	}
}

// ParseInt32Value 把任意值解析为 int32(含范围校验)。
func ParseInt32Value(value any) (int32, error) {
	switch typed := value.(type) {
	case nil:
		return 0, fmt.Errorf("int32 value is required")
	case json.Number:
		n, err := typed.Int64()
		if err != nil {
			return 0, err
		}
		if n < MinInt32Value || n > MaxInt32Value {
			return 0, fmt.Errorf("invalid int32 value %v", n)
		}
		return int32(n), nil
	case string:
		text := strings.TrimSpace(typed)
		if text == "" {
			return 0, fmt.Errorf("int32 value is required")
		}
		n, err := strconv.ParseInt(text, 10, 32)
		if err != nil {
			return 0, err
		}
		return int32(n), nil
	default:
		n, err := ToInteger(value)
		if err != nil {
			return 0, fmt.Errorf("invalid int32 value %T", value)
		}
		if n < MinInt32Value || n > MaxInt32Value {
			return 0, fmt.Errorf("invalid int32 value %v", n)
		}
		return int32(n), nil
	}
}

// ParseInt16Value 把任意值解析为 int16(含范围校验)。
func ParseInt16Value(value any) (int16, error) {
	n, err := ParseInt32Value(value)
	if err != nil {
		return 0, err
	}
	if n < MinInt16Value || n > MaxInt16Value {
		return 0, fmt.Errorf("invalid short value %v", n)
	}
	return int16(n), nil
}

// PickString 从 map 中按多个候选 key 取首个非空字符串值。
func PickString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			if text := strings.TrimSpace(StringifyValue(value)); text != "" {
				return text
			}
		}
	}
	return ""
}

// PickInt 从 map 中按多个候选 key 取首个整数值。
func PickInt(values map[string]any, keys ...string) int {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			switch typed := value.(type) {
			case json.Number:
				if n, err := typed.Int64(); err == nil {
					return int(n)
				}
			case string:
				if n, err := strconv.Atoi(strings.TrimSpace(typed)); err == nil {
					return n
				}
			default:
				if n, err := ToInteger(value); err == nil {
					return int(n)
				}
			}
		}
	}
	return 0
}

// StringifyValue 把任意值转为字符串(支持 JSON 序列化复合类型)。
func StringifyValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case []byte:
		return string(typed)
	case fmt.Stringer:
		return typed.String()
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64, float32, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64:
		return fmt.Sprint(typed)
	case json.Number:
		return typed.String()
	case map[string]any, []any, []string:
		data, err := json.Marshal(typed)
		if err != nil {
			return fmt.Sprint(typed)
		}
		return string(data)
	default:
		return fmt.Sprint(typed)
	}
}
