package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const defaultExecutionBOFCommandID = 70
const defaultPostExCommandID = 90

const (
	postExSpawnDLLSubcommand  = 5
	postExInjectDLLSubcommand = 6
	defaultPostExWaitMS       = 3000
	postExBackendRemoteThread = "remote-thread"
)

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

func (s *PluginService) InvokePluginAction(ctx context.Context, pluginID string, action string, payloadJSON string) (PluginSnapshot, error) {
	return s.manager.Invoke(ctx, pluginID, action, payloadJSON)
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
		left := result[i].DisplayName.SortKey()
		right := result[j].DisplayName.SortKey()
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
	// 阶段 1: 持写锁取出旧插件并清空 map,释放锁。
	// Close 可能做 I/O,必须移到锁外执行,避免阻塞 List/Get/Invoke。
	m.mu.Lock()
	toClose := make([]*PluginInstance, 0, len(m.plugins))
	for _, plugin := range m.plugins {
		toClose = append(toClose, plugin)
	}
	m.plugins = map[string]*PluginInstance{}
	m.mu.Unlock()

	// 锁外: 关闭旧插件。Close 错误不阻塞 reload(坏插件不应阻止其他插件加载)。
	for _, plugin := range toClose {
		if err := plugin.Close(); err != nil {
			log.Printf("plugin %s close during reload failed: %v", plugin.ID, err)
		}
	}

	// 锁外: 磁盘 I/O(MkdirAll/ReadDir/loadPlugin 全部无锁)。
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

	// 锁外加载所有插件(loadPlugin 无状态,不碰 m)。
	loaded := make(map[string]*PluginInstance, len(dirs))
	snapshots := make([]PluginSnapshot, 0, len(dirs))
	for _, dir := range dirs {
		plugin, loadErr := m.loadPlugin(dir)
		if plugin == nil {
			continue
		}
		if loadErr != nil {
			plugin.setError(loadErr)
		}
		loaded[plugin.ID] = plugin
		snapshots = append(snapshots, plugin.snapshot())
	}

	// 阶段 2: 持写锁把加载好的插件写入 map。
	// 注意: 期间可能有并发 Invoke 拿到的是空 map(阶段 1 已清空),会返回 not found,
	// 这是可接受的——reload 期间的短暂窗口内插件不可用是合理语义。
	m.mu.Lock()
	m.plugins = loaded
	m.mu.Unlock()

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
	pluginID = strings.TrimSpace(pluginID)

	// 持写锁取出 plugin 并从 map 移除。
	// 用写锁而非读锁:Delete 是写操作,且要从 map 移除,避免并发 Invoke 在移除前
	// 还能拿到这个即将被删的 plugin。
	m.mu.Lock()
	plugin, ok := m.plugins[pluginID]
	if ok {
		delete(m.plugins, pluginID)
	}
	m.mu.Unlock()
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

	// 锁外: Close + RemoveAll 可能做 I/O,移出锁外避免阻塞 List/Get/Invoke。
	// Close 错误记日志但不阻塞删除(插件目录仍要清理)。
	if err := plugin.Close(); err != nil {
		log.Printf("plugin %s close during delete failed: %v", plugin.ID, err)
	}
	if err := os.RemoveAll(plugin.Root); err != nil {
		return nil, fmt.Errorf("remove plugin failed: %w", err)
	}

	return m.Reload()
}

// Invoke 执行插件指定的动作，通常由前端用户点击操作触发
func (m *PluginManager) Invoke(ctx context.Context, pluginID string, action string, payloadJSON string) (PluginSnapshot, error) {
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

	if err := m.dispatchAction(ctx, plugin, pluginAction, payload); err != nil {
		plugin.setError(err)
		return plugin.snapshot(), err
	}

	plugin.setReady()
	return plugin.snapshot(), nil
}

// loadPlugin 从磁盘加载单个插件(schema v2 严格模式)。
//
// 该函数是无状态的:只读传入的 root 路径下的 plugin.json,不访问 PluginManager
// 任何字段,因此不需要持锁。历史上叫 loadPluginLocked 是误导——它从不在锁内访问 m。
// Reload 把它放在锁外执行,避免磁盘 I/O 阻塞 List/Get/Invoke。
func (m *PluginManager) loadPlugin(root string) (*PluginInstance, error) {
	manifestPath := filepath.Join(root, "plugin.json")
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read plugin manifest failed: %w", err)
	}

	manifest, err := decodePluginManifestV2(manifestBytes)
	if err != nil {
		return nil, err
	}

	if manifest.Name == "" {
		manifest.Name = filepath.Base(root)
	}
	if manifest.DisplayName.IsEmpty() {
		manifest.DisplayName = LocalizedText{Values: map[string]string{"default": manifest.Name}}
	}

	applyManifestConventions(&manifest)
	if err := normalizePluginActionFields(manifest.Actions); err != nil {
		return newPluginInstance(root, manifest), err
	}
	if err := derivePostExFromModule(root, manifest.Actions); err != nil {
		return newPluginInstance(root, manifest), err
	}
	if err := validatePluginManifest(root, manifest); err != nil {
		return newPluginInstance(root, manifest), err
	}
	if err := validateManifestV2(root, manifest); err != nil {
		return newPluginInstance(root, manifest), err
	}
	manifest.Actions = hydratePluginActions(root, manifest.Actions)

	return newPluginInstance(root, manifest), nil
}

func newPluginInstance(root string, manifest PluginManifest) *PluginInstance {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		rootAbs = root
	}
	return &PluginInstance{
		ID:        manifest.Name,
		Root:      rootAbs,
		Manifest:  manifest,
		Status:    "ready",
		LoadedAt:  time.Now(),
		UpdatedAt: time.Now(),
		LastError: "",
	}
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

	// cleanup 持有插件生命周期内需要释放的资源清理函数（如关闭 mmap、子进程、网络连接）。
	// 当前插件仅持有 base64 字符串等 GC 可回收数据，无注册项；
	// 字段就位以备未来引入真实资源时在 newPluginInstance 注册。
	cleanup []func() error
}

// Close 释放插件持有的所有资源。
//
// 遍历已注册的 cleanup 静默函数并清空切片，保证幂等（重复调用是 no-op）。
// 返回聚合的错误：多個清理函数失败时用 errors.Join 合并，方便调用方决定是否记日志。
//
// 注意:当前无任何插件注册 cleanup，本方法等同于 no-op 但保留了真实调度逻辑，
// 为 锁外关闭与未来资源扩展铺路。
func (p *PluginInstance) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.cleanup) == 0 {
		return nil
	}
	pending := p.cleanup
	p.cleanup = nil

	errs := make([]error, 0, len(pending))
	for _, fn := range pending {
		if fn == nil {
			continue
		}
		if err := fn(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

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
		ID:           p.ID,
		Name:         p.Manifest.Name,
		DisplayName:  p.Manifest.DisplayName,
		Version:      p.Manifest.Version,
		Description:  p.Manifest.Description,
		Path:         p.Root,
		Capabilities: clonePluginCapabilities(p.Manifest.Capabilities),
		Actions:      clonePluginActions(p.Manifest.Actions),
		Status:       p.Status,
		LastError:    p.LastError,
		LoadedAt:     p.LoadedAt,
		UpdatedAt:    p.UpdatedAt,
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
