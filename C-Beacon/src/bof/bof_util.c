#include "beacon_bof_internal.h"

#include <stdarg.h>

/* 设置 BOF 最后错误信息（printf 风格） */
VOID BofSetError(BofJobRuntime* runtime, const CHAR* fmt, ...)
{
    va_list ap;

    if (!runtime || !fmt) return;

    va_start(ap, fmt);
    vsnprintf(runtime->last_error, sizeof(runtime->last_error), fmt, ap);
    va_end(ap);

    runtime->last_error[sizeof(runtime->last_error) - 1] = '\0';
}

/* FNV-1a 变体哈希（用于 COFF 符号匹配） */
DWORD BofHashString(const CHAR* str, ULONG len, BOOL upper)
{
    DWORD hash = 0x811C9DC5u ^ 0x5A17B3C9u;
    ULONG i;

    if (!str || len == 0) return 0;

    for (i = 0; i < len && str[i]; i++) {
        BYTE ch = (BYTE)str[i];

        if (upper && ch >= 'a' && ch <= 'z') {
            ch = ch - 'a' + 'A';
        }

        hash ^= ch;
        hash *= 0x01000193u;
        hash = (hash >> 13) | (hash << 19);
    }

    hash ^= hash >> 16;
    hash *= 0x7FEB352Du;
    hash ^= hash >> 15;

    return hash;
}

/* 计算字符串长度（NULL 安全） */
SIZE_T BofStrLen(const CHAR* s)
{
    const CHAR* p = s;

    if (!s) return 0;
    while (*p) p++;

    return (SIZE_T)(p - s);
}

/* 简化版 strtok（不可重入，仅供内部使用） */
PCHAR BofStrToken(PCHAR str, const PCHAR delim)
{
    PCHAR spanp, token;
    INT c, sc;
    PCHAR s;

    if (!str) return NULL;
    s = str;

CONTINUE:
    c = *s++;
    for (spanp = delim; (sc = *spanp++) != 0;) {
        if (c == sc) goto CONTINUE;
    }
    if (c == 0) return NULL;

    token = s - 1;

    for (;;) {
        c = *s++;
        spanp = delim;
        do {
            if ((sc = *spanp++) == c) {
                if (c == 0) s = NULL;
                else s[-1] = '\0';
                return token;
            }
        } while (sc != 0);
    }

    return NULL;
}

/* 跳过导入 thunk 前导下划线（x86 的 _ 前缀） */
PCHAR BofSkipImportThunkPrefix(PCHAR name)
{
    if (!name) return NULL;
    while (*name == '_') name++;
    return name;
}

/* 获取 __imp_ 或 __imp__ 前缀的长度 */
DWORD BofGetImportPrefixSize(PCHAR name)
{
    if (!name) return 0;

    if (BofHashString(name, COFF_PREP_SYMBOL_SIZE + 1, FALSE) ==
        BofHashString("__imp__", COFF_PREP_SYMBOL_SIZE + 1, FALSE))
        return COFF_PREP_SYMBOL_SIZE + 1;

    if (BofHashString(name, COFF_PREP_SYMBOL_SIZE, FALSE) == COFF_PREP_SYMBOL)
        return COFF_PREP_SYMBOL_SIZE;

    return 0;
}

/* 获取 __imp_Beacon 或 __imp__Beacon 前缀的长度 */
DWORD BofGetBeaconPrefixSize(PCHAR name)
{
    DWORD ips = BofGetImportPrefixSize(name);

    if (!ips) return 0;

    if (BofHashString(name, ips + 6, FALSE) ==
        BofHashString(ips == COFF_PREP_SYMBOL_SIZE ? "__imp_Beacon" : "__imp__Beacon",
                      ips + 6, FALSE))
        return ips + 6;

    return 0;
}

/* 去除 stdcall 后缀（如 FuncName@8 -> FuncName） */
VOID BofStripStdcallSuffix(PCHAR name)
{
    DWORD i;

    if (!name) return;

    for (i = 0; name[i] != '\0'; i++) {
        if (name[i] == '@') {
            name[i] = '\0';
            return;
        }
    }
}

/* 安全复制字符串 */
BOOL BofCopyString(PCHAR dst, SIZE_T dstSize, const CHAR* src)
{
    SIZE_T len;

    if (!dst || dstSize == 0 || !src) return FALSE;

    len = BofStrLen(src);
    if (len >= dstSize) return FALSE;

    memcpy(dst, src, len);
    dst[len] = '\0';

    return TRUE;
}

/* 如果缺少 .dll 后缀则自动追加 */
BOOL BofAppendDllSuffix(PCHAR dst, SIZE_T dstSize)
{
    SIZE_T len;

    if (!dst || dstSize == 0) return FALSE;

    if (strchr(dst, '.')) return TRUE;

    len = BofStrLen(dst);
    if (len + 4 >= dstSize) return FALSE;

    memcpy(dst + len, ".dll", 5);

    return TRUE;
}
