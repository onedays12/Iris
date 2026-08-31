# PostEx Template

[中文](README.md) · [English](README.en.md)

A probe for the PostEx path in the Client plugin system. Two context-menu actions:

- `Template Spawn DLL`: sends `postex spawn-dll`, starts a host process, loads the DLL
- `Template Inject DLL`: sends `postex inject-dll` into a PID you pick

## Where the DLLs go

Drop compiled reflective DLLs here:

```text
plugins/postex-template/bin/postex_template.x64.dll
plugins/postex-template/bin/postex_template.x86.dll
```

x64 Beacon only? `postex_template.x64.dll` is enough. `postex-template.manifest.json` is static metadata for load-time lint. The Beacon runtime does not read it.

## Arg layout

Command ID is `90`:

```text
spawn-dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, dll_bytes]
inject-dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, dll_bytes]
```

- `role: "target_pid"`: inject target PID
- `role: "wait_ms"`: pipe wait timeout
- `role: "max_runtime_ms"`: max runtime, `0` means no cap
- `role: "idle_timeout_ms"`: idle-with-no-output timeout, `0` means no cap
- `role: "spawn_path"` / `role: "spawn_args"`: host process
- `postex_arg` is folded into `module_args`
- x64 default spawn path: `C:\Windows\System32\cmd.exe`
- x86 default spawn path: `C:\Windows\SysWOW64\cmd.exe`

Example:

```text
--count 3 --delay 1000 --message hello --artifact
```

## Load-time checks

- `postex.mode` is `spawn-dll` or `inject-dll`
- `postex.backend` is `remote-thread` for now
- `postex.wait_ms` must be > `0`
- `postex.max_runtime_ms` / `postex.idle_timeout_ms` must be ≥ `0`
- DLL paths must stay inside the plugin dir, and the files must exist
- If `postex.manifest` is set, it has to match module manifest v1, and arch / target mode / backend must match the action
- `spawn-dll` needs `spawn_path`, or a field with `role: "spawn_path"`
- `inject-dll` needs `role: "target_pid"`
