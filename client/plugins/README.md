# Client 插件说明（plugin.json schema v2）

本文档用于编写 `plugins/<plugin>/plugin.json`。**schema v2 为破坏性更新**：v1 格式不再支持，加载时直接报错。

v2 目标：能推导的不写、能校验的不猜、能被篡改的必查。

- 约定层：`id` / `kind` / `arch` / `label` / `os` 可省略自动推导
- 单一事实源：PostEx 动作只引用 module manifest，配置与表单字段自动派生
- 完整性：所有被引用的工件必须声明 sha256，加载时强制校验
- 能力白名单：`capabilities.command_ids` 必填，派发前强制校验
- 严格解码：未知字段直接报错（防拼写错误被静默忽略）
- 本地化：文案字段支持 `"text"` 或 `{"zh": "...", "en": "..."}`

## 1. 插件目录结构

```text
plugins/
  my-plugin/
    plugin.json
    my-plugin.manifest.json     (PostEx 动作需要)
    bin/
      demo.x64.o
      demo.x86.o
```

规则：

- 每个插件目录必须包含 `plugin.json`。
- 工件也可以放在插件根目录。
- 插件管理页「添加插件」选择某个插件目录里的 `plugin.json`；外部目录会被复制到 `plugins/<源目录名>`（同名覆盖）；删除插件会删除对应目录。
- 插件已在 `plugins/` 内时只重新加载。

## 2. `plugin.json` 总体结构

最小结构（一个无工件动作，仅用于占位/测试）：

```json
{
  "schema_version": 2,
  "name": "my-plugin",
  "version": "1.0.0",
  "capabilities": { "command_ids": [70] },
  "actions": [ { "id": "noop" } ]
}
```

带工件的最小 BOF 插件（whoami 一行声明）：

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

`id`（= `whoami`）、`kind`（= `bof`）、`arch`（= `["amd64"]`，来自 `.x64` 后缀）、`label`（= `whoami`）、`os`（= `["windows"]`）全部自动推导。

## 3. Manifest 顶层字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schema_version` | number | **是** | 必须为 `2`。v1 不再支持。 |
| `name` | string | 否 | 插件唯一标识。为空时使用目录名。 |
| `display_name` | string / object | 否 | UI 显示名与右键菜单分组名。支持 `{"zh": "...", "en": "..."}`；为空时使用 `name`。 |
| `version` | string | 否 | 版本号，仅展示。 |
| `description` | string / object | 否 | 插件描述。支持本地化对象。 |
| `capabilities` | object | **是** | `{ "command_ids": [70] }`：允许派发的命令白名单。动作声明的 `command_id` 必须落在白名单内；派发前强制校验。 |
| `hashes` | object | **是** | `{ "<相对路径>": "<sha256>" }`：所有被引用的工件（artifact / dll / module manifest）必须声明且内容一致；条目不一致或引用未声明都会加载失败。 |
| `actions` | object[] | **是** | 动作列表，不能为空。 |

顶层插件标识使用 `name`，不要使用顶层 `id`。

## 4. Action 动作语法

动作是 Beacon 右键菜单下的具体菜单项。BOF 动作最小声明：

```json
{ "artifact": "bin/whoami.x64.o" }
```

完整示例（带 UI 约束字段）：

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
| `id` | string | 否 | 动作唯一标识。省略时从工件文件名推导：`bin/whoami.x64.o` → `whoami`。 |
| `kind` | string | 否 | `bof` / `postex`。省略时从扩展名（`.o/.obj` → bof）或 `module` 引用推导。 |
| `label` | string / object | 否 | 菜单显示名。省略时使用 `id`。支持本地化对象。 |
| `description` | string / object | 否 | 动作说明，在参数弹窗里展示。 |
| `os` | string[] | 否 | 支持的目标系统。省略时默认 `["windows"]`；显式声明（如 `["linux"]`）优先。 |
| `arch` | string[] | 否 | 支持的目标架构。省略时从工件文件名 `.x64`/`.x86` 后缀或 `artifact_by_arch` key 推导；无法推导则不限制。 |
| `artifact` | string | 单工件 BOF 必填 | 工件相对路径。也可作为 `artifact_by_arch` 未命中时的 fallback。 |
| `artifact_by_arch` | object | 多架构可用 | key 使用 `amd64` / `x86`，优先级高于 `artifact`。 |
| `module` | string | PostEx 必填 | PostEx module manifest 相对路径。PostEx 的配置与表单字段从该文件派生。 |
| `postex` | object | 否 | 仅作 override（见 §6.1），不再重复声明 module manifest 已声明的内容。 |
| `command_id` | number | 否 | 命令 ID。BOF 动作不写，默认 `70`；PostEx 固定 `90`。声明后必须落在 `capabilities.command_ids` 内。 |
| `requires_input` | bool | 否 | 是否打开参数弹窗。省略时只要 `fields` 非空即需要输入。 |
| `fields` | object[] | 否 | 参数定义。顺序即最终传给 BOF 的参数顺序。 |
| `args` | object[] | 否 | 显式 typed 参数（BOF 常量参数）。命令 `70` 下工件会作为 `bytes` 参数插入到最前。 |

## 5. OS / Arch 过滤与推导

- 省略 `os` → 默认 `["windows"]`；显式声明优先（Linux 插件写 `"os": ["linux"]`）。
- 省略 `arch` → 从工件名推导：`demo.x64.o` → `["amd64"]`，`demo.x86.o` → `["x86"]`；`artifact_by_arch` 存在时取其 key；无法推导则不限制。
- 写了 `os` / `arch` 时，目标 Beacon 必须匹配，否则菜单项隐藏。
- canonical 值：`windows`、`linux`、`darwin`、`amd64`、`x86`。兼容别名：`x64`/`x86_64` → `amd64`，`i386`/`386` → `x86`。

## 6. Artifact 工件与完整性

```json
"artifact": "bin/whoami.x64.o",
"hashes": { "bin/whoami.x64.o": "4fc0f5ee6bcae10fcf6bbc2276976c5bbb67b553369549425c6ef0f0d1e7357f" }
```

规则：

- 所有被 action 引用的文件（`artifact`、`artifact_by_arch`、`postex.dll(_by_arch)`、`module` manifest）**必须**在 `hashes` 中声明 sha256，加载时校验。
- `hashes` 里可以额外声明未被引用的文件（会被校验但不影响加载）。
- 哈希不一致、文件不存在、路径逃逸插件目录 → 加载失败。
- 计算：`Get-FileHash -Algorithm SHA256` 或 `sha256sum`，小写 hex。
- `artifact_data` 由 Client 生成，插件作者不要手写。

## 6.1 PostEx 动作（单一事实源）

PostEx 动作不再重复声明配置：只写 `module` 引用，其余从 module manifest（`beacon.postex.module/v1`）派生。

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

派生规则：

| module manifest 字段 | 派生到 |
| --- | --- |
| `execution.recommended_target_mode` | `postex.mode`（action 级 `postex.mode` 可覆盖） |
| `execution.recommended_backend` | `postex.backend` |
| `execution.default_wait_ms` | `postex.wait_ms` |
| `module.files` / `module.arch` | `postex.dll_by_arch` + action `arch` |
| `module.args` | 表单字段：`flag`→`postex_arg`、`type`（int→int32，enum→select）、`choices`→`options`、`description`→`help`、`required`/`default` 原样 |
| `spawn-dll`（约定） | 缺省 `spawn_path` = `C:\Windows\System32\cmd.exe`，可覆盖 |
| `inject-dll`（约定） | 自动合成 `role: "target_pid"` 字段（name `pid`，int32 必填） |

action 级 `postex` 块仅作 override，可写字段：`mode`、`spawn_path`、`spawn_path_by_arch`、`spawn_args`、`description`、`backend`、`wait_ms`、`max_runtime_ms`、`idle_timeout_ms`、`module_args`。

PostEx 下发到 TeamServer 的命令 ID 固定为 `90`，参数顺序由 Client 后端生成：

```text
spawn-dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, dll_bytes]
inject-dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, dll_bytes]
```

`fields` 的 PostEx 语义（显式声明或派生字段一致）：

- `role: "target_pid"` → inject 目标 PID；`role: "wait_ms"` / `max_runtime_ms` / `idle_timeout_ms` → 覆盖对应控制参数；`role: "spawn_path"` / `spawn_args` → 覆盖 spawn 宿主进程配置。
- `default_by_arch` 可按 Beacon 架构覆盖字段默认值（如 x86 默认 `C:\Windows\SysWOW64\cmd.exe`）。
- `postex_arg: "--name"` → 字段拼进 `module_args`；bool 为 `true` 时只追加 flag；string/int 追加 `--flag value`，含空白自动加引号。

## 7. Fields 参数语法

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
| `name` | string | 是 | 参数名（不要用旧字段 `id`）。 |
| `label` | string / object | 否 | UI 标签。省略时显示 `name`。 |
| `type` | string | 否 | 参数类型，默认 `string`（见 §8）。 |
| `placeholder` | string | 否 | 输入框占位提示。 |
| `default` | any | 否 | 默认值。 |
| `default_by_arch` | object | 否 | 按架构覆盖默认值，key 使用 `amd64` / `x86`。 |
| `required` | bool | 否 | 前端必填校验（bool 字段不校验）。 |
| `help` | string / object | 否 | 帮助文本，支持本地化对象。 |
| `options` | string[] | `select` 必填 | 下拉选项，仅字符串数组。 |
| `role` | string | PostEx 可用 | 控制字段语义（见 §6.1）。 |
| `postex_arg` | string | PostEx 可用 | 拼入 `module_args` 的 flag，如 `--count`。 |

## 8. 支持的字段类型

| type | 前端控件 | 下发 kind |
| --- | --- | --- |
| `string` / `input` | 单行输入框 | `string` |
| `textarea` | 多行输入框 | `string` |
| `select` | 下拉框 | `string` |
| `bool` / `boolean` / `checkbox` | checkbox | `bool` |
| `int8` | 单行输入框 | `int32` |
| `int16` / `short` | 单行输入框 | `short` |
| `int32` | 单行输入框 | `int32` |
| `int64` | 单行输入框 | `string` |
| `bytes` | 单行输入框 | `bytes` |

不要使用 `text`（执行会报 unsupported arg kind）；`options` 只支持字符串数组。

## 9. 参数打包规则

默认按 `fields` 顺序打包。action 带 BOF 工件时，`artifact_data` 以 `bytes` 插入到 `args[0]`：

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

空值处理：string/select → `""`；bool → `false`；int → `0`；bytes → `""`。

## 10. 显式 args 覆盖模式

payload 里存在 `args` 时直接使用（BOF 工件仍插在最前）。示例：

```json
{ "args": [
  { "kind": "int32", "value": 1234 },
  { "kind": "short", "value": 77 },
  { "kind": "string", "value": "hello-elf-bof" }
] }
```

内置处理：action id 为 `com_fileop` 时，前端按 `op/src/dst/task_name` 构造显式 `args`；`task_name` 仅在 `op` 为 `taskcp`/`taskmv` 且填写时发送。

## 11. UI 行为

1. 插件管理页：展示本地化名称、路径、描述、状态与 **capabilities 命令白名单**；支持添加、删除、重载。
2. Beacon 右键菜单：每个插件一个分组（分组名 = `display_name`），每个 action 一个菜单项；需要输入打开弹窗，否则直接执行。

`requires_input` 判断：显式 `true` → 弹窗；`fields` 非空 → 弹窗；两者皆否 → 直接执行。

平台过滤：按 action 的 `os`/`arch` 过滤菜单项；当前架构无对应工件时隐藏。

## 12. 加载与状态

Client 启动时自动加载插件目录。状态：`ready` / `error` / `loading`。

加载失败常见原因（v2）：

- `schema_version` 缺失或不为 `2`（v1 已废弃）。
- `plugin.json` 不是合法 JSON，或包含未知字段（严格解码）。
- `capabilities.command_ids` 缺失或为空。
- `actions` 为空。
- `hashes` 中声明的文件不存在、哈希不一致；或引用的工件未声明哈希。
- `fields[].name` 为空。
- PostEx：`module` 引用的 manifest 不是 `beacon.postex.module/v1`，或 mode/backend/arch 与 action 不一致。
- 工件路径逃逸插件目录。

执行失败常见原因：`beacon_id` / token 为空；`command_id` 不在 capabilities 白名单内；参数类型解析失败；TeamServer 返回 `ok:false`。

## 13. 插件作者检查清单（v2）

发布插件前检查：

- [ ] `schema_version: 2`，无未知字段。
- [ ] `capabilities.command_ids` 声明了全部会派发的命令。
- [ ] 所有被引用的工件都在 `hashes` 中声明了正确的 sha256。
- [ ] 顶层使用 `name`；每个 action 的 `id` 要么显式唯一，要么由工件名推导且不与同插件其他 action 冲突。
- [ ] BOF action 写了 `artifact` 或 `artifact_by_arch`。
- [ ] PostEx action 写了 `module`，override 只写 module manifest 无法表达的内容。
- [ ] 平台限定写在 `os` / `arch`；Linux 插件显式写 `os: ["linux"]`。
- [ ] `fields` 顺序与 BOF 参数顺序一致；`type` 只用支持的类型；`select.options` 是字符串数组。
- [ ] 文案字段（display_name/description/label/help）需要多语言时使用 `{"zh": ..., "en": ...}`。
