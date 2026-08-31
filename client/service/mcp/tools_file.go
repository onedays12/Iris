package mcp

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// 本地产物目录:下载与截图的默认落盘位置。
func downloadsDir(kind string) string {
	return filepath.Join(os.TempDir(), "iris-mcp-downloads", kind)
}

type uploadLocalFileIn struct {
	FilePath   string `json:"file_path" jsonschema:"本机待上传文件的绝对路径"`
	RemoteName string `json:"remote_name,omitempty" jsonschema:"存储名,缺省用文件原名"`
}

// upload_local_file 把本地文件经 multipart 上传到 TeamServer 文件仓,
// 返回 file_id —— 随后可用 send_beacon_command(UPLOAD) 让 beacon 拉取。
func registerUploadTool(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "upload_local_file",
		Description: "上传本机文件到 TeamServer 文件仓并返回 file_id 与元数据。" +
			"随后可在目标 beacon 上用 send_beacon_command(UPLOAD) 让 beacon 经此中转取件。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in uploadLocalFileIn) (*msdk.CallToolResult, any, error) {
		path := strings.TrimSpace(in.FilePath)
		if path == "" {
			return nil, nil, fmt.Errorf("file_path 必填")
		}
		blob, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, fmt.Errorf("读取本地文件失败: %w", err)
		}
		if len(blob) == 0 {
			return nil, nil, fmt.Errorf("拒绝上传空文件 %q", path)
		}
		name := filepath.Base(path)
		if in.RemoteName != "" {
			name = filepath.Base(strings.TrimSpace(in.RemoteName))
		}
		data, err := s.ts.UploadBinary(ctx, "/api/v1/files/uploads", name, base64.StdEncoding.EncodeToString(blob))
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})
}

type downloadFileIn struct {
	FileID   string `json:"file_id" jsonschema:"list_downloads 返回的 StoredFile.file_id"`
	SavePath string `json:"save_path,omitempty" jsonschema:"落盘路径;缺省写入 %TEMP%\\iris-mcp-downloads\\files\\<ts>_<原文件名>"`
	NameHint string `json:"name_hint,omitempty" jsonschema:"缺省路径时的建议文件名"`
}

func registerDownloadTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "list_downloads",
		Description: "列出 beacon 已回传、暂存于 TeamServer 的下载产物(file_id/大小等)。配合 download_file 取回到本机。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in struct{}) (*msdk.CallToolResult, any, error) {
		_, data, err := s.ts.Do(ctx, "GET", "/api/v1/files/downloads", nil)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "download_file",
		Description: "把指定 file_id 的暂存产物取回本机并写盘,返回绝对路径+sha256+大小。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in downloadFileIn) (*msdk.CallToolResult, any, error) {
		id := strings.TrimSpace(in.FileID)
		if id == "" {
			return nil, nil, fmt.Errorf("file_id 必填")
		}
		blob, err := s.ts.DownloadBytes(ctx, "/api/v1/files/downloads/"+id)
		if err != nil {
			return nil, nil, err
		}
		target := strings.TrimSpace(in.SavePath)
		if target == "" {
			target = filepath.Join(downloadsDir("files"),
				filepath.Base(firstNonEmpty(in.NameHint, id)+".bin"))
		}
		target, err = writeArtifact(blob, filepath.Dir(target), filepath.Base(target))
		if err != nil {
			return nil, nil, err
		}
		return textResult(map[string]any{
			"path": target, "sha256": sha256Of(blob),
			"size": int64(len(blob)), "file_id": id,
		})
	})
}
