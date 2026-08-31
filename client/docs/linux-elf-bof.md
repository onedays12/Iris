# Linux ELF BOF

[中文](linux-elf-bof.md) · [English](linux-elf-bof.en.md)

跟 `plugins/linux-elf-bof` 放在一起的写法说明。Go Beacon 的 ELF loader 只认 Linux x64（还要开 cgo）。x86 别编，也别指望能加载。

源码和测试对象在 `plugins/linux-elf-bof/bin/elf_bof/`。在 Linux 上编：

```bash
cd plugins/linux-elf-bof/bin/elf_bof
chmod +x build_linux.sh
./build_linux.sh
```

仓库根目录跑测试套件（脚本还在那边的话）：

```bash
chmod +x plugins/linux-elf-bof/bin/elf_bof/run_linux_tests.sh
./plugins/linux-elf-bof/bin/elf_bof/run_linux_tests.sh
```

## 怎么编

```bash
gcc -c \
  -fPIC \
  -fno-stack-protector \
  -fno-asynchronous-unwind-tables \
  -fno-unwind-tables \
  -fno-exceptions \
  -fno-common \
  -O0 \
  -I. \
  your_bof.c \
  -o your_bof.o
```

| 旗标 | 干什么 |
| --- | --- |
| `-fPIC` | 要重定位 |
| `-fno-stack-protector` | 去掉 `__stack_chk_fail` |
| `-fno-asynchronous-unwind-tables` / `-fno-unwind-tables` | 去掉 `.eh_frame`，loader 不吃这个 |
| `-fno-exceptions` | 去掉 C++ 异常表 |
| `-fno-common` | 未初始化全局进 `.bss`，建议开 |
| `-O0` | 不优化，好查 |

入口必须叫 `go`：

```c
void go(char* args, int len);
```

`args` 是序列化参数，用 `BeaconData*` 拆。`len` 是字节数。头文件用同目录的 `beacon.h`：

```c
#include "beacon.h"
```

## 能调的 API

输出：

```c
void BeaconOutput(int type, char* data, int len);
void BeaconPrintf(int type, const char* fmt, ...);
```

`type`：`CALLBACK_OUTPUT`（0）或 `CALLBACK_ERROR`（13）。

拆参数：

```c
void BeaconDataParse(datap* parser, char* buffer, int size);
int    BeaconDataInt(datap* parser);
short  BeaconDataShort(datap* parser);
int    BeaconDataLength(datap* parser);
char*  BeaconDataExtract(datap* parser, int* size);
```

每个参数前面 4 字节长度：`int` 总共 8 字节（长度 + 4 字节小端），`short` 6 字节，`string` 是长度 + 带 `\0` 的串。

格式缓冲：

```c
void BeaconFormatAlloc(formatp* format, int maxsz);
void BeaconFormatReset(formatp* format);
void BeaconFormatFree(formatp* format);
void BeaconFormatAppend(formatp* format, char* data, int len);
void BeaconFormatPrintf(formatp* format, const char* fmt, ...);
char* BeaconFormatToString(formatp* format, int* size);
void BeaconFormatInt(formatp* format, int value);
```

停任务：

```c
unsigned long BeaconGetStopJobEvent(void);
```

Linux 上这是个 `eventfd`。操作员发 `killjob` 之后 fd 可读，用 `poll` 看：

```c
unsigned long fd = BeaconGetStopJobEvent();
struct pollfd pfd = { .fd = (int)fd, .events = POLLIN };
while (1) {
    if (poll(&pfd, 1, 500) > 0 && (pfd.revents & POLLIN)) {
        BeaconPrintf(CALLBACK_OUTPUT, "stop requested\n");
        return;
    }
}
```

键值（同进程里所有 BOF 共用，线程安全）：

```c
int   BeaconAddValue(const char* key, void* ptr);
void* BeaconGetValue(const char* key);
int   BeaconRemoveValue(const char* key);
```

系统信息：

```c
int         BeaconIsAdmin(void);  // root 为 1
char**      getEnviron(void);
const char* getOSName(void);      // "linux"
int         BeaconWakeup(void);   // 空操作，回 0
```

## 平台

| 平台 | 格式 | Build Tag |
| --- | --- | --- |
| Windows x64 | COFF BOF | `windows && amd64` |
| Linux x64 | ELF BOF（CGO） | `linux && amd64 && cgo` |

x86 故意不支持。

## 崩了就整进程没了

BOF 跑在 Beacon 同一个进程里。段错误、栈溢出、乱写指针，Beacon 当场死。没有信号兜底，也没有进程隔离。Linux 这边，Go/CGO 环境里没有 Windows VEH 那种进程内捞回来的办法。这不是我们独有的，ELFLoader、coffee 也一样。

上线前自己测。别搞没边界的指针运算和递归。BOF 把 Beacon 打挂，这台机器就要重新上线。不熟的东西先丢一次性虚拟机里跑。`-fno-stack-protector` 会拿掉金丝雀，缓冲区溢出可能直接变成 segfault，知道自己在干什么再用。

## 别踩这些

1. 别写 C++。没有 name mangling、RTTI、异常表。
2. 别用 `__thread`。loader 自己占用了（`g_runtime_id`）。
3. `.init_array` / `.fini_array` 不会跑。
4. 别在 BOF 里起线程。`g_runtime_id` 只在调用线程上有，别的线程里 `BeaconPrintf` / `BeaconOutput` 会默默丢掉。
5. 没有 `.eh_frame` 展开。
6. 入口名字写死了，就是 `go`。
7. 外部符号走 `dlsym`。libc 大部分能用。解析失败会告诉你缺哪个。

## 支持的重定位（x86_64）

`R_X86_64_64`、`PC32`、`PLT32`（当 PC32）、`GOTPCREL`、`GOTPCRELX`、`REX_GOTPCRELX`、`32`、`32S`、`PC64`、`GOTOFF64`、`GOTPC64`、`GOT64`。

## 目录里那几个测试对象

| 对象 | 干什么 |
| --- | --- |
| `loader_stress.o` | 比较全：`.text` / `.rodata` / `.data` / `.bss`、Beacon API、外部 libc |
| `hello.o` | 最小冒烟 |
| `sleep_loop.o` | `BeaconGetStopJobEvent` + killjob |
| `global_common.o` | COMMON 符号（编译时别加 `-fno-common`） |
| `global_common_nocommon.o` | 同一份代码加了 `-fno-common`，走 `.bss` |

## 编挂了看什么

重定位失败会长这样：

```text
relocation failed: section=.rela.text target=.text offset=0x1a sym="foo"[5] type=R_X86_64_PC32 addend=0xfffffffffffffffc patch=0x7f...
```

`section` 是重定位节，`target` 是被改的节，`offset` 是节内偏移，`sym` 是符号，`type` / `addend` / `patch` 是类型、加数、运行时要打补丁的地址。

碰到 `COMMON symbol is not supported`，加上 `-fno-common` 再编一遍。

`dlsym` 找不到符号会点名：

```text
failed to resolve external symbol: some_function
```

确认 libc 里有，或者把它静态链进 BOF。
