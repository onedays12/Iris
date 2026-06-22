#include "beacon_cascade.h"

#include "beacon_context.h"

/* ===== CascadeIo 生命周期 ===== */

/* 初始化 CascadeIo 结构，套接字和管道句柄设为无效值 */
VOID CascadeIoInit(CascadeIo* io)
{
    if (!io) return;

    ZeroMemory(io, sizeof(*io));
    io->sock = INVALID_SOCKET;
    io->pipe = INVALID_HANDLE_VALUE;
    io->event = WSA_INVALID_EVENT;
    io->read_event = NULL;
    io->write_event = NULL;
    InitializeCriticalSection(&io->write_lock);
    io->lock_initialized = 1;
}

/* 关闭 CascadeIo，释放套接字/管道/事件及临界区 */
VOID CascadeIoClose(CascadeIo* io)
{
    if (!io) return;

    if (io->kind == CASCADE_IO_TCP && io->sock != INVALID_SOCKET) {
        WSAEventSelect(io->sock, NULL, 0);
        shutdown(io->sock, SD_BOTH);
        closesocket(io->sock);
        io->sock = INVALID_SOCKET;
    }
    if (io->kind == CASCADE_IO_PIPE && io->pipe != INVALID_HANDLE_VALUE) {
        if (io->read_pending) {
            CancelIo(io->pipe);
            io->read_pending = FALSE;
        }
        CloseHandle(io->pipe);
        io->pipe = INVALID_HANDLE_VALUE;
    }
    if (io->event != WSA_INVALID_EVENT && io->event != NULL) {
        WSACloseEvent(io->event);
        io->event = WSA_INVALID_EVENT;
    }
    if (io->read_event) {
        CloseHandle(io->read_event);
        io->read_event = NULL;
    }
    if (io->write_event) {
        CloseHandle(io->write_event);
        io->write_event = NULL;
    }
    io->kind = CASCADE_IO_NONE;

    if (InterlockedExchange(&io->lock_initialized, 0)) {
        DeleteCriticalSection(&io->write_lock);
    }
}

/* 获取 CascadeIo 关联的事件句柄（供 WaitForSingleObject 使用） */
HANDLE CascadeIoEvent(CascadeIo* io)
{
    if (!io) return NULL;
    if (io->kind == CASCADE_IO_PIPE) return io->read_event;
    if (io->event == WSA_INVALID_EVENT) return NULL;
    return (HANDLE)io->event;
}
