# Iris Client

[中文](README.md) · [English](README.en.md)

Desktop console for TeamServer. Beacons, commands, file transfer, tunnels, plugins: all in this window. Builds on Windows, Linux, and macOS.

The long stuff lives in [docs](docs/README.en.md), not here:

- [MCP tools](docs/mcp.en.md): local MCP for agents, 19 tools, a few scripts you can replay
- [Plugin schema](docs/plugins.en.md): how to write `plugin.json` v2
- [Linux ELF BOF](docs/linux-elf-bof.en.md): how to build Linux x64 BOFs, and what they cannot do

## Environment

- **Go** 1.25 (`go.mod` says `go 1.25.0`)
- **Node.js** 22+ (we used v22.21.0)
- **Wails 3 CLI**, same as `wails/v3 v3.0.0-beta.15` in `go.mod`:

  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.15
  ```

- After clone, install frontend deps once:

  ```bash
  cd frontend
  npm install
  ```

Do not grep the repo to bump the version. The source is `info.version` in `build/config.yml`:

```bash
wails3 task version:bump VERSION=0.4.0
```

That updates the sidebar, help page, MCP, and Windows/Linux/macOS package metadata together. Plugin `plugin.json` files and historical notes in docs stay put.

Windows needs WebView2. Win10 1803+ and Win11 already have it. Older boxes: [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

Ubuntu needs webkit / gtk. 22.04 uses 4.1. Older distros may only have 4.0:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev build-essential pkg-config
# older Ubuntu: libwebkit2gtk-4.0-dev
```

macOS: Xcode Command Line Tools.

```bash
xcode-select --install
```

Wails install notes: [v3.wails.io](https://v3.wails.io/).

## Windows

Dev:

```powershell
wails3 task dev
```

Build:

```powershell
wails3 task windows:build ARCH=amd64
```

NSIS installer:

```powershell
wails3 task windows:package ARCH=amd64
```

Output lands in `bin\`. Usual pair: `bin\client.exe`, `bin\client-amd64-installer.exe`.

## Ubuntu Linux

Dev:

```bash
wails3 task dev
```

On Ubuntu 24.04 the app sets these itself, to dodge WebKitGTK bugs:

```text
WEBKIT_DISABLE_DMABUF_RENDERER=1
GSK_RENDERER=cairo
```

Build:

```bash
wails3 task linux:build ARCH=amd64
```

Package (AppImage, deb, rpm, archlinux):

```bash
wails3 task linux:package ARCH=amd64
```

AppImage only:

```bash
wails3 task linux:create:appimage ARCH=amd64
```

deb only:

```bash
wails3 task linux:create:deb ARCH=amd64
```

Output is in `bin/`.

## macOS

Dev:

```bash
wails3 task dev
```

Current arch:

```bash
wails3 task darwin:build
```

Pick an arch:

```bash
wails3 task darwin:build ARCH=arm64
wails3 task darwin:build ARCH=amd64
```

`.app`:

```bash
wails3 task darwin:package
```

Universal `.app`:

```bash
wails3 task darwin:package:universal
```

DMG:

```bash
wails3 task darwin:package:dmg
```

Output is in `bin/`. Usual files: `bin/client.app`, `bin/client.dmg`.

Unsigned `.app` from GitHub Release gets blocked by Gatekeeper. In Finder, right-click Open, then Open again in the dialog. Once is enough. Or:

```bash
xattr -dr com.apple.quarantine /path/to/client.app
```

Double-click works after that.

## Linux packages

Release ships AppImage, deb, and rpm. Pick one for your distro.

AppImage: chmod and run.

```bash
chmod +x client-<version>-linux-amd64.AppImage
./client-<version>-linux-amd64.AppImage
```

Missing FUSE on first run: Ubuntu/Debian `libfuse2`, Fedora `fuse fuse-libs`.

deb:

```bash
sudo dpkg -i client-<version>-linux-amd64.deb
sudo apt-get install -f
```

After install you get "Iris Client" in the app menu, or `client` in a terminal. Remove with `sudo apt-get remove client`. `purge` also drops config.

rpm:

```bash
sudo rpm -i client-<version>-linux-amd64.rpm
# or let dnf pull deps
sudo dnf install client-<version>-linux-amd64.rpm
```

Remove: `sudo rpm -e client` or `sudo dnf remove client`.

Where the binary, desktop file, and icon go: `build/linux/nfpm/nfpm.yaml`.
