# PostEx Template

[中文](README.md) · [English](README.en.md)

用来摸 Client 插件系统里的 PostEx 链路。右键两项：

- `Template Spawn DLL`：下发 `postex spawn-dll`，起一个宿主进程再加载 DLL
- `Template Inject DLL`：下发 `postex inject-dll`，打进指定 PID

## DLL 放哪

编译好的 reflective DLL 丢这里：

```text
plugins/postex-template/bin/postex_template.x64.dll
plugins/postex-template/bin/postex_template.x86.dll
```

只测 x64 Beacon 的话，放 `postex_template.x64.dll` 就够。`postex-template.manifest.json` 是加载期 lint 用的静态信息，Beacon runtime 不读它。

## 参数怎么排

命令 ID 是 `90`：

```text
spawn-dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, dll_bytes]
inject-dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, dll_bytes]
```

- `role: "target_pid"`：inject 目标 PID
- `role: "wait_ms"`：pipe 等待超时
- `role: "max_runtime_ms"`：最长跑多久，`0` 表示不限
- `role: "idle_timeout_ms"`：没输出就超时，`0` 表示不限
- `role: "spawn_path"` / `role: "spawn_args"`：宿主进程
- `postex_arg` 会拼进 `module_args`
- x64 默认 spawn path：`C:\Windows\System32\cmd.exe`
- x86 默认 spawn path：`C:\Windows\SysWOW64\cmd.exe`

比如：

```text
--count 3 --delay 1000 --message hello --artifact
```

## 加载时会查这些

- `postex.mode` 只能是 `spawn-dll` / `inject-dll`
- `postex.backend` 现在只认 `remote-thread`
- `postex.wait_ms` 必须大于 `0`
- `postex.max_runtime_ms` / `postex.idle_timeout_ms` 必须 ≥ `0`
- DLL 路径得在插件目录里，文件还得在
- 有 `postex.manifest` 的话，得符合 module manifest v1，架构、target mode、backend 跟 action 对得上
- `spawn-dll` 得有 `spawn_path`，或者对应的 `role: "spawn_path"` 字段
- `inject-dll` 得有 `role: "target_pid"` 字段
