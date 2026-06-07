package main

import (
	"embed"
	_ "embed"
	"log"
	"os"
	"runtime"

	"changeme/service"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

// main function serves as the application's entry point. It initializes the application, creates a window,
// and logs any error that might occur.
func main() {
	applyLinuxWebKitWorkarounds()

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        "Iris Client",
		Description: "Command & Control Client Management Platform",
		Services: []application.Service{
			application.NewService(&service.FileService{}),
			application.NewService(service.NewPluginService()),
			application.NewService(service.NewProxyService()),
			application.NewService(service.NewWebSocketService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Iris Client",
		Width:            1300,
		Height:           900,
		BackgroundColour: application.NewRGB(10, 10, 26),
		URL:              "/",
		Windows: application.WindowsWindow{
			AdditionalLaunchArgs: []string{"--ignore-certificate-errors"},
		},
	})

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
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
