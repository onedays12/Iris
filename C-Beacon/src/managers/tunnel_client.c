/*
 * tunnel_client.c - 隧道主动拨号与套接字发送
 *
 * 把目标地址字符串解析为可连接的套接字，并提供阻塞式全量发送。
 * 这里只做网络 I/O，不涉及通道生命周期或线程管理。
 */
#include "beacon_tunnel_internal.h"

/* 将目标字符串拆分为主机和服务（端口）组件 */
static INT TunnelSplitTarget(const CHAR* target, CHAR* host, SIZE_T host_len, CHAR* service, SIZE_T service_len)
{
    const CHAR* colon;
    SIZE_T len;

    if (!target || !target[0]) {
        return 0;
    }

    /* 处理 IPv6 方括号表示法 [host]:port */
    if (target[0] == '[') {
        const CHAR* end = strchr(target, ']');
        if (!end || end[1] != ':') {
            return 0;
        }
        len = (SIZE_T)(end - target - 1);
        if (len + 1 > host_len) {
            return 0;
        }
        memcpy(host, target + 1, len);
        host[len] = 0;
        strcpy_s(service, service_len, end + 2);
        return service[0] != 0;
    }

    /* 处理 host:port 表示法 */
    colon = strrchr(target, ':');
    if (!colon || colon == target || colon[1] == 0) {
        return 0;
    }
    len = (SIZE_T)(colon - target);
    if (len + 1 > host_len) {
        return 0;
    }
    memcpy(host, target, len);
    host[len] = 0;
    strcpy_s(service, service_len, colon + 1);
    return 1;
}

/* 使用非阻塞套接字和 select() 进行带超时的连接 */
static INT TunnelConnectWithTimeout(SOCKET s, const struct sockaddr* addr, INT addr_len, INT timeout_ms)
{
    u_long nonblock = 1;
    u_long blocking = 0;
    INT ret;
    fd_set write_set;
    fd_set except_set;
    TIMEVAL tv;
    INT so_error = 0;
    INT so_len = sizeof(so_error);

    /* 开始非阻塞连接 */
    ioctlsocket(s, FIONBIO, &nonblock);
    ret = connect(s, addr, addr_len);
    if (ret == 0) {
        ioctlsocket(s, FIONBIO, &blocking);
        return 0;
    }

    /* 检查预期的进行中错误 */
    ret = WSAGetLastError();
    if (ret != WSAEWOULDBLOCK && ret != WSAEINPROGRESS && ret != WSAEINVAL) {
        return ret;
    }

    /* 等待连接完成或超时 */
    FD_ZERO(&write_set);
    FD_ZERO(&except_set);
    FD_SET(s, &write_set);
    FD_SET(s, &except_set);
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;
    ret = select(0, NULL, &write_set, &except_set, &tv);
    if (ret == 0) {
        return WSAETIMEDOUT;
    }
    if (ret == SOCKET_ERROR) {
        return WSAGetLastError();
    }

    /* select 后检查套接字错误 */
    if (getsockopt(s, SOL_SOCKET, SO_ERROR, (CHAR*)&so_error, &so_len) == SOCKET_ERROR) {
        return WSAGetLastError();
    }
    if (so_error != 0) {
        return so_error;
    }

    /* 恢复阻塞模式 */
    ioctlsocket(s, FIONBIO, &blocking);
    return 0;
}

/* 解析并连接到目标地址，返回已连接的套接字 */
SOCKET TunnelDialTarget(const TunnelStartRequest* req, INT* reason)
{
    CHAR host[256];
    CHAR service[32];
    ADDRINFOA hints;
    ADDRINFOA* result = NULL;
    ADDRINFOA* ai;
    INT gai;
    SOCKET connected = INVALID_SOCKET;
    INT last_error = WSAECONNREFUSED;

    *reason = TUNNEL_REASON_UNKNOWN;

    /* 将目标解析为主机和服务 */
    if (!TunnelSplitTarget(req->target, host, sizeof(host), service, sizeof(service))) {
        *reason = TUNNEL_REASON_DNS_FAILED;
        return INVALID_SOCKET;
    }

    /* 设置 DNS 解析的地址提示 */
    ZeroMemory(&hints, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = strcmp(req->proto, "udp") == 0 ? SOCK_DGRAM : SOCK_STREAM;
    hints.ai_protocol = strcmp(req->proto, "udp") == 0 ? IPPROTO_UDP : IPPROTO_TCP;

    gai = getaddrinfo(host, service, &hints, &result);
    if (gai != 0) {
        *reason = TUNNEL_REASON_DNS_FAILED;
        return INVALID_SOCKET;
    }

    /* 尝试每个解析的地址 */
    for (ai = result; ai; ai = ai->ai_next) {
        SOCKET s = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
        if (s == INVALID_SOCKET) {
            last_error = WSAGetLastError();
            continue;
        }
        if (strcmp(req->proto, "udp") == 0) {
            /* UDP：简单阻塞连接 */
            if (connect(s, ai->ai_addr, (INT)ai->ai_addrlen) == 0) {
                connected = s;
                break;
            }
            last_error = WSAGetLastError();
        } else {
            /* TCP：带超时的连接 */
            last_error = TunnelConnectWithTimeout(s, ai->ai_addr, (INT)ai->ai_addrlen, req->connect_timeout_ms);
            if (last_error == 0) {
                connected = s;
                break;
            }
        }
        closesocket(s);
    }
    freeaddrinfo(result);

    if (connected == INVALID_SOCKET) {
        *reason = TunnelWsaReason(last_error);
    } else {
        *reason = TUNNEL_REASON_NONE;
    }
    return connected;
}

/* 在套接字上发送所有数据，根据需要重试。成功返回 1 */
INT TunnelSendAll(SOCKET s, const BYTE8* data, SIZE_T len)
{
    SIZE_T sent_total = 0;
    while (sent_total < len) {
        INT chunk = (INT)((len - sent_total) > 32768 ? 32768 : (len - sent_total));
        INT n = send(s, (const CHAR*)data + sent_total, chunk, 0);
        if (n == SOCKET_ERROR || n == 0) {
            return 0;
        }
        sent_total += (SIZE_T)n;
    }
    return 1;
}
