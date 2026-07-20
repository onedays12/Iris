// Package file 提供本地文件系统读写的 FileService。
//
// 抽成独立子包是因为该服务零依赖其他业务文件,可完全独立测试与演化。
package file

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// maxReadSize 限制单次 ReadBinaryFileBase64 的文件大小（50MB），
// 超过此大小的文件应使用 ReadBinaryFileBase64Chunked 分片读取。
const maxReadSize = 50 * 1024 * 1024

// FileService is a service for reading the local filesystem
type FileService struct{}

// fileChunk 是 ReadBinaryFileBase64Chunked 返回的单个分片载荷。
// 字段顺序与历史 JSON 输出保持一致（offset/total_size/chunk_size/data），
// 用 struct 而非 map[string]any 以保证 json.Marshal 输出键序稳定。
type fileChunk struct {
	Offset    int64  `json:"offset"`
	TotalSize int64  `json:"total_size"`
	ChunkSize int    `json:"chunk_size"`
	Data      string `json:"data"`
}

// ReadBinaryFileBase64 reads a local file and returns base64-encoded data.
//
// Files larger than 50MB are rejected — use ReadBinaryFileBase64Chunked instead
// to avoid loading the entire file into memory.
func (f *FileService) ReadBinaryFileBase64(sourcePath string) (string, error) {
	cleanPath, err := normalizeLocalPath(sourcePath)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		return "", fmt.Errorf("stat file failed: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("path is a directory, not a file: %s", cleanPath)
	}
	if info.Size() > maxReadSize {
		return "", fmt.Errorf("file too large (%d bytes), use chunked read", info.Size())
	}

	data, err := os.ReadFile(cleanPath)
	if err != nil {
		return "", fmt.Errorf("read file failed: %w", err)
	}

	return base64.StdEncoding.EncodeToString(data), nil
}

// ReadBinaryFileBase64Chunked reads a local file in chunks and returns
// base64-encoded chunks with their offsets. This is for large files that
// exceed the 50MB single-read limit.
//
// Returns a JSON array of [{offset, total_size, chunk_size, base64_data}].
// The caller can iterate chunks and concatenate decoded data.
func (f *FileService) ReadBinaryFileBase64Chunked(sourcePath string, chunkSize int) (string, error) {
	cleanPath, err := normalizeLocalPath(sourcePath)
	if err != nil {
		return "", err
	}

	if chunkSize < 64*1024 {
		chunkSize = 512 * 1024 // default 512KB
	}
	if chunkSize > 4*1024*1024 {
		chunkSize = 4 * 1024 * 1024 // cap at 4MB
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		return "", fmt.Errorf("stat file failed: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("path is a directory, not a file: %s", cleanPath)
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		return "", fmt.Errorf("open file failed: %w", err)
	}
	defer file.Close()

	totalSize := info.Size()
	buf := make([]byte, chunkSize)
	var chunks []fileChunk
	offset := int64(0)

	for offset < totalSize {
		n, err := file.Read(buf)
		if n > 0 {
			chunks = append(chunks, fileChunk{
				Offset:    offset,
				TotalSize: totalSize,
				ChunkSize: n,
				Data:      base64.StdEncoding.EncodeToString(buf[:n]),
			})
			offset += int64(n)
		}
		if err != nil {
			break
		}
	}

	// 用 json.Marshal 而非手搓字符串：保证字段转义正确、键序稳定、
	// 未来加字段时不会引入注入风险。
	// chunks 为 nil 时 Marshal 返回 "null"，统一成 "[]" 让前端总能 JSON.parse 出数组。
	if chunks == nil {
		chunks = []fileChunk{}
	}
	body, err := json.Marshal(chunks)
	if err != nil {
		return "", fmt.Errorf("encode chunked response failed: %w", err)
	}
	return string(body), nil
}

// WriteBinaryFile decodes base64 data and writes it to the specified local path.
//
// The path is normalized and checked for directory traversal attacks.
// Existing files are overwritten only if the user has write permission.
func (f *FileService) WriteBinaryFile(targetPath string, base64Data string) error {
	cleanPath, err := normalizeLocalPath(targetPath)
	if err != nil {
		return err
	}

	// Ensure parent directory exists
	dir := filepath.Dir(cleanPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create directory failed: %w", err)
	}

	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("decode base64 data failed: %w", err)
	}

	// Write with 0644 permissions (owner read/write, group/others read)
	err = os.WriteFile(cleanPath, data, 0644)
	if err != nil {
		return fmt.Errorf("write file failed: %w", err)
	}

	return nil
}

// normalizeLocalPath cleans the path and blocks directory traversal.
//
// It checks the raw path for ".." segments before cleaning (filepath.Clean
// would resolve them, hiding the traversal). Both / and \ separators are
// checked to handle cross-platform paths.
func normalizeLocalPath(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	// Reject raw paths containing ".." as a path segment
	// Check before filepath.Clean which would resolve ".." away
	if containsDotDot(path) {
		return "", fmt.Errorf("path contains illegal directory traversal: %s", path)
	}

	// Clean the path to remove redundant separators and "." segments
	cleanPath := filepath.Clean(path)

	// Double-check after cleaning (should not happen, but defense in depth)
	if containsDotDot(cleanPath) {
		return "", fmt.Errorf("path contains illegal directory traversal: %s", path)
	}

	// Convert to absolute path
	absPath, err := filepath.Abs(cleanPath)
	if err != nil {
		return "", fmt.Errorf("resolve path failed: %w", err)
	}

	return absPath, nil
}

// containsDotDot checks if the path contains ".." as a path segment.
// It handles both / and \ separators.
func containsDotDot(path string) bool {
	// Normalize separators to / for consistent checking
	normalized := strings.ReplaceAll(path, "\\", "/")
	parts := strings.Split(normalized, "/")
	for _, part := range parts {
		if part == ".." {
			return true
		}
	}
	return false
}
