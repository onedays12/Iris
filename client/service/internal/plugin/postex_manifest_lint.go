package plugin

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"irisclient/service/internal/args"
)

type postExModuleManifest struct {
	Schema      string                        `json:"schema"`
	Name        string                        `json:"name"`
	DisplayName string                        `json:"display_name"`
	Version     string                        `json:"version"`
	Description string                        `json:"description"`
	Module      postExModuleManifestModule    `json:"module"`
	Execution   postExModuleManifestExecution `json:"execution"`
	Args        []postExModuleManifestArg     `json:"args"`
	Outputs     []postExModuleManifestOutput  `json:"outputs"`
}

type postExModuleManifestModule struct {
	ABI    string            `json:"abi"`
	Format string            `json:"format"`
	Entry  string            `json:"entry"`
	Arch   []string          `json:"arch"`
	Files  map[string]string `json:"files"`
}

type postExModuleManifestExecution struct {
	TargetModes           []string `json:"target_modes"`
	RecommendedTargetMode string   `json:"recommended_target_mode"`
	Backends              []string `json:"backends"`
	RecommendedBackend    string   `json:"recommended_backend"`
	Transport             string   `json:"transport"`
	DefaultWaitMS         int      `json:"default_wait_ms"`
	SupportsCancel        bool     `json:"supports_cancel"`
}

type postExModuleManifestArg struct {
	Name        string   `json:"name"`
	Flag        string   `json:"flag"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Default     any      `json:"default"`
	Min         *int     `json:"min,omitempty"`
	Max         *int     `json:"max,omitempty"`
	Choices     []string `json:"choices,omitempty"`
	Description string   `json:"description"`
}

type postExModuleManifestOutput struct {
	Type   string   `json:"type"`
	Format string   `json:"format,omitempty"`
	MIME   []string `json:"mime,omitempty"`
}

// loadPostExModuleManifest 读取并校验 module manifest(beacon.postex.module/v1)。
// 供 validatePostExModuleManifest 与 derivePostExFromModule 共用。
func loadPostExModuleManifest(root, manifestPath string) (postExModuleManifest, error) {
	if err := validatePluginRelativeFile(root, manifestPath); err != nil {
		return postExModuleManifest{}, fmt.Errorf("invalid postex module manifest: %w", err)
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return postExModuleManifest{}, err
	}
	manifestAbs, err := filepath.Abs(filepath.Join(rootAbs, manifestPath))
	if err != nil {
		return postExModuleManifest{}, err
	}
	data, err := os.ReadFile(manifestAbs)
	if err != nil {
		return postExModuleManifest{}, fmt.Errorf("read postex module manifest failed: %w", err)
	}

	var manifest postExModuleManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return postExModuleManifest{}, fmt.Errorf("parse postex module manifest failed: %w", err)
	}
	if err := lintPostExModuleManifest(manifest); err != nil {
		return postExModuleManifest{}, fmt.Errorf("invalid postex module manifest: %w", err)
	}
	return manifest, nil
}

func validatePostExModuleManifest(root string, action PluginAction) error {
	actionID := strings.TrimSpace(action.ID)
	manifestPath := strings.TrimSpace(action.PostEx.Manifest)
	if manifestPath == "" {
		return nil
	}

	manifest, err := loadPostExModuleManifest(root, manifestPath)
	if err != nil {
		return fmt.Errorf("invalid postex module manifest for plugin action %s: %w", actionID, err)
	}
	if err := validatePostExManifestMatchesAction(action, manifest); err != nil {
		return fmt.Errorf("postex module manifest mismatch for plugin action %s: %w", actionID, err)
	}
	return nil
}

func lintPostExModuleManifest(manifest postExModuleManifest) error {
	if strings.TrimSpace(manifest.Schema) != "beacon.postex.module/v1" {
		return fmt.Errorf("schema must be beacon.postex.module/v1")
	}
	if strings.TrimSpace(manifest.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if strings.TrimSpace(manifest.Version) == "" {
		return fmt.Errorf("version is required")
	}
	if strings.TrimSpace(manifest.Module.ABI) != "postex/2.1" {
		return fmt.Errorf("module.abi must be postex/2.1")
	}
	if strings.TrimSpace(manifest.Module.Format) != "reflective-dll" {
		return fmt.Errorf("module.format must be reflective-dll")
	}
	if strings.TrimSpace(manifest.Module.Entry) != "REFLoader" {
		return fmt.Errorf("module.entry must be REFLoader")
	}
	if len(manifest.Module.Arch) == 0 {
		return fmt.Errorf("module.arch is required")
	}
	for _, arch := range manifest.Module.Arch {
		if !isSupportedPostExModuleArch(arch) {
			return fmt.Errorf("unsupported module arch %s", arch)
		}
	}
	if len(manifest.Module.Files) == 0 {
		return fmt.Errorf("module.files is required")
	}
	for arch, file := range manifest.Module.Files {
		if !isSupportedPostExModuleArch(arch) {
			return fmt.Errorf("unsupported module file arch %s", arch)
		}
		if strings.TrimSpace(file) == "" {
			return fmt.Errorf("module.files.%s is required", arch)
		}
	}

	if len(manifest.Execution.TargetModes) == 0 {
		return fmt.Errorf("execution.target_modes is required")
	}
	for _, mode := range manifest.Execution.TargetModes {
		if normalizePostExMode(mode) != "spawn-dll" && normalizePostExMode(mode) != "inject-dll" {
			return fmt.Errorf("unsupported execution target mode %s", mode)
		}
	}
	if normalizePostExMode(manifest.Execution.RecommendedTargetMode) != "" &&
		!containsNormalizedPostExMode(manifest.Execution.TargetModes, manifest.Execution.RecommendedTargetMode) {
		return fmt.Errorf("execution.recommended_target_mode must be in target_modes")
	}
	if len(manifest.Execution.Backends) == 0 {
		return fmt.Errorf("execution.backends is required")
	}
	for _, backend := range manifest.Execution.Backends {
		if strings.TrimSpace(backend) != postExBackendRemoteThread {
			return fmt.Errorf("unsupported execution backend %s", backend)
		}
	}
	if strings.TrimSpace(manifest.Execution.RecommendedBackend) != "" &&
		strings.TrimSpace(manifest.Execution.RecommendedBackend) != postExBackendRemoteThread {
		return fmt.Errorf("execution.recommended_backend must be remote-thread")
	}
	if strings.TrimSpace(manifest.Execution.Transport) != "named-pipe" {
		return fmt.Errorf("execution.transport must be named-pipe")
	}
	if manifest.Execution.DefaultWaitMS <= 0 {
		return fmt.Errorf("execution.default_wait_ms must be positive")
	}

	for _, arg := range manifest.Args {
		if strings.TrimSpace(arg.Name) == "" {
			return fmt.Errorf("arg.name is required")
		}
		if !isPostExArgFlag(arg.Flag) {
			return fmt.Errorf("invalid arg flag %q", arg.Flag)
		}
		switch strings.TrimSpace(arg.Type) {
		case "string", "int", "bool":
		case "enum":
			if len(arg.Choices) == 0 {
				return fmt.Errorf("enum arg %s requires choices", arg.Name)
			}
		default:
			return fmt.Errorf("unsupported arg type %s", arg.Type)
		}
		if arg.Min != nil && arg.Max != nil && *arg.Min > *arg.Max {
			return fmt.Errorf("arg %s has min greater than max", arg.Name)
		}
	}

	if len(manifest.Outputs) == 0 {
		return fmt.Errorf("outputs is required")
	}
	for _, output := range manifest.Outputs {
		if !isSupportedPostExManifestOutput(output.Type) {
			return fmt.Errorf("unsupported output type %s", output.Type)
		}
	}
	return nil
}

func validatePostExManifestMatchesAction(action PluginAction, manifest postExModuleManifest) error {
	mode := normalizePostExMode(action.PostEx.Mode)
	if mode != "" && !containsNormalizedPostExMode(manifest.Execution.TargetModes, mode) {
		return fmt.Errorf("execution.target_modes does not include %s", mode)
	}

	backend := strings.TrimSpace(action.PostEx.Backend)
	if backend == "" {
		backend = postExBackendRemoteThread
	}
	if !args.ContainsString(manifest.Execution.Backends, backend) {
		return fmt.Errorf("execution.backends does not include %s", backend)
	}

	requiredArch := map[string]bool{}
	for _, arch := range action.Arch {
		if normalized := normalizePluginArch(arch); normalized != "" {
			requiredArch[postExModuleArchFromPluginArch(normalized)] = true
		}
	}
	for arch := range action.PostEx.DLLByArch {
		if normalized := normalizePluginArch(arch); normalized != "" {
			requiredArch[postExModuleArchFromPluginArch(normalized)] = true
		}
	}
	for arch := range requiredArch {
		if arch == "" {
			continue
		}
		if !args.ContainsString(manifest.Module.Arch, arch) {
			return fmt.Errorf("module.arch does not declare arch %s", arch)
		}
	}
	return nil
}

func isSupportedPostExModuleArch(arch string) bool {
	switch strings.TrimSpace(arch) {
	case "x64", "x86":
		return true
	default:
		return false
	}
}

func postExModuleArchFromPluginArch(arch string) string {
	switch normalizePluginArch(arch) {
	case "amd64":
		return "x64"
	case "x86":
		return "x86"
	default:
		return ""
	}
}

func containsNormalizedPostExMode(items []string, value string) bool {
	target := normalizePostExMode(value)
	for _, item := range items {
		if normalizePostExMode(item) == target {
			return true
		}
	}
	return false
}

func isSupportedPostExManifestOutput(outputType string) bool {
	switch strings.TrimSpace(outputType) {
	case "metadata", "progress", "text", "artifact", "error", "done":
		return true
	default:
		return false
	}
}

// ─── postex plugin action 校验 ───

func validatePostExPluginAction(root string, action PluginAction) error {
	actionID := strings.TrimSpace(action.ID)
	if actionID == "" {
		actionID = "postex"
	}
	if action.PostEx == nil {
		return fmt.Errorf("postex config is required for plugin action %s", actionID)
	}
	if action.CommandID != 0 && action.CommandID != defaultPostExCommandID {
		return fmt.Errorf("postex plugin action %s must use command_id %d", actionID, defaultPostExCommandID)
	}
	if len(action.OS) > 0 && !args.ContainsString(action.OS, "windows") {
		return fmt.Errorf("postex plugin action %s must support os windows", actionID)
	}
	for _, arch := range action.Arch {
		if !isSupportedPostExArch(arch) {
			return fmt.Errorf("postex plugin action %s has unsupported arch %s", actionID, arch)
		}
	}

	mode := normalizePostExMode(action.PostEx.Mode)
	if mode != "spawn-dll" && mode != "inject-dll" {
		return fmt.Errorf("unsupported postex mode for plugin action %s: %s", actionID, action.PostEx.Mode)
	}
	backend := strings.TrimSpace(action.PostEx.Backend)
	if backend != "" && backend != postExBackendRemoteThread {
		return fmt.Errorf("unsupported postex backend for plugin action %s: %s", actionID, backend)
	}
	if action.PostEx.WaitMS <= 0 {
		return fmt.Errorf("postex wait_ms must be positive for plugin action %s", actionID)
	}
	if action.PostEx.MaxRuntimeMS < 0 {
		return fmt.Errorf("postex max_runtime_ms must be non-negative for plugin action %s", actionID)
	}
	if action.PostEx.IdleTimeoutMS < 0 {
		return fmt.Errorf("postex idle_timeout_ms must be non-negative for plugin action %s", actionID)
	}
	if err := validatePostExDLLPaths(root, action); err != nil {
		return err
	}
	if err := validatePostExModuleManifest(root, action); err != nil {
		return err
	}
	if err := validatePostExFields(action); err != nil {
		return err
	}

	switch mode {
	case "spawn-dll":
		if strings.TrimSpace(action.PostEx.SpawnPath) == "" &&
			len(action.PostEx.SpawnPathByArch) == 0 &&
			!hasPostExRoleField(action, "spawn_path") {
			return fmt.Errorf("spawn_path is required for plugin action %s", actionID)
		}
	case "inject-dll":
		if !hasPostExRoleField(action, "target_pid") {
			return fmt.Errorf("target_pid field is required for plugin action %s", actionID)
		}
	}
	return nil
}

func validatePostExDLLPaths(root string, action PluginAction) error {
	actionID := strings.TrimSpace(action.ID)
	hasDLL := strings.TrimSpace(action.PostEx.DLL) != ""
	hasDLLByArch := len(action.PostEx.DLLByArch) > 0
	if !hasDLL && !hasDLLByArch {
		return fmt.Errorf("postex dll or dll_by_arch is required for plugin action %s", actionID)
	}
	if hasDLL {
		if err := validatePluginRelativeFile(root, action.PostEx.DLL); err != nil {
			return fmt.Errorf("invalid postex dll for plugin action %s: %w", actionID, err)
		}
	}
	for arch, dll := range action.PostEx.DLLByArch {
		if !isSupportedPostExArch(arch) {
			return fmt.Errorf("postex plugin action %s has unsupported dll_by_arch key %s", actionID, arch)
		}
		if err := validatePluginRelativeFile(root, dll); err != nil {
			return fmt.Errorf("invalid postex dll for arch %s in plugin action %s: %w", arch, actionID, err)
		}
	}
	return nil
}

func validatePostExFields(action PluginAction) error {
	actionID := strings.TrimSpace(action.ID)
	for _, field := range action.Fields {
		role := strings.ToLower(strings.TrimSpace(field.Role))
		if role != "" && !isSupportedPostExRole(role) {
			return fmt.Errorf("unsupported postex field role %s in plugin action %s", role, actionID)
		}
		if field.PostExArg != "" && !isPostExArgFlag(field.PostExArg) {
			return fmt.Errorf("invalid postex_arg %q in plugin action %s", field.PostExArg, actionID)
		}
		switch role {
		case "wait_ms", "max_runtime_ms", "idle_timeout_ms", "target_pid":
			if !args.IsInt32FieldKind(field.Type) {
				return fmt.Errorf("postex field %s must use int32 type in plugin action %s", field.Name, actionID)
			}
		case "spawn_path", "spawn_args", "description":
			if !args.IsStringFieldKind(field.Type) {
				return fmt.Errorf("postex field %s must use string type in plugin action %s", field.Name, actionID)
			}
		}
	}
	return nil
}

func hasPostExRoleField(action PluginAction, role string) bool {
	for _, field := range action.Fields {
		fieldRole := strings.ToLower(strings.TrimSpace(field.Role))
		if fieldRole == role {
			return true
		}
	}
	return false
}

func isSupportedPostExRole(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "target_pid", "wait_ms", "max_runtime_ms", "idle_timeout_ms",
		"description", "spawn_path", "spawn_args":
		return true
	default:
		return false
	}
}

func isPostExArgFlag(value string) bool {
	text := strings.TrimSpace(value)
	return strings.HasPrefix(text, "-") && !strings.ContainsAny(text, " \t\r\n")
}

// validatePluginManifest 校验插件 manifest 中所有 PostEx 动作的 manifest 完整性。
// 非 PostEx 动作跳过(只有 PostEx 需要 manifest 校验)。
// 合并自 plugin_validate.go(该文件仅含两个 PostEx 校验辅助函数,无独立职责)。
func validatePluginManifest(root string, manifest PluginManifest) error {
	for _, action := range manifest.Actions {
		if normalizePluginActionKind(action.Kind) != "postex" {
			continue
		}
		if err := validatePostExPluginAction(root, action); err != nil {
			return err
		}
	}
	return nil
}

// isSupportedPostExArch 返回 PostEx DLL 当前支持的架构(amd64/x86)。
// 合并自 plugin_validate.go。
func isSupportedPostExArch(arch string) bool {
	switch normalizePluginArch(arch) {
	case "amd64", "x86":
		return true
	default:
		return false
	}
}
