#include "beacon_cascade.h"

#include "beacon_context.h"


#define CASCADE_FRAME_MAGIC   0x43415331u /* CAS1 */
#define CASCADE_FRAME_VERSION 1u


/* 从大端字节序读取 16 位整数 */
static UINT16 ReadBe16(const BYTE8* p)
{
    return (UINT16)(((UINT16)p[0] << 8) | (UINT16)p[1]);
}

/* 从大端字节序读取 32 位整数 */
static UINT32 ReadBe32(const BYTE8* p)
{
    return ((UINT32)p[0] << 24) |
           ((UINT32)p[1] << 16) |
           ((UINT32)p[2] << 8)  |
           (UINT32)p[3];
}

/* 将 16 位整数写入大端字节序 */
static VOID WriteBe16(BYTE8* p, UINT16 v)
{
    p[0] = (BYTE8)((v >> 8) & 0xff);
    p[1] = (BYTE8)(v & 0xff);
}

/* 将 32 位整数写入大端字节序 */
static VOID WriteBe32(BYTE8* p, UINT32 v)
{
    p[0] = (BYTE8)((v >> 24) & 0xff);
    p[1] = (BYTE8)((v >> 16) & 0xff);
    p[2] = (BYTE8)((v >> 8) & 0xff);
    p[3] = (BYTE8)(v & 0xff);
}

/* ===== 底层 I/O 辅助函数 ===== */

/* 接收指定字节数，处理 WSAEWOULDBLOCK 并自动重试 */
static BOOL CascadeRecvAll(SOCKET s, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    INT retries = 0;

    while (off < len) {
        INT n = recv(s, (CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
            retries = 0;
        } else if (n == 0) {
            return FALSE;
        } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
            if (++retries > 500) return FALSE;
            Sleep(10);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}

/* 发送指定字节数，处理 WSAEWOULDBLOCK 并自动重试 */
static BOOL CascadeSendAll(SOCKET s, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    INT retries = 0;

    while (off < len) {
        INT n = send(s, (const CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
            retries = 0;
        } else if (n == SOCKET_ERROR && WSAGetLastError() == WSAEWOULDBLOCK) {
            if (++retries > 500) return FALSE;
            Sleep(10);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}
/*
 * 使用 ReadFile 从管道/文件句柄读取指定字节数。
 * 通过 PeekNamedPipe 检查可用数据，无数据时休眠等待。
 */
static BOOL CascadeReadFileAll(HANDLE h, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        DWORD read = 0;
        DWORD avail = 0;
        DWORD chunk;

        if (!PeekNamedPipe(h, NULL, 0, NULL, &avail, NULL)) {
            return FALSE;
        }
        if (avail == 0) {
            Sleep(20);
            continue;
        }

        chunk = (DWORD)(len - off);
        if (chunk > avail) chunk = avail;
        if (chunk > 0x100000) chunk = 0x100000;
        if (!ReadFile(h, buf + off, chunk, &read, NULL) || read == 0) {
            return FALSE;
        }
        off += (SIZE_T)read;
    }
    return TRUE;
}
/* 使用 WriteFile 向管道/文件句柄写入指定字节数 */
static BOOL CascadeWriteFileAll(HANDLE h, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        DWORD written = 0;
        DWORD chunk = (DWORD)((len - off) > 0x100000 ? 0x100000 : (len - off));
        if (!WriteFile(h, buf + off, chunk, &written, NULL) || written == 0) {
            return FALSE;
        }
        off += (SIZE_T)written;
    }
    return TRUE;
}

/*
 * 同步读管道（overlapped 感知）。
 * 若 CascadeIo 已关联事件对象，则使用 overlapped I/O 等待完成。
 */
static BOOL CascadePipeReadAll(CascadeIo* io, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    HANDLE ev;

    if (!io || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    ev = io->read_event;

    while (off < len) {
        DWORD read_bytes = 0;
        DWORD chunk = (DWORD)((len - off) > 0x100000 ? 0x100000 : (len - off));

        if (ev) {
            ZeroMemory(&io->read_olap, sizeof(io->read_olap));
            io->read_olap.hEvent = ev;
            ResetEvent(ev);
        }

        if (!ReadFile(io->pipe, buf + off, chunk, &read_bytes, ev ? &io->read_olap : NULL)) {
            if (ev && GetLastError() == ERROR_IO_PENDING) {
                if (WaitForSingleObject(ev, INFINITE) != WAIT_OBJECT_0) return FALSE;
                if (!GetOverlappedResult(io->pipe, &io->read_olap, &read_bytes, FALSE)) return FALSE;
            } else {
                return FALSE;
            }
        }
        if (read_bytes == 0) return FALSE;
        off += (SIZE_T)read_bytes;
    }
    return TRUE;
}

/*
 * 同步写管道（overlapped 感知）。
 * 若 CascadeIo 已关联事件对象，则使用 overlapped I/O 等待完成。
 */
static BOOL CascadePipeWriteAll(CascadeIo* io, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    HANDLE ev;

    if (!io || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    ev = io->write_event;

    while (off < len) {
        DWORD written = 0;
        DWORD chunk = (DWORD)((len - off) > 0x100000 ? 0x100000 : (len - off));

        if (ev) {
            ZeroMemory(&io->write_olap, sizeof(io->write_olap));
            io->write_olap.hEvent = ev;
            ResetEvent(ev);
        }

        if (!WriteFile(io->pipe, buf + off, chunk, &written, ev ? &io->write_olap : NULL)) {
            if (ev && GetLastError() == ERROR_IO_PENDING) {
                if (WaitForSingleObject(ev, INFINITE) != WAIT_OBJECT_0) return FALSE;
                if (!GetOverlappedResult(io->pipe, &io->write_olap, &written, FALSE)) return FALSE;
            } else {
                return FALSE;
            }
        }
        if (written == 0) return FALSE;
        off += (SIZE_T)written;
    }
    return TRUE;
}
VOID CascadeFrameReaderInit(CascadeFrameReader* reader)
{
    if (!reader) return;
    ZeroMemory(reader, sizeof(*reader));
    BbInit(&reader->body);
}

/* 释放帧读取器持有的 body 缓冲区 */
VOID CascadeFrameReaderFree(CascadeFrameReader* reader)
{
    if (!reader) return;
    BbFree(&reader->body);
}

/*
 * 增量帧解析：将收到的数据喂入帧读取器。
 * 状态 0 累积 16 字节头部，状态 1 累积 body。
 * 返回消费字节数；出错返回 -1；无完整帧返回 0。
 */
INT CascadeFrameReaderFeed(CascadeFrameReader* reader, const BYTE8* data, SIZE_T len,
                           UINT16* cmd, ByteBuf* body)
{
    SIZE_T consumed = 0;

    if (!reader || !data || len == 0 || !cmd || !body) return -1;
    *cmd = 0;

    while (consumed < len) {
        if (reader->state == 0) {
            SIZE_T need = 16 - reader->hdr_off;
            SIZE_T avail = len - consumed;
            SIZE_T chunk = avail < need ? avail : need;

            CopyMemory(reader->hdr_buf + reader->hdr_off, data + consumed, chunk);
            reader->hdr_off += chunk;
            consumed += chunk;

            if (reader->hdr_off < 16) break;

            {
                UINT32 length = ReadBe32(reader->hdr_buf);
                UINT32 magic = ReadBe32(reader->hdr_buf + 4);
                UINT16 version = ReadBe16(reader->hdr_buf + 8);
                UINT32 body_len = ReadBe32(reader->hdr_buf + 12);

                if (magic != CASCADE_FRAME_MAGIC || version != CASCADE_FRAME_VERSION ||
                    length < 12 || length > CASCADE_MAX_FRAME_SIZE ||
                    body_len != length - 12) {
                    return -1;
                }

                reader->body_len = body_len;

                if (body_len == 0) {
                    *cmd = ReadBe16(reader->hdr_buf + 10);
                    BbInit(body);
                    reader->hdr_off = 0;
                    reader->state = 0;
                    return (INT)consumed;
                }

                BbFree(&reader->body);
                BbInit(&reader->body);
                if (!BbReserve(&reader->body, body_len)) {
                    return -1;
                }
                reader->state = 1;
                reader->body_off = 0;
            }
        } else {
            SIZE_T need = reader->body_len - reader->body_off;
            SIZE_T avail = len - consumed;
            SIZE_T chunk = avail < need ? avail : need;

            CopyMemory(reader->body.data + reader->body_off, data + consumed, chunk);
            reader->body_off += chunk;
            consumed += chunk;

            if (reader->body_off >= reader->body_len) {
                reader->body.len = reader->body_len;
                *cmd = ReadBe16(reader->hdr_buf + 10);
                *body = reader->body;
                BbInit(&reader->body);
                reader->hdr_off = 0;
                reader->state = 0;
                return (INT)consumed;
            }
        }
    }

    return (INT)consumed > 0 ? (INT)consumed : 0;
}

/*
 * 阻塞式帧读取，用于 HELLO 握手阶段。
 * 先读 4 字节长度，再读 12 字节固定头部，最后读 body。
 */
BOOL CascadeIoReadFrame(CascadeIo* io, UINT16* cmd, ByteBuf* body)
{
    BYTE8 hdr[4];
    BYTE8 fixed[12];
    UINT32 length;
    UINT32 magic;
    UINT16 version;
    UINT32 body_len;

    if (!io || !cmd || !body) return FALSE;
    BbInit(body);

    if (io->kind == CASCADE_IO_TCP) {
        if (!CascadeRecvAll(io->sock, hdr, sizeof(hdr))) return FALSE;
    } else if (io->kind == CASCADE_IO_PIPE) {
        if (!CascadePipeReadAll(io, hdr, sizeof(hdr))) return FALSE;
    } else {
        return FALSE;
    }

    length = ReadBe32(hdr);
    if (length < sizeof(fixed) || length > CASCADE_MAX_FRAME_SIZE) {
        return FALSE;
    }

    if (io->kind == CASCADE_IO_TCP) {
        if (!CascadeRecvAll(io->sock, fixed, sizeof(fixed))) return FALSE;
    } else {
        if (!CascadePipeReadAll(io, fixed, sizeof(fixed))) return FALSE;
    }

    magic = ReadBe32(fixed);
    version = ReadBe16(fixed + 4);
    *cmd = ReadBe16(fixed + 6);
    body_len = ReadBe32(fixed + 8);

    if (magic != CASCADE_FRAME_MAGIC || version != CASCADE_FRAME_VERSION ||
        body_len != length - sizeof(fixed)) {
        return FALSE;
    }

    if (body_len) {
        if (!BbReserve(body, body_len)) {
            return FALSE;
        }
        if (io->kind == CASCADE_IO_TCP) {
            if (!CascadeRecvAll(io->sock, body->data, body_len)) {
                BbFree(body);
                return FALSE;
            }
        } else {
            if (!CascadePipeReadAll(io, body->data, body_len)) {
                BbFree(body);
                return FALSE;
            }
        }
        body->len = body_len;
    }

    return TRUE;
}

/*
 * 阻塞式帧写入，带写锁保护。
 * 组装 [4字节长度][12字节固定头][body] 后发送。
 */
BOOL CascadeIoWriteFrame(CascadeIo* io, UINT16 cmd, const ByteBuf* body)
{
    ByteBuf frame;
    BYTE8 outer[4];
    BYTE8 fixed[12];
    UINT32 body_len;
    BOOL ok = FALSE;

    if (!io) return FALSE;
    body_len = (UINT32)(body ? body->len : 0);
    if (body_len > CASCADE_MAX_FRAME_SIZE - sizeof(fixed)) return FALSE;

    BbInit(&frame);
    WriteBe32(outer, sizeof(fixed) + body_len);
    WriteBe32(fixed, CASCADE_FRAME_MAGIC);
    WriteBe16(fixed + 4, CASCADE_FRAME_VERSION);
    WriteBe16(fixed + 6, cmd);
    WriteBe32(fixed + 8, body_len);

    if (!BbAppend(&frame, outer, sizeof(outer)) ||
        !BbAppend(&frame, fixed, sizeof(fixed)) ||
        (body_len && !BbAppend(&frame, body->data, body_len))) {
        BbFree(&frame);
        return FALSE;
    }

    EnterCriticalSection(&io->write_lock);
    if (io->kind == CASCADE_IO_TCP) {
        ok = CascadeSendAll(io->sock, frame.data, frame.len);
    } else if (io->kind == CASCADE_IO_PIPE) {
        ok = CascadePipeWriteAll(io, frame.data, frame.len);
    }
    LeaveCriticalSection(&io->write_lock);

    BbFree(&frame);
    return ok;
}
