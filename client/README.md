# Iris Client

[中文](README.md) · [English](README.en.md)

TeamServer 的桌面控制端。看 beacon、下命令、传文件、管隧道、跑插件，都在这个窗口里。Windows、Linux、macOS 都能编。

更细的说明不堆在这里，去 [docs](docs/)（[English](docs/README.en.md)）：

- [MCP 工具](docs/mcp.md)：给 Agent 用的本地 MCP，19 个工具和几条可复现剧本
- [插件 schema](docs/plugins.md)：`plugin.json` v2 怎么写
- [Linux ELF BOF](docs/linux-elf-bof.md)：Linux x64 BOF 的编法和限制

## 环境

- **Go** 1.25（`go.mod` 写的是 `go 1.25.0`）
- **Node.js** 22 及以上（这边测过 v22.21.0）
- **Wails 3 CLI**，跟 `go.mod` 里的 `wails/v3 v3.0.0-beta.15` 对齐：

  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.15
  ```

- clone 下来先装一次前端依赖：

  ```bash
  cd frontend
  npm install
  ```

改版本号不用自己满仓库搜，源头是 `build/config.yml` 的 `info.version`：

```bash
wails3 task version:bump VERSION=0.4.0
```

侧栏、帮助页、MCP、Windows/Linux/macOS 打包元数据会一起改。插件 `plugin.json` 和文档里的历史句子不动。

Windows 要有 WebView2。Win10 1803+ 和 Win11 自带，更老的自己装：[WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)。

Ubuntu 需要 webkit / gtk。22.04 用 4.1，更老的发行版可能只有 4.0：

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev build-essential pkg-config
# 旧版可以换成 libwebkit2gtk-4.0-dev
```

macOS 装一下 Xcode Command Line Tools：

```bash
xcode-select --install
```

Wails 自己的安装说明：[v3.wails.io](https://v3.wails.io/zh-cn/)。

## Windows

开发：

```powershell
wails3 task dev
```

构建：

```powershell
wails3 task windows:build ARCH=amd64
```

打 NSIS 安装包：

```powershell
wails3 task windows:package ARCH=amd64
```

东西都在 `bin\`。常见两个：`bin\client.exe`、`bin\client-amd64-installer.exe`。

## Ubuntu Linux

开发：

```bash
wails3 task dev
```

Ubuntu 24.04 上程序会自己带这两项，躲开 WebKitGTK 的坑：

```text
WEBKIT_DISABLE_DMABUF_RENDERER=1
GSK_RENDERER=cairo
```

构建：

```bash
wails3 task linux:build ARCH=amd64
```

打包（AppImage、deb、rpm、archlinux）：

```bash
wails3 task linux:package ARCH=amd64
```

只要 AppImage：

```bash
wails3 task linux:create:appimage ARCH=amd64
```

只要 deb：

```bash
wails3 task linux:create:deb ARCH=amd64
```

产物在 `bin/`。

## macOS

开发：

```bash
wails3 task dev
```

构建当前架构：

```bash
wails3 task darwin:build
```

指定架构：

```bash
wails3 task darwin:build ARCH=arm64
wails3 task darwin:build ARCH=amd64
```

打 `.app`：

```bash
wails3 task darwin:package
```

universal `.app`：

```bash
wails3 task darwin:package:universal
```

DMG：

```bash
wails3 task darwin:package:dmg
```

产物在 `bin/`。常见是 `bin/client.app`、`bin/client.dmg`。

从 GitHub Release 下的未签名 `.app`，Gatekeeper 会拦。Finder 里右键「打开」，弹窗再点一次「打开」，做一遍就行。或者：

```bash
xattr -dr com.apple.quarantine /path/to/client.app
```

之后双击就能开。

## Linux 安装包怎么用

Release 里有 AppImage、deb、rpm。按发行版挑一个。

AppImage 解压后给执行权限就能跑：

```bash
chmod +x client-<version>-linux-amd64.AppImage
./client-<version>-linux-amd64.AppImage
```

第一次跑如果缺 FUSE：Ubuntu/Debian 装 `libfuse2`，Fedora 装 `fuse fuse-libs`。

deb：

```bash
sudo dpkg -i client-<version>-linux-amd64.deb
sudo apt-get install -f
```

装完应用菜单里有「Iris Client」，终端也可以敲 `client`。卸：`sudo apt-get remove client`，连配置一起清用 `purge`。

rpm：

```bash
sudo rpm -i client-<version>-linux-amd64.rpm
# 或者让 dnf 拉依赖
sudo dnf install client-<version>-linux-amd64.rpm
```

卸：`sudo rpm -e client` 或 `sudo dnf remove client`。

deb / rpm 装到哪、桌面项和 icon 从哪来，看 `build/linux/nfpm/nfpm.yaml`。
