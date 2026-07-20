package file

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteBinaryFileRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "subdir", "test.bin")

	content := []byte("hello-world-content")
	b64 := base64.StdEncoding.EncodeToString(content)

	f := &FileService{}
	if err := f.WriteBinaryFile(targetPath, b64); err != nil {
		t.Fatalf("WriteBinaryFile error: %v", err)
	}

	// Verify file was created with correct content
	data, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}
	if string(data) != string(content) {
		t.Fatalf("content = %q, want %q", data, content)
	}
}

func TestWriteBinaryFileRejectsDirectoryTraversal(t *testing.T) {
	// Use a raw string with ".." — don't use filepath.Join which resolves it
	evilPath := "/tmp/../etc/passwd"

	f := &FileService{}
	err := f.WriteBinaryFile(evilPath, "dGVzdA==") // "test"
	if err == nil {
		t.Fatal("expected error for directory traversal path")
	}
	if !strings.Contains(err.Error(), "directory traversal") {
		t.Fatalf("expected directory traversal error, got %v", err)
	}
}

func TestWriteBinaryFileRejectsRelativeDotDot(t *testing.T) {
	f := &FileService{}
	err := f.WriteBinaryFile("../../evil.bin", "dGVzdA==")
	if err == nil {
		t.Fatal("expected error for .. relative path")
	}
}

func TestWriteBinaryFileRejectsEmptyPath(t *testing.T) {
	f := &FileService{}
	err := f.WriteBinaryFile("", "dGVzdA==")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestReadBinaryFileBase64RoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "read_test.bin")

	content := []byte("read-test-content")
	if err := os.WriteFile(targetPath, content, 0644); err != nil {
		t.Fatalf("setup WriteFile error: %v", err)
	}

	f := &FileService{}
	got, err := f.ReadBinaryFileBase64(targetPath)
	if err != nil {
		t.Fatalf("ReadBinaryFileBase64 error: %v", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(got)
	if err != nil {
		t.Fatalf("returned data is not valid base64: %v", err)
	}
	if string(decoded) != string(content) {
		t.Fatalf("decoded = %q, want %q", decoded, content)
	}
}

func TestReadBinaryFileBase64RejectsLargeFile(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "large.bin")

	// Create a file just over maxReadSize (50MB)
	largeContent := make([]byte, 51*1024*1024)
	if err := os.WriteFile(targetPath, largeContent, 0644); err != nil {
		t.Fatalf("setup WriteFile error: %v", err)
	}

	f := &FileService{}
	_, err := f.ReadBinaryFileBase64(targetPath)
	if err == nil {
		t.Fatal("expected error for large file")
	}
	if !strings.Contains(err.Error(), "file too large") {
		t.Fatalf("expected 'file too large' error, got %v", err)
	}
}

func TestReadBinaryFileBase64RejectsDirectory(t *testing.T) {
	tmpDir := t.TempDir()

	f := &FileService{}
	_, err := f.ReadBinaryFileBase64(tmpDir)
	if err == nil {
		t.Fatal("expected error for directory path")
	}
	if !strings.Contains(err.Error(), "directory") {
		t.Fatalf("expected directory error, got %v", err)
	}
}

func TestReadBinaryFileBase64RejectsTraversal(t *testing.T) {
	f := &FileService{}
	_, err := f.ReadBinaryFileBase64("../../../etc/passwd")
	if err == nil {
		t.Fatal("expected error for traversal path")
	}
}

func TestReadBinaryFileBase64Chunked(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "chunked.bin")

	// Create a 1MB file
	content := make([]byte, 1024*1024)
	for i := range content {
		content[i] = byte(i % 256)
	}
	if err := os.WriteFile(targetPath, content, 0644); err != nil {
		t.Fatalf("setup WriteFile error: %v", err)
	}

	f := &FileService{}
	// Read in 256KB chunks
	got, err := f.ReadBinaryFileBase64Chunked(targetPath, 256*1024)
	if err != nil {
		t.Fatalf("ReadBinaryFileBase64Chunked error: %v", err)
	}

	// 必须是合法 JSON 数组（手搓 JSON 改 json.Marshal 后的回归点）
	var chunks []fileChunk
	if err := json.Unmarshal([]byte(got), &chunks); err != nil {
		t.Fatalf("response is not valid JSON: %v\nraw: %s", err, got[:200])
	}
	if len(chunks) != 4 {
		t.Fatalf("expected 4 chunks, got %d", len(chunks))
	}

	// 字段顺序与历史 shape 一致: offset, total_size, chunk_size, data
	// json.Marshal 按 struct 字段声明顺序输出, 验证一下首 chunk 的序列化顺序
	first := chunks[0]
	if first.Offset != 0 {
		t.Errorf("first chunk offset = %d, want 0", first.Offset)
	}
	if first.TotalSize != 1024*1024 {
		t.Errorf("total_size = %d, want %d", first.TotalSize, 1024*1024)
	}
	if first.ChunkSize != 256*1024 {
		t.Errorf("chunk_size = %d, want %d", first.ChunkSize, 256*1024)
	}
	// 末尾 chunk offset 应为 3*256KB
	last := chunks[3]
	if last.Offset != 3*256*1024 {
		t.Errorf("last chunk offset = %d, want %d", last.Offset, 3*256*1024)
	}

	// round-trip: 拼回所有 chunk 的 base64 解码后应等于原文件
	var reconstructed bytes.Buffer
	for _, c := range chunks {
		part, err := base64.StdEncoding.DecodeString(c.Data)
		if err != nil {
			t.Fatalf("chunk %d data is not valid base64: %v", c.Offset, err)
		}
		reconstructed.Write(part)
	}
	if !bytes.Equal(reconstructed.Bytes(), content) {
		t.Fatalf("reconstructed content does not match original (len %d vs %d)",
			reconstructed.Len(), len(content))
	}
}

// TestReadBinaryFileBase64ChunkedEmptyFile 验证空文件返回 "[]" 而非 "null"。
// json.Marshal(nil slice) 会输出 "null", 让前端 JSON.parse 得到 null 而非数组,
// 代码里显式把 nil 替换为空切片以保证总是返回数组。
func TestReadBinaryFileBase64ChunkedEmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "empty.bin")
	if err := os.WriteFile(targetPath, []byte{}, 0644); err != nil {
		t.Fatalf("setup WriteFile error: %v", err)
	}

	f := &FileService{}
	got, err := f.ReadBinaryFileBase64Chunked(targetPath, 256*1024)
	if err != nil {
		t.Fatalf("ReadBinaryFileBase64Chunked on empty file error: %v", err)
	}
	if got != "[]" {
		t.Fatalf("empty file should return \"[]\", got %q", got)
	}
}

// TestReadBinaryFileBase64ChunkedChunkSizeClamp 验证 chunkSize 被夹到 [64KB, 4MB] 区间。
func TestReadBinaryFileBase64ChunkedChunkSizeClamp(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "clamp.bin")
	// 写一个超过默认 64KB 下限但小于 4MB 上限的文件
	content := make([]byte, 200*1024)
	if err := os.WriteFile(targetPath, content, 0644); err != nil {
		t.Fatalf("setup WriteFile error: %v", err)
	}

	f := &FileService{}
	// chunkSize=1 应被夹到默认 512KB
	got, err := f.ReadBinaryFileBase64Chunked(targetPath, 1)
	if err != nil {
		t.Fatalf("ReadBinaryFileBase64Chunked error: %v", err)
	}
	var chunks []fileChunk
	if err := json.Unmarshal([]byte(got), &chunks); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	// 200KB 文件 / 512KB chunk → 1 个 chunk, chunk_size = 200KB
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk for 200KB file with clamped 512KB chunkSize, got %d", len(chunks))
	}
	if chunks[0].ChunkSize != 200*1024 {
		t.Errorf("chunk_size = %d, want %d", chunks[0].ChunkSize, 200*1024)
	}
}
