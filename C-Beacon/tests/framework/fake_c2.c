#include "fake_c2.h"

VOID BeaconTestFakeC2Init(BeaconTestFakeC2* c2)
{
    if (!c2) return;
    ZeroMemory(c2, sizeof(*c2));
    c2->send_ok = TRUE;
}

INT BeaconTestFakeC2Send(BeaconContext* ctx, VOID* sender,
                         const ByteBuf* encrypted, ByteBuf* response)
{
    BeaconTestFakeC2* c2 = (BeaconTestFakeC2*)sender;
    ByteBuf plain;

    if (!c2 || !encrypted || !response) return FALSE;
    BbInit(response);
    ++c2->result_count;
    c2->last_result_size = encrypted->len;
    BbInit(&plain);
    c2->result_decrypt_ok = CryptoTestDecryptResult(ctx->session_key,
                                                    sizeof(ctx->session_key),
                                                    encrypted, &plain);
    if (c2->result_decrypt_ok) {
        c2->last_plain_result_size = plain.len;
    }
    BbFree(&plain);
    return c2->send_ok && c2->result_decrypt_ok;
}
