# C2 Client 构建命令

本文只记录 Windows、Ubuntu Linux、macOS 的开发、构建和打包命令。

## 环境前置条件

### 通用（所有平台）

- **Go** ≥ 1.24（项目用 `go 1.24.0`，toolchain `go1.24.4`）
- **Node.js** ≥ 22（实测 v22.21.0）
- **Wails 3 CLI**：需与 `go.mod` 锁定的 `wails/v3 v3.0.0-alpha.47` 对齐
  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-alpha.47
  ```
- **前端依赖**：clone 后在 `frontend/` 下安装一次
  ```bash
  cd frontend
  npm install
  ```

### Windows

- WebView2 Runtime（Win10 1803+ / Win11 自带；旧版 Win10 需手动安装：<https://developer.microsoft.com/microsoft-edge/webview2/>）

### Ubuntu Linux

- webview2 / gtk 系统依赖（Ubuntu 22.04 用 4.1；部分旧版发行版只有 4.0，二选一即可）：
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev build-essential pkg-config
  # 旧版 Ubuntu 可改用：
  # sudo apt install libwebkit2gtk-4.0-dev libgtk-3-dev build-essential pkg-config
  ```

### macOS

- Xcode Command Line Tools：
  ```bash
  xcode-select --install
  ```

## 通用准备

详细安装文档请参考 Wails 3 官网：<https://v3.wails.io/zh-cn/>

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

## macOS 首次运行

未签名的 `.app` 从 GitHub Release 下载后会被 Gatekeeper 拦截（"无法打开，因为无法验证开发者"）。两种绕过方式：

**方式一：右键打开**

在 Finder 中右键 `client.app` → 选择「打开」→ 在弹窗中点「打开」。只需做一次。

**方式二：终端去除隔离属性**

```bash
xattr -dr com.apple.quarantine /path/to/client.app
```

之后双击即可正常启动。

## Linux 产物安装与卸载

GitHub Release 的 Linux 产物有三种格式：AppImage（主推，免安装）、deb、rpm。按你的发行版选其一。

### AppImage（免安装，推荐）

下载 `client-<version>-linux-amd64.zip` 解压后得到 `client-<version>-linux-amd64.AppImage`，赋予执行权限即可运行：

```bash
chmod +x client-<version>-linux-amd64.AppImage
./client-<version>-linux-amd64.AppImage
```

> 首次运行如果系统提示缺少 FUSE，安装 `libfuse2`（Ubuntu/Debian：`sudo apt install libfuse2`；Fedora：`sudo dnf install fuse fuse-libs`）。

### deb（Debian / Ubuntu）

```bash
# 安装
sudo dpkg -i client-<version>-linux-amd64.deb

# 如缺依赖，补一下
sudo apt-get install -f
```

安装后可在应用菜单找到「Iris Client」，或终端运行 `client`。

卸载：

```bash
sudo apt-get remove client
# 或彻底清除配置
sudo apt-get purge client
```

### rpm（Fedora / RHEL / openSUSE）

```bash
# 安装
sudo rpm -i client-<version>-linux-amd64.rpm

# 或用 dnf 自动拉依赖
sudo dnf install client-<version>-linux-amd64.rpm
```

安装后可在应用菜单找到「Iris Client」，或终端运行 `client`。

卸载：

```bash
sudo rpm -e client
# 或
sudo dnf remove client
```

> deb / rpm 安装后的可执行文件路径、桌面项、icon 由 nfpm 配置决定，详见 `build/linux/nfpm/nfpm.yaml`。

