# Client 插件说明

本文档用于编写 `plugins/<plugin>/plugin.json`，覆盖目录结构、字段格式、参数类型和示例。

## 1. 插件目录结构

结构示例：

```text
plugins/
  my-plugin/
    plugin.json
    bin/
      demo.x64.o
      demo.x86.o
```

也允许工件直接放在插件根目录：

```text
plugins/
  create_task&user/
    plugin.json
    adsi_user.x64.o
    adsi_user.x86.o
```

规则：

- 每个插件目录必须包含 `plugin.json`。
- 插件管理页「添加插件」时选择的是某个插件目录里的 `plugin.json`。
- 如果选择的插件已经在 `plugins/` 目录内，Client 只重新加载。
- 如果选择的是外部目录，Client 会把整个插件目录复制到 `plugins/<源目录名>`。
- 同名目标目录会被覆盖。
- 删除插件会删除 `plugins/` 下对应插件目录。

## 2. `plugin.json` 总体结构

最小结构：

```json
{
  "name": "my-plugin",
  "display_name": "我的插件",
  "version": "1.0.0",
  "description": "插件说明",
  "actions": []
}
```

完整常用结构：

```json
{
  "name": "execution-injection",
  "display_name": "执行与注入 (Execution & Injection)",
  "version": "1.0.0",
  "description": "将常用 BOF 工件暴露到 Beacon 右键菜单",
  "permissions": [],
  "actions": [
    {
      "id": "whoami",
      "label": "Whoami",
      "description": "获取当前 Beacon 会话身份信息",
      "artifact": "bin/whoami.x64.o",
      "requires_input": false,
      "fields": []
    }
  ]
}
```

## 3. Manifest 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 插件唯一标识。为空时使用目录名。 |
| `display_name` | string | 否 | UI 显示名，也是 Beacon 右键菜单的插件分组名。为空时使用 `name`。 |
| `version` | string | 否 | 版本号，仅展示。 |
| `description` | string | 否 | 插件描述，仅展示。 |
| `permissions` | string[] | 否 | 展示字段。 |
| `actions` | object[] | 否 | 插件动作列表。没有动作时插件只会在插件页展示，不会出现在 Beacon 右键菜单。 |

顶层插件标识使用 `name`，不要使用顶层 `id`。

## 4. Action 动作语法

动作是 Beacon 右键菜单下的具体菜单项。

```json
{
  "id": "com_fileop",
  "label": "COM 文件操作",
  "description": "通过 COM 执行文件复制/移动",
  "os": ["windows"],
  "arch": ["amd64", "x86"],
  "artifact_by_arch": {
    "amd64": "bin/com_fileop.v3.x64.o",
    "x86": "bin/com_fileop.v3.x86.o"
  },
  "requires_input": true,
  "fields": []
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 动作唯一标识。 |
| `label` | string | 否 | 菜单显示名。为空时前端会退回使用 `id`。 |
| `description` | string | 否 | 动作说明，在参数弹窗里展示。 |
| `os` | string[] | 否 | 支持的目标系统。空数组或省略表示不限制。常用值：`windows` / `linux` / `darwin`。 |
| `arch` | string[] | 否 | 支持的目标架构。空数组或省略表示不限制。常用值：`amd64` / `x86`。 |
| `artifact` | string | 单工件 BOF 必填 | 工件相对路径，相对于插件根目录。也可作为 `artifact_by_arch` 未命中时的 fallback。 |
| `artifact_by_arch` | object | 多架构 BOF 可用 | 按 Beacon 架构选择工件，key 使用 `amd64` / `x86`。优先级高于 `artifact`。 |
| `command_id` | number | 否 | 命令 ID。BOF action 不需要写；存在 `artifact` 或 `artifact_by_arch` 时统一默认使用 `70`。 |
| `requires_input` | bool | 否 | 是否打开参数弹窗。只要 `fields` 非空，前端也会强制认为需要输入。 |
| `fields` | object[] | 否 | 参数定义。顺序即最终传给 BOF 的参数顺序。 |
| `args` | object[] | 否 | 显式 typed 参数。适合 BOF 常量参数；命令 `70` 下工件会作为 `bytes` 参数插入到最前。 |

普通 BOF / OBJ 插件不需要写 `command_id`。

## 5. OS / Arch 过滤语法

写法：

```json
"os": ["windows"],
"arch": ["amd64", "x86"]
```

规则：

- `os` 为空或省略：不限制系统。
- `arch` 为空或省略：不限制架构。
- 写了 `os` 时，目标 Beacon 必须匹配。
- 写了 `arch` 时，目标 Beacon 必须匹配。
- 插件文件里使用 canonical 值：`windows`、`linux`、`darwin`、`amd64`、`x86`。
- 兼容别名：`x64` / `x86_64` -> `amd64`，`i386` / `386` -> `x86`。

## 6. Artifact 工件语法

`artifact` 是相对于插件根目录的路径：

```json
"artifact": "bin/whoami.x64.o"
```

或：

```json
"artifact": "adsi_user.x64.o"
```

多架构使用 `artifact_by_arch`：

```json
"artifact_by_arch": {
  "amd64": "bin/demo.x64.o",
  "x86": "bin/demo.x86.o"
}
```

选择优先级：

```text
artifact_by_arch[目标架构] -> artifact fallback -> 执行失败
```

执行命令 `70` 时，工件内容会作为第一个参数插入，`kind` 固定为 `bytes`：

```json
{
  "kind": "bytes",
  "value": "<base64 BOF 内容>"
}
```

约束：

- `artifact` 不能逃逸插件目录，例如不要写 `../xxx.o`。
- `artifact_by_arch` 的每个值同样不能逃逸插件目录。
- 工件路径错误时，加载阶段不一定报错，但执行阶段会因为缺少 `artifact_data` 失败。
- `artifact_data` 由 Client 生成，插件作者不要手写。

## 7. Fields 参数语法

`fields` 定义参数弹窗，也定义默认参数打包顺序。

示例：

```json
{
  "name": "username",
  "label": "用户名",
  "type": "string",
  "placeholder": "localadmin",
  "default": "",
  "required": true,
  "help": "要创建的本地用户名称"
}
```

字段表：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 参数名。不要使用旧字段 `id`。 |
| `label` | string | 否 | UI 标签。为空时前端显示 `name`。 |
| `type` | string | 否 | 参数类型，默认 `string`。详见下一节。 |
| `placeholder` | string | 否 | 输入框占位提示。 |
| `default` | any | 否 | 默认值。 |
| `required` | bool | 否 | 前端校验必填。bool 字段不做必填校验。 |
| `help` | string | 否 | 参数帮助文本。 |
| `options` | string[] | `select` 必填 | 下拉框选项，只支持字符串数组。 |

规则：

- 字段必须使用 `name`，不要使用旧格式 `id`。
- `fields[].name` 不能为空。
- 参数顺序就是 `fields` 数组顺序。
- `required` 用于前端必填校验。

## 8. 支持的字段类型

支持以下类型：

| type | 前端控件 | 下发 kind | 说明 |
| --- | --- | --- | --- |
| `string` | 单行输入框 | `string` | 默认类型。 |
| `input` | 单行输入框 | `string` | 等价于 string。 |
| `textarea` | 多行输入框 | `string` | 适合长文本。 |
| `select` | 下拉框 | `string` | 选项来自 `options` 字符串数组。 |
| `bool` | checkbox | `bool` | 支持 true/false、1/0、yes/no、on/off。 |
| `boolean` | checkbox | `bool` | 等价于 bool。 |
| `checkbox` | checkbox | `bool` | 等价于 bool。 |
| `int8` | 单行输入框 | `int32` | 会按 int32 解析和下发。 |
| `int16` | 单行输入框 | `short` | 会按 int16 范围解析并以 BOF short spec 下发。 |
| `short` | 单行输入框 | `short` | 等价于 int16。 |
| `int32` | 单行输入框 | `int32` | 范围 `-2147483648` 到 `2147483647`。 |
| `int64` | 单行输入框 | `string` | 转成字符串下发。 |
| `bytes` | 单行输入框 | `bytes` | base64 字符串，TeamServer 负责解码成原始字节。 |

不要使用：

- `text`：执行会报 `unsupported arg kind: text`。
- 对象数组形式的 `options`：`options` 只支持字符串数组。

## 9. 参数打包规则

默认按 `fields` 顺序打包参数。如果 action 带 BOF 工件，`artifact_data` 会以 `bytes` 插入到 `args[0]`。

最终请求体形态：

```json
{
  "beacon_id": "bd50810f",
  "command": 70,
  "args": [
    {
      "kind": "bytes",
      "value": "<base64 artifact_data>"
    },
    {
      "kind": "string",
      "value": "arg1"
    },
    {
      "kind": "short",
      "value": 77
    }
  ]
}
```

字段默认打包：

- `string` / `input` / `textarea` / `select` -> `{ "kind": "string", "value": "..." }`
- `bool` / `boolean` / `checkbox` -> `{ "kind": "bool", "value": true/false }`
- `int8` / `int32` -> `{ "kind": "int32", "value": number }`
- `int16` / `short` -> `{ "kind": "short", "value": number }`
- `int64` -> `{ "kind": "string", "value": "..." }`
- `bytes` -> `{ "kind": "bytes", "value": "<base64>" }`

空值处理：

- string/select/textarea/input 空值 -> `""`
- bool 空值 -> `false`
- int8/int32/int16/short 空值 -> `0`
- int64 空值 -> `""`
- bytes 空值 -> `""`

## 10. 显式 args 覆盖模式

支持显式 `args`：

```json
{
  "args": [
    { "kind": "string", "value": "cp" },
    { "kind": "string", "value": "C:\\a.txt" },
    { "kind": "string", "value": "C:\\b.txt" }
  ]
}
```

如果 payload 里存在 `args`：

- 使用 `args` 作为下发参数。
- 如果 action 带 BOF 工件，仍然会在最前面插入 `bytes` 形式的 `artifact_data`。
- BOF 参数只声明类型和值；BOF packed args 由 TeamServer 统一生成。

BOF 参数示例：

```json
{
  "args": [
    { "kind": "int32", "value": 1234 },
    { "kind": "short", "value": 77 },
    { "kind": "string", "value": "hello-elf-bof" }
  ]
}
```

内置处理：

- 当 action id 是 `com_fileop` 时，前端会根据 `op/src/dst/task_name` 构造显式 `args`。
- `task_name` 只有在 `op` 是 `taskcp` 或 `taskmv` 且用户填写时才会发送。

普通插件使用 `fields` 即可。

## 11. UI 行为

插件加载后会出现在两个地方：

1. 插件管理页
   - 展示插件名称、路径、描述、状态。
   - 支持添加、删除、重新加载。

2. Beacon 右键菜单
   - 每个插件是一个分组。
   - 分组名来自 `display_name`。
   - 分组下每个 action 是一个菜单项。
   - 如果 action 需要输入，则打开插件执行弹窗。
   - 如果 action 不需要输入，则直接执行。

`requires_input` 判断：

- action 显式 `requires_input: true` 会打开弹窗。
- 只要 `fields` 非空，即使 `requires_input: false`，前端也会打开弹窗。
- `fields` 为空且 `requires_input: false` 时直接执行。

平台过滤：

- BOF 插件命令 ID `70` 可按 action 的 `os` / `arch` 暴露给 Windows 或 Linux Beacon。
- 如果 action 声明了 `os` / `arch`，前端会按目标 Beacon 的系统和架构过滤。
- 如果 action 只有 `artifact_by_arch` 且当前架构没有对应工件，也会隐藏。

## 12. 加载与状态

Client 启动时会自动加载插件目录。

插件状态：

| 状态 | 含义 |
| --- | --- |
| `ready` | 加载成功，可展示/执行。 |
| `error` | 加载或执行过程中出现错误。 |
| `loading` | 加载中。 |

加载失败常见原因：

- `plugin.json` 不是合法 JSON。
- `fields[].name` 为空。
- 插件目录没有 `plugin.json`。

执行失败常见原因：

- `beacon_id` 为空。
- token 为空。
- `command_id` 无法确定。
- `artifact` / `artifact_by_arch` 声明了工件但没有读到对应 `artifact_data`。
- 参数类型解析失败，例如 int32 输入了非整数。
- TeamServer `/api/v1/beacon/command` 返回 `ok:false` 或 `error`。

## 13. 示例：无参数 BOF

```json
{
  "name": "demo",
  "display_name": "Demo",
  "version": "1.0.0",
  "description": "无参数 BOF 示例",
  "actions": [
    {
      "id": "whoami",
      "label": "Whoami",
      "description": "执行 whoami BOF",
      "os": ["windows"],
      "arch": ["amd64"],
      "artifact": "bin/whoami.x64.o",
      "requires_input": false
    }
  ]
}
```

点击后直接下发，最终参数为：

```json
[
  { "kind": "string", "value": "<base64 whoami.x64.o>" }
]
```

## 14. 示例：固定两个字符串参数 + 多架构工件

```json
{
  "name": "create-task-user",
  "display_name": "创建任务与用户 (Create Task & User)",
  "version": "1.0.0",
  "description": "创建本地用户示例",
  "actions": [
    {
      "id": "adsi_user",
      "label": "ADSI 创建本地管理员",
      "description": "参数顺序：<username> <password>",
      "os": ["windows"],
      "arch": ["amd64", "x86"],
      "artifact_by_arch": {
        "amd64": "adsi_user.x64.o",
        "x86": "adsi_user.x86.o"
      },
      "requires_input": true,
      "fields": [
        {
          "name": "username",
          "label": "用户名",
          "type": "string",
          "placeholder": "localadmin",
          "default": "",
          "required": true
        },
        {
          "name": "password",
          "label": "密码",
          "type": "string",
          "placeholder": "P@ssw0rd!",
          "default": "",
          "required": true
        }
      ]
    }
  ]
}
```

最终参数顺序：

```text
args[0] = artifact_data
args[1] = username
args[2] = password
```

## 15. 示例：select + 可选参数

```json
{
  "id": "com_fileop",
  "label": "COM 文件操作",
  "description": "复制/移动文件，或先注册计划任务再执行",
  "os": ["windows"],
  "arch": ["amd64", "x86"],
  "artifact_by_arch": {
    "amd64": "bin/com_fileop.v3.x64.o",
    "x86": "bin/com_fileop.v3.x86.o"
  },
  "requires_input": true,
  "fields": [
    {
      "name": "op",
      "label": "操作",
      "type": "select",
      "options": ["cp", "mv", "taskcp", "taskmv"],
      "default": "cp",
      "required": true
    },
    {
      "name": "src",
      "label": "源路径",
      "type": "string",
      "placeholder": "C:\\Users\\Administrator\\Desktop\\a.txt",
      "default": "",
      "required": true
    },
    {
      "name": "dst",
      "label": "目标路径",
      "type": "string",
      "placeholder": "C:\\Users\\Administrator\\Desktop\\b.txt",
      "default": "",
      "required": true
    },
    {
      "name": "task_name",
      "label": "任务名",
      "type": "string",
      "placeholder": "ComFileOp_b.txt",
      "default": "",
      "required": false,
      "help": "仅 taskcp/taskmv 使用；留空时 BOF 默认使用 ComFileOp_<dst文件名>"
    }
  ]
}
```

`com_fileop`：`op=cp/mv` 时不会发送空的 `task_name`。

## 16. 插件作者检查清单

发布插件前检查：

- [ ] 插件目录根部存在 `plugin.json`。
- [ ] `plugin.json` 是合法 JSON。
- [ ] 顶层使用 `name`，不要只写 `id`。
- [ ] 每个 action 都有非空 `id`。
- [ ] BOF action 写了 `artifact` 或 `artifact_by_arch`；不需要显式写 `command_id`。
- [ ] 如果 action 只支持部分平台，写清楚 `os` / `arch`。
- [ ] 每个字段使用 `name`，不要使用旧字段 `id`。
- [ ] `fields` 顺序与 BOF 参数顺序一致。
- [ ] `type` 只使用支持的类型。
- [ ] `select.options` 是字符串数组。
- [ ] 工件路径相对插件根目录，且没有 `..` 逃逸。
- [ ] x64/x86 工件如果都支持，使用一个 action + `artifact_by_arch`。
