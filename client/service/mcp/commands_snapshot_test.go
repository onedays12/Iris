package mcp

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// TestCommandIDMirrorSnapshot 机械比对 Go 端 CommandID 与前端
// frontend/src/constants/commands.ts 的 COMMAND_ID 表:
// 每一个 TS 名称都必须存在于 Go 端且数值一致,防止双仓漂移。
func TestCommandIDMirrorSnapshot(t *testing.T) {
	tsPath := filepath.Join("..", "..", "frontend", "src", "constants", "commands.ts")
	raw, err := os.ReadFile(tsPath)
	if err != nil {
		t.Skipf("跳过: 找不到 commands.ts(单仓检出): %v", err)
	}
	re := regexp.MustCompile(`(?m)^\s*([A-Z][A-Z0-9_]+):\s*(\d+)\s*,\s*$`)
	found := map[string]int{}
	for _, m := range re.FindAllStringSubmatch(string(raw), -1) {
		name, num := m[1], atoi(m[2])
		if prev, dup := found[name]; dup && prev != num {
			t.Fatalf("TS 表内 %s 存在冲突定义 %d/%d", name, prev, num)
		}
		found[name] = num
	}
	if len(found) < 10 {
		t.Fatalf("解析到 %d 个命令,正则或文件结构可能变了", len(found))
	}
	for name, id := range found {
		got, ok := CommandID[name]
		if !ok {
			t.Errorf("Go 端缺少 TS 定义的命令 %s:%d", name, id)
			continue
		}
		if got != id {
			t.Errorf("命令 %s 数值漂移: go=%d ts=%d", name, got, id)
		}
	}
	for name := range CommandID {
		if _, ok := found[name]; !ok {
			t.Errorf("Go 端多出 TS 未定义的命令 %s(删除或改回镜像)", name)
		}
	}
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		n = n*10 + int(c-'0')
	}
	return n
}

// ─── buildBeaconCommandArgs 行为快照(镜像 commandArgs.ts 关键分支) ───

func TestBuildArgsNoArgCommands(t *testing.T) {
	for _, cmd := range []string{"WHOAMI", "PS", "PWD", "JOBS", "NETINFO", "NETSTAT"} {
		out, err := buildBeaconCommandArgs(CommandID[cmd], []any{"多余也会被忽略"})
		if err != nil || len(out) != 0 {
			t.Errorf("%s 应为无参命令(out=%+v err=%v)", cmd, out, err)
		}
	}
}

func TestBuildArgsShellRequiresOneString(t *testing.T) {
	if _, err := buildBeaconCommandArgs(CommandID["SHELL"], []any{}); err == nil {
		t.Error("SHELL 零参应报错")
	}
	out, err := buildBeaconCommandArgs(CommandID["POWERSHELL"], []any{"Get-Process"})
	if err != nil || len(out) != 1 || out[0].Kind != argKindString || out[0].Value != "Get-Process" {
		t.Fatalf("shell args = %+v err=%v", out, err)
	}
}

func TestBuildArgsSleepDefaultsAndRanges(t *testing.T) {
	out, err := buildBeaconCommandArgs(CommandID["SLEEP"], []any{5000.0})
	if err != nil || len(out) != 2 {
		t.Fatalf("sleep 单参应补 jitter 默认 0: %+v err=%v", out, err)
	}
	if out[0].Value != int64(5000) || out[1].Value != int64(0) ||
		out[0].Kind != argKindInt32 || out[1].Kind != argKindInt32 {
		t.Fatalf("sleep 类型化错误: %+v", out)
	}
	if _, err := buildBeaconCommandArgs(CommandID["SLEEP"], []any{-5}); err == nil {
		t.Error("负数 sleep 应报错")
	}
	out2, err := buildBeaconCommandArgs(CommandID["SLEEP"], []any{1, 999})
	if err != nil || out2[1].Value != int64(999) {
		t.Errorf("jitter 999 应原样通过: %+v err=%v", out2, err)
	}
}

func TestBuildArgsLSOptional(t *testing.T) {
	if out, err := buildBeaconCommandArgs(CommandID["LS"], nil); err != nil || len(out) != 0 {
		t.Fatalf("ls 零参合法: %+v %v", out, err)
	}
	out, err := buildBeaconCommandArgs(CommandID["LS"], []any{"C:\\tmp"})
	if err != nil || len(out) != 1 || out[0].Value != "C:\\tmp" {
		t.Fatalf("ls path: %+v %v", out, err)
	}
}

func TestBuildArgsDownloadChunkDefaults(t *testing.T) {
	out, err := buildBeaconCommandArgs(CommandID["DOWNLOAD"], []any{"C:\\a.txt"})
	if err != nil || len(out) != 3 {
		t.Fatalf("download 应回填默认分块: %+v err=%v", out, err)
	}
	if out[1].Value != int64(fileChunkSizeDefault) || out[2].Value != int64(chunksPerHeartbeatDefault) {
		t.Fatalf("chunk/heartbeat 默认值错误: %+v", out)
	}
	// 越界收敛
	out, _ = buildBeaconCommandArgs(CommandID["DOWNLOAD"], []any{"p", 1e9, 99})
	if out[1].Value != int64(fileChunkSizeMax) || out[2].Value != int64(chunksPerHeartbeatMax) {
		t.Fatalf("越界值未按前端规则收敛: %+v", out)
	}
}

func TestBuildArgsScreenshotDefaults(t *testing.T) {
	out, err := buildBeaconCommandArgs(CommandID["SCREENSHOT"], nil)
	if err != nil || len(out) != 2 || out[0].Value != int64(0) || out[1].Value != int64(80) {
		t.Fatalf("screenshot 默认 monitor=0 quality=80: %+v err=%v", out, err)
	}
}

func TestBuildArgsExplicitTypedPassthrough(t *testing.T) {
	in := []any{
		map[string]any{"kind": "int32", "value": float64(7)},
		map[string]any{"kind": "bytes", "value": []any{}},
	}
	out, err := buildBeaconCommandArgs(31 /*SETATTR 走 default 家族*/, in)
	if err != nil || len(out) != 2 || out[0].Value != int64(7) {
		t.Fatalf("显式对象应透传: %+v err=%v", out, err)
	}
	if _, err := buildBeaconCommandArgs(31, []any{42.0}); err == nil {
		t.Error("复杂命令的纯数值应被拒绝并引导")
	}
}

func TestResolveCommandIDByNameAndNumber(t *testing.T) {
	if id, err := resolveCommandID("whoami"); err != nil || id != CommandID["WHOAMI"] {
		t.Fatalf("小写名解析失败: %d %v", id, err)
	}
	if id, err := resolveCommandID(float64(50)); err != nil || id != 50 {
		t.Fatalf("数字解析失败: %d %v", id, err)
	}
	if _, err := resolveCommandID("NOPE"); err == nil {
		t.Error("未知命令名应报错")
	}
}
