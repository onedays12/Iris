# Changelog

## v0.1.5

### Client

- 新增 — `spawnto`、`migrate_spawn`、`migrate_inject` 控制台命令支持，包括参数解析、帮助信息、基础校验和事件面板标记
- 新增 — 进程浏览器中的 `Migrate Inject` 图形化操作流，支持基于目标进程自动复用架构，并阻止危险的 `x86 parent -> x64 target` 组合
- 新增 — 图形化迁移流程支持筛选 external 与 internal `TCP/SMB` listener，并补充相应的拓扑行为提示
- 变更 — 统一命令结果、文件传输、事件面板摘要到 TeamServer 的 `COMMAND_EVENT` 协议模型
- 变更 — 对齐前端命令参数打包格式，收口命令结果路由与结构化结果处理逻辑
- 修复 — `ps`、`net_info`、`netstat` 等命令结果在新旧 TeamServer payload 结构下的兼容显示
- 修复 — 文件浏览器中同一下载任务出现多个 `0%` 进度记录的问题，改为按 `direction + task_id` 合并传输进度
- 修复 — 统一 websocket 事件别名与历史兼容逻辑，补齐 `tunnel`、`listener` 相关事件同步
- 修复 — 截图预览删除按钮对比度问题
- 维护 — 更新 Iris Client 版本显示与各平台打包元数据到 `v0.1.5`

### Server

- 新增 — TeamServer 对 `spawnto`、`migrate_spawn`、`migrate_inject` 的完整任务处理能力
- 新增 — external listener 的 direct-stage 迁移流程
- 新增 — internal TCP 迁移支持，为每个任务分配独立的 bind 端口并建立 cascade child 跟踪
- 新增 — internal SMB `migrate_inject` 支持，为注入后的 child 生成独立的 pipe 名并自动排队后续 `cascade connect/link`
- 变更 — 将 migrate inject 子命令语义收口为 stage-oriented 命名，同时保持既有 wire value 不变
- 测试 — 增加 internal `TCP/SMB` migrate inject 行为测试与相关任务校验
- 变更 — 统一 websocket 事件常量，移除旧的 `TASK_RESULT`、`FILE_TRANSFER_*` 独立事件路径
- 变更 — 将 listener 状态变更与 tunnel 确认事件改为统一的具名事件常量，减少历史分支逻辑

### C-Beacon

- 新增 — migrate manager，支持 `spawnto`、`spawn`、`inject` 三类迁移路径
- 新增 — 基于 reflective stage 的远程执行能力，打通 Beacon 侧迁移命令与 TeamServer stage 下发链路
- 新增 — 目标进程架构校验、父子架构匹配校验以及远程线程/远程进程状态诊断输出
- 新增 — internal TCP migrate stage 构建脚本与模板同步支持
- 新增 — internal SMB direct-stage DLL 构建流程，并将 SMB internal DLL 纳入模板 patch/copy 同步链路
- 变更 — 将 migrate inject 子命令重命名为 stage-oriented 语义，但保持原有协议值兼容
- 重构 — 整理命令分发与 inject 辅助逻辑，减少迁移路径中的重复实现
- 文档 — 更新 README 与模板产物说明，补充 internal SMB 相关构建与同步文档

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
