# MCP 工具

[中文](mcp.md) · [English](mcp.en.md)

Iris Client 里带了一个本地 MCP 服务。外部 Agent（ZCode、Claude Code、Codex 这类）可以调 Client 的控制面：建监听器、生成 beacon、下命令、传文件、等事件。主要拿来跑 TeamServer → Beacon 的自动化，偶尔也当半自动操作员用。

client `0.4.0` 起就有。现在 19 个工具。主通道是本机 Streamable HTTP，Codex 走旁边那条 stdio 桥。

## 先把服务拉起来

每次都一样：先开 Client（`bin/client.exe` 或你编出来的那个），MCP 跟着主程序起来，默认听 `127.0.0.1:9333`。端口用环境变量 `IRIS_MCP_LISTEN` 改，但只能绑回环。绑到别的网卡，服务端直接拒。

然后在 GUI 里登录 TeamServer。账密走 WS 钩子同步给 MCP，Agent 碰不到。没登录的话，要打 TeamServer 的工具会回一句很直白的错：client GUI 未登录或凭据未同步。

### Agent 怎么接

| Agent | 怎么连 | 配什么 |
| --- | --- | --- |
| ZCode / Claude Code | Streamable HTTP | MCP URL：`http://127.0.0.1:9333` |
| Codex CLI | stdio | 启动命令用 `bin/iris-mcp-stdio.exe` |

Codex `config.toml` 大概这样：

```toml
[mcp_servers.iris-client]
command = "C:\\path\\to\\bin\\iris-mcp-stdio.exe"
```

stdio 桥就是根管子。Agent 把它拉起来，它再连回常驻 Client 的 HTTP 口。工具同一套，会话也是同一份。

探活：

```bash
curl -s -X POST http://127.0.0.1:9333/ \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

正常的话，响应里有 `"serverInfo":{"name":"iris-client",...}`，头上还能拿到 `Mcp-Session-Id`。

## 它在干什么

```
Agent (ZCode / Claude Code / Codex)
   │ stdio (cmd/iris-mcp-stdio)          │ Streamable HTTP
   └──────────────┬──────────────────────┘
                  ▼
   127.0.0.1:9333  Client 内嵌 MCP (service/mcp, go-sdk v1.7)
                  │ REST 打 TeamServer（共用 HTTP 客户端 + Bearer）
                  │ 本地：FileService / PluginService
                  │ wait_for_event ← FanoutEmitter（环形缓冲 1000）
                  ▼
            TeamServer :8080  ⇄  beacon
```

GUI 那条 WS 不受影响。凭据跟 GUI 会话同生共死：重登、静默重登都会覆盖过去，MCP 自己不存账密。

这个口只听回环、没有鉴权。本机任意进程连上，就等于拿到控制面。别把 `IRIS_MCP_LISTEN` 指到对外网卡，指了也会被拒。

## 工具一览

| 分组 | 工具 | 干什么 |
| --- | --- | --- |
| 会话 | `get_client_status` | 登录态、api_base、WS 是否连着 |
| 事件 | `list_recent_events`、`wait_for_event` | 倒环形缓冲；按条件卡住等下一帧 |
| 监听器 | `list_listeners`、`create_listener`、`pause_listener`、`resume_listener`、`remove_listener`、`edit_listener` | 全套 CRUD，name 就是 id。remove 回不来 |
| 信标 | `list_beacons`、`send_beacon_command` | 列表，下任务。命令用符号名或数字 ID 都行 |
| 载荷 | `generate_beacon` | 生成真实二进制，落盘，回绝对路径 + sha256 + 大小 |
| 文件 | `upload_local_file`、`list_downloads`、`download_file` | 本机进 TeamServer 仓，beacon 去取，产物再拉回本机 |
| 截图 | `request_screenshot`、`list_screenshots`、`save_screenshot` | 下任务、列清单、取回落盘 |
| 预览 | `preview_remote_file` | 远端文本/图片白名单预览，≤2MB，一次调用拿完 |

### `send_beacon_command`

```jsonc
{ "beacon_id": "<id>", "command": "WHOAMI", "args": [] }
```

命令名跟前端 `constants/commands.ts` 对齐：SLEEP EXIT SHELL POWERSHELL CD LS PWD CAT MKDIR RM MV CP DOWNLOAD UPLOAD SETATTR ZIP PS KILLJOB KILL STEAL_TOKEN JOBS WHOAMI SCREENSHOT NETINFO NETSTAT EXECUTION_BOF CASCADE_* POSTEX* MIGRATE*。

常用写法：`SHELL ["whoami > c:\\users\\public\\o.txt"]`、`SLEEP [5000, 200]`、`LS ["C:\\"]`、`KILL [<pid>]`。SETATTR、CASCADE_*、POSTEX*、MIGRATE* 参数比较绕，`args` 要写成 `{kind:"string|int32|short|bool|bytes", value}`。结果是异步的，发完去 `wait_for_event`。

### `generate_beacon`

```jsonc
{ "listener_id": "...", "os": "windows", "arch": "amd64",
  "format": "exe", "stage_mode": "stagerless", "beacon_type": "c" }
```

文件落到 `%TEMP%\iris-mcp-payloads\`，返回 `{path, sha256, size, stage_url?}`。MCP 不负责跑这个文件，Agent 自己用 shell 拉起来。默认用 C-beacon（`beacon_type:"c"`）。go-beacon 也能编，就是更大。

### `wait_for_event`

```jsonc
{ "type_prefix": "BEACON_REG",
  "since_seq": 12,
  "beacon_id": "...",
  "command_id": "...",
  "timeout_ms": 90000 }
```

`since_seq` 用 `list_recent_events` 的 `last_seq`。基线必须在触发动作之前读，晚了会漏掉中间那几帧。

常见内层 `type`：`BEACON_REGISTERED`、`BEACON_TICK`、`USER_ONLINE`、`COMMAND_EVENT`（`phase=result` 是普通结果，`phase=preview` 是预览）。关联字段多半在 `data` 里，别只看顶层。

### `preview_remote_file`

文本（`kind=text`）直接回 `content`。图片写到 `%TEMP%\iris-mcp-downloads\previews\`，回 `path_local`。超过 2MB，或不在白名单里，工具错误里会带 reason，让你改走 DOWNLOAD。内容走 CommandDownload 分块，按心跳回。没写 `timeout_ms` 就等 30 秒。

手头测过：`C:\Windows\win.ini` 首行 `; for 16-bit app support`，mime `text/plain; charset=utf-8`。

### 上传再拉回来

`upload_local_file` 给你 TeamServer 仓里的 `file_id`。beacon 侧 `send_beacon_command(UPLOAD, args=[source_file, remote_path])` 去取。beacon 跑完 DOWNLOAD 之后，`list_downloads` 能看见，再用 `download_file` 拉到本机，默认目录 `%TEMP%\iris-mcp-downloads\files\`。

## 能复现的几条路

完整脚本在 `frontend/scripts/mcp-e2e-chain.mjs`，前提是 Client 已经登录。下面是人肉等价步骤。

### 上线（C-beacon）

1. `get_client_status`，确认 logged_in。
2. `list_listeners` 复用已经 started 的监听器。没有就 `create_listener`（external/http，`encrypt_key` 留空会自己生成）。
3. `generate_beacon(listener_id, windows/amd64/exe/stagerless, beacon_type=c)`，拿到 path。
4. Agent 用 shell 把这个文件拉起来（detached）。
5. `wait_for_event(type_prefix="BEACON_REG", since_seq=<动作前 last_seq>, timeout_ms=90000)`，核对注册帧。
6. 收尾：杀掉 beacon 进程，清掉载荷目录。

C-beacon 大概 320KB。HTTP external 监听器下，几秒内会上线。

### 命令回显

1. `send_beacon_command(beacon_id, "WHOAMI")`。
2. `wait_for_event(type_prefix="COMMAND", beacon_id=<id>, since_seq=<发送前游标>)`。
3. 文本在事件的 `data.data.text`（phase=result，status=completed）。WHOAMI 见过 `"Administrator (User)"`。

### 文件和观测

1. `upload_local_file` 拿 file_id，再 `send_beacon_command(UPLOAD,…)` 让 beacon 取件。
2. 小文本、配置可以 `preview_remote_file`。大文件走 DOWNLOAD。
3. 回传完了：`list_downloads` → `download_file`。
4. 截图：`request_screenshot` 只是 ack。等 `wait_for_event(COMMAND…)`，或者直接 `list_screenshots`，再用 `save_screenshot` 落盘（path / sha256 / size）。

`request_screenshot` 几秒内能出图（测过 2048x1152 PNG，大约 198KB）。`save_screenshot` 默认写 `%TEMP%\iris-mcp-downloads\screenshots\`。quality 不传的话命令层用 80，显式传必须在 1 到 100。

### 操作员全流程

`frontend/scripts/mcp-operator-sim.mjs` 按操作员视角串一遍，边走边报观察结果。除登录态以外都是软失败。结尾打 `SUMMARY: OK=n FAIL=m`，FAIL>0 退出码 2。

顺序大致是：看监听器和 beacon（活着的看 `last_seen`）→ 没存活 beacon 就走上面那条部署 → WHOAMI / PWD / LS / SHELL（SHELL 按 `matched.seq` 把 Job 回执和输出两帧读完）→ 预览 win.ini → 截图 → `list_recent_events` 回看尾巴。

### 双传输冒烟

```bash
node frontend/scripts/stdio-mcp-smoke.mjs
```

HTTP 侧把任意 MCP 客户端指到 `http://127.0.0.1:9333` 就行。

抓预览全链路真实 WS 帧：`frontend/scripts/diag-preview-frame.mjs`。帧长什么样、谓词能不能对上，以这份 JSON 为准。

## 不对的时候看这

| 现象 | 多半是 |
| --- | --- |
| REST 类工具说未登录或凭据未同步 | GUI 没登，或者刚重启还没连上。先在界面登一次。 |
| 端口不通 | Client 没开，或者口被占了。换 `IRIS_MCP_LISTEN`，或者把口让出来再开 Client。 |
| `wait_for_event` 超时 | beacon sleep 太长，先 SLEEP 把心跳打短；`since_seq` 取得太晚，漏帧了；`beacon_id` 写错，字段在嵌套 `data` 里。 |
| create / generate 说 listener not found，或生成失败 | 监听器没 started。os / arch / format 组合不支持（stager 只认 windows+http stager；c 格式只在 stager 场景）。 |
| preview 报 too_large / 类型不支持 | 超 2MB，或扩展名不在白名单。改 DOWNLOAD。白名单在 client `frontend/src/features/preview/model.ts` 和 TeamServer `server/transfer/codec.go`，两边要一起改。 |
| 预览、下载 404 | TTL 过了（预览 5 分钟，下载暂存看 server 策略）。再发一次。 |
| 409 conflict（create_preview） | 服务端活跃预览上限 10。把旧的 DELETE 掉，或者等一会儿。 |
| stdio 桥回 HTTP 错误帧（-32000） | 常驻 Client 没开，桥转发不了。先起 Client。 |
| 单测里 commands.ts 对不上 | 双仓命令表漂了。按报错把两边 `CommandID` / `COMMAND_ID` 对齐，再跑快照。 |

## 改代码时别忘了两边

下面这几处改一边，另一边也得动，最好有测试护着：

- 命令 ID：`frontend/src/constants/commands.ts` ↔ `service/mcp/commands.go`（快照测试会比）
- 参数类型化：`features/beacon/api/commandArgs.ts` ↔ `buildBeaconCommandArgs`
- 预览扩展名：`frontend/src/features/preview/model.ts` ↔ TeamServer `server/transfer/codec.go`（`npm run check:preview-mirror`）
- WS 帧 type 键：`parse_frame.go` 的 `frameTypeKeys`，规范键是小写 `type`
- COMMAND_EVENT 的嵌套：任务级字段（beacon_id / task_id）在 `payload.data`，结果元数据（preview_id / status / reason / text）在 `payload.data.data`。`matchFilters`、`previewEventMeta` 都按两级找。新工具要吃帧字段，先跑 `diag-preview-frame.mjs` 看真帧，别拿单测夹具脑补。以前出过假帧扁平、真帧嵌套，谓词永远命不中。

主程序：`wails3 build`。stdio 桥：`wails3 task mcp:stdio:build`，产物 `bin/iris-mcp-stdio.exe`。

回归：`mcp-e2e-chain.mjs`（链路硬门禁）、`mcp-operator-sim.mjs`（FAIL>0 非 0 退出）、`stdio-mcp-smoke.mjs`。

清 `main.go` 里调试注入（比如 CDP 端口）时，别整文件 `git checkout -- main.go`。MCP 接线要是还没提交，会一起没。用 grep `remote-debugging-port` 对着删那几行。
