# Beacon 构建与 Reflective Stub Patch

语言：中文 | [English](README.en.md)

## 环境要求

在其他机器上构建本项目，需要先安装下面的环境。

### 必需环境

| 依赖 | 说明 |
|------|------|
| Visual Studio 2017 或更高版本 | 推荐 VS 2022，也可以只安装 Visual Studio Build Tools |
| Desktop development with C++ / 使用 C++ 的桌面开发 | 必须安装，提供 MSVC、MSBuild、Windows SDK |
| MSVC C++ 工具集 | VS 安装器中随 C++ 工作负载安装，例如 v143 / v142 |
| Windows 10 SDK 或 Windows 11 SDK | 项目使用 Windows API 构建，VS 安装器中勾选即可 |

### Patch 阶段需要

| 依赖 | 说明 |
|------|------|
| Go 1.21+ | 用于运行 `tools\patch_reflective_stub`，生成 patched reflective stub |

### Visual Studio 安装建议

如果使用 Visual Studio Installer，至少勾选：

```text
工作负载:
  使用 C++ 的桌面开发

单个组件:
  MSVC v143 或 v142 C++ x64/x86 build tools
  Windows 10 SDK 或 Windows 11 SDK
  C++ CMake tools for Windows（可选）
```

也可以安装更轻量的 **Visual Studio Build Tools**，但同样需要勾选 C++ build tools 和 Windows SDK。

### 构建脚本说明

本项目的 `.bat` 构建脚本不会依赖固定的本机安装路径，例如：

```text
D:\Program Files\Microsoft Visual Studio\2022\Professional
```

脚本会通过 Visual Studio 自带的 `vswhere.exe` 自动查找 VS / Build Tools 安装目录，然后调用对应的 `vcvarsall.bat` 初始化 x64 或 x86 编译环境。

如果已经在 **Developer Command Prompt for VS** 中运行脚本，脚本会优先复用当前环境。

## 构建

在项目根目录执行：

```bat
build_all.bat
```

Release 产物目录：

```text
x64\Release\Beacon_amd64.dll
x64\ReleaseExe\beacon_windows_amd64.exe
x86\Release\Beacon_x86.dll
x86\ReleaseExe\beacon_windows_x86.exe
```

所有产物需部署到 TeamServer 的 `static\beacon_templates` 目录下：

```text
static\beacon_templates\
├── beacon_windows_amd64.exe
├── beacon_windows_x86.exe
├── stager_windows_amd64.bin    ← patch 后生成
└── stager_windows_32.bin       ← patch 后生成
```

## Patch DLL Reflective Stub

工具目录：

```text
tools\patch_reflective_stub
```

该工具会自动识别 DLL 架构：

- `x64\Release\Beacon_amd64.dll` → 生成 x64 DOS-head reflective stub
- `x86\Release\Beacon_x86.dll` → 生成 x86 DOS-head reflective stub

### x64 DLL

```bat
cd tools\patch_reflective_stub
go run . "..\..\x64\Release\Beacon_amd64.dll" "..\..\beacon_windows_amd64.dll" REFLoader
```

### x86 DLL

```bat
cd tools\patch_reflective_stub
go run . "..\..\x86\Release\Beacon_x86.dll" "..\..\beacon_windows_x86.dll" REFLoader
```

说明：

- 第三个参数 `REFLoader` 可省略，默认就是 `REFLoader`。
- x86 DLL 若找不到 `REFLoader`，工具会自动 fallback 查找 `_REFLoader@4`。
- 当前 reflective stub patch 只支持 DLL，不支持 EXE。
- x86 patched blob 需要在 x86/WOW64 进程中执行。
- 生成的 `stager_windows_amd64.bin` 和 `stager_windows_32.bin` 需部署到 TeamServer 的 `static\beacon_templates` 目录下。

## DebugExe 用法

DebugExe 是独立运行的调试版本，用于验证功能和添加新功能。构建产物为 `x64\DebugExe\beacon_windows_amd64.exe`。

### 硬编码配置

所有连接配置硬编码在 `src\core\profile.c` 的 `ProfileLoad()` 函数中，**上线前必须修改为实际值**，否则无法连接到 TeamServer：

| 配置项 | 当前默认值 | 说明 |
|--------|-----------|------|
| `p->http.target` | `192.168.18.1:9999` | TeamServer 地址（IP:端口） |
| `p->http.uri` | `/index.php` | 通信 URI 路径 |
| `p->http.encrypt_key` | `194f7b83023fdd7c6fdfd70a4e6b9cfe` | 加密密钥（32字符 hex） |
| `p->sleep_ms` | `5000` | 心跳间隔（毫秒） |
| `p->jitter` | `20` | 抖动百分比（0-100） |
| `p->http.user_agent` | Chrome 120 UA | HTTP User-Agent |
| `p->http.hb_header` | `Cookie` | 元数据传输头 |
| `p->http.hb_prefix` | `SESSIONID=` | 元数据前缀 |

### 关闭睡眠混淆

调试时应确保睡眠混淆处于关闭状态（默认已关闭），避免影响断点调试：

```c
// profile.c 第 383-385 行
//p->sleep_obf_enabled = TRUE;   // 启用
p->sleep_obf_enabled = FALSE;    // 关闭（默认值）
p->sleep_obf_technique = SLEEP_OBF_ZILEAN;
```

睡眠混淆仅在 x64 平台生效，x86 无此功能。

### 构建与运行

在 VS 中选择 `DebugExe|x64` 或 `DebugExe|x86` 配置构建，或使用批处理脚本：

```bat
build_exe_x64.bat
build_exe_x86.bat
```

产物：

- `x64\DebugExe\beacon_windows_amd64.exe`
- `x86\DebugExe\beacon_windows_x86.exe`

DebugExe 以独立 EXE 方式运行，不依赖 DLL 注入或反射加载，方便直接调试。
