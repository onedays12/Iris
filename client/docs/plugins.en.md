# Plugins (`plugin.json` schema v2)

[中文](plugins.md) · [English](plugins.en.md)

This is the page for writing `plugins/<plugin>/plugin.json`. v2 is a breaking change. v1 fails to load.

Do not write fields the Client can infer. Do not guess what it will accept. Every referenced file needs a sha256, checked on load.

- Skip `id` / `kind` / `arch` / `label` / `os` when they can be inferred.
- PostEx actions only point at a module manifest. Config and form fields grow from that.
- `capabilities.command_ids` is required. Checked again before dispatch.
- Unknown fields blow up. A typo is not silently dropped.
- Copy can be a plain string or `{"zh": "...", "en": "..."}`.

## Directory layout

```text
plugins/
  my-plugin/
    plugin.json
    my-plugin.manifest.json     (PostEx only)
    bin/
      demo.x64.o
      demo.x86.o
```

Every plugin dir needs `plugin.json`. Artifacts at the plugin root are fine too.

The plugin manager "Add plugin" picker wants a `plugin.json` in some directory. If that directory is outside `plugins/`, it gets copied to `plugins/<source dir name>`, same-name overwrite. Deleting a plugin deletes that directory. Already inside `plugins/`? Reload only.

## Smallest `plugin.json` that loads

No artifact, placeholder:

```json
{
  "schema_version": 2,
  "name": "my-plugin",
  "version": "1.0.0",
  "capabilities": { "command_ids": [70] },
  "actions": [ { "id": "noop" } ]
}
```

Minimal BOF with a whoami object:

```json
{
  "schema_version": 2,
  "name": "demo",
  "version": "1.0.0",
  "capabilities": { "command_ids": [70] },
  "hashes": { "bin/whoami.x64.o": "<sha256>" },
  "actions": [ { "artifact": "bin/whoami.x64.o" } ]
}
```

From that one line the Client infers `id` (whoami), `kind` (bof), `arch` (`["amd64"]` from `.x64`), `label` (whoami), `os` (`["windows"]`).

## Top-level fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schema_version` | number | yes | Must be `2`. |
| `name` | string | no | Plugin id. Empty → directory name. |
| `display_name` | string / object | no | UI name and context-menu group. Empty → `name`. |
| `version` | string | no | Display only. |
| `description` | string / object | no | Plugin blurb. |
| `capabilities` | object | yes | `{ "command_ids": [70] }`. Action `command_id` must sit in this list. |
| `hashes` | object | yes | `{ "<rel path>": "<sha256>" }`. artifact, dll, module manifest all need an entry. Mismatch or missing → load fail. |
| `actions` | object[] | yes | Cannot be empty. |

Top-level id is `name`. Do not put a top-level `id`.

## Action

One item on the Beacon context menu. Smallest BOF:

```json
{ "artifact": "bin/whoami.x64.o" }
```

With UI constraints:

```json
{
  "id": "com_fileop",
  "label": { "zh": "COM 文件操作", "en": "COM File Operations" },
  "description": { "zh": "通过 COM 执行文件复制/移动", "en": "Copy/move files via COM" },
  "artifact_by_arch": {
    "amd64": "bin/com_fileop.v3.x64.o",
    "x86": "bin/com_fileop.v3.x86.o"
  },
  "fields": [ { "name": "op", "type": "select", "options": ["cp", "mv", "taskcp", "taskmv"], "default": "cp", "required": true } ]
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | no | Inferred from the artifact name: `bin/whoami.x64.o` → `whoami`. |
| `kind` | string | no | `bof` / `postex`. Else from extension (`.o` / `.obj` → bof) or a `module` ref. |
| `label` | string / object | no | Menu text. Empty → `id`. |
| `description` | string / object | no | Line in the param dialog. |
| `os` | string[] | no | Default `["windows"]`. Linux plugins write `["linux"]`. |
| `arch` | string[] | no | From `.x64` / `.x86` or `artifact_by_arch` keys. If none, unrestricted. |
| `artifact` | string | required for single-file BOF | Relative path. Fallback when `artifact_by_arch` misses. |
| `artifact_by_arch` | object | multi-arch | Keys `amd64` / `x86`. Beats `artifact`. |
| `module` | string | required for PostEx | Relative path to the module manifest. Config and form come from that file. |
| `postex` | object | no | Overrides only. Do not copy fields already in the manifest. |
| `command_id` | number | no | BOF defaults to `70`. PostEx is always `90`. If you write it, it must be in capabilities. |
| `requires_input` | bool | no | Open the dialog? Omit it and a non-empty `fields` still opens one. |
| `fields` | object[] | no | Params. Order is the order sent to the BOF. |
| `args` | object[] | no | Explicit typed args. Command 70 inserts the artifact as `bytes` first. |

## OS / Arch

Omit `os` and you get Windows. Write it and that is what you get. Omit `arch`: `demo.x64.o` → `["amd64"]`, `demo.x86.o` → `["x86"]`. `artifact_by_arch` keys win if present.

If you set `os` / `arch` and the target Beacon does not match, the menu item hides. Canonical: `windows`, `linux`, `darwin`, `amd64`, `x86`. Aliases: `x64` / `x86_64` → `amd64`, `i386` / `386` → `x86`.

## Artifacts and hashes

```json
"artifact": "bin/whoami.x64.o",
"hashes": { "bin/whoami.x64.o": "4fc0f5ee6bcae10fcf6bbc2276976c5bbb67b553369549425c6ef0f0d1e7357f" }
```

Every file an action points at (`artifact`, `artifact_by_arch`, `postex.dll(_by_arch)`, `module`) must be in `hashes`. Extra unused entries are hashed too, but they do not block load. Bad hash, missing file, or a path that escapes the plugin dir: load fails.

Hash with `Get-FileHash -Algorithm SHA256` or `sha256sum`, lowercase hex. `artifact_data` is generated by the Client. Do not type it in.

## PostEx

Do not copy PostEx config into the action. A `module` ref is enough. The rest is derived from `beacon.postex.module/v1`.

```json
{
  "id": "postex_template_spawn",
  "module": "postex-template.manifest.json",
  "postex": {
    "description": "postex-template-spawn",
    "spawn_path": "C:\\Windows\\System32\\cmd.exe",
    "spawn_path_by_arch": {
      "amd64": "C:\\Windows\\System32\\cmd.exe",
      "x86": "C:\\Windows\\SysWOW64\\cmd.exe"
    },
    "spawn_args": "/c timeout /t 30 /nobreak > nul"
  }
}
```

```json
{
  "id": "postex_template_inject",
  "module": "postex-template.manifest.json",
  "postex": { "mode": "inject-dll", "description": "postex-template-inject" }
}
```

| module manifest | derived as |
| --- | --- |
| `execution.recommended_target_mode` | `postex.mode` (action can override) |
| `execution.recommended_backend` | `postex.backend` |
| `execution.default_wait_ms` | `postex.wait_ms` |
| `module.files` / `module.arch` | `postex.dll_by_arch` + action `arch` |
| `module.args` | form fields: `flag`→`postex_arg`, `type` (int→int32, enum→select), `choices`→`options`, `description`→`help` |
| `spawn-dll` | default `spawn_path` = `C:\Windows\System32\cmd.exe` |
| `inject-dll` | synthesizes `role: "target_pid"` (`name` `pid`, int32, required) |

Action-level `postex` is override only: `mode`, `spawn_path`, `spawn_path_by_arch`, `spawn_args`, `description`, `backend`, `wait_ms`, `max_runtime_ms`, `idle_timeout_ms`, `module_args`.

Command ID sent to TeamServer is `90`. Client backend orders the args:

```text
spawn-dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, dll_bytes]
inject-dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, dll_bytes]
```

Field meaning:

- `role: "target_pid"` → inject PID
- `role: "wait_ms"` / `max_runtime_ms` / `idle_timeout_ms` → override those timeouts
- `role: "spawn_path"` / `spawn_args` → spawn host
- `default_by_arch` overrides defaults per Beacon arch (x86 often `C:\Windows\SysWOW64\cmd.exe`)
- `postex_arg: "--name"` is folded into `module_args`. bool true appends the flag only. string/int append `--flag value`, quoted if it has spaces.

## Fields

```json
{
  "name": "username",
  "label": { "zh": "用户名", "en": "Username" },
  "type": "string",
  "placeholder": "localadmin",
  "default": "",
  "required": true,
  "help": { "zh": "要创建的本地用户名称", "en": "Local user name to create" }
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Param name. Not the old `id`. |
| `label` | string / object | no | Empty → show `name`. |
| `type` | string | no | Default `string`. |
| `placeholder` | string | no | Input placeholder. |
| `default` | any | no | Default value. |
| `default_by_arch` | object | no | Per-arch defaults, keys `amd64` / `x86`. |
| `required` | bool | no | Front-end required (bool fields skip this). |
| `help` | string / object | no | Help text. |
| `options` | string[] | required for `select` | Dropdown. Strings only. |
| `role` | string | PostEx | Control-field meaning, see above. |
| `postex_arg` | string | PostEx | Flag folded into `module_args`, e.g. `--count`. |

| type | widget | wire kind |
| --- | --- | --- |
| `string` / `input` | single line | `string` |
| `textarea` | multi line | `string` |
| `select` | dropdown | `string` |
| `bool` / `boolean` / `checkbox` | checkbox | `bool` |
| `int8` | single line | `int32` |
| `int16` / `short` | single line | `short` |
| `int32` | single line | `int32` |
| `int64` | single line | `string` |
| `bytes` | single line | `bytes` |

Do not use `text`. Dispatch will say unsupported arg kind. `options` is a string array only.

## Packing

Default order is `fields` order. With a BOF artifact, `artifact_data` is inserted as `bytes` at `args[0]`:

```json
{
  "beacon_id": "bd50810f",
  "command": 70,
  "args": [
    { "kind": "bytes", "value": "<base64 artifact_data>" },
    { "kind": "string", "value": "arg1" },
    { "kind": "short", "value": 77 }
  ]
}
```

Empty values: string/select → `""`; bool → `false`; int → `0`; bytes → `""`.

If the payload already has `args`, those win (BOF artifact still goes first). Action id `com_fileop` is special: the frontend builds `args` from `op/src/dst/task_name`. `task_name` is sent only for `taskcp` / `taskmv` when filled.

## UI

Plugin manager shows localized name, path, description, status, and the capabilities whitelist. Add, delete, reload.

Beacon context menu: one group per plugin (`display_name`), one item per action. Input needed → dialog. Otherwise it runs immediately.

`requires_input`: explicit true opens the dialog. Non-empty `fields` also opens it. Neither → run now. Menu is filtered by `os` / `arch`. No artifact for the current arch → hidden.

## Common load failures

Client scans the plugin dir on startup. Status is `ready` / `error` / `loading`.

v2 load usually dies on:

- missing `schema_version`, or not `2`
- invalid JSON, or unknown fields
- empty `capabilities.command_ids`
- empty `actions`
- hash mismatch, missing file, or a referenced artifact with no hash
- empty `fields[].name`
- PostEx `module` is not `beacon.postex.module/v1`, or mode / backend / arch disagree with the action
- artifact path escaped the plugin dir

Dispatch failures: empty `beacon_id` / token; `command_id` not in the whitelist; arg type parse failed; TeamServer returned `ok:false`.

## Before you ship

- `schema_version: 2`, no unknown fields.
- `capabilities.command_ids` covers every command you will dispatch.
- Every referenced artifact has the right sha256.
- Top-level uses `name`. Each action `id` is unique, or inferred from the artifact name without colliding.
- BOF has `artifact` or `artifact_by_arch`.
- PostEx has `module`. Overrides only cover what the manifest cannot say.
- Platform limits live in `os` / `arch`. Linux plugins write `os: ["linux"]`.
- `fields` order matches BOF args. `type` is one of the rows above. `select.options` is a string array.
- Bilingual copy uses `{"zh": ..., "en": ...}`.
