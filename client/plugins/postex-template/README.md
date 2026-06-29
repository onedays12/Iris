# PostEx Template Plugin

这个插件用于验证 client 插件系统里的 PostEx action 链路。

它提供两个右键菜单动作：

- `Template Spawn DLL`: 下发 `postex spawn-dll`，创建宿主进程并加载 DLL。
- `Template Inject DLL`: 下发 `postex inject-dll`，注入 DLL 到指定 PID。

## 放置 DLL

把编译好的 PostEx reflective DLL 放到：

```text
plugins/postex-template/bin/postex_template.x64.dll
plugins/postex-template/bin/postex_template.x86.dll
```

如果只验证 x64 Beacon，只需要放 `postex_template.x64.dll`。
`postex-template.manifest.json` 是模块静态 metadata，用于加载期 lint；它不会被 Beacon runtime 解析。

## 参数映射

插件会生成 PostEx 命令 `90` 的参数：

```text
spawn-dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, dll_bytes]
inject-dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, dll_bytes]
```

字段语义：

- `role: "target_pid"` -> inject 目标 PID。
- `role: "wait_ms"` -> pipe 等待超时。
- `role: "max_runtime_ms"` -> 最大运行时长，`0` 表示关闭。
- `role: "idle_timeout_ms"` -> 无输出空闲超时，`0` 表示关闭。
- `role: "spawn_path"` / `role: "spawn_args"` -> spawn 宿主进程配置。
- `postex_arg` 字段会被拼入 `module_args`。
- x64 Beacon 默认 spawn path 是 `C:\Windows\System32\cmd.exe`。
- x86 Beacon 默认 spawn path 是 `C:\Windows\SysWOW64\cmd.exe`。

例如：

```text
--count 3 --delay 1000 --message hello --artifact
```

## Package v1 校验要点

Client 加载 PostEx 插件时会提前校验：

- `postex.mode` 只能是 `spawn-dll` / `inject-dll`。
- `postex.backend` 当前只能是 `remote-thread`。
- `postex.wait_ms` 必须大于 `0`。
- `postex.max_runtime_ms` / `postex.idle_timeout_ms` 必须大于等于 `0`。
- `postex.dll` / `postex.dll_by_arch` 指向的 DLL 必须存在于插件目录内。
- `postex.manifest` 如果存在，必须符合 PostEx module manifest v1，且声明的架构、target mode、backend 与 action 一致。
- `spawn-dll` 必须提供 `spawn_path` 或对应 `role: "spawn_path"` 字段。
- `inject-dll` 必须提供 `role: "target_pid"` 字段。
