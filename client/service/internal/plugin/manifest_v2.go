// manifest_v2.go — plugin.json schema v2 层:
//   - LocalizedText(i18n 文案: 字符串或 {zh, en} 对象)
//   - 严格解码(schema_version 必须为 2, 未知字段报错)
//   - 约定层(可推导字段自动补齐: id / kind / arch / label / os)
//   - v2 校验(capabilities 白名单 + hashes 完整性)
//   - PostEx module 单一事实源派生(配置与字段从 module manifest 派生, action 级 postex 块仅作 override)
package plugin

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// pluginManifestSchemaVersion 是 plugin.json 当前唯一支持的 schema 版本。
// v1 格式已废弃(破坏性更新), 旧 manifest 加载时报错并提示迁移。
const pluginManifestSchemaVersion = 2

// LocalizedText 支持两种声明形式:
//   - 字符串:   "Whoami"                (单一语言文案)
//   - 对象:     {"zh": "...", "en": "..."}
//
// 内部统一为 map[string]string; 纯字符串形式存入 "default" 键。
// MarshalJSON 时若只有 default 键则回写为字符串, 保持快照紧凑。
type LocalizedText struct {
	Values map[string]string
}

func (t *LocalizedText) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		t.Values = nil
		return nil
	}
	if trimmed[0] == '"' {
		var plain string
		if err := json.Unmarshal(trimmed, &plain); err != nil {
			return err
		}
		t.Values = map[string]string{"default": plain}
		return nil
	}
	if trimmed[0] == '{' {
		values := map[string]string{}
		if err := json.Unmarshal(trimmed, &values); err != nil {
			return err
		}
		t.Values = values
		return nil
	}
	return fmt.Errorf("localized text must be a string or an object of locale -> string")
}

func (t LocalizedText) MarshalJSON() ([]byte, error) {
	if len(t.Values) == 1 {
		if plain, ok := t.Values["default"]; ok {
			return json.Marshal(plain)
		}
	}
	if t.Values == nil {
		return []byte(`""`), nil
	}
	return json.Marshal(t.Values)
}

func (t LocalizedText) IsEmpty() bool {
	return len(t.Values) == 0
}

// Text 返回最适合展示的文案: en → zh → default → 任一值 → 空串。
func (t LocalizedText) Text() string {
	for _, key := range []string{"en", "zh", "default"} {
		if value := strings.TrimSpace(t.Values[key]); value != "" {
			return value
		}
	}
	for _, value := range t.Values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// Get 按 locale 取值, 缺失时回退 Text()。
func (t LocalizedText) Get(locale string) string {
	if value := strings.TrimSpace(t.Values[locale]); value != "" {
		return value
	}
	return t.Text()
}

// SortKey 用于列表排序的稳定字符串。
func (t LocalizedText) SortKey() string {
	return strings.ToLower(t.Text())
}

func (t LocalizedText) Clone() LocalizedText {
	if len(t.Values) == 0 {
		return LocalizedText{}
	}
	cloned := make(map[string]string, len(t.Values))
	for key, value := range t.Values {
		cloned[key] = value
	}
	return LocalizedText{Values: cloned}
}

// decodePluginManifestV2 严格解码 v2 manifest:
// schema_version 必须为 2, 未知字段直接报错(防止拼写错误被静默忽略)。
func decodePluginManifestV2(data []byte) (PluginManifest, error) {
	var probe struct {
		SchemaVersion int `json:"schema_version"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return PluginManifest{}, fmt.Errorf("parse plugin manifest failed: %w", err)
	}
	if probe.SchemaVersion != pluginManifestSchemaVersion {
		return PluginManifest{}, fmt.Errorf(
			"plugin manifest requires schema_version %d (got %d): v1 格式已废弃, 请迁移到 schema v2",
			pluginManifestSchemaVersion, probe.SchemaVersion)
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest PluginManifest
	if err := decoder.Decode(&manifest); err != nil {
		return PluginManifest{}, fmt.Errorf("invalid plugin manifest (schema v2 严格模式): %w", err)
	}
	return manifest, nil
}

// ─── 约定层 ───

// applyManifestConventions 在 normalize 之前补齐可推导字段, 减少声明量:
// id ← 工件文件名; kind ← 扩展名/module; arch ← 文件名后缀; label ← id; os ← 默认 windows。
func applyManifestConventions(manifest *PluginManifest) {
	for i := range manifest.Actions {
		action := &manifest.Actions[i]
		if strings.TrimSpace(action.Kind) == "" {
			action.Kind = inferActionKind(*action)
		}
		kind := normalizePluginActionKind(action.Kind)
		if strings.TrimSpace(action.ID) == "" {
			action.ID = inferActionID(*action, kind)
		}
		if action.Label.IsEmpty() {
			action.Label = LocalizedText{Values: map[string]string{"default": action.ID}}
		}
		if len(action.OS) == 0 {
			action.OS = defaultActionOS(kind)
		}
		if len(action.Arch) == 0 {
			action.Arch = inferActionArch(*action, kind)
		}
		for j := range action.Fields {
			field := &action.Fields[j]
			if field.Label.IsEmpty() {
				field.Label = LocalizedText{Values: map[string]string{"default": field.Name}}
			}
		}
	}
}

func inferActionKind(action PluginAction) string {
	if strings.TrimSpace(action.Module) != "" || action.PostEx != nil {
		return "postex"
	}
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(action.Artifact))) {
	case ".o", ".obj":
		return "bof"
	case ".dll":
		return "postex"
	default:
		return "bof"
	}
}

func inferActionID(action PluginAction, kind string) string {
	if kind == "postex" {
		base := strings.TrimSpace(action.Module)
		if base == "" {
			return ""
		}
		base = filepath.Base(base)
		base = strings.TrimSuffix(base, filepath.Ext(base)) // 去 .json
		base = strings.TrimSuffix(base, ".manifest")       // postex-template.manifest → postex-template
		if mode := normalizePostExMode(action.PostEx.Mode); mode != "" {
			return base + "-" + mode
		}
		return base
	}

	artifact := strings.TrimSpace(action.Artifact)
	if artifact == "" {
		return ""
	}
	base := filepath.Base(artifact)
	base = strings.TrimSuffix(base, ".o")
	base = strings.TrimSuffix(base, ".obj")
	base = strings.TrimSuffix(base, ".x64")
	base = strings.TrimSuffix(base, ".x86")
	return strings.TrimSpace(base)
}

func defaultActionOS(kind string) []string {
	switch kind {
	case "bof", "postex":
		return []string{"windows"}
	default:
		return nil
	}
}

func inferActionArch(action PluginAction, kind string) []string {
	if kind != "bof" {
		return nil
	}
	if len(action.ArtifactByArch) > 0 {
		out := make([]string, 0, len(action.ArtifactByArch))
		for arch := range action.ArtifactByArch {
			out = append(out, arch)
		}
		sort.Strings(out)
		return out
	}
	name := strings.ToLower(filepath.Base(strings.TrimSpace(action.Artifact)))
	switch {
	case strings.Contains(name, ".x64"):
		return []string{"amd64"}
	case strings.Contains(name, ".x86"):
		return []string{"x86"}
	default:
		return nil
	}
}

// ─── v2 校验 ───

// validateManifestV2 校验 v2 专属约束: capabilities 白名单与 hashes 完整性。
// 结构性校验(validatePluginManifest)在调用方先行执行。
func validateManifestV2(root string, manifest PluginManifest) error {
	if len(manifest.Actions) == 0 {
		return fmt.Errorf("plugin actions must not be empty (schema v2)")
	}
	if manifest.Capabilities == nil || len(manifest.Capabilities.CommandIDs) == 0 {
		return fmt.Errorf("capabilities.command_ids is required (schema v2)")
	}

	allowed := map[int]bool{}
	for _, id := range manifest.Capabilities.CommandIDs {
		allowed[id] = true
	}
	for _, action := range manifest.Actions {
		if action.CommandID != 0 && !allowed[action.CommandID] {
			return fmt.Errorf("action %s declares command_id %d which is not in capabilities.command_ids", action.ID, action.CommandID)
		}
	}

	return verifyManifestHashes(root, manifest)
}

// verifyManifestHashes 校验 hashes 清单:
//  1. 每个声明条目必须是插件根内存在且内容匹配的文件;
//  2. 每个被 manifest 引用的工件(dll/模块清单)必须已在 hashes 中声明。
func verifyManifestHashes(root string, manifest PluginManifest) error {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve plugin root failed: %w", err)
	}

	declared := map[string]bool{}
	for relPath, want := range manifest.Hashes {
		clean := cleanRelPath(relPath)
		if err := validatePluginRelativeFile(root, clean); err != nil {
			return fmt.Errorf("hashes entry %s: %w", relPath, err)
		}
		got, err := sha256File(filepath.Join(rootAbs, clean))
		if err != nil {
			return fmt.Errorf("hash file %s failed: %w", relPath, err)
		}
		if !strings.EqualFold(strings.TrimSpace(want), got) {
			return fmt.Errorf("hash mismatch for %s: manifest declares %s but file is %s", relPath, strings.TrimSpace(want), got)
		}
		declared[clean] = true
	}

	for _, relPath := range referencedManifestFiles(manifest) {
		clean := cleanRelPath(relPath)
		if !declared[clean] {
			return fmt.Errorf("file %s is referenced by the manifest but not declared in hashes (schema v2 要求全部工件声明 sha256)", relPath)
		}
	}
	return nil
}

func cleanRelPath(relPath string) string {
	return filepath.ToSlash(filepath.Clean(strings.TrimSpace(relPath)))
}

func referencedManifestFiles(manifest PluginManifest) []string {
	out := []string{}
	for _, action := range manifest.Actions {
		if strings.TrimSpace(action.Artifact) != "" {
			out = append(out, action.Artifact)
		}
		for _, artifact := range action.ArtifactByArch {
			if strings.TrimSpace(artifact) != "" {
				out = append(out, artifact)
			}
		}
		if strings.TrimSpace(action.Module) != "" {
			out = append(out, action.Module)
		}
		if action.PostEx != nil {
			if strings.TrimSpace(action.PostEx.Manifest) != "" {
				out = append(out, action.PostEx.Manifest)
			}
			if strings.TrimSpace(action.PostEx.DLL) != "" {
				out = append(out, action.PostEx.DLL)
			}
			for _, dll := range action.PostEx.DLLByArch {
				if strings.TrimSpace(dll) != "" {
					out = append(out, dll)
				}
			}
		}
	}
	return out
}

func sha256File(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// ─── PostEx module 派生 ───

// derivePostExFromModule 把声明了 module 的 postex 动作从 module manifest 派生配置与字段:
//   - mode       ← execution.recommended_target_mode(可被 action 级 postex.mode 覆盖)
//   - backend    ← execution.recommended_backend
//   - wait_ms    ← execution.default_wait_ms
//   - dll_by_arch / arch / os ← module.files / module.arch
//   - fields     ← module args(name/flag→postex_arg/type/choices/description/required/default)
//   - spawn-dll 缺省 spawn_path 约定: C:\Windows\System32\cmd.exe
//   - inject-dll 自动合成 target_pid 字段
func derivePostExFromModule(root string, actions []PluginAction) error {
	for i := range actions {
		action := &actions[i]
		if normalizePluginActionKind(action.Kind) != "postex" || strings.TrimSpace(action.Module) == "" {
			continue
		}

		module, err := loadPostExModuleManifest(root, action.Module)
		if err != nil {
			return fmt.Errorf("plugin action %s: %w", action.ID, err)
		}

		merged := PluginPostExAction{}
		if action.PostEx != nil {
			merged = *action.PostEx
		}
		merged.Manifest = action.Module
		if strings.TrimSpace(merged.Mode) == "" {
			merged.Mode = module.Execution.RecommendedTargetMode
		}
		if strings.TrimSpace(merged.Backend) == "" {
			merged.Backend = module.Execution.RecommendedBackend
		}
		if merged.WaitMS <= 0 {
			merged.WaitMS = module.Execution.DefaultWaitMS
		}

		merged.DLLByArch = map[string]string{}
		archs := make([]string, 0, len(module.Module.Files))
		for moduleArch, file := range module.Module.Files {
			pluginArch := pluginArchFromPostExModuleArch(moduleArch)
			if pluginArch == "" {
				continue
			}
			merged.DLLByArch[pluginArch] = file
			archs = append(archs, pluginArch)
		}
		sort.Strings(archs)
		if len(action.Arch) == 0 {
			action.Arch = archs
		}
		if len(action.OS) == 0 {
			action.OS = []string{"windows"}
		}

		mode := normalizePostExMode(merged.Mode)
		if mode == "spawn-dll" && strings.TrimSpace(merged.SpawnPath) == "" && len(merged.SpawnPathByArch) == 0 {
			merged.SpawnPath = `C:\Windows\System32\cmd.exe`
		}
		action.PostEx = &merged

		if err := mergeDerivedPostExFields(action, module); err != nil {
			return err
		}
	}
	return nil
}

func pluginArchFromPostExModuleArch(moduleArch string) string {
	switch strings.TrimSpace(moduleArch) {
	case "x64":
		return "amd64"
	case "x86":
		return "x86"
	default:
		return ""
	}
}

// mergeDerivedPostExFields 把 module manifest 的 args 派生为表单字段(仅追加未显式声明的字段名),
// 并为 inject-dll 自动合成 target_pid 字段。
func mergeDerivedPostExFields(action *PluginAction, module postExModuleManifest) error {
	existing := map[string]bool{}
	for _, field := range action.Fields {
		existing[strings.TrimSpace(field.Name)] = true
	}

	for _, arg := range module.Args {
		name := strings.TrimSpace(arg.Name)
		if name == "" || existing[name] {
			continue
		}
		action.Fields = append(action.Fields, PluginActionField{
			Name:      name,
			Label:     LocalizedText{Values: map[string]string{"default": name}},
			Type:      postExFieldTypeFromModuleArg(arg),
			Default:   arg.Default,
			Required:  arg.Required,
			Help:      LocalizedText{Values: map[string]string{"default": strings.TrimSpace(arg.Description)}},
			Options:   append([]string{}, arg.Choices...),
			PostExArg: strings.TrimSpace(arg.Flag),
		})
	}

	if action.PostEx != nil && normalizePostExMode(action.PostEx.Mode) == "inject-dll" && !hasPostExRoleField(*action, "target_pid") {
		action.Fields = append(action.Fields, PluginActionField{
			Name:     "pid",
			Type:     "int32",
			Required: true,
			Role:     "target_pid",
			Label:    LocalizedText{Values: map[string]string{"zh": "目标进程 PID", "en": "Target PID"}},
		})
	}
	return nil
}

func postExFieldTypeFromModuleArg(arg postExModuleManifestArg) string {
	switch strings.TrimSpace(arg.Type) {
	case "int":
		return "int32"
	case "bool":
		return "bool"
	case "enum":
		return "select"
	default:
		return "string"
	}
}
