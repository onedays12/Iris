#pragma once

#include "beacon_context.h"

typedef struct Agent {
    BeaconContext ctx;
    WSADATA wsa;
    volatile LONG stop;
    INT initialized;
    INT wsa_started;
} Agent;

INT AgentInit(Agent* agent);
INT AgentRun(Agent* agent);
VOID AgentStop(Agent* agent);
VOID AgentFree(Agent* agent);
