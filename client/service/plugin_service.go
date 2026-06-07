package service

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const defaultExecutionBOFCommandID = 70
const (
	minInt16Value = -1 << 15
	maxInt16Value = 1<<15 - 1
	minInt32Value = -1 << 31
	maxInt32Value = 1<<31 - 1
)

type PluginManifest struct {
	Name        string         `json:"name"`
	DisplayName string         `json:"display_name"`
	Version     string         `json:"version"`
	Description string         `json:"description"`
	Permissions []string       `json:"permissions"`
	Actions     []PluginAction `json:"actions"`
}

type PluginActionField struct {
	Name        string   `json:"name"`
	Label       string   `json:"label"`
	Type        string   `json:"type"`
	Placeholder string   `json:"placeholder"`
	Default     any      `json:"default"`
	Required    bool     `json:"required"`
	Help        string   `json:"help"`
	Options     []string `json:"options,omitempty"`
}

type PluginAction struct {
	ID                 string              `json:"id"`
	Label              string              `json:"label"`
	Description        string              `json:"description"`
	OS                 []string            `json:"os,omitempty"`
	Arch               []string            `json:"arch,omitempty"`
	Artifact           string              `json:"artifact"`
	ArtifactByArch     map[string]string   `json:"artifact_by_arch,omitempty"`
	ArtifactData       string              `json:"artifact_data,omitempty"`
	ArtifactDataByArch map[string]string   `json:"-"`
	CommandID          int                 `json:"command_id,omitempty"`
	RequiresInput      bool                `json:"requires_input"`
	Fields             []PluginActionField `json:"fields,omitempty"`
	Args               []BeaconCommandArg  `json:"args,omitempty"`
}

type BeaconCommandArg struct {
	Kind  string `json:"kind"`
	Value any    `json:"value"`
}

// PluginSnapshot 用于向前端同步插件的当前状态快照
type PluginSnapshot struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	DisplayName string         `json:"display_name"`
	Version     string         `json:"version"`
	Description string         `json:"description"`
	Path        string         `json:"path"`
	Permissions []string       `json:"permissions"`
	Actions     []PluginAction `json:"actions"`
	Status      string         `json:"status"` // loading, ready, error
	LastError   string         `json:"last_error"`
	LoadedAt    time.Time      `json:"loaded_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type PluginService struct {
	manager *PluginManager
}

func NewPluginService() *PluginService {
	manager := NewPluginManager()
	_, _ = manager.Reload()
	return &PluginService{manager: manager}
}

func (s *PluginService) ListPlugins() ([]PluginSnapshot, error) {
	return s.manager.List(), nil
}

func (s *PluginService) GetPlugin(pluginID string) (PluginSnapshot, error) {
	return s.manager.Get(pluginID)
}

func (s *PluginService) ReloadPlugins() ([]PluginSnapshot, error) {
	return s.manager.Reload()
}

func (s *PluginService) AddPlugin(sourcePath string) ([]PluginSnapshot, error) {
	return s.manager.Add(sourcePath)
}

func (s *PluginService) DeletePlugin(pluginID string) ([]PluginSnapshot, error) {
	return s.manager.Delete(pluginID)
}

func (s *PluginService) InvokePluginAction(pluginID string, action string, payloadJSON string) (PluginSnapshot, error) {
	return s.manager.Invoke(pluginID, action, payloadJSON)
}

// PluginManager 负责插件的生命周期管理（扫描、加载、卸载）
type PluginManager struct {
	mu      sync.RWMutex
	rootDir string
	plugins map[string]*PluginInstance
}

func NewPluginManager() *PluginManager {
	return &PluginManager{
		rootDir: resolvePluginsRoot(),
		plugins: map[string]*PluginInstance{},
	}
}

func (m *PluginManager) List() []PluginSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]PluginSnapshot, 0, len(m.plugins))
	for _, plugin := range m.plugins {
		result = append(result, plugin.snapshot())
	}
	sort.Slice(result, func(i, j int) bool {
		left := strings.ToLower(result[i].DisplayName)
		right := strings.ToLower(result[j].DisplayName)
		if left == right {
			return result[i].ID < result[j].ID
		}
		return left < right
	})
	return result
}

func (m *PluginManager) Get(pluginID string) (PluginSnapshot, error) {
	pluginID = strings.TrimSpace(pluginID)
	if pluginID == "" {
		return PluginSnapshot{}, fmt.Errorf("plugin id is required")
	}

	m.mu.RLock()
	plugin, ok := m.plugins[pluginID]
	m.mu.RUnlock()
	if !ok {
		return PluginSnapshot{}, fmt.Errorf("plugin not found: %s", pluginID)
	}
	return plugin.snapshot(), nil
}

func (m *PluginManager) Reload() ([]PluginSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, plugin := range m.plugins {
		plugin.Close()
	}
	m.plugins = map[string]*PluginInstance{}

	if err := os.MkdirAll(m.rootDir, 0755); err != nil {
		return nil, fmt.Errorf("ensure plugins dir failed: %w", err)
	}

	entries, err := os.ReadDir(m.rootDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []PluginSnapshot{}, nil
		}
		return nil, fmt.Errorf("read plugins dir failed: %w", err)
	}

	dirs := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		dirs = append(dirs, filepath.Join(m.rootDir, entry.Name()))
	}
	sort.Strings(dirs)

	snapshots := make([]PluginSnapshot, 0, len(dirs))
	for _, dir := range dirs {
		plugin, loadErr := m.loadPluginLocked(dir)
		if plugin == nil {
			continue
		}
		if loadErr != nil {
			plugin.setError(loadErr)
		}
		m.plugins[plugin.ID] = plugin
		snapshots = append(snapshots, plugin.snapshot())
	}
	return snapshots, nil
}

func (m *PluginManager) Add(sourcePath string) ([]PluginSnapshot, error) {
	pluginRoot, err := resolvePluginSourceRoot(sourcePath)
	if err != nil {
		return nil, err
	}

	sourceAbs, err := filepath.Abs(pluginRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve plugin source failed: %w", err)
	}
	rootAbs, err := filepath.Abs(m.rootDir)
	if err != nil {
		return nil, fmt.Errorf("resolve plugins root failed: %w", err)
	}

	if isWithinDir(rootAbs, sourceAbs) {
		return m.Reload()
	}

	if err := os.MkdirAll(m.rootDir, 0755); err != nil {
		return nil, fmt.Errorf("ensure plugins dir failed: %w", err)
	}

	dest := filepath.Join(rootAbs, filepath.Base(sourceAbs))
	if err := os.RemoveAll(dest); err != nil {
		return nil, fmt.Errorf("clear destination failed: %w", err)
	}
	if err := copyPluginDir(sourceAbs, dest); err != nil {
		return nil, err
	}

	return m.Reload()
}

func (m *PluginManager) Delete(pluginID string) ([]PluginSnapshot, error) {
	m.mu.RLock()
	plugin, ok := m.plugins[strings.TrimSpace(pluginID)]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", pluginID)
	}

	rootAbs, err := filepath.Abs(m.rootDir)
	if err != nil {
		return nil, fmt.Errorf("resolve plugins root failed: %w", err)
	}
	pluginRootAbs, err := filepath.Abs(plugin.Root)
	if err != nil {
		return nil, fmt.Errorf("resolve plugin path failed: %w", err)
	}
	if !isWithinDir(rootAbs, pluginRootAbs) {
		return nil, fmt.Errorf("plugin path is outside plugins root")
	}

	plugin.Close()
	if err := os.RemoveAll(plugin.Root); err != nil {
		return nil, fmt.Errorf("remove plugin failed: %w", err)
	}

	return m.Reload()
}

// Invoke 执行插件指定的动作，通常由前端用户点击操作触发
func (m *PluginManager) Invoke(pluginID string, action string, payloadJSON string) (PluginSnapshot, error) {
	m.mu.RLock()
	plugin, ok := m.plugins[strings.TrimSpace(pluginID)]
	m.mu.RUnlock()
	if !ok {
		return PluginSnapshot{}, fmt.Errorf("plugin not found: %s", pluginID)
	}

	actionID := strings.TrimSpace(action)
	if actionID == "" {
		return PluginSnapshot{}, fmt.Errorf("plugin action is required")
	}

	pluginAction, ok := plugin.findAction(actionID)
	if !ok {
		return PluginSnapshot{}, fmt.Errorf("plugin action not found: %s", actionID)
	}

	payload := map[string]any{}
	if strings.TrimSpace(payloadJSON) != "" {
		if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
			return PluginSnapshot{}, fmt.Errorf("invalid plugin payload: %w", err)
		}
	}

	if err := m.dispatchAction(pluginAction, payload); err != nil {
		plugin.setError(err)
		return plugin.snapshot(), err
	}

	plugin.setReady()
	return plugin.snapshot(), nil
}

func (m *PluginManager) loadPluginLocked(root string) (*PluginInstance, error) {
	manifestPath := filepath.Join(root, "plugin.json")
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read plugin manifest failed: %w", err)
	}

	var manifest PluginManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("parse plugin manifest failed: %w", err)
	}

	if manifest.Name == "" {
		manifest.Name = filepath.Base(root)
	}
	if manifest.DisplayName == "" {
		manifest.DisplayName = manifest.Name
	}
	if err := normalizePluginActionFields(manifest.Actions); err != nil {
		return nil, err
	}
	manifest.Actions = hydratePluginActions(root, manifest.Actions)

	plugin := &PluginInstance{
		ID:        manifest.Name,
		Root:      root,
		Manifest:  manifest,
		Status:    "ready",
		LoadedAt:  time.Now(),
		UpdatedAt: time.Now(),
		LastError: "",
	}

	return plugin, nil
}

func (m *PluginManager) dispatchAction(action PluginAction, payload map[string]any) error {
	beaconID := pickString(payload, "beacon_id", "beaconId", "beaconID")
	if beaconID == "" {
		return fmt.Errorf("beacon_id is required")
	}

	apiBase := pickString(payload, "api_base", "apiBase", "api_base_url", "apiBaseUrl")
	if apiBase == "" {
		apiBase = "https://127.0.0.1:8080"
	}
	token := pickString(payload, "token", "access_token", "accessToken")
	if token == "" {
		return fmt.Errorf("token is required")
	}

	commandID := pickInt(payload, "command_id", "commandId", "commandID")
	if commandID <= 0 {
		commandID = action.CommandID
	}
	if commandID <= 0 && actionHasArtifact(action) {
		commandID = defaultExecutionBOFCommandID
	}
	if commandID <= 0 {
		return fmt.Errorf("command_id is required for plugin action %s", action.ID)
	}

	args, err := buildPluginArgs(action, payload)
	if err != nil {
		return err
	}

	artifactData, hasArtifact, err := resolveActionArtifactData(action, payload)
	if err != nil {
		return err
	}
	if hasArtifact {
		artifactKind := "string"
		if commandID == defaultExecutionBOFCommandID {
			artifactKind = "bytes"
		}
		args = append([]BeaconCommandArg{{Kind: artifactKind, Value: artifactData}}, args...)
	}

	requestBody := map[string]any{
		"beacon_id": beaconID,
		"command":   commandID,
		"args":      args,
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("marshal plugin command failed: %w", err)
	}

	proxy := NewProxyService()
	respBody, err := proxy.DoRequest(
		http.MethodPost,
		strings.TrimRight(apiBase, "/")+"/api/v1/beacon/command",
		string(bodyBytes),
		map[string]string{
			"Authorization": "Bearer " + token,
		},
	)
	if err != nil {
		return fmt.Errorf("dispatch plugin command failed: %w", err)
	}

	if dispatchErr := detectDispatchError(respBody); dispatchErr != nil {
		return dispatchErr
	}
	return nil
}

func resolvePluginsRoot() string {
	candidates := make([]string, 0, 2)

	if wd, err := os.Getwd(); err == nil && wd != "" {
		candidates = append(candidates, filepath.Join(wd, "plugins"))
	}
	if exe, err := os.Executable(); err == nil && exe != "" {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "plugins"))
	}

	for _, dir := range candidates {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
	}

	if len(candidates) > 0 {
		return candidates[0]
	}
	return "plugins"
}

func resolvePluginSourceRoot(sourcePath string) (string, error) {
	cleaned := strings.TrimSpace(sourcePath)
	if cleaned == "" {
		return "", fmt.Errorf("plugin path is required")
	}

	absPath, err := filepath.Abs(cleaned)
	if err != nil {
		return "", fmt.Errorf("resolve plugin path failed: %w", err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", fmt.Errorf("plugin path not found: %w", err)
	}

	if !info.IsDir() {
		absPath = filepath.Dir(absPath)
	}

	manifestPath := filepath.Join(absPath, "plugin.json")
	if info, err := os.Stat(manifestPath); err == nil && !info.IsDir() {
		return absPath, nil
	}

	return "", fmt.Errorf("plugin manifest not found: %s", manifestPath)
}

func isWithinDir(root, target string) bool {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." {
		return false
	}
	prefix := ".." + string(filepath.Separator)
	return !strings.HasPrefix(rel, prefix)
}

func copyPluginDir(source, dest string) error {
	return filepath.WalkDir(source, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dest, rel)

		info, err := d.Info()
		if err != nil {
			return err
		}

		if d.IsDir() {
			return os.MkdirAll(target, info.Mode().Perm())
		}

		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode().Perm())
	})
}

type PluginInstance struct {
	mu        sync.Mutex
	ID        string
	Root      string
	Manifest  PluginManifest
	Status    string
	LastError string
	LoadedAt  time.Time
	UpdatedAt time.Time
}

func (p *PluginInstance) Close() {}

func (p *PluginInstance) setError(err error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err == nil {
		p.LastError = ""
		return
	}
	p.LastError = err.Error()
	p.Status = "error"
	p.UpdatedAt = time.Now()
}

func (p *PluginInstance) setReady() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Status = "ready"
	p.LastError = ""
	p.UpdatedAt = time.Now()
}

func (p *PluginInstance) snapshot() PluginSnapshot {
	p.mu.Lock()
	defer p.mu.Unlock()

	return PluginSnapshot{
		ID:          p.ID,
		Name:        p.Manifest.Name,
		DisplayName: p.Manifest.DisplayName,
		Version:     p.Manifest.Version,
		Description: p.Manifest.Description,
		Path:        p.Root,
		Permissions: append([]string{}, p.Manifest.Permissions...),
		Actions:     clonePluginActions(p.Manifest.Actions),
		Status:      p.Status,
		LastError:   p.LastError,
		LoadedAt:    p.LoadedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

func (p *PluginInstance) findAction(actionID string) (PluginAction, bool) {
	target := strings.TrimSpace(actionID)
	if target == "" {
		return PluginAction{}, false
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	for _, action := range p.Manifest.Actions {
		if strings.TrimSpace(action.ID) == target {
			return action, true
		}
	}
	return PluginAction{}, false
}

func buildPluginArgs(action PluginAction, payload map[string]any) ([]BeaconCommandArg, error) {
	if rawArgs, ok := payload["args"]; ok {
		return normalizeBeaconCommandArgs(rawArgs)
	}
	if len(action.Args) > 0 {
		return normalizeManifestCommandArgs(action.Args)
	}

	values := map[string]any{}
	if rawValues, ok := payload["values"]; ok {
		if typed, ok := rawValues.(map[string]any); ok {
			values = typed
		}
	}

	args := make([]BeaconCommandArg, 0, len(action.Fields))
	for _, field := range action.Fields {
		key := strings.TrimSpace(field.Name)
		if key == "" {
			continue
		}

		value, ok := values[key]
		if !ok || isBlankValue(value) {
			value = field.Default
		}

		arg, err := buildBeaconCommandArg(field.Type, value)
		if err != nil {
			return nil, fmt.Errorf("invalid value for %s: %w", key, err)
		}
		args = append(args, arg)
	}
	return args, nil
}

func resolveActionArtifactData(action PluginAction, payload map[string]any) (string, bool, error) {
	if err := validateActionTarget(action, payload); err != nil {
		return "", false, err
	}

	targetArch := normalizePluginArch(pickString(payload, "beacon_arch", "beaconArch", "arch", "Arch"))
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

	if explicit := pickString(payload, "artifact_data", "artifactData"); explicit != "" && !actionHasArtifact(action) {
		return explicit, true, nil
	}

	if actionHasArtifact(action) {
		return "", true, fmt.Errorf("artifact data is required for plugin action %s", action.ID)
	}

	return "", false, nil
}

func validateActionTarget(action PluginAction, payload map[string]any) error {
	targetOS := normalizePluginOS(pickString(payload, "beacon_os", "beaconOS", "os", "OS"))
	if len(action.OS) > 0 {
		if targetOS == "" {
			return fmt.Errorf("beacon_os is required for plugin action %s", action.ID)
		}
		if !containsString(action.OS, targetOS) {
			return fmt.Errorf("plugin action %s does not support os %s", action.ID, targetOS)
		}
	}

	targetArch := normalizePluginArch(pickString(payload, "beacon_arch", "beaconArch", "arch", "Arch"))
	if len(action.Arch) > 0 {
		if targetArch == "" {
			return fmt.Errorf("beacon_arch is required for plugin action %s", action.ID)
		}
		if !containsString(action.Arch, targetArch) {
			return fmt.Errorf("plugin action %s does not support arch %s", action.ID, targetArch)
		}
	}

	return nil
}

func actionHasArtifact(action PluginAction) bool {
	return strings.TrimSpace(action.Artifact) != "" || len(action.ArtifactByArch) > 0
}

func containsString(items []string, value string) bool {
	for _, item := range items {
		if strings.TrimSpace(item) == value {
			return true
		}
	}
	return false
}

func normalizeBeaconCommandArgs(raw any) ([]BeaconCommandArg, error) {
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("args must be an array")
	}

	args := make([]BeaconCommandArg, 0, len(items))
	for _, item := range items {
		arg, err := normalizeBeaconCommandArg(item)
		if err != nil {
			return nil, err
		}
		args = append(args, arg)
	}
	return args, nil
}

func normalizeManifestCommandArgs(items []BeaconCommandArg) ([]BeaconCommandArg, error) {
	args := make([]BeaconCommandArg, 0, len(items))
	for _, item := range items {
		arg, err := normalizeBeaconCommandArg(item)
		if err != nil {
			return nil, err
		}
		args = append(args, arg)
	}
	return args, nil
}

func normalizeBeaconCommandArg(raw any) (BeaconCommandArg, error) {
	switch typed := raw.(type) {
	case BeaconCommandArg:
		return buildBeaconCommandArg(typed.Kind, typed.Value)
	case map[string]any:
		kind := strings.ToLower(strings.TrimSpace(pickString(typed, "kind", "Kind")))
		value := typed["value"]
		if kind == "" {
			return inferBeaconCommandArg(value)
		}
		return buildBeaconCommandArg(kind, value)
	case string, bool, float64, float32, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64, json.Number:
		return inferBeaconCommandArg(typed)
	default:
		return BeaconCommandArg{}, fmt.Errorf("unsupported arg type %T", raw)
	}
}

func inferBeaconCommandArg(value any) (BeaconCommandArg, error) {
	switch typed := value.(type) {
	case nil:
		return BeaconCommandArg{Kind: "string", Value: ""}, nil
	case bool:
		return BeaconCommandArg{Kind: "bool", Value: typed}, nil
	case float64, float32, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64, json.Number:
		n, err := parseInt32Value(typed)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "int32", Value: n}, nil
	default:
		return BeaconCommandArg{Kind: "string", Value: stringifyValue(value)}, nil
	}
}

func buildBeaconCommandArg(kind string, value any) (BeaconCommandArg, error) {
	if isBlankValue(value) {
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
		b, err := parseBoolValue(value)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "bool", Value: b}, nil
	case "bytes":
		return BeaconCommandArg{Kind: "bytes", Value: stringifyValue(value)}, nil
	case "short", "int16":
		n, err := parseInt16Value(value)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "short", Value: n}, nil
	case "int8", "int32":
		n, err := parseInt32Value(value)
		if err != nil {
			return BeaconCommandArg{}, err
		}
		return BeaconCommandArg{Kind: "int32", Value: n}, nil
	case "int64":
		return BeaconCommandArg{Kind: "string", Value: stringifyValue(value)}, nil
	case "string", "textarea", "input", "select", "":
		return BeaconCommandArg{Kind: "string", Value: stringifyValue(value)}, nil
	default:
		return BeaconCommandArg{}, fmt.Errorf("unsupported arg kind: %s", kind)
	}
}

func isBlankValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(typed) == ""
	default:
		return false
	}
}

func parseBoolValue(value any) (bool, error) {
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
	case float64:
		return typed != 0, nil
	case float32:
		return typed != 0, nil
	case int:
		return typed != 0, nil
	case int8:
		return typed != 0, nil
	case int16:
		return typed != 0, nil
	case int32:
		return typed != 0, nil
	case int64:
		return typed != 0, nil
	case uint:
		return typed != 0, nil
	case uint8:
		return typed != 0, nil
	case uint16:
		return typed != 0, nil
	case uint32:
		return typed != 0, nil
	case uint64:
		return typed != 0, nil
	case json.Number:
		n, err := typed.Int64()
		if err != nil {
			return false, err
		}
		return n != 0, nil
	default:
		return false, fmt.Errorf("invalid boolean value %T", value)
	}
}

func parseInt32Value(value any) (int32, error) {
	switch typed := value.(type) {
	case nil:
		return 0, fmt.Errorf("int32 value is required")
	case int32:
		return typed, nil
	case int:
		if typed < minInt32Value || typed > maxInt32Value {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case int8:
		return int32(typed), nil
	case int16:
		return int32(typed), nil
	case int64:
		if typed < minInt32Value || typed > maxInt32Value {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case uint:
		if uint64(typed) > uint64(maxInt32Value) {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case uint8:
		return int32(typed), nil
	case uint16:
		return int32(typed), nil
	case uint32:
		if uint64(typed) > uint64(maxInt32Value) {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case uint64:
		if typed > uint64(maxInt32Value) {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case float32:
		if typed != float32(int32(typed)) {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		if typed < minInt32Value || typed > maxInt32Value {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case float64:
		if typed != float64(int32(typed)) {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		if typed < minInt32Value || typed > maxInt32Value {
			return 0, fmt.Errorf("invalid int32 value %v", typed)
		}
		return int32(typed), nil
	case json.Number:
		n, err := typed.Int64()
		if err != nil {
			return 0, err
		}
		if n < minInt32Value || n > maxInt32Value {
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
		return 0, fmt.Errorf("invalid int32 value %T", value)
	}
}

func parseInt16Value(value any) (int16, error) {
	n, err := parseInt32Value(value)
	if err != nil {
		return 0, err
	}
	if n < minInt16Value || n > maxInt16Value {
		return 0, fmt.Errorf("invalid short value %v", n)
	}
	return int16(n), nil
}

func detectDispatchError(respBody string) error {
	trimmed := strings.TrimSpace(respBody)
	if trimmed == "" {
		return nil
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		if strings.HasPrefix(trimmed, "<") {
			return fmt.Errorf("服务器返回了非预期的 HTML 页面（可能是路径错误或接口变更）")
		}
		return nil
	}

	if errMsg := pickString(payload, "error", "Error"); errMsg != "" {
		return errors.New(errMsg)
	}
	if okVal, exists := payload["ok"]; exists {
		if ok, isBool := okVal.(bool); isBool && !ok {
			msg := pickString(payload, "message", "Message")
			if msg == "" {
				msg = "command dispatch failed"
			}
			return errors.New(msg)
		}
	}
	return nil
}

func pickString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			if text := strings.TrimSpace(stringifyValue(value)); text != "" {
				return text
			}
		}
	}
	return ""
}

func pickInt(values map[string]any, keys ...string) int {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			switch typed := value.(type) {
			case float64:
				return int(typed)
			case float32:
				return int(typed)
			case int:
				return typed
			case int8:
				return int(typed)
			case int16:
				return int(typed)
			case int32:
				return int(typed)
			case int64:
				return int(typed)
			case uint:
				return int(typed)
			case uint8:
				return int(typed)
			case uint16:
				return int(typed)
			case uint32:
				return int(typed)
			case uint64:
				return int(typed)
			case json.Number:
				if n, err := typed.Int64(); err == nil {
					return int(n)
				}
			case string:
				if n, err := strconv.Atoi(strings.TrimSpace(typed)); err == nil {
					return n
				}
			}
		}
	}
	return 0
}

func stringifyValue(value any) string {
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
		cloned.ArtifactByArch = normalizeArtifactByArch(cloned.ArtifactByArch)
		if strings.TrimSpace(cloned.Artifact) != "" {
			artifactPath := filepath.Join(root, cloned.Artifact)
			if artifactAbs, absErr := filepath.Abs(artifactPath); absErr == nil && isWithinDir(rootAbs, artifactAbs) {
				if data, err := os.ReadFile(artifactAbs); err == nil && len(data) > 0 {
					cloned.ArtifactData = base64.StdEncoding.EncodeToString(data)
				}
			}
		}
		if len(cloned.ArtifactByArch) > 0 {
			cloned.ArtifactDataByArch = map[string]string{}
			for arch, artifact := range cloned.ArtifactByArch {
				artifactPath := filepath.Join(root, artifact)
				if artifactAbs, absErr := filepath.Abs(artifactPath); absErr == nil && isWithinDir(rootAbs, artifactAbs) {
					if data, err := os.ReadFile(artifactAbs); err == nil && len(data) > 0 {
						cloned.ArtifactDataByArch[arch] = base64.StdEncoding.EncodeToString(data)
					}
				}
			}
		}
		out = append(out, cloned)
	}
	return out
}

func normalizePluginActionFields(actions []PluginAction) error {
	for actionIndex := range actions {
		actions[actionIndex].OS = normalizePluginOSList(actions[actionIndex].OS)
		actions[actionIndex].Arch = normalizePluginArchList(actions[actionIndex].Arch)
		actions[actionIndex].ArtifactByArch = normalizeArtifactByArch(actions[actionIndex].ArtifactByArch)

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
		}
	}
	return nil
}

func clonePluginActions(actions []PluginAction) []PluginAction {
	if len(actions) == 0 {
		return []PluginAction{}
	}

	out := make([]PluginAction, 0, len(actions))
	for _, action := range actions {
		cloned := PluginAction{
			ID:             action.ID,
			Label:          action.Label,
			Description:    action.Description,
			OS:             append([]string{}, action.OS...),
			Arch:           append([]string{}, action.Arch...),
			Artifact:       action.Artifact,
			ArtifactByArch: cloneStringMap(action.ArtifactByArch),
			ArtifactData:   action.ArtifactData,
			CommandID:      action.CommandID,
			RequiresInput:  action.RequiresInput,
			Fields:         make([]PluginActionField, 0, len(action.Fields)),
			Args:           cloneBeaconCommandArgs(action.Args),
		}
		for _, field := range action.Fields {
			cloned.Fields = append(cloned.Fields, PluginActionField{
				Name:        field.Name,
				Label:       field.Label,
				Type:        field.Type,
				Placeholder: field.Placeholder,
				Default:     field.Default,
				Required:    field.Required,
				Help:        field.Help,
				Options:     append([]string{}, field.Options...),
			})
		}
		out = append(out, cloned)
	}
	return out
}

func cloneBeaconCommandArgs(args []BeaconCommandArg) []BeaconCommandArg {
	if len(args) == 0 {
		return nil
	}
	out := make([]BeaconCommandArg, 0, len(args))
	for _, arg := range args {
		out = append(out, BeaconCommandArg{
			Kind:  arg.Kind,
			Value: arg.Value,
		})
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
