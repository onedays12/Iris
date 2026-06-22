#include "beacon_cascade.h"

#include "beacon_context.h"

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
