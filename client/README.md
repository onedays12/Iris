# C2 Client 构建命令

本文只记录 Windows、Ubuntu Linux、macOS 的开发、构建和打包命令。

## 通用准备

安装 Wails 3 CLI：

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
```

详细安装文档请参考 Wails 3 官网：https://v3.wails.io/zh-cn/

## Windows

### Dev

```powershell
wails3 task dev
```

### Build

```powershell
wails3 task windows:build ARCH=amd64
```

### Package

生成 NSIS setup 安装包：

```powershell
wails3 task windows:package ARCH=amd64
```

输出目录：

```text
bin\
```

常见产物：

```text
bin\client.exe
bin\client-amd64-installer.exe
```

## Ubuntu Linux

### Dev

```bash
wails3 task dev
```

Ubuntu 24.04 上程序会默认启用 WebKitGTK 兼容参数：

```text
WEBKIT_DISABLE_DMABUF_RENDERER=1
GSK_RENDERER=cairo
```

### Build

```bash
wails3 task linux:build ARCH=amd64
```

### Package

生成 AppImage、deb、rpm、archlinux package：

```bash
wails3 task linux:package ARCH=amd64
```

只生成 AppImage：

```bash
wails3 task linux:create:appimage ARCH=amd64
```

只生成 Ubuntu/Debian deb：

```bash
wails3 task linux:create:deb ARCH=amd64
```

输出目录：

```text
bin/
```

## macOS

### Dev

```bash
wails3 task dev
```

### Build

构建当前架构：

```bash
wails3 task darwin:build
```

构建指定架构：

```bash
wails3 task darwin:build ARCH=arm64
wails3 task darwin:build ARCH=amd64
```

### Package

生成 `.app`：

```bash
wails3 task darwin:package
```

生成 universal `.app`：

```bash
wails3 task darwin:package:universal
```

生成 DMG：

```bash
wails3 task darwin:package:dmg
```

输出目录：

```text
bin/
```

常见产物：

```text
bin/client.app
bin/client.dmg
```
