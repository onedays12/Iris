#include "beacon_test.h"
#include "fake_c2.h"

VOID BeaconTestScenarioTaskOutboxFlow(VOID)
{
    BeaconContext ctx;
    ByteBuf task;
    ByteBuf payload;
    ByteBuf task_plain;
    ByteBuf encrypted_tasks;
    ByteBuf packed_payload;
    ByteBuf packed_task;
    BeaconTestFakeC2 c2;
    BeaconTestFaultPlan* faults;

    BeaconTestFakeC2Init(&c2);
    BeaconTestConfigureRandomFailure(0);
    TEST_ASSERT(ContextInit(&ctx));
    if (!ctx.active) return;

    payload = BbFromText("");
    BbInit(&task);
    PacketArrayI32(&task, 1001);
    PacketArrayI32(&task, BEACON_COMMAND_PWD);
    packed_payload = PacketPackBytes(&payload);
    PacketArrayBytes(&task, packed_payload.data, packed_payload.len);
    BbFree(&packed_payload);
    BbFree(&payload);

    BbInit(&task_plain);
    packed_task = PacketPackBytes(&task);
    PacketArrayBytes(&task_plain, packed_task.data, packed_task.len);
    BbFree(&packed_task);
    BbFree(&task);

    BbInit(&encrypted_tasks);
    TEST_ASSERT(CryptoTestEncryptTask(ctx.session_key, sizeof(ctx.session_key),
                                      &task_plain, &encrypted_tasks));
    AgentDispatchTasks(&ctx, &encrypted_tasks);
    TEST_ASSERT(ctx.outbox.count == 1);
    TEST_ASSERT(BeaconTestTraceHas(BeaconTestGetTrace(), BEACON_TEST_EVENT_OUTBOX_ENQUEUE));

    faults = BeaconTestGetFaultPlan();
    if (faults) faults->point = BEACON_TEST_FAULT_NONE;
    TEST_ASSERT(AgentFlushOutbox(&ctx, BeaconTestFakeC2Send, &c2));
    TEST_ASSERT(ctx.outbox.count == 0);
    TEST_ASSERT(c2.result_count == 1);
    TEST_ASSERT(c2.last_result_size > 0);
    TEST_ASSERT(c2.result_decrypt_ok);
    TEST_ASSERT(c2.last_plain_result_size > 0);

    BbFree(&encrypted_tasks);
    BbFree(&task_plain);
    ContextFree(&ctx);
}
