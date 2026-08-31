# MCP tools

[中文](mcp.md) · [English](mcp.en.md)

Iris Client ships a local MCP server. External agents (ZCode, Claude Code, Codex) can drive the Client: listeners, beacon generation, commands, file transfer, waiting on events. Mainly for TeamServer → Beacon automation. Sometimes you use it as a half-auto operator.

Built in since client `0.4.0`. 19 tools right now. Main path is loopback Streamable HTTP. Codex uses the stdio bridge next to it.

## Bring the service up

Same every time: start the Client (`bin/client.exe` or whatever you built). MCP comes up with the app and listens on `127.0.0.1:9333`. Change the port with `IRIS_MCP_LISTEN`, loopback only. Bind anything else and the server refuses.

Then log into TeamServer in the GUI. Creds sync to MCP over a WS hook. The agent never sees them. If you skip login, tools that hit TeamServer come back with a blunt error: client GUI is not logged in, or creds were not synced.

### How agents connect

| Agent | Transport | Config |
| --- | --- | --- |
| ZCode / Claude Code | Streamable HTTP | MCP URL: `http://127.0.0.1:9333` |
| Codex CLI | stdio | start command: `bin/iris-mcp-stdio.exe` |

Codex `config.toml` looks like this:

```toml
[mcp_servers.iris-client]
command = "C:\\path\\to\\bin\\iris-mcp-stdio.exe"
```

The stdio bridge is just a pipe. The agent starts it, it dials the Client HTTP port. Same tools, same session.

Probe:

```bash
curl -s -X POST http://127.0.0.1:9333/ \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

A good reply has `"serverInfo":{"name":"iris-client",...}` and `Mcp-Session-Id` in the headers.

## What it actually does

```
Agent (ZCode / Claude Code / Codex)
   │ stdio (cmd/iris-mcp-stdio)          │ Streamable HTTP
   └──────────────┬──────────────────────┘
                  ▼
   127.0.0.1:9333  Client-embedded MCP (service/mcp, go-sdk v1.7)
                  │ REST to TeamServer (shared HTTP client + Bearer)
                  │ local: FileService / PluginService
                  │ wait_for_event ← FanoutEmitter (ring buffer 1000)
                  ▼
            TeamServer :8080  ⇄  beacon
```

The GUI WebSocket is left alone. Creds live and die with the GUI session. Relogin or silent reauth overwrites them. MCP does not store passwords.

This port is loopback-only and has no auth. Any local process that connects owns the control plane. Do not point `IRIS_MCP_LISTEN` at a public NIC. The server will refuse that too.

## Tool list

| Group | Tools | What they do |
| --- | --- | --- |
| Session | `get_client_status` | login state, api_base, whether WS is up |
| Events | `list_recent_events`, `wait_for_event` | dump the ring buffer; block until the next matching frame |
| Listeners | `list_listeners`, `create_listener`, `pause_listener`, `resume_listener`, `remove_listener`, `edit_listener` | full CRUD. name is the id. remove does not come back |
| Beacons | `list_beacons`, `send_beacon_command` | list, dispatch. command name or numeric id |
| Payload | `generate_beacon` | real binary on disk, returns abs path + sha256 + size |
| Files | `upload_local_file`, `list_downloads`, `download_file` | local file into TeamServer store, beacon fetches it, product comes back |
| Screenshot | `request_screenshot`, `list_screenshots`, `save_screenshot` | dispatch, list, save to disk |
| Preview | `preview_remote_file` | remote text/image whitelist preview, ≤2MB, one call |

### `send_beacon_command`

```jsonc
{ "beacon_id": "<id>", "command": "WHOAMI", "args": [] }
```

Names match frontend `constants/commands.ts`: SLEEP EXIT SHELL POWERSHELL CD LS PWD CAT MKDIR RM MV CP DOWNLOAD UPLOAD SETATTR ZIP PS KILLJOB KILL STEAL_TOKEN JOBS WHOAMI SCREENSHOT NETINFO NETSTAT EXECUTION_BOF CASCADE_* POSTEX* MIGRATE*.

Usual shapes: `SHELL ["whoami > c:\\users\\public\\o.txt"]`, `SLEEP [5000, 200]`, `LS ["C:\\"]`, `KILL [<pid>]`. SETATTR, CASCADE_*, POSTEX*, MIGRATE* need typed args: `{kind:"string|int32|short|bool|bytes", value}`. Results are async. After send, `wait_for_event`.

### `generate_beacon`

```jsonc
{ "listener_id": "...", "os": "windows", "arch": "amd64",
  "format": "exe", "stage_mode": "stagerless", "beacon_type": "c" }
```

Files land in `%TEMP%\iris-mcp-payloads\`. Return is `{path, sha256, size, stage_url?}`. MCP will not run the file. The agent starts it with a shell. Default is C-beacon (`beacon_type:"c"`). go-beacon works too, it is just bigger.

### `wait_for_event`

```jsonc
{ "type_prefix": "BEACON_REG",
  "since_seq": 12,
  "beacon_id": "...",
  "command_id": "...",
  "timeout_ms": 90000 }
```

`since_seq` comes from `list_recent_events.last_seq`. Read the baseline before you fire the action. Read it late and you miss frames in the gap.

Inner `type` values you will see: `BEACON_REGISTERED`, `BEACON_TICK`, `USER_ONLINE`, `COMMAND_EVENT` (`phase=result` is a normal result, `phase=preview` is preview). Correlation fields sit in `data` most of the time. Do not only look at the top level.

### `preview_remote_file`

Text (`kind=text`) comes back as `content`. Images go to `%TEMP%\iris-mcp-downloads\previews\` and you get `path_local`. Over 2MB, or not on the whitelist, the tool error has a reason and tells you to use DOWNLOAD. Payload rides CommandDownload chunks on the heartbeat. No `timeout_ms` means 30s.

We have seen `C:\Windows\win.ini` start with `; for 16-bit app support`, mime `text/plain; charset=utf-8`.

### Upload, then pull back

`upload_local_file` gives you a `file_id` in the TeamServer store. On the beacon: `send_beacon_command(UPLOAD, args=[source_file, remote_path])`. After DOWNLOAD finishes, `list_downloads` sees it. `download_file` brings it home, default dir `%TEMP%\iris-mcp-downloads\files\`.

## Paths you can replay

Full script: `frontend/scripts/mcp-e2e-chain.mjs`. Client must already be logged in. Human-shaped steps below.

### Online (C-beacon)

1. `get_client_status`, confirm logged_in.
2. `list_listeners` and reuse a started one. None? `create_listener` (external/http, empty `encrypt_key` generates one).
3. `generate_beacon(listener_id, windows/amd64/exe/stagerless, beacon_type=c)`, take the path.
4. Agent starts that file with a shell (detached).
5. `wait_for_event(type_prefix="BEACON_REG", since_seq=<last_seq before the action>, timeout_ms=90000)`, check the register frame.
6. Kill the beacon process, wipe the payload dir.

C-beacon is about 320KB. On an HTTP external listener it usually checks in within a few seconds.

### Command echo

1. `send_beacon_command(beacon_id, "WHOAMI")`.
2. `wait_for_event(type_prefix="COMMAND", beacon_id=<id>, since_seq=<cursor before send>)`.
3. Text is at `data.data.text` (`phase=result`, `status=completed`). WHOAMI has come back as `"Administrator (User)"`.

### Files and observation

1. `upload_local_file` for a file_id, then `send_beacon_command(UPLOAD,…)` so the beacon fetches it.
2. Small text / config: `preview_remote_file`. Big files: DOWNLOAD.
3. After it comes back: `list_downloads` → `download_file`.
4. Screenshot: `request_screenshot` is only an ack. Wait with `wait_for_event(COMMAND…)`, or `list_screenshots`, then `save_screenshot` (path / sha256 / size).

`request_screenshot` can produce a PNG in a few seconds (we saw 2048x1152, about 198KB). `save_screenshot` defaults to `%TEMP%\iris-mcp-downloads\screenshots\`. Omit quality and the command layer uses 80. Explicit values must be 1–100.

### Operator walkthrough

`frontend/scripts/mcp-operator-sim.mjs` walks the operator path and prints what it sees. Everything except login state is a soft fail. Ends with `SUMMARY: OK=n FAIL=m`. FAIL>0 exits 2.

Rough order: listeners and beacons (alive ones use `last_seen`) → no live beacon, run the deploy path above → WHOAMI / PWD / LS / SHELL (SHELL reads the Job ack and the output as two frames via `matched.seq`) → preview win.ini → screenshot → `list_recent_events` on the tail.

### Dual-transport smoke

```bash
node frontend/scripts/stdio-mcp-smoke.mjs
```

HTTP side: point any MCP client at `http://127.0.0.1:9333`.

Dump real preview WS frames: `frontend/scripts/diag-preview-frame.mjs`. Trust that JSON for frame shape and whether predicates match.

## When it goes wrong

| Symptom | Likely cause |
| --- | --- |
| REST tools say not logged in / creds not synced | GUI is not logged in, or you just restarted and it has not connected. Log in once in the UI. |
| Port dead | Client is not running, or the port is taken. Change `IRIS_MCP_LISTEN`, or free the port and start Client. |
| `wait_for_event` times out | beacon sleep is long: SLEEP it down first. `since_seq` was taken too late and you missed frames. `beacon_id` is wrong; the field lives under nested `data`. |
| create / generate says listener not found, or generate fails | listener is not started. os / arch / format combo is unsupported (stager is windows+http stager only; c format is stager-only). |
| preview says too_large / type unsupported | over 2MB, or extension not on the whitelist. Use DOWNLOAD. Whitelist is `frontend/src/features/preview/model.ts` and TeamServer `server/transfer/codec.go`. Change both. |
| preview / download 404 | TTL expired (preview 5 min; download staging follows server policy). Send again. |
| 409 conflict (`create_preview`) | server cap of 10 active previews. DELETE an old one, or wait. |
| stdio bridge returns HTTP error frame (-32000) | the long-lived Client is not up, so the bridge cannot forward. Start Client first. |
| unit test disagrees on commands.ts | command tables drifted across repos. Align `CommandID` / `COMMAND_ID` from the error, rerun the snapshot. |

## Change both sides

If you touch one of these, touch the other. Tests help.

- Command IDs: `frontend/src/constants/commands.ts` ↔ `service/mcp/commands.go` (snapshot test)
- Arg typing: `features/beacon/api/commandArgs.ts` ↔ `buildBeaconCommandArgs`
- Preview extensions: `frontend/src/features/preview/model.ts` ↔ TeamServer `server/transfer/codec.go` (`npm run check:preview-mirror`)
- WS frame type keys: `frameTypeKeys` in `parse_frame.go`. Canonical key is lowercase `type`
- COMMAND_EVENT nesting: task fields (`beacon_id` / `task_id`) live in `payload.data`. Result metadata (`preview_id` / `status` / `reason` / `text`) lives in `payload.data.data`. `matchFilters` and `previewEventMeta` search both levels. New tools that read frame fields should dump a real frame with `diag-preview-frame.mjs`. Do not invent the shape from a unit fixture. We already had a fake flat frame vs a nested real frame, and predicates never hit.

Main app: `wails3 build`. stdio bridge: `wails3 task mcp:stdio:build`, output `bin/iris-mcp-stdio.exe`.

Regression: `mcp-e2e-chain.mjs` (hard gate), `mcp-operator-sim.mjs` (non-zero if FAIL>0), `stdio-mcp-smoke.mjs`.

Cleaning debug hooks in `main.go` (CDP port, etc.): do not `git checkout -- main.go` on the whole file. Uncommitted MCP wiring goes with it. grep `remote-debugging-port` and delete those lines.
