#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif

#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

typedef unsigned char BYTE8;

typedef struct ByteBuf {
    BYTE8* data;
    SIZE_T len;
    SIZE_T cap;
} ByteBuf;

typedef struct PacketList {
    ByteBuf* items;
    SIZE_T count;
    SIZE_T cap;
    INT items_are_final;
    INT should_exit;
} PacketList;

VOID BbInit(ByteBuf* b);
VOID BbFree(ByteBuf* b);
INT BbReserve(ByteBuf* b, SIZE_T need);
INT BbAppend(ByteBuf* b, const VOID* data, SIZE_T len);
INT BbU8(ByteBuf* b, UINT8 v);
INT BbU16(ByteBuf* b, UINT16 v);
INT BbU32(ByteBuf* b, UINT32 v);
INT BbU64(ByteBuf* b, UINT64 v);
INT BbBytes(ByteBuf* b, const VOID* data, SIZE_T len);
INT BbString(ByteBuf* b, const CHAR* s);
INT BbPrintf(ByteBuf* b, const CHAR* fmt, ...);
ByteBuf BbFromText(const CHAR* s);

VOID PlistInit(PacketList* list);
VOID PlistFree(PacketList* list);
INT PlistAdd(PacketList* list, ByteBuf item);

WCHAR* Utf8ToWide(const CHAR* s);
CHAR* WideToUtf8(const WCHAR* s);
CHAR* SystemToUtf8(const CHAR* data, UINT cp);
CHAR* SystemBytesToUtf8(const BYTE8* data, SIZE_T len, UINT cp);
CHAR* HeapStrDupA(const CHAR* s);
WCHAR* HeapStrDupW(const WCHAR* s);
VOID HexEncode(const BYTE8* data, SIZE_T len, CHAR* out, SIZE_T out_len);
UINT64 GetUnixTimestamp(VOID);
VOID DebugPrintf(const CHAR* fmt, ...);

/* 动态解析的格式化接口（避免静态链接 CRT printf） */
INT FmtVscprintfA(const CHAR* fmt, va_list ap);
INT FmtVsnprintfA(CHAR* dst, SIZE_T dst_len, const CHAR* fmt, va_list ap);
INT FmtSnprintfA(CHAR* dst, SIZE_T dst_len, const CHAR* fmt, ...);
INT FmtSnprintfW(WCHAR* dst, SIZE_T dst_len, const WCHAR* fmt, ...);

/* 宏重定向：项目中的 snprintf/vsnprintf/_vscprintf/swprintf_s 自动走动态解析 */
#ifndef BEACON_NO_FORMAT_REDIRECT
#define snprintf   FmtSnprintfA
#define vsnprintf  FmtVsnprintfA
#define _vscprintf FmtVscprintfA
#define swprintf_s FmtSnprintfW
#endif
