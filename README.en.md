# IrisC2

Language: [中文](README.md) | English

IrisC2 is a C2 framework for authorized security testing, red team exercises, attack-defense labs, and internal research. It is composed of Iris Client, Iris Server, Beacon, Stager, and a plugin system, covering listener management, payload generation, Beacon tasking, file transfer, screenshots, tunneling, BOF/PostEx extension execution, structured events, and real-time event synchronization.

> This project is only intended for use in explicitly authorized environments. Do not deploy, connect, test, or run any component against unauthorized systems, accounts, networks, or third-party assets.

## Project Layout

```text
IrisC2/
├── C-Beacon/           C Beacon source code, build scripts, and reflective stub patch tooling
├── Go-Beacon/          Go cross-platform Beacon source code (Windows / Linux / macOS)
├── client/             Client source code (Wails 3: Go + Vue/TypeScript frontend)
├── stager_shellcode/   Windows x64/x86 stager source code, build scripts, and patch tooling
├── images/             README demo images and video
├── CHANGELOG.md
├── README.md
└── README.en.md
```

Client source code is located in `client/`, built with Wails 3 (Go + Vue/TypeScript). Server is distributed only through GitHub Releases; its source code is not included in this repository. Beacon and stager-related source code are included here and can be built or used to update templates by following the README files in their respective directories.

## How It Works

- Client provides the operator interface, task submission, result viewing, and plugin entry points.
- Server handles authentication, listeners, payload generation, tasking, files, screenshots, tunneling, and event synchronization.
- Beacon runs in authorized target environments, communicates with listeners according to the C2 Profile, and executes tasks.
- Stager is used in staged payload scenarios: it downloads the stage first, then starts the Beacon stage.
- Plugins expose BOF/OBJ and PostEx DLL extension actions through Client and dispatch them to Beacon.

## Demo

GitHub may not preview the large LFS-backed demo video directly on the repository page. Open the [demo video](images/video.mp4) directly, or download it from the Release page.

### Screenshots

![Dashboard and command console](images/演示1.png)

![Listener configuration](images/演示2.png)

![Beacon context menu and plugin entry points](images/演示3.png)

![Payload generator](images/演示4.png)

## Features

### Client

- Provides release packages for Windows, Linux, and macOS.
- Connects to Iris Server for login, session handling, and real-time event updates.
- Manages listeners, payloads, Beacons, tasks, files, screenshots, and tunnels.
- Supports Beacon context menus and plugin action entry points.
- Organizes `plugin.json` and artifact files into executable plugin actions.
- Supports BOF/OBJ and PostEx plugin actions; PostEx actions support `spawn-dll` / `inject-dll`, architecture-aware DLL selection, architecture-aware defaults, and manifest linting.
- Displays structured PostEx frames, including metadata, progress, artifact, and error frames, and routes artifacts into the downloads page.
- Supports common task parameter forms, such as strings, select fields, and required inputs.

Client source code is located in `client/`, built with Wails 3 with a Go backend and Vue + TypeScript frontend. You need to build it from source. See [client/README.md](client/README.md) for details.

Build output includes the plugin directory:

### Server

- Supports username/password authentication and JWT-based API authorization.
- Allows only one active session per username; a new login replaces the previous session.
- Provides REST APIs and a WebSocket event channel.
- Supports HTTP/HTTPS listeners and External TCP listeners; TCP listeners can enable SSL/TLS when configured.
- Supports creating, editing, pausing, resuming, deleting, and listing listeners.
- Uses C2 Profiles to manage Beacon sleep, jitter, sleep obfuscation, HTTP URI, headers, User-Agent, stager behavior, and related options.
- Supports stagerless and staged payload generation.
- Supports Windows x64/x86 Beacon templates and stager templates.
- Supports task persistence, pending task recovery, task status tracking, and result collection.
- Supports PostEx `spawn_dll` / `inject_dll` commands, structured frame events, and artifact downloads.
- Supports file upload, Beacon file download, chunked transfer, screenshot management, and tunneling.
- Provides Windows 7-compatible TLS cipher fallback for HTTP, stager, and TCP listeners.
- Supports local SQLite persistence, runtime logging, and basic decoy response configuration.

Server binaries are published through GitHub Releases. Each platform package includes the required `config.yaml`, `c2profile/`, and `static/` runtime files:

```text
Iris-Server-windows-x64.zip
Iris-Server-linux-x64.tar.gz
```

### Beacon

Beacon source code is located in `C-Beacon/`. Current Beacon-side capabilities include:

- HTTP/HTTPS and External TCP C2 communication, with Raw TCP or TLS over TCP for TCP transport.
- Initial registration, heartbeat refresh, and session key update.
- Sleep time, jitter, and sleep obfuscation configuration.
- Sleep obfuscation technique values:
  - `0` = none
  - `1` = ekko
  - `2` = zilean
  - `3` = gargle
- Basic control: Sleep and Exit.
- Command execution: Shell and PowerShell.
- File system operations: Cd, Ls, Pwd, Cat, Mkdir, Rm, Mv, Cp, SetAttr, and Zip.
- File transfer: Download and Upload.
- File browsing: FileBrowser.
- Process, job, and identity operations: Ps, Jobs, KillJob, Kill, StealToken, and Whoami.
- Network information: Netinfo and Netstat.
- Screenshot capture: Screenshot.
- Tunneling: SOCKS / port-forward-style tunnel start, control, data, and close.
- Extension execution: BOF/OBJ loading, relocation, execution, output collection, and task cancellation.
- PostEx extension execution: supports `spawn-dll` / `inject-dll`, async job polling, metadata/progress/artifact/error frames, and task cancellation.
- Cascade transport: supports TCP and SMB (named pipe) internal beacons. Parent beacons establish cascade links via `connect` or `link` commands, with multi-hop support (e.g. HTTP → TCP → SMB). Internal beacons automatically return to listen state when disconnected from parent.

Beacon build artifacts should be deployed to `server/static/beacon_templates/C-Beacon/`:

```text
beacon_http_windows_amd64.dll     # x64 HTTP/HTTPS reflective DLL (requires patching)
beacon_http_windows_x86.dll       # x86 HTTP/HTTPS reflective DLL (requires patching)
beacon_http_windows_amd64.exe     # x64 HTTP/HTTPS EXE
beacon_http_windows_x86.exe       # x86 HTTP/HTTPS EXE
beacon_tcp_windows_amd64.dll      # x64 TCP external reflective DLL (requires patching)
beacon_tcp_windows_x86.dll        # x86 TCP external reflective DLL (requires patching)
beacon_tcp_windows_amd64.exe      # x64 TCP external EXE
beacon_tcp_windows_x86.exe        # x86 TCP external EXE
beacon_tcp_internal_amd64.exe     # x64 TCP internal cascade beacon
beacon_tcp_internal_x86.exe       # x86 TCP internal cascade beacon
beacon_smb_internal_amd64.exe     # x64 SMB internal cascade beacon
beacon_smb_internal_x86.exe       # x86 SMB internal cascade beacon
```

### Go-Beacon

Go-Beacon source code is located in `Go-Beacon/`, implemented in Go, and supports Windows, Linux, and macOS.

- HTTP/HTTPS C2 communication.
- Supports Windows x64, Linux x64, and macOS ARM builds.
- Windows and Linux support BOF loader, compatible with Client-bundled plugins.
  - Windows x64: COFF format, VirtualAlloc + NtCreateThreadEx, with VEH crash recovery.
  - Linux x64: ELF format, mmap + direct call, with GOT/trampoline external symbol resolution.
- Configuration is written in TSCF v2 TLV format, using the `tools/patch_profile.go` tool.

Go-Beacon build artifacts should be deployed to `server/static/beacon_templates/Go-Beacon/`:

```text
beacon_windows_amd64.exe
beacon_linux_amd64.elf
beacon_mac_arm.macho
```

### Stager

Stager source code is located in `stager_shellcode/` and is used for staged payload scenarios.

- Supports Windows x64/x86.
- Supports downloading stages over HTTP/HTTPS.
- Supports ignoring HTTPS certificate errors when configured.
- Supports `thread` / `process` exit modes.
- Uses an `STG2` configuration block written by Server or `tools/patch_stager_config`.

Server reads stager templates with the following names:

```text
server/static/stager_templates/
├── stager_windows_amd64.exe
├── stager_windows_amd64.bin
├── stager_windows_32.exe
└── stager_windows_32.bin
```

Keep the `stager_windows_*` prefix consistent. Server reads 32-bit stager templates from `stager_windows_32.exe` / `stager_windows_32.bin`.

## Quick Start

### 1. Get The Project Or Release Packages

Server packages are available from [GitHub Releases](https://github.com/onedays12/Iris/releases). Client must be built from source — clone the repository and follow [client/README.md](client/README.md). You will need Go, Node.js, and the Wails 3 CLI.

This repository uses Git LFS for large files such as the demo video. Before cloning for the first time, install and enable Git LFS:

```bash
git lfs install
git clone <repo-url>
cd IrisC2
git lfs pull
```

If you clone a private repository over HTTPS, make sure the current account or token has repository access.

### 2. Configure Server

Extract the Server release package and enter the extracted directory, for example:

```bash
cd Iris-Server-<platform>
```

Edit `config.yaml` and review the following values:

```yaml
TeamServer:
  host: "0.0.0.0"
  port: 8080
  users:
    - username: "admin"
      password: "123456"
  jwt_secret: "change-this-secret"
  allowed_origins: ["*"]
  cert: "static/server.crt"
  key: "static/server.key"
database:
  path: "teamserver.db"
```

For first-time deployment, change the default username, password, and `jwt_secret` immediately. If the release package includes test certificates, use them only for local validation. Replace `server.crt` and `server.key` with your own certificates in production environments.

### 3. Start Server

Start Server from inside the `server/` directory so relative paths can correctly resolve `config.yaml`, `c2profile/`, and `static/`.

Windows:

```powershell
.\TeamServer.exe
```

Linux:

```bash
chmod +x ./TeamServer
./TeamServer
```

The default service address is determined by `host` and `port` in `config.yaml`, for example:

```text
https://127.0.0.1:8080
```

### 4. Start Client

After building Client from source, the build output is in the `client/bin/` directory. See [client/README.md](client/README.md) for build commands.

Windows:

```powershell
cd client\bin
.\client.exe
```

Linux:

```bash
cd client/bin
chmod +x ./client
./client
```

macOS:

```bash
cd client/bin
open client.app
```

In Client, enter the Server address, username, and password to log in. The default accounts are defined in `server/config.yaml`.

### 5. Create A Listener

After logging in, create a listener in Client:

- Choose an HTTP/HTTPS listener or an External TCP listener based on the payload transport; TCP can enable SSL/TLS when needed.
- Set the bind address, port, and callback address.
- Set the communication key.
- Choose a C2 Profile, such as `http-default` or `http-stager`.
- Start the listener and confirm that it is running.

### 6. Generate A Payload

On the Client payload page, choose:

- Listener.
- Target platform: currently mainly Windows.
- Architecture: `amd64` or `x86`.
- Output format: EXE, DLL, shellcode, or stager, depending on the formats supported by the Client page.
- C2 Profile: use a regular profile for stagerless payloads, and a stager-enabled profile for staged payloads.

Template sources:

- Stagerless payloads use `server/static/beacon_templates/`.
- Staged payloads use `server/static/stager_templates/`; Server generates the stage and the stager downloads it.

### 7. Manage Beacons

After a Beacon checks in, Client can display its session, heartbeat, system information, task results, and file transfer status. Common operations include:

- Run Shell / PowerShell.
- Browse and operate on the file system.
- Upload and download files.
- View processes and jobs.
- Capture screenshots.
- Start or stop tunnels.
- Execute BOF/OBJ or PostEx actions provided by plugins, and review structured output or artifacts in task results and the downloads page.

## Plugins

Plugins are bundled with the Client release packages and support BOF/OBJ and PostEx DLL actions. Plugin authoring, field formats, parameter types, and full examples are documented in [client/plugins/README.md](client/plugins/README.md).

Inside a Client release package, plugins are located in:

```text
client/plugins/
```

Each plugin is a standalone directory that contains at least:

```text
plugin-name/
├── plugin.json
└── bin/ or other artifact files
```

Built-in plugin examples in the Client release package:

```text
client/plugins/
├── execution-injection/
└── postex-template/
```

### Usage Steps

1. Place the plugin directory under `client/plugins/`.
2. Make sure the plugin directory contains `plugin.json`.
3. Make sure BOF/OBJ `artifact` / `artifact_by_arch` files or PostEx `postex.dll` / `postex.dll_by_arch` files exist and are relative to the plugin directory.
4. Restart Client or refresh the plugin list.
5. Select the action from the Beacon context menu or plugin entry point.
6. Fill in the form fields and submit the task.
7. View results in task output, Beacon output, or the Downloads page.

### plugin.json Format

```json
{
  "name": "example-plugin",
  "display_name": "Example Plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "actions": [
    {
      "id": "whoami",
      "kind": "bof",
      "label": "Whoami",
      "description": "Get the identity of the current Beacon session",
      "os": ["windows"],
      "arch": ["amd64"],
      "artifact": "bin/whoami.x64.o",
      "requires_input": false
    }
  ]
}
```

Actions with parameters can declare `fields`:

```json
{
  "id": "example_with_input",
  "label": "Example With Input",
  "kind": "bof",
  "artifact_by_arch": {
    "amd64": "bin/example.x64.o",
    "x86": "bin/example.x86.o"
  },
  "requires_input": true,
  "fields": [
    {
      "name": "target",
      "label": "Target",
      "type": "string",
      "placeholder": "127.0.0.1",
      "default": "",
      "required": true
    }
  ]
}
```

Field notes:

- `name`: parameter name used during submission.
- `label`: display name shown in Client.
- `type`: field type, commonly `string` or `select`.
- `options`: candidate values for `select` fields.
- `artifact`: plugin artifact path, relative to the plugin directory.
- `artifact_by_arch`: chooses a BOF/OBJ artifact by Beacon architecture; common keys are `amd64` and `x86`.
- `kind`: action type; omitted actions default to `bof`, and PostEx actions use `postex`.
- `postex`: PostEx action configuration block. Use `dll` / `dll_by_arch` for DLL files; PostEx does not reuse the `artifact` field.
- `command_id`: Beacon command ID; BOF/OBJ actions default to `70`, PostEx actions must use `90`, and plugin authors usually do not need to set it manually.
- `requires_input`: whether a parameter form should be shown.

Plugin artifacts must match the Beacon architecture. Use x64 BOF/OBJ or DLL artifacts with x64 Beacon, and x86 BOF/OBJ or DLL artifacts with x86 Beacon.

PostEx action example:

```json
{
  "id": "postex_template_spawn",
  "kind": "postex",
  "label": "PostEx Template Spawn",
  "os": ["windows"],
  "arch": ["amd64", "x86"],
  "postex": {
    "mode": "spawn-dll",
    "dll_by_arch": {
      "amd64": "bin/postex_template.x64.dll",
      "x86": "bin/postex_template.x86.dll"
    },
    "manifest": "postex-template.manifest.json",
    "wait_ms": 3000,
    "spawn_path_by_arch": {
      "amd64": "C:\\Windows\\System32\\cmd.exe",
      "x86": "C:\\Windows\\SysWOW64\\cmd.exe"
    },
    "spawn_args": "/c timeout /t 30 /nobreak > nul",
    "backend": "remote-thread"
  }
}
```

## C2 Profile

C2 Profiles are located in the Server release package:

```text
server/c2profile/
├── http-default.yaml
└── http-stager.yaml
```

Common fields:

```yaml
beacon:
  sleep_time: 3000
  jitter: 20
  sleep_obf_enabled: true
  sleep_obf_technique: 3

http:
  uri: /index.php
  method: GET
  hb_header: Cookie
  hb_prefix: SESSIONID=
  user_agent: "Mozilla/5.0 ..."

stager:
  enabled: false
  base_uri: /assets
  https: false
  ignore_cert: false
```

`sleep_obf_technique` values:

- `0`: none
- `1`: ekko
- `2`: zilean
- `3`: gargle

`http-stager.yaml` enables staged payloads. `http-default.yaml` is the default profile for regular HTTP Beacon usage.

## Build Beacon Templates

Enter the Beacon source directory:

```bat
cd C-Beacon
build_all.bat
```

`build_all.bat` produces all 12 artifacts:

```text
C-Beacon/x64/Release/beacon_http_windows_amd64.dll
C-Beacon/x86/Release/beacon_http_windows_x86.dll
C-Beacon/x64/ReleaseExe/beacon_http_windows_amd64.exe
C-Beacon/x86/ReleaseExe/beacon_http_windows_x86.exe
C-Beacon/x64/ReleaseDllTcpExternal/beacon_tcp_windows_amd64.dll
C-Beacon/x86/ReleaseDllTcpExternal/beacon_tcp_windows_x86.dll
C-Beacon/x64/ReleaseExeTcpExternal/beacon_tcp_windows_amd64.exe
C-Beacon/x86/ReleaseExeTcpExternal/beacon_tcp_windows_x86.exe
C-Beacon/x64/ReleaseExeTcpInternal/beacon_tcp_internal_amd64.exe
C-Beacon/x86/ReleaseExeTcpInternal/beacon_tcp_internal_x86.exe
C-Beacon/x64/ReleaseExeSmbInternal/beacon_smb_internal_amd64.exe
C-Beacon/x86/ReleaseExeSmbInternal/beacon_smb_internal_x86.exe
```

DLLs must be processed with reflective stub patching before deployment. Use `sync_teamserver_templates.bat` for a one-step build, patch, and deploy, or follow the manual steps in [C-Beacon/README.md](C-Beacon/README.md).

Deployment target inside the Server release package:

```text
server/static/beacon_templates/C-Beacon/
```

## Build Go-Beacon Templates

Enter the Go-Beacon source directory:

Windows:

```bat
cd Go-Beacon
build_windows.bat
```

Linux:

```bash
cd Go-Beacon
chmod +x build_linux.sh
./build_linux.sh
```

macOS (ARM):

```bash
cd Go-Beacon
chmod +x build_mac.sh
./build_mac.sh
```

Artifacts are in `Go-Beacon/bin/`:

```text
Go-Beacon/bin/beacon_windows_amd64.exe
Go-Beacon/bin/beacon_linux_amd64.elf
Go-Beacon/bin/beacon_mac_arm.macho
```

Deployment target inside the Server release package:

```text
server/static/beacon_templates/Go-Beacon/
```

## Build Stager Templates

Enter the stager source directory:

```bat
cd stager_shellcode
build_stager_x64.bat
build_stager_x86.bat
```

Artifacts:

```text
stager_shellcode/x64/Release/stager_windows_amd64.exe
stager_shellcode/x64/Release/stager_windows_amd64.bin
stager_shellcode/x86/Release/stager_windows_32.exe
stager_shellcode/x86/Release/stager_windows_32.bin
```

Deployment target inside the Server release package:

```text
server/static/stager_templates/
```

For detailed patching, testing, and HTTPS stage server usage, see [stager_shellcode/README.en.md](stager_shellcode/README.en.md).

## Responsibility Statement

IrisC2 is a tool for authorized security testing and internal research. Users must ensure that all targets, accounts, networks, payloads, plugin artifacts, and collected data are within a clearly authorized scope. The maintainers are not responsible for any consequences caused by unauthorized use.
