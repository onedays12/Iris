# IrisC2

Language: [中文](README.md) | English

IrisC2 is a C2 framework for authorized security testing, red team exercises, attack-defense labs, and internal research. It is composed of Iris Client, Iris Server, Beacon, Stager, and a plugin system, covering listener management, payload generation, Beacon tasking, file transfer, screenshots, tunneling, BOF execution, and real-time event synchronization.

> This project is only intended for use in explicitly authorized environments. Do not deploy, connect, test, or run any component against unauthorized systems, accounts, networks, or third-party assets.

## Project Layout

```text
IrisC2/
├── C-Beacon/           Beacon source code, build scripts, and reflective stub patch tooling
├── stager_shellcode/   Windows x64/x86 stager source code, build scripts, and patch tooling
├── images/             README demo images and video
├── README.md
└── README.en.md
```

Client and Server are distributed only through GitHub Releases. Their source code and local runtime directories are not included in this repository. Beacon and stager-related source code are included here and can be built or used to update templates by following the README files in their respective directories.

## How It Works

- Client provides the operator interface, task submission, result viewing, and plugin entry points.
- Server handles authentication, listeners, payload generation, tasking, files, screenshots, tunneling, and event synchronization.
- Beacon runs in authorized target environments, communicates with listeners according to the C2 Profile, and executes tasks.
- Stager is used in staged payload scenarios: it downloads the stage first, then starts the Beacon stage.
- Plugins expose BOF/OBJ-based extension actions through Client and dispatch them to Beacon.

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
- Supports common task parameter forms, such as strings, select fields, and required inputs.

Client binaries are published through GitHub Releases. Plugins are bundled with each platform-specific Client zip package:

```text
Iris-Client-v0.0.1-windows-x64.zip
Iris-Client-v0.0.1-linux-x64.zip
Iris-Client-v0.0.1-macos-arm64.zip
Irisclient-v0.0.1-arm-Mac.dmg
```

### Server

- Supports username/password authentication and JWT-based API authorization.
- Allows only one active session per username; a new login replaces the previous session.
- Provides REST APIs and a WebSocket event channel.
- Supports HTTP/HTTPS listeners; Server also contains TCP listener-related capabilities, while the currently public Beacon C2 callback path is based on HTTP/HTTPS transport.
- Supports creating, editing, pausing, resuming, deleting, and listing listeners.
- Uses C2 Profiles to manage Beacon sleep, jitter, HTTP URI, headers, User-Agent, stager behavior, and related options.
- Supports stagerless and staged payload generation.
- Supports Windows x64/x86 Beacon templates and stager templates.
- Supports task persistence, pending task recovery, task status tracking, and result collection.
- Supports file upload, Beacon file download, chunked transfer, screenshot management, and tunneling.
- Supports local SQLite persistence, runtime logging, and basic decoy response configuration.

Server binaries are published through GitHub Releases. Each platform package includes the required `config.yaml`, `c2profile/`, and `static/` runtime files:

```text
Iris-Server-v0.0.1-windows-x64.zip
Iris-Server-v0.0.1-linux-x64.tar.gz
Iris-Server-v0.0.1-macos-arm64.tar.gz
```

### Beacon

Beacon source code is located in `C-Beacon/`. Current Beacon-side capabilities include:

- HTTP/HTTPS C2 communication.
- Initial registration, heartbeat refresh, and session key update.
- Sleep time, jitter, and sleep obfuscation configuration.
- Sleep obfuscation technique values:
  - `0` = none
  - `1` = ekko
  - `2` = zilean
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

Beacon build artifacts should be deployed to:

```text
server/static/beacon_templates/
├── beacon_windows_amd64.dll
├── beacon_windows_amd64.exe
├── beacon_windows_x86.dll
└── beacon_windows_x86.exe
```

### Advanced Capability Boundary

In addition to the public capabilities above, IrisC2 also plans or reserves a set of advanced capabilities with deeper adversarial depth and higher misuse risk, such as Dump LSASS, browser credential extraction, RunPE, shellcode injection, VNC, AMSI bypass, ETW bypass, system calls, call stack spoofing, anti-debugging, anti-sandboxing, BeaconGate, cascading, lateral movement, persistence, privilege escalation, and similar topics.

These capabilities involve deeper attack-defense details and are not included in the public release or public documentation. This README will not provide implementation details, invocation methods, or bypass strategies. If they are discussed in the future, they will be presented as authorized research, technical analysis, or defense-oriented writeups.

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

If you only want to run IrisC2, download the Server and Client packages for your platform from [GitHub Releases](https://github.com/onedays12/Iris/releases).

Clone the repository only if you want to inspect the source, build Beacon/Stager, or modify plugins. This repository uses Git LFS for large files such as the demo video. Before cloning for the first time, install and enable Git LFS:

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
cd Iris-Server-v0.0.1-<platform>
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
.\TeamServer-v0.0.1-x64-Windows.exe
```

Linux:

```bash
chmod +x ./TeamServer-v0.0.1-x64-Linux
./TeamServer-v0.0.1-x64-Linux
```

macOS:

```bash
chmod +x ./TeamServer-v0.0.1-arm-Mac
./TeamServer-v0.0.1-arm-Mac
```

The default service address is determined by `host` and `port` in `config.yaml`, for example:

```text
https://127.0.0.1:8080
```

### 4. Start Client

Windows:

```powershell
cd Iris-Client-v0.0.1-windows-x64
.\Irisclient-v0.0.1-x64-Windows.exe
```

Linux AppImage:

In a graphical desktop environment, you can run it by double-clicking:

```text
Iris-Client-v0.0.1-linux-x64/Irisclient-v0.0.1-x64-Linux.AppImage
```

You can also run it from a terminal:

```bash
cd Iris-Client-v0.0.1-linux-x64
chmod +x ./Irisclient-v0.0.1-x64-Linux.AppImage
./Irisclient-v0.0.1-x64-Linux.AppImage
```

Debian/Ubuntu:

```bash
cd Iris-Client-v0.0.1-linux-x64
sudo dpkg -i ./Irisclient-v0.0.1-x64-Linux.deb
client
```

The package installs the executable to `/usr/local/bin/client` and registers a desktop entry. If `dpkg` reports missing dependencies, run:

```bash
sudo apt-get install -f
client
```

macOS:

```text
Open Irisclient-v0.0.1-arm-Mac.dmg, or extract Iris-Client-v0.0.1-macos-arm64.zip and run the .app inside it.
```

In Client, enter the Server address, username, and password to log in. The default accounts are defined in `server/config.yaml`.

### 5. Create A Listener

After logging in, create a listener in Client:

- For the currently public Beacon, choose an HTTP/HTTPS listener.
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
- Execute BOF/OBJ actions provided by plugins.

## Plugins

Plugins are bundled with the Client release packages. Plugin authoring, field formats, parameter types, and examples are documented below.

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
└── execution-injection/
```

### Usage Steps

1. Place the plugin directory under `client/plugins/`.
2. Make sure the plugin directory contains `plugin.json`.
3. Make sure the file referenced by `artifact` exists and is relative to the plugin directory.
4. Restart Client or refresh the plugin list.
5. Select the action from the Beacon context menu or plugin entry point.
6. Fill in the form fields and submit the task.
7. View the result in task output or Beacon output.

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
      "label": "Whoami",
      "description": "Get the identity of the current Beacon session",
      "artifact": "bin/whoami.x64.o",
      "command_id": 70,
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
  "artifact": "bin/example.x64.o",
  "command_id": 70,
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
- `command_id`: Beacon command ID; BOF/OBJ plugins usually use `70`.
- `requires_input`: whether a parameter form should be shown.

Plugin artifacts must match the Beacon architecture. Use x64 BOF/OBJ artifacts with x64 Beacon, and x86 BOF/OBJ artifacts with x86 Beacon.

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
  sleep_obf_technique: 2

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

`http-stager.yaml` enables staged payloads. `http-default.yaml` is the default profile for regular HTTP Beacon usage.

## Build Beacon Templates

Enter the Beacon source directory:

```bat
cd C-Beacon
build_all.bat
```

Common artifacts:

```text
C-Beacon/x64/Release/Beacon_amd64.dll
C-Beacon/x64/ReleaseExe/beacon_windows_amd64.exe
C-Beacon/x86/Release/Beacon_x86.dll
C-Beacon/x86/ReleaseExe/beacon_windows_x86.exe
```

DLLs must be processed with reflective stub patching before deployment to the extracted Server template directory. For detailed commands, see [C-Beacon/README.en.md](C-Beacon/README.en.md).

Deployment target inside the Server release package:

```text
server/static/beacon_templates/
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
