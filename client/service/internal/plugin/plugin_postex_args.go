package plugin

import (
	"fmt"
	"strings"

	"irisclient/service/internal/args"
)

func buildPluginArgs(action PluginAction, payload map[string]any) ([]args.BeaconCommandArg, error) {
	if rawArgs, ok := payload["args"]; ok {
		return args.NormalizeBeaconCommandArgs(rawArgs)
	}
	if len(action.Args) > 0 {
		return args.NormalizeManifestCommandArgs(action.Args)
	}

	values := map[string]any{}
	if rawValues, ok := payload["values"]; ok {
		if typed, ok := rawValues.(map[string]any); ok {
			values = typed
		}
	}

	cmdArgs := make([]args.BeaconCommandArg, 0, len(action.Fields))
	for _, field := range action.Fields {
		key := strings.TrimSpace(field.Name)
		if key == "" {
			continue
		}

		value, ok := values[key]
		if !ok || args.IsBlankValue(value) {
			value = field.Default
		}

		arg, err := args.BuildBeaconCommandArg(field.Type, value)
		if err != nil {
			return nil, fmt.Errorf("invalid value for %s: %w", key, err)
		}
		cmdArgs = append(cmdArgs, arg)
	}
	return cmdArgs, nil
}

func buildPostExPluginArgs(action PluginAction, payload map[string]any) ([]args.BeaconCommandArg, error) {
	targetOS := normalizePluginOS(args.PickString(payload, "beacon_os"))
	if targetOS == "" {
		return nil, fmt.Errorf("beacon_os is required for postex plugin action %s", action.ID)
	}
	if targetOS != "windows" {
		return nil, fmt.Errorf("postex plugin action %s does not support os %s", action.ID, targetOS)
	}
	if err := validateActionTarget(action, payload); err != nil {
		return nil, err
	}
	if action.PostEx == nil {
		return nil, fmt.Errorf("postex config is required for plugin action %s", action.ID)
	}

	mode := normalizePostExMode(action.PostEx.Mode)
	if mode == "" {
		return nil, fmt.Errorf("postex mode is required for plugin action %s", action.ID)
	}

	dllData, err := resolvePostExDLLData(action, payload)
	if err != nil {
		return nil, err
	}

	values := payloadValues(payload)
	waitMS, err := resolvePostExWaitMS(action, payload, values)
	if err != nil {
		return nil, err
	}
	maxRuntimeMS, err := resolvePostExNonNegativeMS(action, payload, values, "max_runtime_ms", action.PostEx.MaxRuntimeMS)
	if err != nil {
		return nil, err
	}
	idleTimeoutMS, err := resolvePostExNonNegativeMS(action, payload, values, "idle_timeout_ms", action.PostEx.IdleTimeoutMS)
	if err != nil {
		return nil, err
	}
	description := resolvePostExDescription(action, payload, values)
	moduleArgs, err := buildPostExModuleArgs(action, payload, values)
	if err != nil {
		return nil, err
	}

	switch mode {
	case "spawn-dll":
		spawnPath := resolvePostExStringValue(action, payload, values, "spawn_path", "spawn_path", resolvePostExSpawnPathFallback(action, payload))
		if strings.TrimSpace(spawnPath) == "" {
			return nil, fmt.Errorf("spawn_path is required for plugin action %s", action.ID)
		}
		spawnArgs := resolvePostExStringValue(action, payload, values, "spawn_args", "spawn_args", action.PostEx.SpawnArgs)
		return []args.BeaconCommandArg{
			{Kind: "int32", Value: int32(postExSpawnDLLSubcommand)},
			{Kind: "int32", Value: int32(waitMS)},
			{Kind: "int32", Value: int32(maxRuntimeMS)},
			{Kind: "int32", Value: int32(idleTimeoutMS)},
			{Kind: "string", Value: description},
			{Kind: "string", Value: moduleArgs},
			{Kind: "string", Value: spawnPath},
			{Kind: "string", Value: spawnArgs},
			{Kind: "bytes", Value: dllData},
		}, nil
	case "inject-dll":
		pidValue, ok := resolvePostExControlValue(action, payload, values, "target_pid", "pid")
		if !ok || args.IsBlankValue(pidValue) {
			return nil, fmt.Errorf("target_pid is required for plugin action %s", action.ID)
		}
		pid, err := args.ParseInt32Value(pidValue)
		if err != nil || pid <= 0 {
			return nil, fmt.Errorf("target_pid must be a positive int32 for plugin action %s", action.ID)
		}
		return []args.BeaconCommandArg{
			{Kind: "int32", Value: int32(postExInjectDLLSubcommand)},
			{Kind: "int32", Value: int32(waitMS)},
			{Kind: "int32", Value: int32(maxRuntimeMS)},
			{Kind: "int32", Value: int32(idleTimeoutMS)},
			{Kind: "string", Value: description},
			{Kind: "string", Value: moduleArgs},
			{Kind: "int32", Value: pid},
			{Kind: "bytes", Value: dllData},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported postex mode for plugin action %s: %s", action.ID, action.PostEx.Mode)
	}
}

func resolvePostExSpawnPathFallback(action PluginAction, payload map[string]any) string {
	if action.PostEx == nil {
		return ""
	}

	targetArch := normalizePluginArch(args.PickString(payload, "beacon_arch"))
	if targetArch != "" && len(action.PostEx.SpawnPathByArch) > 0 {
		if value := strings.TrimSpace(action.PostEx.SpawnPathByArch[targetArch]); value != "" {
			return value
		}
	}
	return action.PostEx.SpawnPath
}

// resolvePostExDLLData 解析 PostEx 动作要投递的 DLL base64 数据。
//
// 解析顺序(优先级从高到低):
//  1. 已 hydrate 的 DLLDataByArch[arch](加载时读好的内存数据)
//  2. 按 arch 路径 DLLByArch[arch] 现读(回退路径,极少触发)
//  3. 已 hydrate 的单 DLLData
//  4. 单 DLL 路径现读
//  5. 全部失败 → 报错
//
// 注意:第 2 步若 arch 路径存在但现读返回空(空文件),会回退到单 DLL,
// 与历史行为一致;只有 arch 路径为空且单 DLL 也为空时才报 "arch not available"。
func resolvePostExDLLData(action PluginAction, payload map[string]any) (string, error) {
	if action.PostEx == nil {
		return "", fmt.Errorf("postex config is required for plugin action %s", action.ID)
	}
	postex := action.PostEx
	root := action.PluginRoot
	targetArch := normalizePluginArch(args.PickString(payload, "beacon_arch"))

	// 1. 已 hydrate 的 arch 数据
	if targetArch != "" && len(postex.DLLDataByArch) > 0 {
		if data := strings.TrimSpace(postex.DLLDataByArch[targetArch]); data != "" {
			return data, nil
		}
	}

	// 2. 按 arch 路径现读
	if targetArch != "" && len(postex.DLLByArch) > 0 {
		dllPath := strings.TrimSpace(postex.DLLByArch[targetArch])
		if dllPath != "" {
			data, err := readPluginFileBase64(root, dllPath)
			if err != nil {
				return "", fmt.Errorf("read postex dll for plugin action %s failed: %w", action.ID, err)
			}
			if data != "" {
				return data, nil
			}
			// err==nil 但 data==""(空文件):回退到单 DLL,与历史行为一致
		} else if strings.TrimSpace(postex.DLL) == "" {
			// arch 路径为空且无单 DLL 回退:arch 不可用
			return "", fmt.Errorf("postex dll for arch %s is not available for plugin action %s", targetArch, action.ID)
		}
	}

	// 3. 已 hydrate 的单 DLL 数据
	if data := strings.TrimSpace(postex.DLLData); data != "" {
		return data, nil
	}

	// 4. 单 DLL 路径现读
	if dllPath := strings.TrimSpace(postex.DLL); dllPath != "" {
		data, err := readPluginFileBase64(root, dllPath)
		if err != nil {
			return "", fmt.Errorf("read postex dll for plugin action %s failed: %w", action.ID, err)
		}
		if data != "" {
			return data, nil
		}
	}

	// 5. 全部失败
	return "", fmt.Errorf("postex dll data is required for plugin action %s", action.ID)
}

func buildPostExModuleArgs(action PluginAction, payload map[string]any, values map[string]any) (string, error) {
	if action.PostEx == nil {
		return "", nil
	}

	parts := splitStaticPostExModuleArgs(action.PostEx.ModuleArgs)
	for _, field := range action.Fields {
		flag := strings.TrimSpace(field.PostExArg)
		if flag == "" {
			continue
		}

		value := resolveFieldValue(field, values, payload)
		if args.IsBoolFieldKind(field.Type) {
			enabled, err := args.ParseBoolValue(value)
			if err != nil {
				return "", fmt.Errorf("invalid value for %s: %w", field.Name, err)
			}
			if enabled {
				parts = append(parts, flag)
			}
			continue
		}

		arg, err := args.BuildBeaconCommandArg(field.Type, value)
		if err != nil {
			return "", fmt.Errorf("invalid value for %s: %w", field.Name, err)
		}
		parts = append(parts, flag, quotePostExModuleArg(args.StringifyValue(arg.Value)))
	}
	return strings.Join(parts, " "), nil
}

func resolvePostExWaitMS(action PluginAction, payload map[string]any, values map[string]any) (int, error) {
	defaultWait := action.PostEx.WaitMS
	if defaultWait <= 0 {
		defaultWait = defaultPostExWaitMS
	}

	value, ok := resolvePostExControlValue(action, payload, values, "wait_ms", "wait_ms")
	if !ok || args.IsBlankValue(value) {
		return defaultWait, nil
	}
	waitMS, err := args.ParseInt32Value(value)
	if err != nil || waitMS <= 0 {
		return 0, fmt.Errorf("wait_ms must be a positive int32 for plugin action %s", action.ID)
	}
	return int(waitMS), nil
}

func resolvePostExNonNegativeMS(action PluginAction, payload map[string]any, values map[string]any, name string, fallback int) (int, error) {
	value, ok := resolvePostExControlValue(action, payload, values, name, name)
	if !ok || args.IsBlankValue(value) {
		if fallback < 0 {
			return 0, fmt.Errorf("%s must be a non-negative int32 for plugin action %s", name, action.ID)
		}
		return fallback, nil
	}
	ms, err := args.ParseInt32Value(value)
	if err != nil || ms < 0 {
		return 0, fmt.Errorf("%s must be a non-negative int32 for plugin action %s", name, action.ID)
	}
	return int(ms), nil
}

func resolvePostExDescription(action PluginAction, payload map[string]any, values map[string]any) string {
	description := action.PostEx.Description
	if description == "" {
		description = action.Description.Text()
	}
	if description == "" {
		description = "postex"
	}
	return resolvePostExStringValue(action, payload, values, "description", "description", description)
}

func resolvePostExStringValue(action PluginAction, payload map[string]any, values map[string]any, role, payloadKey, fallback string) string {
	value, ok := resolvePostExControlValue(action, payload, values, role, payloadKey)
	if !ok || args.IsBlankValue(value) {
		return strings.TrimSpace(fallback)
	}
	return strings.TrimSpace(args.StringifyValue(value))
}

func resolvePostExControlValue(action PluginAction, payload map[string]any, values map[string]any, role, fallbackName string) (any, bool) {
	if payloadValue, ok := payload[fallbackName]; ok {
		return payloadValue, true
	}
	for _, field := range action.Fields {
		fieldRole := strings.TrimSpace(strings.ToLower(field.Role))
		fieldName := strings.TrimSpace(field.Name)
		if fieldRole != role && fieldName != fallbackName {
			continue
		}
		return resolveFieldValue(field, values, payload), true
	}
	return nil, false
}

func resolveFieldValue(field PluginActionField, values map[string]any, payload map[string]any) any {
	key := strings.TrimSpace(field.Name)
	if key != "" {
		if value, ok := values[key]; ok && !args.IsBlankValue(value) {
			return value
		}
	}
	targetArch := normalizePluginArch(args.PickString(payload, "beacon_arch"))
	if targetArch != "" && len(field.DefaultByArch) > 0 {
		if value, ok := field.DefaultByArch[targetArch]; ok && !args.IsBlankValue(value) {
			return value
		}
	}
	return field.Default
}

func payloadValues(payload map[string]any) map[string]any {
	values := map[string]any{}
	if rawValues, ok := payload["values"]; ok {
		if typed, ok := rawValues.(map[string]any); ok {
			values = typed
		}
	}
	return values
}

func resolveActionArtifactData(action PluginAction, payload map[string]any) (string, bool, error) {
	if err := validateActionTarget(action, payload); err != nil {
		return "", false, err
	}

	targetArch := normalizePluginArch(args.PickString(payload, "beacon_arch"))
	if targetArch != "" && len(action.ArtifactDataByArch) > 0 {
		if data := strings.TrimSpace(action.ArtifactDataByArch[targetArch]); data != "" {
			return data, true, nil
		}
		if strings.TrimSpace(action.Artifact) == "" {
			return "", true, fmt.Errorf("artifact for arch %s is not available for plugin action %s", targetArch, action.ID)
		}
	}

	if data := strings.TrimSpace(action.ArtifactData); data != "" {
		return data, true, nil
	}

	if explicit := args.PickString(payload, "artifact_data"); explicit != "" && !actionHasArtifact(action) {
		return explicit, true, nil
	}

	if actionHasArtifact(action) {
		return "", true, fmt.Errorf("artifact data is required for plugin action %s", action.ID)
	}
	return "", false, nil
}

func validateActionTarget(action PluginAction, payload map[string]any) error {
	targetOS := normalizePluginOS(args.PickString(payload, "beacon_os"))
	if len(action.OS) > 0 {
		if targetOS == "" {
			return fmt.Errorf("beacon_os is required for plugin action %s", action.ID)
		}
		if !args.ContainsString(action.OS, targetOS) {
			return fmt.Errorf("plugin action %s does not support os %s", action.ID, targetOS)
		}
	}

	targetArch := normalizePluginArch(args.PickString(payload, "beacon_arch"))
	if len(action.Arch) > 0 {
		if targetArch == "" {
			return fmt.Errorf("beacon_arch is required for plugin action %s", action.ID)
		}
		if !args.ContainsString(action.Arch, targetArch) {
			return fmt.Errorf("plugin action %s does not support arch %s", action.ID, targetArch)
		}
	}

	return nil
}

func actionHasArtifact(action PluginAction) bool {
	return strings.TrimSpace(action.Artifact) != "" || len(action.ArtifactByArch) > 0
}

func splitStaticPostExModuleArgs(moduleArgs string) []string {
	text := strings.TrimSpace(moduleArgs)
	if text == "" {
		return nil
	}
	return []string{text}
}

func quotePostExModuleArg(value string) string {
	if value == "" {
		return `""`
	}
	if !strings.ContainsAny(value, " \t\r\n\"") {
		return value
	}
	return `"` + strings.ReplaceAll(value, `"`, `\"`) + `"`
}
