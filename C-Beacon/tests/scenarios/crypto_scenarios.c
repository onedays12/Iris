#include "beacon_test.h"

VOID BeaconTestScenarioCryptoAndJitterFailure(VOID)
{
    ByteBuf plain;
    ByteBuf encrypted;
    Profile profile;
    UINT32 value = 0xA5A5A5A5u;
    BOOL ok;
    const BeaconTestFaultPlan* faults;

    plain = BbFromText("test");
    BeaconTestConfigureRandomFailure(1);
    ok = CryptoRandomU32(&value);
    TEST_ASSERT(!ok);
    TEST_ASSERT(value == 0xA5A5A5A5u);

    BeaconTestConfigureRandomZero(TRUE);
    ok = CryptoRandomU32(&value);
    TEST_ASSERT(ok);
    TEST_ASSERT(value == 0);

    BeaconTestConfigureRandomFailure(1);
    BbInit(&encrypted);
    ok = CryptoEncryptHeartbeat("test-key", &plain, &encrypted);
    TEST_ASSERT(!ok);
    TEST_ASSERT(encrypted.data == NULL);
    TEST_ASSERT(encrypted.len == 0);
    faults = BeaconTestGetFaultPlan();
    TEST_ASSERT(faults && faults->call_count == 1);

    ZeroMemory(&profile, sizeof(profile));
    profile.sleep_ms = 1000;
    profile.jitter = 25;
    BeaconTestConfigureRandomFailure(1);
    TEST_ASSERT(SleepCalculateWithJitter(&profile) == 1000);

    BbFree(&plain);
}
