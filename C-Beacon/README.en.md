# Beacon Build And Reflective Stub Patch

Language: [中文](README.md) | English

## Requirements

Install the following tools before building this project on another machine.

### Required

| Dependency | Notes |
| --- | --- |
| Visual Studio 2017 or later | Visual Studio 2022 is recommended. Visual Studio Build Tools is also supported. |
| Desktop development with C++ | Required for MSVC, MSBuild, and Windows SDK support. |
| MSVC C++ toolset | Installed with the C++ workload, such as v143 or v142. |
| Windows 10 SDK or Windows 11 SDK | Required for Windows API builds. Select it in Visual Studio Installer. |

### Required For Patch

| Dependency | Notes |
| --- | --- |
| Go 1.21+ | Used to run `tools\patch_reflective_stub` and generate patched reflective stubs. |

### Visual Studio Installation Notes

When using Visual Studio Installer, select at least:

```text
Workloads:
  Desktop development with C++

Individual components:
  MSVC v143 or v142 C++ x64/x86 build tools
  Windows 10 SDK or Windows 11 SDK
  C++ CMake tools for Windows (optional)
```

You can also install the lighter **Visual Studio Build Tools**, but the C++ build tools and Windows SDK are still required.

### Build Script Notes

The `.bat` build scripts do not depend on a fixed local Visual Studio path such as:

```text
D:\Program Files\Microsoft Visual Studio\2022\Professional
```

They use Visual Studio's `vswhere.exe` to locate VS / Build Tools automatically, then call the matching `vcvarsall.bat` to initialize the x64 or x86 build environment.

If the scripts are already running inside a **Developer Command Prompt for VS**, they reuse the current environment first.

## Build

Run from the project root:

```bat
build_all.bat
```

Release output paths:

```text
x64\Release\Beacon_amd64.dll
x64\ReleaseExe\beacon_windows_amd64.exe
x86\Release\Beacon_x86.dll
x86\ReleaseExe\beacon_windows_x86.exe
```

Deploy all artifacts to TeamServer's `static\beacon_templates` directory:

```text
static\beacon_templates\
├── beacon_windows_amd64.exe
├── beacon_windows_x86.exe
├── stager_windows_amd64.bin    <- generated after patch
└── stager_windows_32.bin       <- generated after patch
```

## Patch DLL Reflective Stub

Tool directory:

```text
tools\patch_reflective_stub
```

The tool detects the DLL architecture automatically:

- `x64\Release\Beacon_amd64.dll` -> generates an x64 DOS-head reflective stub.
- `x86\Release\Beacon_x86.dll` -> generates an x86 DOS-head reflective stub.

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

Notes:

- The third argument, `REFLoader`, can be omitted. It is the default symbol name.
- If the x86 DLL cannot find `REFLoader`, the tool falls back to `_REFLoader@4`.
- Reflective stub patching currently supports DLLs only, not EXEs.
- The x86 patched blob must run in an x86 or WOW64 process.
- The generated `stager_windows_amd64.bin` and `stager_windows_32.bin` must be deployed to TeamServer's `static\beacon_templates` directory.

## DebugExe Usage

DebugExe is a standalone debug build used to validate features and develop new ones. The x64 output is `x64\DebugExe\beacon_windows_amd64.exe`.

### Hardcoded Configuration

All connection settings are hardcoded in the `ProfileLoad()` function in `src\core\profile.c`. **Change them to real values before check-in or testing against your own TeamServer**, otherwise the Beacon will not connect.

| Config | Default | Notes |
| --- | --- | --- |
| `p->http.target` | `192.168.18.1:9999` | TeamServer address, in `IP:port` format. |
| `p->http.uri` | `/index.php` | Communication URI path. |
| `p->http.encrypt_key` | `194f7b83023fdd7c6fdfd70a4e6b9cfe` | Encryption key, 32-character hex string. |
| `p->sleep_ms` | `5000` | Heartbeat interval in milliseconds. |
| `p->jitter` | `20` | Jitter percentage, from 0 to 100. |
| `p->http.user_agent` | Chrome 120 UA | HTTP User-Agent. |
| `p->http.hb_header` | `Cookie` | Header used for metadata transport. |
| `p->http.hb_prefix` | `SESSIONID=` | Metadata prefix. |

### Disable Sleep Obfuscation

Disable sleep obfuscation while debugging, which is the default, so breakpoints are easier to use:

```c
// profile.c lines 383-385
//p->sleep_obf_enabled = TRUE;   // enable
p->sleep_obf_enabled = FALSE;    // disable (default)
p->sleep_obf_technique = SLEEP_OBF_ZILEAN;
```

Sleep obfuscation is only effective on x64. It is not available on x86.

### Build And Run

Select `DebugExe|x64` or `DebugExe|x86` in Visual Studio, or run:

```bat
build_exe_x64.bat
build_exe_x86.bat
```

Artifacts:

- `x64\DebugExe\beacon_windows_amd64.exe`
- `x86\DebugExe\beacon_windows_x86.exe`

DebugExe runs as a standalone EXE and does not require DLL injection or reflective loading, which makes it convenient for direct debugging.
