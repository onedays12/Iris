#include "beacon_cascade.h"

#include "beacon_cascade_internal.h"
#include "beacon_context.h"

/* ===== CascadeIoOps 查表 ===== */

/* 按 io->kind 返回对应后端 ops；未知 kind 返回 NULL。*/
const CascadeIoOps* CascadeIoOpsForKind(UINT32 kind)
{
    switch (kind) {
        case CASCADE_IO_TCP:  return &g_cascade_io_tcp_ops;
        case CASCADE_IO_PIPE: return &g_cascade_io_pipe_ops;
        default:              return NULL;
    }
}

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

/* 关闭 CascadeIo：委托 ops->Close 关闭后端资源，再释放共享资源与锁 */
VOID CascadeIoClose(CascadeIo* io)
{
    const CascadeIoOps* ops;

    if (!io) return;

    ops = CascadeIoOpsForKind(io->kind);
    if (ops && ops->Close) {
        ops->Close(io);
    }
    io->kind = CASCADE_IO_NONE;

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

    if (InterlockedExchange(&io->lock_initialized, 0)) {
        DeleteCriticalSection(&io->write_lock);
    }
}

/* 获取 CascadeIo 关联的事件句柄（供 WaitForSingleObject 使用） */
HANDLE CascadeIoEvent(CascadeIo* io)
{
    const CascadeIoOps* ops;

    if (!io) return NULL;
    ops = CascadeIoOpsForKind(io->kind);
    if (ops && ops->GetEvent) {
        return ops->GetEvent(io);
    }
    return NULL;
}
