#include "beacon_cascade.h"

#include "beacon_context.h"

/* ===== Pipe 连接与监听 ===== */

/* 主动连接命名管道（SMB 级联），使用 overlapped I/O */
BOOL CascadeIoConnectPipe(const CHAR* pipe_path, INT timeout_ms, CascadeIo* out)
{
    WCHAR* wide;
    HANDLE h;
    DWORD mode = PIPE_READMODE_BYTE;

    if (!pipe_path || !out) return FALSE;

    CascadeIoInit(out);
    wide = Utf8ToWide(pipe_path);
    if (!wide) {
        CascadeIoClose(out);
        return FALSE;
    }

    if (timeout_ms > 0) {
        WaitNamedPipeW(wide, (DWORD)timeout_ms);
    }

    h = CreateFileW(wide, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS, NULL);
    HeapFree(GetProcessHeap(), 0, wide);
    if (h == INVALID_HANDLE_VALUE) {
        CascadeIoClose(out);
        return FALSE;
    }

    SetNamedPipeHandleState(h, &mode, NULL, NULL);
    out->kind = CASCADE_IO_PIPE;
    out->pipe = h;
    out->read_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    out->write_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!out->read_event || !out->write_event) {
        CascadeIoClose(out);
        return FALSE;
    }
    return TRUE;
}

/* 阻塞式管道接受连接：创建命名管道并等待客户端连接 */
BOOL CascadeIoAcceptPipe(const CHAR* pipe_name, CascadeIo* out)
{
    WCHAR* wide;
    HANDLE h;
    BOOL connected;

    if (!pipe_name || !out) return FALSE;

    CascadeIoInit(out);
    wide = Utf8ToWide(pipe_name);
    if (!wide) {
        CascadeIoClose(out);
        return FALSE;
    }

    h = CreateNamedPipeW(wide,
                         PIPE_ACCESS_DUPLEX,
                         PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                         1,
                         65536,
                         65536,
                         0,
                         NULL);
    HeapFree(GetProcessHeap(), 0, wide);
    if (h == INVALID_HANDLE_VALUE) {
        CascadeIoClose(out);
        return FALSE;
    }

    connected = ConnectNamedPipe(h, NULL) ? TRUE : (GetLastError() == ERROR_PIPE_CONNECTED);
    if (!connected) {
        CloseHandle(h);
        CascadeIoClose(out);
        return FALSE;
    }

    out->kind = CASCADE_IO_PIPE;
    out->pipe = h;
    out->read_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    out->write_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!out->read_event || !out->write_event) {
        CascadeIoClose(out);
        return FALSE;
    }
    return TRUE;
}

/* 启用管道异步读事件：创建事件对象并关联 overlapped 结构 */
BOOL CascadeIoEnablePipeReadEvent(CascadeIo* io)
{
    if (!io || io->kind != CASCADE_IO_PIPE || io->pipe == INVALID_HANDLE_VALUE) return FALSE;
    if (!io->read_event) {
        io->read_event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!io->read_event) return FALSE;
    }
    if (!io->write_event) {
        io->write_event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!io->write_event) return FALSE;
    }
    ZeroMemory(&io->read_olap, sizeof(io->read_olap));
    io->read_olap.hEvent = io->read_event;
    io->read_pending = FALSE;
    return TRUE;
}

/*
 * 创建命名管道并开始异步监听连接。
 * 使用 overlapped ConnectNamedPipe 等待客户端连接。
 */
static BOOL CascadePipeCreateAndListen(const CHAR* pipe_name, CascadePipeListener* out)
{
    WCHAR* wide;
    HANDLE h;

    if (!pipe_name || !out) return FALSE;

    wide = Utf8ToWide(pipe_name);
    if (!wide) return FALSE;

    h = CreateNamedPipeW(wide,
                         PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
                         PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                         1,
                         65536,
                         65536,
                         0,
                         NULL);
    HeapFree(GetProcessHeap(), 0, wide);
    if (h == INVALID_HANDLE_VALUE) {
        DebugPrintf("[!] CreateNamedPipeW failed: %lu\n", (unsigned long)GetLastError());
        return FALSE;
    }
    DebugPrintf("[*] CreateNamedPipeW success: handle=%p\n", h);

    out->pipe = h;
    if (!out->event) {
        out->event = CreateEventW(NULL, TRUE, FALSE, NULL);
        if (!out->event) {
            CloseHandle(h);
            out->pipe = INVALID_HANDLE_VALUE;
            return FALSE;
        }
    }

    ZeroMemory(&out->olap, sizeof(out->olap));
    out->olap.hEvent = out->event;
    ResetEvent(out->event);

    if (ConnectNamedPipe(h, &out->olap)) {
        out->pending_connect = FALSE;
        DebugPrintf("[*] ConnectNamedPipe: immediate success\n");
        return TRUE;
    }

    {
        DWORD err = GetLastError();
        DebugPrintf("[*] ConnectNamedPipe: error=%lu\n", (unsigned long)err);
        if (err == ERROR_IO_PENDING) {
            out->pending_connect = TRUE;
            return TRUE;
        }
        if (err == ERROR_PIPE_CONNECTED) {
            out->pending_connect = FALSE;
            SetEvent(out->event);
            return TRUE;
        }
    }

    DebugPrintf("[!] ConnectNamedPipe failed: %lu\n", (unsigned long)GetLastError());
    CloseHandle(h);
    out->pipe = INVALID_HANDLE_VALUE;
    return FALSE;
}

/* 初始化管道监听器结构 */
VOID CascadePipeListenerInit(CascadePipeListener* listener)
{
    if (!listener) return;
    ZeroMemory(listener, sizeof(*listener));
    listener->pipe = INVALID_HANDLE_VALUE;
}

/* 关闭管道监听器，取消挂起的 I/O 并释放句柄 */
VOID CascadePipeListenerClose(CascadePipeListener* listener)
{
    if (!listener) return;
    if (listener->pipe != INVALID_HANDLE_VALUE) {
        CancelIo(listener->pipe);
        CloseHandle(listener->pipe);
        listener->pipe = INVALID_HANDLE_VALUE;
    }
    if (listener->event) {
        CloseHandle(listener->event);
        listener->event = NULL;
    }
    listener->pending_connect = FALSE;
}

/* 获取管道监听器的事件句柄 */
HANDLE CascadePipeListenerEvent(CascadePipeListener* listener)
{
    if (!listener || !listener->event) return NULL;
    return listener->event;
}

/* 开始管道监听（委托给 CascadePipeCreateAndListen） */
BOOL CascadePipeListen(const CHAR* pipe_name, CascadePipeListener* out)
{
    if (!pipe_name || !out) return FALSE;
    DebugPrintf("[*] CascadePipeListen: pipe=%s\n", pipe_name);
    return CascadePipeCreateAndListen(pipe_name, out);
}

/*
 * 事件驱动接受管道连接。
 * 完成挂起的 ConnectNamedPipe 后将管道所有权转移到 CascadeIo。
 */
BOOL CascadePipeAcceptReady(CascadePipeListener* listener, CascadeIo* out)
{
    DWORD dummy;

    if (!listener || !out || listener->pipe == INVALID_HANDLE_VALUE) return FALSE;

    if (listener->pending_connect) {
        if (!GetOverlappedResult(listener->pipe, &listener->olap, &dummy, FALSE)) {
            return FALSE;
        }
        listener->pending_connect = FALSE;
    }

    CascadeIoInit(out);
    out->kind = CASCADE_IO_PIPE;
    out->pipe = listener->pipe;
    listener->pipe = INVALID_HANDLE_VALUE;
    return TRUE;
}
