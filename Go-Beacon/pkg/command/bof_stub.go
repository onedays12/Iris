//go:build (!windows && !linux) || !amd64 || (linux && amd64 && !cgo)

package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/packet"
	"fmt"
)

// BOFCommand 是不支持 BOF 执行的平台上的占位实现。
type BOFCommand struct{}

func (c *BOFCommand) Execute(p *packet.Parser, acp int) ([][]byte, error) {
	return nil, fmt.Errorf("bof execution is only supported on windows/amd64 and linux/amd64 with cgo")
}

func StartBOFJob(manager *jobs.Manager, sink func([]byte), taskID uint32, commandID uint32, p *packet.Parser, acp int) ([]byte, error) {
	return nil, fmt.Errorf("bof execution is only supported on windows/amd64 and linux/amd64 with cgo")
}
