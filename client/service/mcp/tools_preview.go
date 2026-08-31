package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

type previewRemoteIn struct {
	BeaconID   string `json:"beacon_id"`
	RemotePath string `json:"remote_path" jsonschema:"远端文件绝对路径(C:\\... 或 /...)"`
	TimeoutMs  int    `json:"timeout_ms,omitempty" jsonschema:"等待回传完成的超时,默认 30000"`
}

// previewReadyPred 命中指定预览任务的完成帧:
// COMMAND_EVENT + data.phase=preview + data.preview_id 匹配 + status ready/failed。
// previewEventMeta 取 COMMAND_EVENT 里的预览元数据对象。
// 真实帧的元数据嵌套在 payload.data.data(与 beacon_id 同类嵌套,见
// scripts/diag-preview-frame.mjs 抓帧);兼容旧的扁平结构。
func previewEventMeta(payload any) map[string]any {
	obj, _ := payload.(map[string]any)
	sub, _ := obj["data"].(map[string]any)
	if inner, ok := sub["data"].(map[string]any); ok && inner != nil {
		return inner
	}
	return sub
}

func previewReadyPred(previewID string) func(FrameRecord) bool {
	return func(rec FrameRecord) bool {
		if rec.Type != "COMMAND_EVENT" {
			return false
		}
		sub := previewEventMeta(rec.Payload)
		if sub == nil {
			return false
		}
		if fmt.Sprint(sub["preview_id"]) != previewID {
			return false
		}
		switch strings.ToLower(fmt.Sprint(sub["status"])) {
		case "ready", "failed":
			return true
		default:
			return false
		}
	}
}

// registerPreviewTools 提供自包含的远端文件预览:
// 创建任务 → 内部等就绪事件 → 拉取内容 → DELETE 释放服务端内存。
// 对 Agent 而言是一次调用拿到全部结果,无需感知异步细节。
func registerPreviewTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "preview_remote_file",
		Description: "读取 beacon 主机上文本/图片文件的预览内容(白名单受限、2MB 上限,内存中转不落盘)。" +
			"文本直接返回 UTF-8 内容;图片落盘本地 PNG/JPEG 并返回路径。" +
			"不支持的类型或超限时报错并提示改用 DOWNLOAD。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in previewRemoteIn) (*msdk.CallToolResult, any, error) {
		beacon := strings.TrimSpace(in.BeaconID)
		path := strings.TrimSpace(in.RemotePath)
		if beacon == "" || path == "" {
			return nil, nil, fmt.Errorf("beacon_id 与 remote_path 必填")
		}
		// 结果经 CommandDownload 分块按心跳回传,10s 全局默认太紧:
		// 本工具遵循自身文档,未指定时等 30s。
		timeout := time.Duration(in.TimeoutMs) * time.Millisecond
		if in.TimeoutMs <= 0 {
			timeout = 30 * time.Second
		}

		_, data, err := s.ts.Do(ctx, "POST",
			"/api/v1/beacon/"+urlEscape(beacon)+"/preview", map[string]any{"path": path})
		if err != nil {
			return nil, nil, err
		}
		var view struct {
			PreviewID string `json:"preview_id"`
			Kind      string `json:"kind"`
			Mime      string `json:"mime"`
			Status    string `json:"status"`
		}
		if err := json.Unmarshal(data, &view); err != nil || view.PreviewID == "" {
			return nil, nil, fmt.Errorf("预览响应缺少 preview_id: %s", truncateJSON(data))
		}
		// 创建成功即登记释放:超时/失败/成功任一路径都回收服务端内存(TTL 兜底前)。
		defer s.releasePreview(context.WithoutCancel(ctx), view.PreviewID)

		// 同步就绪的响应(status=ready)可跳过等待;否则等 WS 完成帧。
		status := strings.ToLower(view.Status)
		var failureReason string
		if status != "ready" {
			rec, err := s.deps.Sink.WaitFunc(ctx, previewReadyPred(view.PreviewID), timeout)
			if err != nil {
				return nil, nil, fmt.Errorf("等待预览内容超时(%v): %w", timeout, err)
			}
			if sub := previewEventMeta(rec.Payload); sub != nil {
				status = strings.ToLower(fmt.Sprint(sub["status"]))
				failureReason = strings.ToLower(strings.TrimSpace(fmt.Sprint(sub["reason"])))
				if v, ok := sub["mime"].(string); ok && v != "" {
					view.Mime = v
				}
			}
		}
		if status == "failed" {
			hint := "读取失败"
			if failureReason == "too_large" {
				hint = "文件超出 2MB 预览上限,请改用 send_beacon_command(DOWNLOAD)"
			}
			return nil, nil, fmt.Errorf("%s(reason=%s)", hint, firstNonEmpty(failureReason, "unknown"))
		}

		blob, err := s.ts.DownloadBytes(ctx, "/api/v1/preview/"+urlEscape(view.PreviewID))
		if err != nil {
			return nil, nil, err
		}

		out := map[string]any{
			"kind": strings.ToLower(firstNonEmpty(view.Kind, "text")),
			"mime": firstNonEmpty(view.Mime, "text/plain"),
			"path": path,
			"size": int64(len(blob)),
		}
		if strings.HasPrefix(out["kind"].(string), "image") {
			ext := "png"
			if strings.Contains(out["mime"].(string), "jpeg") {
				ext = "jpg"
			} else if strings.Contains(out["mime"].(string), "gif") {
				ext = "gif"
			}
			target, werr := writeArtifact(blob, downloadsDir("previews"), view.PreviewID+"."+ext)
			if werr != nil {
				return nil, nil, werr
			}
			out["path_local"] = target
			out["note"] = "图片已落盘,可用本机工具查看该路径。"
		} else {
			out["content"] = string(blob)
		}
		return textResult(out)
	})
}

// releasePreview 尽力释放服务端预览内存;失败静默(TTL 兜底 5 分钟)。
func (s *Server) releasePreview(ctx context.Context, previewID string) {
	if previewID == "" {
		return
	}
	releaseCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_, _, _ = s.ts.Do(releaseCtx, "DELETE", "/api/v1/preview/"+urlEscape(previewID), nil)
}
