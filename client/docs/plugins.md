# 插件（plugin.json schema v2）

[中文](plugins.md) · [English](plugins.en.md)

写 `plugins/<plugin>/plugin.json` 看这篇。v2 是破坏性更新，v1 加载直接报错。

能推出来的字段别写。能校验的别猜。被引用的文件必须有 sha256，加载时会对一下。

- `id` / `kind` / `arch` / `label` / `os` 能省就省，Client 自己推。
- PostEx 动作只引用 module manifest，配置和表单字段从那边长出来。
- `capabilities.command_ids` 必填，派发前再核一次。
- 未知字段直接炸，拼错字段名不会被默默吃掉。
- 文案可以是普通字符串，也可以是 `{"zh": "...", "en": "..."}`。

## 目录长什么样

```text
plugins/
  my-plugin/
    plugin.json
    my-plugin.manifest.json     (PostEx 才要)
    bin/
      demo.x64.o
      demo.x86.o
```

每个插件目录都得有 `plugin.json`。工件扔根上也可以。

插件管理页「添加插件」选的是某个目录里的 `plugin.json`。目录在外面，会被拷进 `plugins/<源目录名>`，同名覆盖。删插件会把对应目录一起删。已经在 `plugins/` 里的，只重新加载。

## 最小能跑的 `plugin.json`

没工件、占位用：

```json
{
  "schema_version": 2,
  "name": "my-plugin",
  "version": "1.0.0",
  "capabilities": { "command_ids": [70] },
  "actions": [ { "id": "noop" } ]
}
```

带 whoami 工件的最小 BOF：

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

这一行里，`id`（whoami）、`kind`（bof）、`arch`（`["amd64"]`，看 `.x64`）、`label`（whoami）、`os`（`["windows"]`）全是推出来的。

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schema_version` | number | 是 | 必须是 `2`。 |
| `name` | string | 否 | 插件唯一标识。空就用目录名。 |
| `display_name` | string / object | 否 | UI 显示名，也是右键菜单分组名。空就用 `name`。 |
| `version` | string | 否 | 只展示。 |
| `description` | string / object | 否 | 插件描述。 |
| `capabilities` | object | 是 | `{ "command_ids": [70] }`。动作里写的 `command_id` 必须落在这里面。 |
| `hashes` | object | 是 | `{ "<相对路径>": "<sha256>" }`。artifact、dll、module manifest 都得声明，对不上或漏了就加载失败。 |
| `actions` | object[] | 是 | 不能空。 |

顶层标识用 `name`，别写顶层 `id`。

## Action

Beacon 右键菜单里的一项。BOF 最少可以只写：

```json
{ "artifact": "bin/whoami.x64.o" }
```

带 UI 约束的完整一点：

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

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 否 | 省略时从工件名推：`bin/whoami.x64.o` → `whoami`。 |
| `kind` | string | 否 | `bof` / `postex`。省略看扩展名（`.o` / `.obj` → bof）或有没有 `module`。 |
| `label` | string / object | 否 | 菜单上显示的字。空就用 `id`。 |
| `description` | string / object | 否 | 参数弹窗里那行说明。 |
| `os` | string[] | 否 | 默认 `["windows"]`。Linux 插件自己写 `["linux"]`。 |
| `arch` | string[] | 否 | 省略时从 `.x64` / `.x86` 或 `artifact_by_arch` 的 key 推。推不出来就不限。 |
| `artifact` | string | 单工件 BOF 必填 | 相对路径。`artifact_by_arch` 没命中时当 fallback。 |
| `artifact_by_arch` | object | 多架构可用 | key 用 `amd64` / `x86`，优先于 `artifact`。 |
| `module` | string | PostEx 必填 | module manifest 相对路径。配置和表单从这份文件来。 |
| `postex` | object | 否 | 只写 override，manifest 里已经有的别再抄一遍。 |
| `command_id` | number | 否 | BOF 默认 `70`，PostEx 固定 `90`。写了就必须在 capabilities 里。 |
| `requires_input` | bool | 否 | 要不要弹窗。不写的话，`fields` 非空就会弹。 |
| `fields` | object[] | 否 | 参数定义。顺序就是最终传给 BOF 的顺序。 |
| `args` | object[] | 否 | 显式 typed 参数。命令 70 会把工件当 `bytes` 插到最前。 |

## OS / Arch

省略 `os` 就是 Windows。写了就按写的来。省略 `arch`：`demo.x64.o` → `["amd64"]`，`demo.x86.o` → `["x86"]`。有 `artifact_by_arch` 就用它的 key。

写了 `os` / `arch`，目标 Beacon 对不上，菜单项就藏起来。规范值：`windows`、`linux`、`darwin`、`amd64`、`x86`。别名：`x64` / `x86_64` → `amd64`，`i386` / `386` → `x86`。

## 工件和哈希

```json
"artifact": "bin/whoami.x64.o",
"hashes": { "bin/whoami.x64.o": "4fc0f5ee6bcae10fcf6bbc2276976c5bbb67b553369549425c6ef0f0d1e7357f" }
```

action 引用过的文件（`artifact`、`artifact_by_arch`、`postex.dll(_by_arch)`、`module`）都必须在 `hashes` 里。`hashes` 里多写几个没被引用的文件也行，会校验，但不挡加载。哈希不对、文件没有、路径逃出插件目录，加载失败。

算哈希：`Get-FileHash -Algorithm SHA256` 或 `sha256sum`，小写 hex。`artifact_data` 是 Client 生成的，别手填。

## PostEx

PostEx 动作别把配置再抄一遍。写个 `module` 引用就够，剩下从 `beacon.postex.module/v1` 派生。

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

| module manifest | 派生到 |
| --- | --- |
| `execution.recommended_target_mode` | `postex.mode`（action 级可以盖） |
| `execution.recommended_backend` | `postex.backend` |
| `execution.default_wait_ms` | `postex.wait_ms` |
| `module.files` / `module.arch` | `postex.dll_by_arch` + action `arch` |
| `module.args` | 表单字段：`flag`→`postex_arg`、`type`（int→int32，enum→select）、`choices`→`options`、`description`→`help` |
| `spawn-dll` | 缺省 `spawn_path` = `C:\Windows\System32\cmd.exe` |
| `inject-dll` | 自动合成 `role: "target_pid"`（name `pid`，int32 必填） |

action 级 `postex` 只当 override，能写：`mode`、`spawn_path`、`spawn_path_by_arch`、`spawn_args`、`description`、`backend`、`wait_ms`、`max_runtime_ms`、`idle_timeout_ms`、`module_args`。

下到 TeamServer 的命令 ID 是 `90`，参数顺序 Client 后端排好：

```text
spawn-dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, dll_bytes]
inject-dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, dll_bytes]
```

字段语义：

- `role: "target_pid"` → inject 目标 PID
- `role: "wait_ms"` / `max_runtime_ms` / `idle_timeout_ms` → 盖对应超时
- `role: "spawn_path"` / `spawn_args` → spawn 宿主
- `default_by_arch` 按 Beacon 架构盖默认值（x86 常见是 `C:\Windows\SysWOW64\cmd.exe`）
- `postex_arg: "--name"` 拼进 `module_args`。bool 为 true 只追加 flag；string/int 追加 `--flag value`，有空白会加引号。

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

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 参数名。别用旧字段 `id`。 |
| `label` | string / object | 否 | 空就显示 `name`。 |
| `type` | string | 否 | 默认 `string`。 |
| `placeholder` | string | 否 | 输入框占位。 |
| `default` | any | 否 | 默认值。 |
| `default_by_arch` | object | 否 | 按架构盖默认值，key 用 `amd64` / `x86`。 |
| `required` | bool | 否 | 前端必填（bool 字段不校验）。 |
| `help` | string / object | 否 | 帮助文本。 |
| `options` | string[] | `select` 必填 | 下拉选项，只要字符串数组。 |
| `role` | string | PostEx | 控制字段语义，见上面。 |
| `postex_arg` | string | PostEx | 拼进 `module_args` 的 flag，比如 `--count`。 |

| type | 控件 | 下发 kind |
| --- | --- | --- |
| `string` / `input` | 单行 | `string` |
| `textarea` | 多行 | `string` |
| `select` | 下拉 | `string` |
| `bool` / `boolean` / `checkbox` | checkbox | `bool` |
| `int8` | 单行 | `int32` |
| `int16` / `short` | 单行 | `short` |
| `int32` | 单行 | `int32` |
| `int64` | 单行 | `string` |
| `bytes` | 单行 | `bytes` |

别用 `text`，执行会报 unsupported arg kind。`options` 只认字符串数组。

## 打包

默认按 `fields` 顺序。带 BOF 工件时，`artifact_data` 以 `bytes` 插到 `args[0]`：

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

空值：string/select → `""`；bool → `false`；int → `0`；bytes → `""`。

payload 里已经有 `args`，就用那份（BOF 工件还是插最前）。action id 是 `com_fileop` 时，前端按 `op/src/dst/task_name` 自己组 `args`。`task_name` 只在 `op` 为 `taskcp` / `taskmv` 且填了才发。

## UI

插件管理页能看到本地化名称、路径、描述、状态，还有 capabilities 白名单。可以添加、删除、重载。

Beacon 右键：每个插件一个分组（分组名 = `display_name`），每个 action 一项。要输入就弹窗，否则直接跑。

`requires_input`：显式 true 弹；`fields` 非空弹；两个都没有就直接执行。菜单按 `os` / `arch` 过滤，当前架构没有对应工件就藏。

## 加载失败常见原因

Client 启动时扫插件目录。状态就三种：`ready` / `error` / `loading`。

v2 加载挂掉，多半是这些：

- `schema_version` 没有，或者不是 `2`
- JSON 不合法，或有未知字段
- `capabilities.command_ids` 空
- `actions` 空
- `hashes` 对不上、文件不在，或引用了没声明的工件
- `fields[].name` 空
- PostEx 的 `module` 不是 `beacon.postex.module/v1`，或 mode / backend / arch 跟 action 对不上
- 工件路径跑出插件目录

执行挂掉：`beacon_id` / token 空；`command_id` 不在白名单；参数类型解析失败；TeamServer 回 `ok:false`。

## 发出去之前过一遍

- `schema_version: 2`，没有未知字段。
- `capabilities.command_ids` 覆盖所有会派发的命令。
- 引用过的工件都有正确的 sha256。
- 顶层用 `name`。每个 action 的 `id` 要么你写唯一，要么从工件名推出来还不撞车。
- BOF 写了 `artifact` 或 `artifact_by_arch`。
- PostEx 写了 `module`，override 只写 manifest 表达不了的东西。
- 平台限定写在 `os` / `arch`。Linux 插件显式 `os: ["linux"]`。
- `fields` 顺序跟 BOF 参数一致。`type` 只用上面那些。`select.options` 是字符串数组。
- 要双语就用 `{"zh": ..., "en": ...}`。
