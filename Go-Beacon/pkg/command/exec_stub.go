//go:build !windows

package command

import (
	"context"
	"os/exec"
)

func newWindowsShellCmd(ctx context.Context, raw string, powershell bool) *exec.Cmd {
	if powershell {
		return exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", raw)
	}
	return exec.CommandContext(ctx, "cmd.exe", "/c", raw)
}
