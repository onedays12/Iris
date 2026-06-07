// Package jobs 实现 Beacon 的后台任务管理器。
// 支持两类后台任务：进程型（Shell/PowerShell）和 BOF 型。
// Manager 通过 context 控制任务生命周期，支持优雅关闭和超时强制退出。
package jobs

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Type 标识后台任务的类型。
type Type string

const (
	TypeProcess Type = "process" // Shell/PowerShell 进程
	TypeBOF     Type = "bof"     // BOF/COFF 加载器
)

// State 标识后台任务的运行状态。
type State string

const (
	StateRunning  State = "running"  // 正在运行
	StateStopping State = "stopping" // 正在停止
)

// Job 代表一个后台任务，持有 context 用于取消和超时控制。
type Job struct {
	ID        uint32      // 任务 ID（由 TaskID 复用）
	CommandID uint32      // 触发此 Job 的命令 ID
	Type      Type        // 任务类型
	State     State       // 当前状态
	Name      string      // 显示名称（如 "shell"、"powershell"）
	Ref       string      // 引用标识（如 BOF 名称）
	Detail    string      // 附加信息（如命令行内容）
	StartedAt time.Time   // 启动时间

	ctx    context.Context    // 任务上下文（取消时 Done）
	cancel context.CancelFunc // 取消函数

	mu       sync.Mutex   // 保护 process 和 onCancel
	process  *os.Process  // 关联的系统进程（用于 Kill）
	onCancel func()       // 自定义取消钩子（如关闭 pipe）
}

// Row 是 Job 的只读快照，用于 jobs 命令的表格展示。
type Row struct {
	ID        uint32 // 任务 ID
	Type      string // 类型
	State     string // 状态
	Age       int64  // 已运行秒数
	CommandID uint32 // 命令 ID
	Name      string // 名称
	Ref       string // 引用
	Detail    string // 详情
}

// Context 返回任务的 context，可用于 select 监听取消信号。
func (j *Job) Context() context.Context {
	return j.ctx
}

// SetProcess 绑定一个系统进程，取消时会自动 Kill。
func (j *Job) SetProcess(process *os.Process) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.process = process
}

// SetCancelHook 设置自定义取消钩子（如关闭 stdin pipe），在取消时优先调用。
func (j *Job) SetCancelHook(fn func()) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.onCancel = fn
}

func (j *Job) requestCancel() {
	j.mu.Lock()
	j.State = StateStopping
	cancel := j.cancel
	process := j.process
	onCancel := j.onCancel
	j.mu.Unlock()

	if onCancel != nil {
		onCancel()
	}
	if cancel != nil {
		cancel()
	}
	if process != nil {
		_ = process.Kill()
	}
}

type Manager struct {
	mu           sync.Mutex
	jobs         map[uint32]*Job
	shuttingDown bool
	wg           sync.WaitGroup
}

// NewManager 创建一个新的后台任务管理器。
func NewManager() *Manager {
	return &Manager{
		jobs: make(map[uint32]*Job),
	}
}

// Create 创建一个新任务并注册到管理器，返回 Job 实例供调用方启动。
func (m *Manager) Create(id uint32, commandID uint32, typ Type, name string) (*Job, error) {
	if id == 0 {
		return nil, fmt.Errorf("invalid job id")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.shuttingDown {
		return nil, fmt.Errorf("job manager is shutting down")
	}
	if _, exists := m.jobs[id]; exists {
		return nil, fmt.Errorf("job %d already exists", id)
	}

	ctx, cancel := context.WithCancel(context.Background())
	job := &Job{
		ID:        id,
		CommandID: commandID,
		Type:      typ,
		State:     StateRunning,
		Name:      name,
		StartedAt: time.Now(),
		ctx:       ctx,
		cancel:    cancel,
	}
	m.jobs[id] = job
	return job, nil
}

// Start 在 goroutine 中执行任务函数 fn，完成后自动调用 Complete 清理。
func (m *Manager) Start(job *Job, fn func(*Job)) {
	if job == nil || fn == nil {
		return
	}

	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		defer m.Complete(job.ID)
		fn(job)
	}()
}

// Complete 标记任务完成并从管理器中移除，释放关联的 context。
func (m *Manager) Complete(id uint32) {
	m.mu.Lock()
	job := m.jobs[id]
	delete(m.jobs, id)
	m.mu.Unlock()

	if job != nil && job.cancel != nil {
		job.cancel()
	}
}

// RequestKill 请求终止指定任务（调用取消钩子 → 取消 context → Kill 进程）。
func (m *Manager) RequestKill(id uint32) (string, bool) {
	m.mu.Lock()
	job := m.jobs[id]
	m.mu.Unlock()

	if job == nil {
		return "", false
	}

	job.requestCancel()
	if job.Type == TypeBOF {
		return fmt.Sprintf("job %d (%s) stop requested", id, jobName(job)), true
	}
	return fmt.Sprintf("job %d (%s) kill requested", id, jobName(job)), true
}

// List 返回格式化的任务列表字符串（用于 jobs 命令输出）。
func (m *Manager) List() string {
	return FormatRows(m.Rows())
}

// Rows 返回所有活跃任务的只读快照（按 ID 排序）。
func (m *Manager) Rows() []Row {
	m.mu.Lock()
	ids := make([]uint32, 0, len(m.jobs))
	for id := range m.jobs {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	snap := make([]*Job, 0, len(ids))
	for _, id := range ids {
		snap = append(snap, m.jobs[id])
	}
	m.mu.Unlock()

	rows := make([]Row, 0, len(snap))
	now := time.Now()
	for _, job := range snap {
		age := int64(now.Sub(job.StartedAt).Seconds())
		if age < 0 {
			age = 0
		}
		rows = append(rows, Row{
			ID:        job.ID,
			Type:      string(job.Type),
			State:     string(job.State),
			Age:       age,
			CommandID: job.CommandID,
			Name:      job.Name,
			Ref:       job.Ref,
			Detail:    job.Detail,
		})
	}
	return rows
}

// FormatRows 将任务行格式化为对齐的表格字符串。
func FormatRows(rows []Row) string {
	if len(rows) == 0 {
		return "No active jobs"
	}

	var b strings.Builder
	b.WriteString("ID          Type        State       Age(s)     Command    Name        Ref                 Detail\n")
	b.WriteString("----------  ----------  ----------  ---------  ---------  ----------  ------------------  ----------------\n")
	for _, row := range rows {
		age := row.Age
		if age < 0 {
			age = 0
		}
		fmt.Fprintf(&b, "%-10d  %-10s  %-10s  %-9d  %-9d  %-10s  %-18s  %s\n",
			row.ID,
			row.Type,
			row.State,
			age,
			row.CommandID,
			valueOrDash(row.Name),
			valueOrDash(row.Ref),
			valueOrDash(row.Detail))
	}
	return strings.TrimRight(b.String(), "\n")
}

// Close 请求所有任务退出，等待最多 5 秒后强制返回。
// 关闭顺序：标记 shuttingDown → 取消所有任务 → 等待 goroutine 完成（或超时）。
func (m *Manager) Close() {
	// 1. 标记关闭状态并请求取消所有任务
	m.mu.Lock()
	m.shuttingDown = true
	for _, job := range m.jobs {
		job.requestCancel()
	}
	m.mu.Unlock()

	// 2. 等待所有任务 goroutine 退出，最多 5 秒
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}
}

func jobName(job *Job) string {
	if job == nil || job.Name == "" {
		return "unknown"
	}
	return job.Name
}

func valueOrDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
