#pragma once

#include "beacon_cascade.h"
#include "beacon_context.h"

CascadeChannel* CascadeFindLocked(CascadeManager* cm, const CHAR* child_id);
VOID CascadeQueueDead(CascadeManager* cm, const CHAR* child_id, const CHAR* reason);
ByteBuf CascadeRegisterChannel(BeaconContext* ctx, const CHAR* child_id,
                               UINT32 protocol, const CHAR* hint,
                               CascadeIo* io);
