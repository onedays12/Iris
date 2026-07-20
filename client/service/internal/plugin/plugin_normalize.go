package plugin

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"irisclient/service/internal/args"
)

func normalizePluginActionKind(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	if text == "" {
		return "bof"
	}
	return text
}

func normalizePostExMode(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	switch text {
	case "spawn", "spawn_dll", "spawn-dll":
		return "spawn-dll"
	case "inject", "inject_dll", "inject-dll":
		return "inject-dll"
	default:
		return text
	}
}

func normalizePluginOS(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	switch text {
	case "win", "windows":
		return "windows"
	case "linux":
		return "linux"
	case "mac", "macos", "osx", "darwin":
		return "darwin"
	default:
		return text
	}
}

func normalizePluginArch(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	switch text {
	case "x64", "x86_64", "amd64":
		return "amd64"
	case "x86", "i386", "386":
		return "x86"
	default:
		return text
	}
}

func normalizePluginOSList(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		normalized := normalizePluginOS(value)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		out = append(out, normalized)
	}
	return out
}

func normalizePluginArchList(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		normalized := normalizePluginArch(value)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		out = append(out, normalized)
	}
	return out
}

func normalizeArtifactByArch(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := map[string]string{}
	for key, value := range values {
		arch := normalizePluginArch(key)
		artifact := strings.TrimSpace(value)
		if arch == "" || artifact == "" {
			continue
		}
		out[arch] = artifact
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeStringByArch(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := map[string]string{}
	for key, value := range values {
		arch := normalizePluginArch(key)
		text := strings.TrimSpace(value)
		if arch == "" || text == "" {
			continue
		}
		out[arch] = text
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeAnyByArch(values map[string]any) map[string]any {
	if len(values) == 0 {
		return nil
	}
	out := map[string]any{}
	for key, value := range values {
		arch := normalizePluginArch(key)
		if arch == "" || args.IsBlankValue(value) {
			continue
		}
		out[arch] = value
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// hydrateArtifactBase64 读取插件内单个 artifact 文件并返回 base64。
// 与 pluginfs.readPluginFileBase64 的区别:本函数用于 hydrate 阶段,
// 读失败时静默返回空串(不阻塞加载,坏文件由下游 resolvePostExDLLData 重读报错)。
// 路径逃逸插件根时同样静默返回空串。
func hydrateArtifactBase64(rootAbs, relPath string) string {
	if strings.TrimSpace(relPath) == "" {
		return ""
	}
	artifactPath := filepath.Join(rootAbs, relPath)
	artifactAbs, err := filepath.Abs(artifactPath)
	if err != nil || !isWithinDir(rootAbs, artifactAbs) {
		return ""
	}
	data, err := os.ReadFile(artifactAbs)
	if err != nil || len(data) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

// hydrateArtifactBase64ByArch 按 arch→相对路径映射读取多个文件,返回 arch→base64。
// 单个 arch 读失败不影响其他 arch(静默跳过)。
func hydrateArtifactBase64ByArch(rootAbs string, byArch map[string]string) map[string]string {
	if len(byArch) == 0 {
		return nil
	}
	out := map[string]string{}
	for arch, relPath := range byArch {
		if data := hydrateArtifactBase64(rootAbs, relPath); data != "" {
			out[arch] = data
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func hydratePluginActions(root string, actions []PluginAction) []PluginAction {
	if len(actions) == 0 {
		return []PluginAction{}
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		rootAbs = root
	}

	out := make([]PluginAction, 0, len(actions))
	for _, action := range actions {
		cloned := action
		cloned.PluginRoot = rootAbs
		if strings.TrimSpace(cloned.Kind) == "" && cloned.PostEx != nil {
			cloned.Kind = "postex"
		} else {
			cloned.Kind = normalizePluginActionKind(cloned.Kind)
		}
		cloned.ArtifactByArch = normalizeArtifactByArch(cloned.ArtifactByArch)
		cloned.ArtifactData = hydrateArtifactBase64(rootAbs, cloned.Artifact)
		cloned.ArtifactDataByArch = hydrateArtifactBase64ByArch(rootAbs, cloned.ArtifactByArch)
		if cloned.PostEx != nil {
			postex := *cloned.PostEx
			postex.Mode = normalizePostExMode(postex.Mode)
			postex.DLLByArch = normalizeArtifactByArch(postex.DLLByArch)
			postex.SpawnPathByArch = normalizeStringByArch(postex.SpawnPathByArch)
			postex.Manifest = strings.TrimSpace(postex.Manifest)
			postex.DLLData = hydrateArtifactBase64(rootAbs, postex.DLL)
			postex.DLLDataByArch = hydrateArtifactBase64ByArch(rootAbs, postex.DLLByArch)
			cloned.PostEx = &postex
		}
		out = append(out, cloned)
	}
	return out
}

func normalizePluginActionFields(actions []PluginAction) error {
	for actionIndex := range actions {
		if strings.TrimSpace(actions[actionIndex].Kind) == "" && actions[actionIndex].PostEx != nil {
			actions[actionIndex].Kind = "postex"
		} else {
			actions[actionIndex].Kind = normalizePluginActionKind(actions[actionIndex].Kind)
		}
		actions[actionIndex].OS = normalizePluginOSList(actions[actionIndex].OS)
		actions[actionIndex].Arch = normalizePluginArchList(actions[actionIndex].Arch)
		actions[actionIndex].ArtifactByArch = normalizeArtifactByArch(actions[actionIndex].ArtifactByArch)
		if actions[actionIndex].PostEx != nil {
			actions[actionIndex].PostEx.Mode = normalizePostExMode(actions[actionIndex].PostEx.Mode)
			actions[actionIndex].PostEx.DLLByArch = normalizeArtifactByArch(actions[actionIndex].PostEx.DLLByArch)
			actions[actionIndex].PostEx.SpawnPathByArch = normalizeStringByArch(actions[actionIndex].PostEx.SpawnPathByArch)
			actions[actionIndex].PostEx.Backend = strings.TrimSpace(actions[actionIndex].PostEx.Backend)
			actions[actionIndex].PostEx.Manifest = strings.TrimSpace(actions[actionIndex].PostEx.Manifest)
		}

		actionID := strings.TrimSpace(actions[actionIndex].ID)
		if actionID == "" {
			actionID = fmt.Sprintf("#%d", actionIndex+1)
		}

		for fieldIndex := range actions[actionIndex].Fields {
			field := &actions[actionIndex].Fields[fieldIndex]
			field.Name = strings.TrimSpace(field.Name)
			if field.Name == "" {
				return fmt.Errorf("plugin action %s field #%d name is required", actionID, fieldIndex+1)
			}
			field.Role = strings.ToLower(strings.TrimSpace(field.Role))
			field.PostExArg = strings.TrimSpace(field.PostExArg)
			field.DefaultByArch = normalizeAnyByArch(field.DefaultByArch)
		}
	}
	return nil
}
