# cascade_proto

`cascade_proto` 是级联第一版的 Go 原型，只验证 internal TCP/SMB Beacon 的核心数据流：

```text
监听 -> 建链 -> 接收命令 -> 转发数据 -> 回传结果
```

它不接入真实 TeamServer、不做加密、不修改 Beacon C 代码。

## 构建

```cmd
cd /d D:\代码\Vs2022\Beacon\Beacon\tools\cascade_proto
build.bat
```

产物：

```text
bin\cascade_proto.exe
```

## TCP 单跳

窗口 1：

```cmd
bin\cascade_proto.exe node --id B --tcp-listen 127.0.0.1:9001
```

窗口 2：

```cmd
bin\cascade_proto.exe root
```

root 输入：

```text
connect-tcp B 127.0.0.1:9001
exec B whoami
```

## TCP 多跳

窗口 1：

```cmd
bin\cascade_proto.exe node --id B --tcp-listen 127.0.0.1:9001
```

窗口 2：

```cmd
bin\cascade_proto.exe node --id C --tcp-listen 127.0.0.1:9002
```

窗口 3：

```cmd
bin\cascade_proto.exe root
```

root 输入：

```text
connect-tcp B 127.0.0.1:9001
connect-tcp-via B C 127.0.0.1:9002
exec C hostname
nodes
```

数据流：

```text
root -> B: ROUTE(child=C, EXEC)
B -> C: EXEC
C -> B: RESULT
B -> root: READ(child=C, RESULT)
```

## SMB 单跳

窗口 1：

```cmd
bin\cascade_proto.exe node --id B --pipe \\.\pipe\beacon_b
```

窗口 2：

```cmd
bin\cascade_proto.exe root
```

root 输入：

```text
connect-smb B \\.\pipe\beacon_b
exec B whoami
```

## SMB 多跳

窗口 1：

```cmd
bin\cascade_proto.exe node --id B --pipe \\.\pipe\beacon_b
```

窗口 2：

```cmd
bin\cascade_proto.exe node --id C --pipe \\.\pipe\beacon_c
```

窗口 3：

```cmd
bin\cascade_proto.exe root
```

root 输入：

```text
connect-smb B \\.\pipe\beacon_b
connect-smb-via B C \\.\pipe\beacon_c
exec C hostname
nodes
```

## 命令

```text
connect-tcp <child_id> <host:port>
connect-smb <child_id> \\.\pipe\name
connect-tcp-via <parent_id> <child_id> <host:port>
connect-smb-via <parent_id> <child_id> \\.\pipe\name
exec <beacon_id> <command...>
ping <beacon_id>
nodes
exit
```

## 和正式实现的对应关系

| Go 原型 | Beacon C 第一版 |
|---|---|
| `frame.go` | `cascade_frame.c` |
| `tcp.go` | `cascade_tcp.c` |
| `smb_windows.go` | `cascade_smb.c` |
| `node.go` | `cascade.c` |
| `root` | TeamServer + external Beacon |
| `CmdConnectTCP` | `COMMAND_CASCADE_CONNECT_TCP` |
| `CmdLinkSMB` | `COMMAND_CASCADE_LINK_SMB` |
| `CmdRoute` | `COMMAND_CASCADE_ROUTE` |
| `CmdRead` | `COMMAND_CASCADE_READ` |
| `CmdOpen` | `COMMAND_CASCADE_OPEN` |
