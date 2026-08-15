// Package plugin 实现插件的生命周期管理(扫描、加载、卸载)与命令派发。
//
// 7 个文件形成强耦合簇,共享 PluginManifest/PluginAction 等类型与
// normalize/hydrate/lint 工具函数,作为单一子包整体搬迁。
// 依赖 internal/args(参数构造)与 internal/transport(HTTP 投递)。
package plugin

import (
	"time"

	"irisclient/service/internal/args"
)

type PluginManifest struct {
	SchemaVersion int                 `json:"schema_version"`
	Name          string              `json:"name"`
	DisplayName   LocalizedText       `json:"display_name"`
	Version       string              `json:"version"`
	Description   LocalizedText       `json:"description"`
	Capabilities  *PluginCapabilities `json:"capabilities,omitempty"`
	Hashes        map[string]string   `json:"hashes,omitempty"`
	Actions       []PluginAction      `json:"actions"`
}

// PluginCapabilities 声明插件允许投递的 Beacon 命令白名单。
// schema v2 必填: dispatch 前校验最终 command_id 必须落在 CommandIDs 内。
type PluginCapabilities struct {
	CommandIDs []int `json:"command_ids"`
}

type PluginActionField struct {
	Name          string         `json:"name"`
	Label         LocalizedText  `json:"label"`
	Type          string         `json:"type"`
	Placeholder   string         `json:"placeholder"`
	Default       any            `json:"default"`
	DefaultByArch map[string]any `json:"default_by_arch,omitempty"`
	Required      bool           `json:"required"`
	Help          LocalizedText  `json:"help"`
	Options       []string       `json:"options,omitempty"`
	Role          string         `json:"role,omitempty"`
	PostExArg     string         `json:"postex_arg,omitempty"`
}

type PluginAction struct {
	ID                 string              `json:"id"`
	PluginRoot         string              `json:"-"`
	Kind               string              `json:"kind,omitempty"`
	Label              LocalizedText       `json:"label"`
	Description        LocalizedText       `json:"description"`
	OS                 []string            `json:"os,omitempty"`
	Arch               []string            `json:"arch,omitempty"`
	Artifact           string              `json:"artifact"`
	ArtifactByArch     map[string]string   `json:"artifact_by_arch,omitempty"`
	ArtifactData       string              `json:"artifact_data,omitempty"`
	ArtifactDataByArch map[string]string   `json:"-"`
	PostEx             *PluginPostExAction `json:"postex,omitempty"`
	// Module 指向 PostEx module manifest(beacon.postex.module/v1)。
	// schema v2: postex 动作的配置与字段从 module manifest 派生, postex 块仅作 override。
	Module       string                 `json:"module,omitempty"`
	CommandID    int                    `json:"command_id,omitempty"`
	// RequiresInput 仅作显式覆盖: false(零值)时省略该键,
	// 前端按 v2 约定回退为"有字段即需要输入"(requiresInput = fields.length > 0)。
	RequiresInput bool `json:"requires_input,omitempty"`
	Fields       []PluginActionField    `json:"fields,omitempty"`
	Args         []args.BeaconCommandArg `json:"args,omitempty"`
}

type PluginPostExAction struct {
	Mode            string            `json:"mode"`
	DLL             string            `json:"dll,omitempty"`
	DLLByArch       map[string]string `json:"dll_by_arch,omitempty"`
	Manifest        string            `json:"manifest,omitempty"`
	DLLData         string            `json:"-"`
	DLLDataByArch   map[string]string `json:"-"`
	WaitMS          int               `json:"wait_ms,omitempty"`
	MaxRuntimeMS    int               `json:"max_runtime_ms,omitempty"`
	IdleTimeoutMS   int               `json:"idle_timeout_ms,omitempty"`
	Description     string            `json:"description,omitempty"`
	ModuleArgs      string            `json:"module_args,omitempty"`
	SpawnPath       string            `json:"spawn_path,omitempty"`
	SpawnPathByArch map[string]string `json:"spawn_path_by_arch,omitempty"`
	SpawnArgs       string            `json:"spawn_args,omitempty"`
	Backend         string            `json:"backend,omitempty"`
}

// PluginSnapshot 用于向前端同步插件的当前状态快照
type PluginSnapshot struct {
	ID           string               `json:"id"`
	Name         string               `json:"name"`
	DisplayName  LocalizedText        `json:"display_name"`
	Version      string               `json:"version"`
	Description  LocalizedText        `json:"description"`
	Path         string               `json:"path"`
	Capabilities *PluginCapabilities  `json:"capabilities"`
	Actions      []PluginAction       `json:"actions"`
	Status       string               `json:"status"` // loading, ready, error
	LastError    string               `json:"last_error"`
	LoadedAt     time.Time            `json:"loaded_at"`
	UpdatedAt    time.Time            `json:"updated_at"`
}

func clonePluginCapabilities(in *PluginCapabilities) *PluginCapabilities {
	if in == nil {
		return nil
	}
	return &PluginCapabilities{CommandIDs: append([]int{}, in.CommandIDs...)}
}

func clonePluginActions(actions []PluginAction) []PluginAction {
	if len(actions) == 0 {
		return []PluginAction{}
	}

	out := make([]PluginAction, 0, len(actions))
	for _, action := range actions {
		cloned := PluginAction{
			ID:             action.ID,
			PluginRoot:     action.PluginRoot,
			Kind:           action.Kind,
			Label:          action.Label.Clone(),
			Description:    action.Description.Clone(),
			OS:             append([]string{}, action.OS...),
			Arch:           append([]string{}, action.Arch...),
			Artifact:       action.Artifact,
			ArtifactByArch: cloneStringMap(action.ArtifactByArch),
			ArtifactData:   action.ArtifactData,
			PostEx:         clonePluginPostExAction(action.PostEx),
			Module:         action.Module,
			CommandID:      action.CommandID,
			RequiresInput:  action.RequiresInput,
			Fields:         make([]PluginActionField, 0, len(action.Fields)),
			Args:           cloneBeaconCommandArgs(action.Args),
		}
		for _, field := range action.Fields {
			cloned.Fields = append(cloned.Fields, PluginActionField{
				Name:          field.Name,
				Label:         field.Label.Clone(),
				Type:          field.Type,
				Placeholder:   field.Placeholder,
				Default:       field.Default,
				DefaultByArch: cloneAnyMap(field.DefaultByArch),
				Required:      field.Required,
				Help:          field.Help.Clone(),
				Options:       append([]string{}, field.Options...),
				Role:          field.Role,
				PostExArg:     field.PostExArg,
			})
		}
		out = append(out, cloned)
	}
	return out
}

func cloneBeaconCommandArgs(in []args.BeaconCommandArg) []args.BeaconCommandArg {
	if len(in) == 0 {
		return nil
	}
	out := make([]args.BeaconCommandArg, 0, len(in))
	for _, a := range in {
		out = append(out, args.BeaconCommandArg{
			Kind:  a.Kind,
			Value: a.Value,
		})
	}
	return out
}

func clonePluginPostExAction(postex *PluginPostExAction) *PluginPostExAction {
	if postex == nil {
		return nil
	}
	return &PluginPostExAction{
		Mode:            postex.Mode,
		DLL:             postex.DLL,
		DLLByArch:       cloneStringMap(postex.DLLByArch),
		Manifest:        postex.Manifest,
		DLLData:         postex.DLLData,
		DLLDataByArch:   cloneStringMap(postex.DLLDataByArch),
		WaitMS:          postex.WaitMS,
		MaxRuntimeMS:    postex.MaxRuntimeMS,
		IdleTimeoutMS:   postex.IdleTimeoutMS,
		Description:     postex.Description,
		ModuleArgs:      postex.ModuleArgs,
		SpawnPath:       postex.SpawnPath,
		SpawnPathByArch: cloneStringMap(postex.SpawnPathByArch),
		SpawnArgs:       postex.SpawnArgs,
		Backend:         postex.Backend,
	}
}

func cloneAnyMap(values map[string]any) map[string]any {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]any, len(values))
	for key, value := range values {
		out[key] = value
	}
	return out
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]string, len(values))
	for key, value := range values {
		out[key] = value
	}
	return out
}
