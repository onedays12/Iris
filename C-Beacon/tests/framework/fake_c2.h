#pragma once

#include "beacon_agent_internal.h"

typedef struct BeaconTestFakeC2 {
    UINT32 task_count;
    UINT32 result_count;
    SIZE_T last_result_size;
    SIZE_T last_plain_result_size;
    BOOL result_decrypt_ok;
    BOOL send_ok;
} BeaconTestFakeC2;

VOID BeaconTestFakeC2Init(BeaconTestFakeC2* c2);
INT BeaconTestFakeC2Send(BeaconContext* ctx, VOID* sender,
                         const ByteBuf* encrypted, ByteBuf* response);
