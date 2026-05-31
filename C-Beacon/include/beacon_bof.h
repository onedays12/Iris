#pragma once

#include "beacon_context.h"

/* ===== COFF 常量 ===== */

#define SIZE_OF_PAGE 4096
#define PAGE_ALLIGN( x ) ( PVOID )( (ULONG_PTR)(x) + ( ( SIZE_OF_PAGE - ( (ULONG_PTR)(x) & ( SIZE_OF_PAGE - 1 ) ) ) % SIZE_OF_PAGE ) )

/* 重定位类型（winnt.h 可能已部分定义，用 #ifndef 保护） */
#ifndef IMAGE_REL_AMD64_ADDR64
#define IMAGE_REL_AMD64_ADDR64      0x0001
#endif
#ifndef IMAGE_REL_AMD64_ADDR32NB
#define IMAGE_REL_AMD64_ADDR32NB    0x0003
#endif
#ifndef IMAGE_REL_AMD64_REL32
#define IMAGE_REL_AMD64_REL32       0x0004
#endif
#ifndef IMAGE_REL_AMD64_REL32_1
#define IMAGE_REL_AMD64_REL32_1     0x0005
#endif
#ifndef IMAGE_REL_AMD64_REL32_2
#define IMAGE_REL_AMD64_REL32_2     0x0006
#endif
#ifndef IMAGE_REL_AMD64_REL32_3
#define IMAGE_REL_AMD64_REL32_3     0x0007
#endif
#ifndef IMAGE_REL_AMD64_REL32_4
#define IMAGE_REL_AMD64_REL32_4     0x0008
#endif
#ifndef IMAGE_REL_AMD64_REL32_5
#define IMAGE_REL_AMD64_REL32_5     0x0009
#endif

#ifndef IMAGE_REL_I386_ABSOLUTE
#define IMAGE_REL_I386_ABSOLUTE     0x0000
#endif
#ifndef IMAGE_REL_I386_DIR16
#define IMAGE_REL_I386_DIR16        0x0001
#endif
#ifndef IMAGE_REL_I386_REL16
#define IMAGE_REL_I386_REL16        0x0002
#endif
#ifndef IMAGE_REL_I386_DIR32
#define IMAGE_REL_I386_DIR32        0x0006
#endif
#ifndef IMAGE_REL_I386_DIR32NB
#define IMAGE_REL_I386_DIR32NB      0x0007
#endif
#ifndef IMAGE_REL_I386_SEG12
#define IMAGE_REL_I386_SEG12        0x0009
#endif
#ifndef IMAGE_REL_I386_SECTION
#define IMAGE_REL_I386_SECTION      0x000A
#endif
#ifndef IMAGE_REL_I386_SECREL
#define IMAGE_REL_I386_SECREL       0x000B
#endif
#ifndef IMAGE_REL_I386_REL32
#define IMAGE_REL_I386_REL32        0x0014
#endif

#ifndef IMAGE_SYM_CLASS_EXTERNAL
#define IMAGE_SYM_CLASS_EXTERNAL    0x0002
#endif
#ifndef IMAGE_SYM_CLASS_STATIC
#define IMAGE_SYM_CLASS_STATIC      0x0003
#endif

#ifndef IMAGE_SCN_MEM_EXECUTE
#define IMAGE_SCN_MEM_EXECUTE       0x20000000
#endif
#ifndef IMAGE_SCN_MEM_READ
#define IMAGE_SCN_MEM_READ          0x40000000
#endif
#ifndef IMAGE_SCN_MEM_WRITE
#define IMAGE_SCN_MEM_WRITE         0x80000000
#endif

/* ===== COFF 前缀哈希 ===== */

#define COFF_PREP_SYMBOL            0x4D7E3D03
#define COFF_PREP_SYMBOL_SIZE       6
#define COFF_PREP_TEXT              0xF6201B2A
#define COFF_PREP_TEXT_SIZE         5

/* ===== Beacon API 回调类型 ===== */

#define CALLBACK_OUTPUT             0x00
#define CALLBACK_OUTPUT_OEM         0x1e
#define CALLBACK_ERROR              0x0d
#define CALLBACK_OUTPUT_UTF8        0x20

/* ===== Beacon API 符号哈希 ===== */

#define BEACONOUTPUT_HASH           0x04539BE1
#define BEACONPRINTF_HASH           0x7E4C2582
#define BEACONDATAINT_HASH          0x85E5D290
#define BEACONDATASHORT_HASH        0x3F43E9B4
#define BEACONISADMIN_HASH          0x400F97BC
#define BEACONDATAPARSE_HASH        0x25796A17
#define BEACONFORMATINT_HASH        0xCFDAF868
#define BEACONFORMATFREE_HASH       0x4C607CB7
#define BEACONFORMATRESET_HASH      0x976A2DBC
#define BEACONFORMATAPPEND_HASH     0x49C00993
#define BEACONDATALENGTH_HASH       0xAB599C25
#define BEACONDATAEXTRACT_HASH      0xFE56DCA8
#define BEACONFORMATALLOC_HASH      0xCF1ECC1C
#define BEACONFORMATPRINTF_HASH     0x74E5C3CD
#define BEACONFORMATTOSTRING_HASH   0xF69523D5
#define BEACONADDVALUE_HASH         0x950FBF53
#define BEACONGETVALUE_HASH         0x5C96B3E5
#define BEACONREMOVEVALUE_HASH      0x0FE52E8F
#define BEACONGETSTOPJOBEVENT_HASH  0x45779D7C
#define BEACONWAKEUP_HASH           0x7E39C0C3
#define TOWIDECHAR_HASH             0xB6A4B45E
#define FREELIBRARY_HASH            0x3A1A1F9F
#define LOADLIBRARYA_HASH           0x18BED220
#define CREATETHREAD_HASH           0xA571F254
#define GETPROCADDRESS_HASH         0x50A5008A
#define GETMODULEHANDLEA_HASH       0xA565CF29

/* ===== 安全释放宏 ===== */

#define BOFSECUREFREE(pBuffer, size) \
    if (pBuffer) { \
        memset(pBuffer, 0, size); \
        HeapFree(GetProcessHeap(), 0, pBuffer); \
        pBuffer = NULL; \
    }

/* ===== COFF 文件结构 ===== */

#pragma pack(push,1)
typedef struct _COFF_FILE_HEADER {
    UINT16  Machine;
    UINT16  NumberOfSections;
    UINT32  TimeDateStamp;
    UINT32  PointerToSymbolTable;
    UINT32  NumberOfSymbols;
    UINT16  SizeOfOptionalHeader;
    UINT16  Characteristics;
} COFF_FILE_HEADER, *PCOFF_FILE_HEADER;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _COFF_SECTION {
    CHAR    Name[8];
    UINT32  VirtualSize;
    UINT32  VirtualAddress;
    UINT32  SizeOfRawData;
    UINT32  PointerToRawData;
    UINT32  PointerToRelocations;
    UINT32  PointerToLineNumbers;
    UINT16  NumberOfRelocations;
    UINT16  NumberOfLinenumbers;
    UINT32  Characteristics;
} COFF_SECTION, *PCOFF_SECTION;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _COFF_RELOC {
    UINT32  VirtualAddress;
    UINT32  SymbolTableIndex;
    UINT16  Type;
} COFF_RELOC, *PCOFF_RELOC;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _COFF_SYMBOL {
    union {
        CHAR    Name[8];
        UINT32  Value[2];
    } First;
    UINT32 Value;
    UINT16 SectionNumber;
    UINT16 Type;
    UINT8  StorageClass;
    UINT8  NumberOfAuxSymbols;
} COFF_SYMBOL, *PCOFF_SYMBOL;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _SECTION_MAP {
    PCHAR   Ptr;
    SIZE_T  Size;
} SECTION_MAP, *PSECTION_MAP;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _COFFEE {
    PVOID             Data;
    PCOFF_FILE_HEADER Header;
    PCOFF_SECTION     Section;
    PCOFF_RELOC       Reloc;
    PCOFF_SYMBOL      Symbol;
    PVOID             ImageBase;
    SIZE_T            BofSize;
    PSECTION_MAP      SecMap;
    PULONG_PTR        GOT;
    SIZE_T            GOTSize;
    PULONG_PTR        BSS;
    SIZE_T            BSSSize;
} COFFEE, *PCOFFEE;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _BSSEntry {
    PVOID   pvSymbolAddr;
    SIZE_T  stOffset;
} BSSEntry, *PBSSEntry;
#pragma pack(pop)

typedef struct BofJobRuntime BofJobRuntime;

/* ===== Beacon API 符号表条目 ===== */

#pragma pack(push,1)
typedef struct _COFFAPIFUNC {
    UINT_PTR    NameHash;
    PVOID       Pointer;
} COFFAPIFUNC, *PCOFFAPIFUNC;
#pragma pack(pop)

/* ===== Beacon API 数据解析器 ===== */

#pragma pack(push,1)
typedef struct _datap {
    PCHAR  original;
    PCHAR  buffer;
    INT    length;
    INT    size;
} datap, *PDATA;
#pragma pack(pop)

#pragma pack(push,1)
typedef struct _formatp {
    PCHAR  original;
    PCHAR  buffer;
    INT    length;
    INT    size;
} formatp, *PFORMAT;
#pragma pack(pop)

/* ===== BOF 加载器函数声明 ===== */

/* BOF 命令入口，从 dispatcher 调用 */
PacketList CommandBofHandle(BeaconContext* ctx, UINT32 task_id, Parser* p);

/* 根据 TLS 或返回地址获取当前 BOF runtime */
BofJobRuntime* BofGetCurrentRuntime(PVOID return_address);

/* BOF runtime 只暴露只读 accessor，避免 Beacon API 直接依赖内部结构 */
BeaconContext* BofRuntimeGetContext(BofJobRuntime* runtime);
UINT32 BofRuntimeGetTaskId(BofJobRuntime* runtime);
HANDLE BofRuntimeGetStopEvent(BofJobRuntime* runtime);

/* ===== Beacon API 函数声明 ===== */

VOID BeaconDataParse(PDATA parser, PCHAR buffer, INT size);
INT BeaconDataInt(PDATA parser);
SHORT BeaconDataShort(PDATA parser);
PCHAR BeaconDataExtract(PDATA parser, PINT size);
INT BeaconDataLength(PDATA parser);
VOID BeaconFormatAlloc(PFORMAT format, INT maxsz);
VOID BeaconFormatFree(PFORMAT format);
VOID BeaconFormatReset(PFORMAT format);
VOID BeaconFormatAppend(PFORMAT format, PCHAR text, INT len);
VOID BeaconFormatInt(PFORMAT format, INT value);
VOID BeaconFormatPrintf(PFORMAT format, PCHAR fmt, ...);
PCHAR BeaconFormatToString(PFORMAT format, PINT size);
VOID BeaconPrintf(INT Type, PCHAR fmt, ...);
VOID BeaconOutput(INT Type, PCHAR data, INT len);
BOOL BeaconIsAdmin(VOID);
BOOL BeaconAddValue(PCHAR key, PVOID ptr);
PVOID BeaconGetValue(PCHAR key);
BOOL BeaconRemoveValue(PCHAR key);
HANDLE BeaconGetStopJobEvent(VOID);
VOID BeaconWakeup(VOID);
BOOL toWideChar(PCHAR src, WCHAR* dst, INT max);
