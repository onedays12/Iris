# PoolParty

Beacon 右键插件：用 Windows 线程池把 x64 shellcode 注入目标进程（PoolParty 变体 2–8，不做变体 1）。

## 菜单

| 项 | 手法 | 额外字段 |
| --- | --- | --- |
| TP_WORK注入 | 插入 TP_WORK | — |
| TP_WAIT注入 | Event → IOCP | 可选事件名，空 = 匿名 |
| TP_IO注入 | 重叠写文件 → IOCP | 可选文件名，空 = `%TEMP%` 随机 `.tmp`，打完删除 |
| TP_ALPC注入 | 命名 ALPC → IOCP | 可选端口名，空 = `\RPC Control\<hex>` |
| TP_JOB注入 | Job 通知 → IOCP | 可选 Job 名，空 = 匿名。**会把当前 Beacon Assign 进 Job** |
| TP_DIRECT注入 | `ZwSetIoCompletion` | — |
| TP_TIMER注入 | TimerQueue + IRTimer | — |

每项都要填目标 PID 和一份 `.bin`（1 字节–10MB）。只打 Windows amd64 Beacon / x64 目标。

## 约束

- 不提 `SeDebugPrivilege`，靠 Beacon 现有权限。
- 拒绝 PID 0、自身进程、WOW64 目标。
- 目标需要已有线程池；变体 3–7 还要有 worker 堵在 IOCP 上。
- 命令 70 把 `.o` 插在参数最前，`go()` 按 TeamServer 长度前缀读 pid / shellcode。
- 不要在控制台只敲 `bof "xxx.x64.o"`：那不会带 PID 和 bin。从右键插件表单提交。
- 改完 BOF 后必须重载插件（或重启 Client），否则还在跑旧 `.o`。

BOF 源码在 `PoolParty-main/poolparty_bof`，改完用 `build_bof.bat <name>` 出 `.x64.o`，拷进 `bin/` 并更新 `plugin.json` 的 sha256。
