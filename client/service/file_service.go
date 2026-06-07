package service

import (
	"encoding/base64"
	"fmt"
	"os"
)

// FileService is a service for reading the local filesystem
type FileService struct{}

// ReadBinaryFileBase64 reads a local file and returns base64-encoded data
func (f *FileService) ReadBinaryFileBase64(sourcePath string) (string, error) {
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %v", err)
	}

	return base64.StdEncoding.EncodeToString(data), nil
}

// WriteBinaryFile decodes base64 data and writes it to the specified local path
func (f *FileService) WriteBinaryFile(targetPath string, base64Data string) error {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("解码数据失败: %v", err)
	}

	err = os.WriteFile(targetPath, data, 0644)
	if err != nil {
		return fmt.Errorf("写入文件失败: %v", err)
	}

	return nil
}
