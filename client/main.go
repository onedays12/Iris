package main

import (
	"embed"
	_ "embed"
	"log"
	"os"
	"runtime"

	"irisclient/service"
	"irisclient/service/mcp"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	applyLinuxWebKitWorkarounds()

	// MCP 事件出口与会话状态:Fanout 把 WS 帧同时送往前端与 MCP 环形缓冲,
	// Connect 钩子把 GUI 登录凭据同步给 MCP 工具面(见 mcp-server-execution-plan.md)。
	// 容量 5000:两三个 beacon 的心跳流几分钟能灌满小缓冲,把 COMMAND 结果
// 挤出环形区,操作员就只能翻丢失的历史(2026-08 实测 1000 条不够)。
	sink := mcp.NewEventSink(5000)
	sess := mcp.NewSessionState()
	wsSvc := service.NewWebSocketServiceWithOpts(
		service.WithEventEmitter(
			service.NewFanoutEmitter(service.NewWailsEventEmitter(), sink)),
		service.WithConnectHook(sess.SetCredentials),
	)

	startMCPServer(mcp.Deps{
		Sess:     sess,
		Sink:     sink,
		WSStatus: wsSvc.Status,
	})

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor an application when running on macOS.
	app := application.New(application.Options{
		Name:        "Iris Client",
		Description: "Command & Control Client Management Platform",
		Services: []application.Service{
			application.NewService(service.NewFileService()),
			application.NewService(service.NewPluginService()),
			application.NewService(service.NewProxyService()),
			application.NewService(wsSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		// beta.15:Chromium 启动参数从窗口级 AdditionalLaunchArgs 迁到应用级
		Windows: application.WindowsOptions{
			AdditionalBrowserArgs: []string{"--ignore-certificate-errors"},
		},
	})

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Iris Client",
		Width:            1300,
		Height:           900,
		BackgroundColour: application.NewRGB(10, 10, 26),
		URL:              "/",
		// Windows 上原生 DropTarget 会接管文件拖放,DOM 收不到 drop 事件;
		// 文件浏览器的拖拽上传依赖该机制(前端落点元素标 data-file-drop-target)。
		EnableFileDrop: true,
	})

	// 原生拖拽桥:把 dropzone 落点(文件绝对路径 + 目标元素 id)转发给前端,
	// 文件浏览器按 targetId 认领并走暂存区→beacon 上传管线。
	win.OnWindowEvent(events.Common.WindowFilesDropped, func(evt *application.WindowEvent) {
		files := evt.Context().DroppedFiles()
		targetID := ""
		if details := evt.Context().DropTargetDetails(); details != nil {
			targetID = details.ElementID
		}
		application.Get().Event.Emit("iris:dropped-files", map[string]any{
			"files":    files,
			"targetId": targetID,
		})
	})

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}

// startMCPServer 显式启动本地 MCP HTTP 服务(端口默认 127.0.0.1:9333,
// env IRIS_MCP_LISTEN 覆盖)。失败仅记日志,不阻断 GUI 启动——MCP 属于
// 增强能力,不该因端口占用等原因拖垮主程序。
func startMCPServer(deps mcp.Deps) {
	srv := mcp.NewServer(deps)
	addr := mcp.ListenAddr()
	if err := srv.Start(addr); err != nil {
		log.Printf("[iris-mcp] MCP server 启动失败(addr=%s): %v", addr, err)
		return
	}
	log.Printf("[iris-mcp] listening on %s", srv.Addr())
}

func applyLinuxWebKitWorkarounds() {
	if runtime.GOOS != "linux" {
		return
	}

	setEnvDefault("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
	setEnvDefault("GSK_RENDERER", "cairo")
}

func setEnvDefault(key, value string) {
	if os.Getenv(key) == "" {
		_ = os.Setenv(key, value)
	}
}
