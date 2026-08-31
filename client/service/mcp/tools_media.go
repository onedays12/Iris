package mcp

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	msdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

type requestScreenshotIn struct {
	BeaconID  string `json:"beacon_id"`
	MonitorID int    `json:"monitor_id,omitempty" jsonschema:"显示器编号,0 表示全部"`
	Quality   int    `json:"quality,omitempty" jsonschema:"JPEG 质量 1-100,默认 80"`
}

type screenshotNameIn struct {
	ScreenshotID string `json:"screenshot_id" jsonschema:"list_screenshots 返回的截图 id"`
	SavePath     string `json:"save_path,omitempty" jsonschema:"落盘路径;缺省写入 %TEMP%\\iris-mcp-downloads\\screenshots\\<ts>_<id>.png"`
}

func registerScreenshotTools(s *Server) {
	msdk.AddTool(s.srv, &msdk.Tool{
		Name: "request_screenshot",
		Description: "向 beacon 下发截图任务(cmd SCREENSHOT)。异步执行:随后用" +
			"wait_for_event(type_prefix=COMMAND,beacon_id=...) 等待完成,再 list_screenshots/save_screenshot 取回。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in requestScreenshotIn) (*msdk.CallToolResult, any, error) {
		if strings.TrimSpace(in.BeaconID) == "" {
			return nil, nil, fmt.Errorf("beacon_id 必填")
		}
		// 未填写时 SDK 解码为字面量 0,而质量 0 越界非法:
		// 缺省时不携带该参数,让命令层套用 80 默认值;显式传值则严校。
		source := []any{in.MonitorID}
		switch {
		case in.Quality == 0:
		case in.Quality < 1 || in.Quality > 100:
			return nil, nil, fmt.Errorf("quality %d 越界 [1,100]", in.Quality)
		default:
			source = append(source, in.Quality)
		}
		wire, err := buildBeaconCommandArgs(CommandID["SCREENSHOT"], source)
		if err != nil {
			return nil, nil, err
		}
		return s.callBeaconCommand(ctx, in.BeaconID, CommandID["SCREENSHOT"], wire)
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "list_screenshots",
		Description: "列出 TeamServer 暂存的全部截图(screenshot_id/尺寸/来源 beacon 等)。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in struct{}) (*msdk.CallToolResult, any, error) {
		_, data, err := s.ts.Do(ctx, "GET", "/api/v1/screenshot/list", nil)
		if err != nil {
			return nil, nil, err
		}
		return rawResult(data)
	})

	msdk.AddTool(s.srv, &msdk.Tool{
		Name:        "save_screenshot",
		Description: "把指定截图取回到本机写盘,返回绝对路径+sha256+大小。",
	}, func(ctx context.Context, req *msdk.CallToolRequest, in screenshotNameIn) (*msdk.CallToolResult, any, error) {
		id := strings.TrimSpace(in.ScreenshotID)
		if id == "" {
			return nil, nil, fmt.Errorf("screenshot_id 必填")
		}
		blob, err := s.ts.DownloadBytes(ctx, "/api/v1/screenshot/download?screenshot_id="+urlEscape(id))
		if err != nil {
			return nil, nil, err
		}
		target := strings.TrimSpace(in.SavePath)
		if target == "" {
			target = filepath.Join(downloadsDir("screenshots"), id+".png")
		}
		target, err = writeArtifact(blob, filepath.Dir(target), filepath.Base(target))
		if err != nil {
			return nil, nil, err
		}
		sum := sha256Of(blob)
		return textResult(map[string]any{
			"path": target, "sha256": sum,
			"size": int64(len(blob)), "screenshot_id": id,
		})
	})
}
