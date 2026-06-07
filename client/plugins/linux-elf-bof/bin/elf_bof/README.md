# ELF BOF Examples

Linux ELF Beacon Object File (BOF) examples and test suite for the Go Beacon ELF loader.

## Quick Start

```bash
# Build all test BOFs (requires Linux with gcc)
cd examples/elf_bof
chmod +x build_linux.sh
./build_linux.sh

# Run the full test suite (from repo root)
chmod +x examples/elf_bof/run_linux_tests.sh
./examples/elf_bof/run_linux_tests.sh
```

## Writing ELF BOFs

### Compilation

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

| Flag | Purpose |
|------|---------|
| `-fPIC` | Position-independent code (required for relocation) |
| `-fno-stack-protector` | Remove `__stack_chk_fail` dependency |
| `-fno-asynchronous-unwind-tables` | Remove `.eh_frame` (not supported by loader) |
| `-fno-unwind-tables` | Remove `.eh_frame` |
| `-fno-exceptions` | Remove C++ exception tables |
| `-fno-common` | Force uninitialized globals into `.bss` (recommended) |
| `-O0` | No optimization (easier debugging) |

### Entry Point

Every BOF must export a function named `go`:

```c
void go(char* args, int len);
```

- `args`: serialized argument buffer (use `BeaconData*` APIs to parse)
- `len`: length of `args` in bytes

### beacon.h

Include `beacon.h` from this directory for the standard BOF API declarations:

```c
#include "beacon.h"
```

## Available APIs

### Output

```c
void BeaconOutput(int type, char* data, int len);
void BeaconPrintf(int type, const char* fmt, ...);
```

- `type`: `CALLBACK_OUTPUT` (0) or `CALLBACK_ERROR` (13)

### Argument Parsing

```c
void BeaconDataParse(datap* parser, char* buffer, int size);
int    BeaconDataInt(datap* parser);
short  BeaconDataShort(datap* parser);
int    BeaconDataLength(datap* parser);
char*  BeaconDataExtract(datap* parser, int* size);
```

Arguments are serialized as: `[4-byte length prefix][value]` for each parameter.
- `int`: 4-byte length + 4-byte LE value (8 bytes total)
- `short`: 4-byte length + 2-byte LE value (6 bytes total)
- `string`: 4-byte length + null-terminated string

### Format Buffer

```c
void BeaconFormatAlloc(formatp* format, int maxsz);
void BeaconFormatReset(formatp* format);
void BeaconFormatFree(formatp* format);
void BeaconFormatAppend(formatp* format, char* data, int len);
void BeaconFormatPrintf(formatp* format, const char* fmt, ...);
char* BeaconFormatToString(formatp* format, int* size);
void BeaconFormatInt(formatp* format, int value);
```

### Job Control

```c
unsigned long BeaconGetStopJobEvent(void);
```

Returns an `eventfd` file descriptor (Linux). When the operator issues `killjob`, the fd becomes readable. Use `poll()` to check:

```c
unsigned long fd = BeaconGetStopJobEvent();
struct pollfd pfd = { .fd = (int)fd, .events = POLLIN };
while (1) {
    if (poll(&pfd, 1, 500) > 0 && (pfd.revents & POLLIN)) {
        BeaconPrintf(CALLBACK_OUTPUT, "stop requested\n");
        return;
    }
    // do work...
}
```

### Key-Value Store

```c
int   BeaconAddValue(const char* key, void* ptr);
void* BeaconGetValue(const char* key);
int   BeaconRemoveValue(const char* key);
```

Thread-safe. Shared across all BOFs in the same Beacon process.

### System Info

```c
int         BeaconIsAdmin(void);  // 1 if root, 0 otherwise
char**      getEnviron(void);     // process environment
const char* getOSName(void);      // "linux"
int         BeaconWakeup(void);   // no-op, returns 0
```

## Platform Support

Go Beacon BOF loader intentionally supports **x64 only**:

| Platform | Format | Build Tag |
|----------|--------|-----------|
| Windows x64 | COFF BOF | `//go:build windows && amd64` |
| Linux x64 | ELF BOF (CGO) | `//go:build linux && amd64 && cgo` |

**x86 (32-bit) BOF is intentionally not supported.** Do not compile BOFs as 32-bit objects or expect them to load.

## Important: No Crash Isolation

**BOF runs in the same process as the Beacon.** If the BOF crashes (segfault, stack overflow, wild pointer write), it will kill the entire Beacon process immediately. There is no signal handler, no process isolation, no recovery mechanism.

This is a known limitation shared by all in-process ELF BOF loaders (ELFLoader, coffee, etc.). Linux has no equivalent to Windows VEH for in-process crash recovery in a Go/CGO environment.

**Operator guidelines:**
- Test BOFs thoroughly before deploying on engagement targets.
- Avoid unsafe pointer arithmetic, unchecked array access, and recursive functions without bounds.
- If a BOF crashes the Beacon, the operator loses access to that host until a new Beacon is re-established.
- For untrusted or complex BOFs, consider testing in a disposable VM first.
- Use `-fno-stack-protector` only if you know what you're doing — stack canaries catch buffer overflows before they become segfaults.

## Restrictions

1. **No C++**: The loader does not handle C++ name mangling, RTTI, or exception tables.
2. **No TLS**: `__thread` variables in BOF code are not supported (the loader uses `__thread` internally for `g_runtime_id`).
3. **No constructors/destructors**: `.init_array` / `.fini_array` are not executed.
4. **No native threads**: Do not create threads from within a BOF. The `g_runtime_id` thread-local is only set on the calling thread. If you create native threads, `BeaconPrintf`/`BeaconOutput` will silently drop output from those threads.
5. **No `.eh_frame` runtime unwind**: Stack unwinding from exceptions/signals will not work.
6. **Entry must be `go`**: The entry point name is hardcoded.
7. **External symbols via `dlsym`**: Most libc functions work. If a symbol cannot be resolved, the loader reports which symbol failed.

## Supported Relocations (x86_64)

| Type | Description |
|------|-------------|
| `R_X86_64_64` | Absolute 64-bit address |
| `R_X86_64_PC32` | PC-relative 32-bit |
| `R_X86_64_PLT32` | PLT call (treated as PC32) |
| `R_X86_64_GOTPCREL` | GOT-relative PC32 |
| `R_X86_64_GOTPCRELX` | GOT PC-relative (relaxable) |
| `R_X86_64_REX_GOTPCRELX` | GOT PC-relative with REX (relaxable) |
| `R_X86_64_32` | Absolute 32-bit (zero-extended) |
| `R_X86_64_32S` | Absolute 32-bit (sign-extended) |
| `R_X86_64_PC64` | PC-relative 64-bit |
| `R_X86_64_GOTOFF64` | GOT-relative 64-bit offset |
| `R_X86_64_GOTPC64` | GOT base PC-relative 64-bit |
| `R_X86_64_GOT64` | GOT entry 64-bit |

## Test BOFs

| Object | Purpose |
|--------|---------|
| `loader_stress.o` | Comprehensive test: .text/.rodata/.data/.bss, Beacon APIs, external libc |
| `hello.o` | Minimal smoke test |
| `sleep_loop.o` | Tests `BeaconGetStopJobEvent()` + killjob cooperative cancellation |
| `global_common.o` | Tests COMMON symbol handling (compile without `-fno-common`) |
| `global_common_nocommon.o` | Same code with `-fno-common` (uses .bss instead) |

## Troubleshooting

### Relocation errors

If you see an error like:

```
relocation failed: section=.rela.text target=.text offset=0x1a sym="foo"[5] type=R_X86_64_PC32 addend=0xfffffffffffffffc patch=0x7f...: ...
```

The fields are:
- `section`: the relocation section (`.rela.text`)
- `target`: the section being patched (`.text`)
- `offset`: byte offset within the target section
- `sym`: symbol name and index
- `type`: relocation type
- `addend`: relocation addend
- `patch`: runtime address being patched

### COMMON symbols

If linking fails with `COMMON symbol is not supported`, recompile with `-fno-common`:

```bash
gcc -c -fPIC -fno-common -fno-stack-protector ... your_bof.c -o your_bof.o
```

### Missing symbols

If `dlsym` cannot find a symbol, the error will name it:

```
failed to resolve external symbol: some_function
```

Check that the function exists in libc or is statically linked into the BOF.
