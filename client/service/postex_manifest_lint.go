package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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

func validatePostExModuleManifest(root string, action PluginAction) error {
	actionID := strings.TrimSpace(action.ID)
	manifestPath := strings.TrimSpace(action.PostEx.Manifest)
	if manifestPath == "" {
		return nil
	}
	if err := validatePluginRelativeFile(root, manifestPath); err != nil {
		return fmt.Errorf("invalid postex module manifest for plugin action %s: %w", actionID, err)
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	manifestAbs, err := filepath.Abs(filepath.Join(rootAbs, manifestPath))
	if err != nil {
		return err
	}
	data, err := os.ReadFile(manifestAbs)
	if err != nil {
		return fmt.Errorf("read postex module manifest for plugin action %s failed: %w", actionID, err)
	}

	var manifest postExModuleManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return fmt.Errorf("parse postex module manifest for plugin action %s failed: %w", actionID, err)
	}
	if err := lintPostExModuleManifest(manifest); err != nil {
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
	if !containsString(manifest.Execution.Backends, backend) {
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
		if !containsString(manifest.Module.Arch, arch) {
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
