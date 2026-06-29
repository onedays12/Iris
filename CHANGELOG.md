# Changelog

## v0.1.4

### Client

- 新增 — PostEx 插件动作工作流，支持 `spawn-dll` / `inject-dll`、按架构选择 DLL、按架构默认值和加载期 manifest lint
- 新增 — PostEx 结构化事件展示，支持 metadata、progress、artifact、error frame
- 新增 — PostEx artifact 下载接入 Downloads 页面，使用 Server 解析后的 artifact 字段和下载标识
- 修复 — Downloads 页面滚动、表头和自动刷新体验

### Server

- 新增 — PostEx server 侧命令与事件处理，支持 `spawn_dll` / `inject_dll` 子命令、异步 frame 事件和 artifact 下载
- 新增 — C2 Profile 支持 Gargle sleep obfuscation 配置
- 修复 — PostEx artifact 下载标识与 Client 对齐
- 修复 — Listener TLS 增加 Windows 7 cipher fallback，HTTP、stager、TCP listener 共用兼容配置
- 维护 — 刷新 internal C-Beacon 模板和 payload/cascade 模板

### Beacon

- 新增 — Gargle sleep obfuscation 支持，这是为了绕过CFG保护，提前为“迁移”功能模块做准备。
- 新增 — PostEx 模块执行框架，支持 backend 拆分、job 轮询、结构化 frame 输出和 artifact/error helper
- 加固 — PostEx job 边界、轮询流程和 reflective loading 架构校验
- 修复 — 禁用 CFG 敏感的 reflective stomping 路径
- 修复 — Win7 WinHTTP 强制 TLS 1.2

## v0.1.3

### Beacon

- 变更 — 睡眠混淆改用 patched PE 头部信息到 Beacon，并且 Beacon 通过入口 WinMain 或 DllMain 传递基址
- 新增 — TCP 外部 Beacon 传输及 TLS 构建支持
- 重构 — 核心模块拆分：agent 模块拆分、BOF 模块拆分、cascade 模块拆分、构建产物重命名

### Client

- 新增 External TCP 监听器支持，含 SSL/TLS 开关
- 仪表盘 Beacon Session 表格新增 C2 协议列
- 修复：现在支持生成 x86 架构的 Internal TCP/SMB Beacon

## v0.1.2

### Client

- 新增米黄 Paper 主题
- 新增 PageTitleIcon 组件，8 个页面统一使用 SVG 图标
- 修改应用图标
- 文件浏览器、进程浏览器、网络浏览器等对话框根据窗口大小动态调整位置，始终居中

## v0.1.1

### Bug Fix

- 修复 stager 模式发送 beacon_type 导致模板找不到的问题，现在可以正确生成 stager

## v0.1.0

### Client

- 新增 Dark UI 主题
- 新增拓扑界面，支持右键点击节点进行操作
- 新增 TCP / SMB Internal Beacon 的生成选项

### Beacon

- 新增级联传输 — TCP / SMB Internal Cascade Beacon，支持多级跳转
- 新增 Go-Beacon 跨平台 Beacon，支持 Windows、Linux、macOS 三端系统
- Go-Beacon 中 Linux、Windows 均支持 BOF loader 能力，可使用 Client 项目自带的插件进行实验

![级联演示图](images/级联演示图.png)
