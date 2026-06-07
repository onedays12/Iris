# Go Beacon

Go 语言实现的 Beacon Agent，支持 Windows / Linux / macOS 三平台。

## 构建

### Windows

```bat
build_windows.bat
```

输出：`bin\beacon_windows_amd64.exe`、`bin\patch_profile.exe`

### Linux

```bash
chmod +x build_linux.sh
./build_linux.sh
```

输出：`bin/beacon_linux_amd64.elf`

### macOS (ARM)

```bash
chmod +x build_mac.sh
./build_mac.sh
```

输出：`bin/beacon_mac_arm.macho`

## 调试模式配置

直接构建后运行，Beacon 会使用硬编码的默认配置（`pkg/profile/profile.go` 中的 `defaultProfile()` 函数）。

修改 `defaultProfile()` 中的字段即可调整调试行为：

```go
func defaultProfile() Profile {
    return Profile{
        HTTP: HTTPProfile{
            SleepTime:    5000,                          // 心跳间隔（毫秒）
            Jitter:       20,                            // 抖动百分比
            CallbackHost: "127.0.0.1:9999",              // 回连地址（host:port）
            URI:          "/index.php",                  // 请求路径
            Method:       "GET",                         // HTTP 方法
            HBHeader:     "Cookie",                      // 心跳数据承载的 Header
            HBPrefix:     "SESSIONID=",                  // Header 值前缀
            EncryptKey:   "194f7b83023fdd7c6fdfd70a4e6b9cfe", // AES-256 密钥（hex，32 字节）
            ...
        },
    }
}
```

运行时会输出 `[!] Running in Debug Mode (Hardcoded Configuration)`。

## BOF (Beacon Object Files)

支持在目标进程中执行 BOF 代码：

| 平台 | 格式 | 说明 |
|------|------|------|
| Windows x64 | COFF (.o) | 使用 VirtualAlloc + NtCreateThreadEx，含 VEH 崩溃恢复 |
| Linux x64 | ELF (.o) | 使用 mmap + 直接调用，含 GOT/trampoline 外部符号解析 |

BOF 入口函数：`void go(char* args, int len);`

详见 `examples/elf_bof/README.md`。

## 项目结构

```
beacon/
  main.go                        # 入口
  pkg/
    core/                        # Agent 核心循环
    profile/                     # 配置管理（TSCF v2 TLV）
    command/                     # 命令分发（ps, cd, ls, bof, ...）
    bof/
      coff/                      # Windows COFF BOF loader
      elf/                       # Linux ELF BOF loader
    jobs/                        # 后台任务管理
    utils/                       # 工具函数
  tools/
    patch_profile.go             # 配置写入工具
  examples/
    elf_bof/                     # ELF BOF 示例和测试
  build_windows.bat              # Windows 构建
  build_linux.sh                 # Linux 构建
  build_mac.sh                   # macOS 构建
```
