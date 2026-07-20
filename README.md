# IrisC2

语言：中文 | [English](README.en.md)

IrisC2 是一个面向授权安全测试、红队演练、攻防实验和内部研究的 C2 框架。项目由 Client、Server、Beacon、Stager 和插件体系组成，围绕 Listener 管理、Payload 生成、Beacon 任务调度、文件传输、截图、隧道转发、BOF/PostEx 扩展执行、结构化事件和实时事件同步构建。

> 本项目仅允许在明确授权的环境中使用。请勿在未授权系统、账号、网络或第三方资产上部署、连接、测试或运行任何组件。

## 项目状态

主体框架已经搭完，早期规划的核心能力也都补得差不多了。权限提升、横向移动这些更高级的功能，等我把相关技术再学扎实些会陆续加上；后续会持续更新 Wiki、完善 Go-Beacon、补文档和示例，把稳定性和使用体验一点点磨好。

Server 目前只通过 Releases 以二进制形式发布，源码暂不公开——等这个项目攒到 200 star 之后，我会把 Server 源码开源出来。

## 项目组成

```text
IrisC2/
├── C-Beacon/           C 语言 Beacon 源码、构建脚本和 reflective stub patch 工具
├── Go-Beacon/          Go 语言跨平台 Beacon 源码（Windows / Linux / macOS）
├── client/             Client 源码（Wails 3：Go + Vue/TypeScript 前端）
├── stager_shellcode/   Windows x64/x86 stager 源码、构建脚本和 patch 工具
├── images/             README 演示图片与视频
├── CHANGELOG.md
├── README.md
└── README.en.md
```

Client 源码在 `client/`，基于 Wails 3 构建（Go + Vue/TypeScript）。Server 只通过 GitHub Releases 以发布包形式提供，源码不在仓库里。Beacon 和 stager 的源码都在仓库内，按各自目录下的 README 构建和更新模板即可。

## 工作方式

- Client 负责操作界面、任务下发、结果查看和插件入口。
- Server 负责认证、Listener、Payload、任务、文件、截图、隧道和事件同步。
- Beacon 在授权目标环境中运行，按 C2 Profile 与 Listener 通信并执行任务。
- Stager 用于 staged payload 场景，先下载 stage，再启动 Beacon stage。
- 插件通过 Client 暴露 BOF/OBJ 和 PostEx DLL 等扩展动作，统一下发到 Beacon 执行。

## 演示

GitHub 仓库页面可能不会直接预览较大的 LFS 视频。可以直接打开 [演示视频](images/video.mp4)，或在 Release 页面下载查看。

### 界面截图

![仪表盘与命令控制台](images/演示1.png)

![Listener 配置](images/演示2.png)

![Beacon 右键菜单与插件入口](images/演示3.png)

![Payload 生成器](images/演示4.png)

## 功能特点

### Client

- 支持 Windows、Linux、macOS 三端发布包。
- 连接 Iris Server 后登录、保持会话、实时接收事件。
- 管理 Listener、Payload、Beacon、任务、文件、截图、隧道。
- 支持 Beacon 右键菜单和插件动作入口。
- 支持 BOF/OBJ 与 PostEx 插件动作（含 `spawn-dll` / `inject-dll`、按架构选 DLL、manifest lint）。
- 支持 PostEx metadata / progress / artifact / error 等结构化 frame 展示，artifact 接入下载页面。

构建详见 [client/README.md](client/README.md)。

### Server

- 账号密码 + JWT 鉴权；同名用户单会话，新登录替换旧会话。
- REST API + WebSocket 事件通道。
- HTTP/HTTPS Listener 和 External TCP Listener；TCP 可按配置启用 SSL/TLS。
- 通过 C2 Profile 管理 Beacon sleep、jitter、sleep obfuscation、HTTP transforms、stager 等行为。
- 支持 stagerless 与 staged payload 生成，支持 C/Go 两类 Beacon 模板。
- 任务持久化、pending 任务恢复、任务状态跟踪、结果回传。
- PostEx `spawn_dll` / `inject_dll`、结构化 frame 事件、artifact 下载。
- 文件上传 / Beacon 文件下载 / 分块传输 / 截图 / 隧道转发。
- Windows 7 兼容 TLS cipher fallback；SQLite 本地持久化；基础伪装响应。

Server 通过 GitHub Releases 发布，每个平台包内含运行所需的 `config.yaml`、`c2profile/` 和 `static/`：

```text
Iris-Server-windows-x64.zip
Iris-Server-linux-x64.tar.gz
```

### Beacon

Beacon 源码在 `C-Beacon/`，当前能力：

- HTTP/HTTPS 与 External TCP C2 通信（TCP 支持 Raw TCP 或 TLS over TCP）。
- 首次上线注册、心跳刷新、会话密钥更新。
- sleep time / jitter / sleep obfuscation（none / ekko / zilean / gargle）。
- 命令执行、文件系统、文件传输、文件浏览、进程/作业/身份、网络信息、截图。
- 隧道：SOCKS / 端口转发类 tunnel start / control / data / close。
- 扩展执行：BOF/OBJ 加载、重定位、执行、输出回传、任务取消。
- PostEx：`spawn-dll` / `inject-dll`、异步 job 轮询、metadata/progress/artifact/error frame 回传。
- 级联传输：TCP 和 SMB（命名管道）两种 internal beacon，父 Beacon 通过 `connect` / `link` 建立多级链路（如 HTTP → TCP → SMB）；断开后 internal beacon 自动回到监听。

构建与模板部署详见 [C-Beacon/README.md](C-Beacon/README.md)。

> v0.2.0 起，所有 C-Beacon / Go-Beacon 模板统一命名为 `beacon_{proto}_{external|internal}_{os}_{arch}.{ext}`。

### Go-Beacon

Go-Beacon 源码在 `Go-Beacon/`，使用 Go 实现，支持 Windows、Linux、macOS 三平台。

- HTTP/HTTPS C2 通信。
- Windows x64、Linux x64、macOS ARM 三端构建。
- Windows 和 Linux 支持 BOF loader：
  - Windows x64：COFF 格式，VirtualAlloc + NtCreateThreadEx，含 VEH 崩溃恢复。
  - Linux x64：ELF 格式，mmap + 直接调用，含 GOT/trampoline 外部符号解析。
- 配置通过 TSCF v2 TLV 格式写入，由 `tools/patch_profile.go` 工具生成。

构建与模板部署详见 [Go-Beacon/README.md](Go-Beacon/README.md)。

### Stager

Stager 源码在 `stager_shellcode/`，用于 staged payload 场景。

- 支持 Windows x64/x86。
- 支持 HTTP/HTTPS 下载 stage，支持忽略证书错误。
- 支持 `thread` / `process` 退出模式。
- 使用 `STG2` 配置块，由 Server 或 `tools/patch_stager_config` 写入回连参数。

构建与 patch 详见 [stager_shellcode/README.md](stager_shellcode/README.md)。

## 快速开始

### 1. 获取项目或发布包

Server 发布包从 [GitHub Releases](https://github.com/onedays12/Iris/releases) 下载。Client 需要从源码构建，克隆仓库后按 [client/README.md](client/README.md) 操作，需要 Go、Node.js 和 Wails 3 CLI。

仓库用 Git LFS 管理演示视频等大文件，首次克隆前先装好并启用：

```bash
git lfs install
git clone <repo-url>
cd IrisC2
git lfs pull
```

### 2. 配置并启动 Server

解压 Server 发布包后进入目录，编辑 `config.yaml`（重点改默认账号密码和 `jwt_secret`，正式环境替换为自己的 TLS 证书），然后在 `server/` 目录内启动：

```bash
# Windows
.\TeamServer.exe
# Linux
chmod +x ./TeamServer && ./TeamServer
```

默认服务地址按 `config.yaml` 的 `host` 和 `port`，例如 `https://127.0.0.1:8080`。

### 3. 启动 Client 并登录

Client 构建产物在 `client/bin/`。启动后填 Server 地址、用户名、密码登录。默认账号以 `server/config.yaml` 为准。构建步骤详见 [client/README.md](client/README.md)。

### 4. 创建 Listener 与 Payload

登录后在 Client 中创建 Listener（HTTP/HTTPS 或 External TCP，TCP 可启用 SSL/TLS），再在 Payload 页面选择 Listener、目标平台、架构、输出格式和 C2 Profile 生成 Payload。Payload 生成支持 `beacon_type`（`c` / `go`）；`go + external tcp` 组合会被服务端拒绝。

模板来源：

- stagerless payload：`server/static/beacon_templates/`
- staged payload：`server/static/stager_templates/`

## 插件

插件随 Client 发布包提供，支持 BOF/OBJ 与 PostEx DLL 两类动作。插件编写、`plugin.json` 字段、参数类型和完整示例见 [client/plugins/README.md](client/plugins/README.md)。

内置示例插件：

```text
client/plugins/
├── execution-injection/
├── linux-elf-bof/
└── postex-template/
```

## C2 Profile

C2 Profile 位于 Server 发布包的 `server/c2profile/` 目录：

```text
server/c2profile/
├── http-default.yaml
├── http-stager.yaml
└── tcp-default.yaml
```

Profile 控制 Beacon 的 sleep、jitter、sleep obfuscation、HTTP transforms（metadata / stage_output / server_output 的位置、编码、prefix/suffix）、stager 等行为。`sleep_obf_technique` 可选 `0` none / `1` ekko / `2` zilean / `3` gargle。具体字段以发布包内 c2profile 文件为准。

## 构建模板

Beacon 和 stager 模板的构建、patch、部署步骤详见各子目录 README：

- C-Beacon：[C-Beacon/README.md](C-Beacon/README.md)
- Go-Beacon：[Go-Beacon/README.md](Go-Beacon/README.md)
- Stager：[stager_shellcode/README.md](stager_shellcode/README.md)

## 责任声明

IrisC2 是授权安全测试与内部研究工具。使用者必须确保测试目标、账号、网络、payload、插件工件和采集数据均处于明确授权范围内。项目维护者不对任何未授权使用造成的后果负责。
