#include "beacon_packet.h"

/* 验证解析器至少还有 'n' 字节剩余 */
static INT ParserRequire(Parser* p, SIZE_T n, const CHAR* what)
{
    if (p->error[0]) {
        return 0;
    }
    if (ParserLeft(p) < n) {
        snprintf(p->error, sizeof(p->error), "not enough data for %s", what);
        return 0;
    }
    return 1;
}

/* 在原始数据缓冲区上初始化解析器 */
VOID ParserInit(Parser* p, const BYTE8* data, SIZE_T len)
{
    p->data = data;
    p->len = len;
    p->off = 0;
    p->error[0] = 0;
}

/* 返回解析器中未消费的字节数 */
SIZE_T ParserLeft(const Parser* p)
{
    return p->off <= p->len ? p->len - p->off : 0;
}

/* 从解析器读取大端序 uint32 */
UINT32 ParserU32(Parser* p)
{
    UINT32 v;

    if (!ParserRequire(p, 4, "u32")) {
        return 0;
    }

    v = ((UINT32)p->data[p->off] << 24) |
        ((UINT32)p->data[p->off + 1] << 16) |
        ((UINT32)p->data[p->off + 2] << 8) |
        (UINT32)p->data[p->off + 3];
    p->off += 4;
    return v;
}

/* 从解析器读取大端序 uint64 */
UINT64 ParserU64(Parser* p)
{
    UINT64 v = 0;
    INT i;

    if (!ParserRequire(p, 8, "u64")) {
        return 0;
    }

    /* 组装 8 字节大端序 */
    for (i = 0; i < 8; ++i) {
        v = (v << 8) | p->data[p->off + i];
    }
    p->off += 8;
    return v;
}

/* 从解析器读取长度前缀字节到新的 ByteBuf */
ByteBuf ParserBytes(Parser* p)
{
    ByteBuf b;
    UINT32 n;

    BbInit(&b);
    n = ParserU32(p);

    if (!ParserRequire(p, n, "bytes")) {
        return b;
    }

    if (!BbAppend(&b, p->data + p->off, n)) {
        snprintf(p->error, sizeof(p->error), "allocation failed for bytes");
        BbFree(&b);
        return b;
    }
    p->off += n;
    return b;
}

/* 从解析器读取长度前缀字符串，去除尾部空字符 */
CHAR* ParserString(Parser* p)
{
    ByteBuf b = ParserBytes(p);
    CHAR* s;
    SIZE_T n;

    if (p->error[0]) {
        BbFree(&b);
        return HeapStrDupA("");
    }

    /* 去除尾部空终止符 */
    n = b.len;
    while (n && b.data[n - 1] == 0) {
        --n;
    }

    s = (CHAR*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, n + 1);
    if (s && n) {
        memcpy(s, b.data, n);
    }

    BbFree(&b);
    return s ? s : HeapStrDupA("");
}

/* 向输出缓冲区追加原始字节 */
INT PacketArrayBytes(ByteBuf* out, const VOID* data, SIZE_T len)
{
    return BbAppend(out, data, len);
}

/* 向输出缓冲区追加字符串 */
INT PacketArrayString(ByteBuf* out, const CHAR* value)
{
    return BbString(out, value);
}

/* 向输出缓冲区追加有符号 int16（转换为 uint16） */
INT PacketArrayI16(ByteBuf* out, int16_t value)
{
    return BbU16(out, (UINT16)value);
}

/* 向输出缓冲区追加有符号 int32（转换为 uint32） */
INT PacketArrayI32(ByteBuf* out, int32_t value)
{
    return BbU32(out, (UINT32)value);
}

/* 向输出缓冲区追加布尔值（单字节 1 或 0） */
INT PacketArrayBool(ByteBuf* out, INT value)
{
    return BbU8(out, value ? 1u : 0u);
}

/* 将原始字节打包为长度前缀的 ByteBuf */
ByteBuf PacketPackBytesData(const VOID* data, SIZE_T len)
{
    ByteBuf out;

    BbInit(&out);
    BbBytes(&out, data, len);
    return out;
}

/* 将现有 ByteBuf 打包为长度前缀的 ByteBuf */
ByteBuf PacketPackBytes(const ByteBuf* in)
{
    return PacketPackBytesData(in ? in->data : NULL, in ? in->len : 0);
}

/* 构建最终数据包：inner(task_id, command_id, payload) 包裹在长度前缀中 */
ByteBuf PacketMakeFinal(UINT32 task_id, UINT32 command_id, const ByteBuf* payload)
{
    ByteBuf inner;
    ByteBuf final;
    ByteBuf packed_payload;

    BbInit(&inner);

    /* 编码内部头部和载荷 */
    PacketArrayI32(&inner, (INT32)task_id);
    PacketArrayI32(&inner, (INT32)command_id);

    packed_payload = PacketPackBytes(payload);
    PacketArrayBytes(&inner, packed_payload.data, packed_payload.len);

    /* 将内部数据包装裹为最终的长度前缀数据包 */
    final = PacketPackBytes(&inner);

    BbFree(&packed_payload);
    BbFree(&inner);
    return final;
}

/* 构建包含信标 ID、会话密钥和元数据的心跳数据包 */
ByteBuf PacketPackHeartbeat(UINT32 beacon_id, const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* metadata)
{
    ByteBuf p;

    BbInit(&p);
    PacketArrayI32(&p, (INT32)beacon_id);
    PacketArrayI16(&p, (INT16)session_key_len);
    PacketArrayBytes(&p, session_key, session_key_len);

    if (metadata) {
        PacketArrayBytes(&p, metadata->data, metadata->len);
    }
    return p;
}
