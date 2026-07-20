package plugin

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// resolvePluginsRoot 解析插件根目录：优先工作目录下的 plugins，其次可执行文件同级 plugins
func resolvePluginsRoot() string {
	candidates := make([]string, 0, 2)

	if wd, err := os.Getwd(); err == nil && wd != "" {
		candidates = append(candidates, filepath.Join(wd, "plugins"))
	}
	if exe, err := os.Executable(); err == nil && exe != "" {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "plugins"))
	}

	for _, dir := range candidates {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
	}

	if len(candidates) > 0 {
		return candidates[0]
	}
	return "plugins"
}

// resolvePluginSourceRoot 解析待安装插件源路径，要求包含 plugin.json
func resolvePluginSourceRoot(sourcePath string) (string, error) {
	cleaned := strings.TrimSpace(sourcePath)
	if cleaned == "" {
		return "", fmt.Errorf("plugin path is required")
	}

	absPath, err := filepath.Abs(cleaned)
	if err != nil {
		return "", fmt.Errorf("resolve plugin path failed: %w", err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", fmt.Errorf("plugin path not found: %w", err)
	}

	if !info.IsDir() {
		absPath = filepath.Dir(absPath)
	}

	manifestPath := filepath.Join(absPath, "plugin.json")
	if info, err := os.Stat(manifestPath); err == nil && !info.IsDir() {
		return absPath, nil
	}

	return "", fmt.Errorf("plugin manifest not found: %s", manifestPath)
}

// copyPluginDir 递归复制插件目录，保留文件权限
func copyPluginDir(source, dest string) error {
	return filepath.WalkDir(source, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dest, rel)

		info, err := d.Info()
		if err != nil {
			return err
		}

		if d.IsDir() {
			return os.MkdirAll(target, info.Mode().Perm())
		}

		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode().Perm())
	})
}

// isWithinDir 判断 target 是否在 root 目录内（含 root 自身）
func isWithinDir(root, target string) bool {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." {
		return false
	}
	prefix := ".." + string(filepath.Separator)
	return !strings.HasPrefix(rel, prefix)
}

// validatePluginRelativeFile 校验相对 root 的文件路径：不逃逸、存在、非目录、非空
func validatePluginRelativeFile(root, relativePath string) error {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	targetAbs, err := filepath.Abs(filepath.Join(rootAbs, relativePath))
	if err != nil {
		return err
	}
	if !isWithinDir(rootAbs, targetAbs) {
		return fmt.Errorf("path escapes plugin root: %s", relativePath)
	}
	info, err := os.Stat(targetAbs)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("path is a directory: %s", relativePath)
	}
	if info.Size() == 0 {
		return fmt.Errorf("file is empty: %s", relativePath)
	}
	return nil
}

// readPluginFileBase64 读取插件内文件并返回 base64 编码；路径不得逃逸插件根
func readPluginFileBase64(root, relativePath string) (string, error) {
	if strings.TrimSpace(root) == "" || strings.TrimSpace(relativePath) == "" {
		return "", nil
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(filepath.Join(rootAbs, relativePath))
	if err != nil {
		return "", err
	}
	if !isWithinDir(rootAbs, targetAbs) {
		return "", fmt.Errorf("path escapes plugin root: %s", relativePath)
	}

	data, err := os.ReadFile(targetAbs)
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", fmt.Errorf("file is empty: %s", relativePath)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}
