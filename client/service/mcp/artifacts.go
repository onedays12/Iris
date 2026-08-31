package mcp

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

// ─── 产物落盘与指纹小工具(下载/截图/载荷共用) ───

func timeNowMilli() int64 { return time.Now().UnixMilli() }

func sha256Of(blob []byte) string {
	sum := sha256.Sum256(blob)
	return hex.EncodeToString(sum[:])
}

// writeArtifact 把字节写入 dir(缺省时按 <ts>_<base>)并返回路径。
func writeArtifact(blob []byte, dir, base string) (string, error) {
	target := filepath.Join(dir, fmt.Sprintf("%d_%s", timeNowMilli(), filepath.Base(base)))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", fmt.Errorf("创建目录失败: %w", err)
	}
	if err := os.WriteFile(target, blob, 0o644); err != nil {
		return "", fmt.Errorf("写盘失败: %w", err)
	}
	return target, nil
}

func urlEscape(s string) string { return url.QueryEscape(s) }
