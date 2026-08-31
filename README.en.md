# IrisC2

Language: [中文](README.md) | English

IrisC2 is a C2 framework for authorized security testing, red team exercises, attack-defense labs, and internal research. It is composed of Iris Client, Iris Server, Beacon, Stager, and a plugin system, covering listener management, payload generation, Beacon tasking, file transfer, screenshots, tunneling, BOF/PostEx extension execution, structured events, and real-time event synchronization.

> This project is only intended for use in explicitly authorized environments. Do not deploy, connect, test, or run any component against unauthorized systems, accounts, networks, or third-party assets.

## Project Status

The main framework is in place, and the core capabilities from the early roadmap have largely landed. Roadmap:

- **v0.4.x** — continued polish of the Client / Server experience; Beacon stays unchanged for now.
- **v0.5** — start building a plugin authoring framework, plus credential-extraction and persistence tooling. These tools are destructive in nature and will not ship with public Releases for the time being; the community is encouraged to write their own plugins on top of the existing plugin system, and you can reach out privately if you genuinely need them.
- Defense evasion techniques for the Beacon will be open-sourced without reservation.

Server is currently distributed only via Releases as binaries — its source code is not public yet. Once the project reaches 200 stars, I will open-source the Server source.

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

- Client provides the operator interface, task submission, result viewing, and plugin entry points, with an embedded MCP Server that lets agents drive listeners, Beacons, commands, files, and events directly.
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

- Release packages for Windows, Linux, and macOS.
- Connects to Iris Server for login, session handling, and real-time event updates.
- Manages listeners, payloads, Beacons, tasks, files, screenshots, and tunnels.
- Supports Beacon context menus and plugin action entry points.
- Supports BOF/OBJ and PostEx plugin actions (including `spawn-dll` / `inject-dll`, architecture-aware DLL selection, and manifest linting).
- Displays structured PostEx frames (metadata / progress / artifact / error) and routes artifacts into the downloads page.
- Embedded MCP Server that lets agents drive listeners, Beacons, commands, files, and events directly.
- Workbench BottomDock: console, events, and transfers docked at the bottom of the window.
- Remote file preview (text / image whitelist, in-memory relay, never written to disk).
- Beacon notes, grouping, and checkbox multi-select deletion; file browser supports execution, native drag-and-drop upload, and a per-Beacon transfer panel.
- Remember-password on login (written only after a successful login).

Build details: [client/README.md](client/README.md).

### Server

- Username/password + JWT auth; login uses a CS-style unified password with username occupation and disconnect grace.
- REST APIs and a WebSocket event channel.
- HTTP/HTTPS listeners and External TCP listeners; TCP can enable SSL/TLS when configured.
- C2 Profiles control Beacon sleep, jitter, sleep obfuscation, HTTP transforms, stager behavior, and more.
- Supports stagerless and staged payload generation, with both C and Go Beacon templates.
- Task persistence, pending task recovery, task status tracking, and result collection.
- PostEx `spawn_dll` / `inject_dll`, structured frame events, and artifact downloads.
- Remote file preview (text / image whitelist, in-memory relay, never written to disk) — no Beacon changes required.
- Session notes, grouping, and batch-delete APIs; `GET /transfers/active` transfer reconciliation snapshot.
- File upload / Beacon file download / chunked transfer / screenshots / tunneling.
- Windows 7-compatible TLS cipher fallback; SQLite local persistence; basic decoy responses.

Server is published through GitHub Releases. Each platform package includes the required `config.yaml`, `c2profile/`, and `static/`:

```text
Iris-Server-windows-x64.zip
Iris-Server-linux-x64.tar.gz
```

### Beacon

Beacon source code is in `C-Beacon/`. Current capabilities:

- HTTP/HTTPS and External TCP C2 communication (TCP supports Raw TCP or TLS over TCP).
- Initial registration, heartbeat refresh, and session key update.
- Sleep time / jitter / sleep obfuscation (none / ekko / zilean / gargle).
- Command execution, file system operations, file transfer, file browsing, process/job/identity, network info, and screenshots.
- Indirect syscalls: recycled / halos gate with randomized invocation.
- PPID spoofing: target process name or PID configured in the profile; syscalls can be toggled via TSCF.
- Tunneling: SOCKS / port-forward-style tunnel start / control / data / close.
- Extension execution: BOF/OBJ loading, relocation, execution, output collection, and task cancellation.
- PostEx: `spawn-dll` / `inject-dll`, async job polling, and metadata/progress/artifact/error frames.
- Cascade transport: TCP and SMB (named pipe) internal beacons. Parent beacons establish cascade links via `connect` / `link`, with multi-hop support (e.g. HTTP → TCP → SMB). Internal beacons automatically return to listen state when disconnected from the parent.

Build and template deployment: [C-Beacon/README.md](C-Beacon/README.md).

> As of v0.2.0, all C-Beacon / Go-Beacon templates use a unified naming scheme: `beacon_{proto}_{external|internal}_{os}_{arch}.{ext}`.

### Go-Beacon

Go-Beacon source code is in `Go-Beacon/`, implemented in Go, and supports Windows, Linux, and macOS.

- HTTP/HTTPS C2 communication.
- Builds for Windows x64, Linux x64, and macOS ARM.
- Windows and Linux support a BOF loader:
  - Windows x64: COFF format, VirtualAlloc + NtCreateThreadEx, with VEH crash recovery.
  - Linux x64: ELF format, mmap + direct call, with GOT/trampoline external symbol resolution.
- Configuration is written in TSCF v2 TLV format, produced by `tools/patch_profile.go`.
- Tunneling aligned with C-Beacon, with batched callbacks.
- Windows builds are windowless; no console window is spawned at runtime.

Build and template deployment: [Go-Beacon/README.md](Go-Beacon/README.md).

### Stager

Stager source code is in `stager_shellcode/`, used for staged payload scenarios.

- Supports Windows x64/x86.
- Supports downloading stages over HTTP/HTTPS, with optional certificate error ignoring.
- Supports `thread` / `process` exit modes.
- Uses an `STG2` configuration block written by Server or `tools/patch_stager_config`.

Build and patching details: [stager_shellcode/README.en.md](stager_shellcode/README.en.md).

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

### 2. Configure And Start Server

Extract the Server release package, enter the directory, edit `config.yaml` (change the default username/password and `jwt_secret`; replace the TLS certificates with your own in production), then start it from inside the `server/` directory:

```bash
# Windows
.\TeamServer.exe
# Linux
chmod +x ./TeamServer && ./TeamServer
```

The default service address is determined by `host` and `port` in `config.yaml`, for example `https://127.0.0.1:8080`.

### 3. Start Client And Log In

Client build output is in `client/bin/`. Launch it and enter the Server address, username, and password to log in. Default accounts are defined in `server/config.yaml`. Build steps: [client/README.md](client/README.md).

### 4. Create A Listener And Payload

After logging in, create a listener in Client (HTTP/HTTPS or External TCP; TCP can enable SSL/TLS), then on the payload page choose the listener, target platform, architecture, output format, and C2 Profile to generate the payload. Payload generation supports a `beacon_type` field (`c` / `go`); the `go + external tcp` combination is rejected by the server.

Template sources:

- Stagerless payloads: `server/static/beacon_templates/`
- Staged payloads: `server/static/stager_templates/`

## Plugins

Plugins are bundled with the Client release packages and support BOF/OBJ and PostEx DLL actions. Plugin authoring, `plugin.json` fields, parameter types, and full examples are documented in [client/plugins/README.md](client/plugins/README.md).

Built-in example plugins:

```text
client/plugins/
├── execution-injection/
├── linux-elf-bof/
└── postex-template/
```

## C2 Profile

C2 Profiles are located in the Server release package at `server/c2profile/`:

```text
server/c2profile/
├── http-default.yaml
├── http-stager.yaml
└── tcp-default.yaml
```

Profiles control Beacon sleep, jitter, sleep obfuscation, HTTP transforms (location, encoding, prefix/suffix for metadata / stage_output / server_output), stager behavior, and more. `sleep_obf_technique` accepts `0` none / `1` ekko / `2` zilean / `3` gargle. For exact fields, refer to the c2profile files shipped with the release package.

## Build Templates

Build, patch, and deployment steps for Beacon and stager templates are documented in each subdirectory README:

- C-Beacon: [C-Beacon/README.md](C-Beacon/README.md)
- Go-Beacon: [Go-Beacon/README.md](Go-Beacon/README.md)
- Stager: [stager_shellcode/README.en.md](stager_shellcode/README.en.md)

## Responsibility Statement

IrisC2 is a tool for authorized security testing and internal research. Users must ensure that all targets, accounts, networks, payloads, plugin artifacts, and collected data are within a clearly authorized scope. The maintainers are not responsible for any consequences caused by unauthorized use.
