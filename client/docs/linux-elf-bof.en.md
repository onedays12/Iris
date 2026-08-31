# Linux ELF BOF

[中文](linux-elf-bof.md) · [English](linux-elf-bof.en.md)

Notes that go with `plugins/linux-elf-bof`. The Go Beacon ELF loader only takes Linux x64, and cgo has to be on. Do not build x86. It will not load.

Source and test objects live in `plugins/linux-elf-bof/bin/elf_bof/`. On Linux:

```bash
cd plugins/linux-elf-bof/bin/elf_bof
chmod +x build_linux.sh
./build_linux.sh
```

From the repo root, if the test script is still there:

```bash
chmod +x plugins/linux-elf-bof/bin/elf_bof/run_linux_tests.sh
./plugins/linux-elf-bof/bin/elf_bof/run_linux_tests.sh
```

## Compile

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

| Flag | Why |
| --- | --- |
| `-fPIC` | relocations |
| `-fno-stack-protector` | drop `__stack_chk_fail` |
| `-fno-asynchronous-unwind-tables` / `-fno-unwind-tables` | drop `.eh_frame`; the loader does not eat it |
| `-fno-exceptions` | drop C++ exception tables |
| `-fno-common` | uninitialized globals into `.bss`. recommended |
| `-O0` | no optimize, easier to debug |

Entry point must be named `go`:

```c
void go(char* args, int len);
```

`args` is the packed buffer. Unpack with `BeaconData*`. `len` is the byte count. Header is `beacon.h` in the same dir:

```c
#include "beacon.h"
```

## APIs

Output:

```c
void BeaconOutput(int type, char* data, int len);
void BeaconPrintf(int type, const char* fmt, ...);
```

`type`: `CALLBACK_OUTPUT` (0) or `CALLBACK_ERROR` (13).

Args:

```c
void BeaconDataParse(datap* parser, char* buffer, int size);
int    BeaconDataInt(datap* parser);
short  BeaconDataShort(datap* parser);
int    BeaconDataLength(datap* parser);
char*  BeaconDataExtract(datap* parser, int* size);
```

Each value is prefixed with a 4-byte length. `int` is 8 bytes total (length + 4-byte LE). `short` is 6. `string` is length + NUL-terminated bytes.

Format buffer:

```c
void BeaconFormatAlloc(formatp* format, int maxsz);
void BeaconFormatReset(formatp* format);
void BeaconFormatFree(formatp* format);
void BeaconFormatAppend(formatp* format, char* data, int len);
void BeaconFormatPrintf(formatp* format, const char* fmt, ...);
char* BeaconFormatToString(formatp* format, int* size);
void BeaconFormatInt(formatp* format, int value);
```

Stop the job:

```c
unsigned long BeaconGetStopJobEvent(void);
```

On Linux this is an `eventfd`. After the operator sends `killjob` the fd becomes readable. Poll it:

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

Key/value store, shared by every BOF in the process, thread-safe:

```c
int   BeaconAddValue(const char* key, void* ptr);
void* BeaconGetValue(const char* key);
int   BeaconRemoveValue(const char* key);
```

System info:

```c
int         BeaconIsAdmin(void);  // 1 if root
char**      getEnviron(void);
const char* getOSName(void);      // "linux"
int         BeaconWakeup(void);   // no-op, returns 0
```

## Platforms

| Platform | Format | Build tag |
| --- | --- | --- |
| Windows x64 | COFF BOF | `windows && amd64` |
| Linux x64 | ELF BOF (CGO) | `linux && amd64 && cgo` |

x86 is intentionally unsupported.

## A crash kills the whole process

The BOF runs in the Beacon process. Segfault, stack overflow, wild pointer write: Beacon dies on the spot. No signal net. No process isolation. On Linux, a Go/CGO host has nothing like Windows VEH to catch this in-process. ELFLoader and coffee have the same limit.

Test before you take it live. Stay away from unbounded pointer math and recursion. If a BOF kills the Beacon, that host has to check in again. Unknown code goes in a throwaway VM first. `-fno-stack-protector` removes the canary. A buffer overflow can become a segfault. Use it only if you mean to.

## Do not

1. Do not write C++. No name mangling, RTTI, or exception tables.
2. Do not use `__thread`. The loader already uses it (`g_runtime_id`).
3. `.init_array` / `.fini_array` never run.
4. Do not spawn threads from a BOF. `g_runtime_id` exists only on the calling thread. `BeaconPrintf` / `BeaconOutput` on other threads drop output.
5. No `.eh_frame` unwind.
6. Entry name is hardcoded: `go`.
7. Externals go through `dlsym`. Most of libc works. A resolve failure names the missing symbol.

## Relocations (x86_64)

`R_X86_64_64`, `PC32`, `PLT32` (treated as PC32), `GOTPCREL`, `GOTPCRELX`, `REX_GOTPCRELX`, `32`, `32S`, `PC64`, `GOTOFF64`, `GOTPC64`, `GOT64`.

## Test objects in the tree

| Object | What it hits |
| --- | --- |
| `loader_stress.o` | `.text` / `.rodata` / `.data` / `.bss`, Beacon APIs, external libc |
| `hello.o` | smallest smoke |
| `sleep_loop.o` | `BeaconGetStopJobEvent` + killjob |
| `global_common.o` | COMMON symbols (compile without `-fno-common`) |
| `global_common_nocommon.o` | same source with `-fno-common`, lands in `.bss` |

## If the build fails

A relocation error looks like:

```text
relocation failed: section=.rela.text target=.text offset=0x1a sym="foo"[5] type=R_X86_64_PC32 addend=0xfffffffffffffffc patch=0x7f...
```

`section` is the reloc section, `target` is the patched section, `offset` is inside that section, `sym` is the symbol, `type` / `addend` / `patch` are the type, addend, and runtime address being patched.

`COMMON symbol is not supported`: add `-fno-common` and rebuild.

`dlsym` names missing symbols:

```text
failed to resolve external symbol: some_function
```

Confirm it is in libc, or statically link it into the BOF.
