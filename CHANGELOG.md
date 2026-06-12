# Changelog

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
