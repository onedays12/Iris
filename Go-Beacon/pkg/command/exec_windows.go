//go:build windows

package command

import (
	"context"
	"os/exec"
	"syscall"
)

const createNoWindow = 0x08000000

func newWindowsShellCmd(ctx context.Context, raw string, powershell bool) *exec.Cmd {
	exe := "cmd.exe"
	if powershell {
		exe = "powershell.exe"
	}
	cmd := exec.CommandContext(ctx, exe)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CmdLine:       windowsShellCmdLine(raw, powershell),
		CreationFlags: createNoWindow,
	}
	return cmd
}
