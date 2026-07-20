#pragma once

#include "beacon_common.h"

/* 会话密钥种子长度（经 HKDF-like expand 派生为 32 字节后用于 AES-256-GCM） */
#define BEACON_SESSION_KEY_SIZE 16u

/* 生成密码学安全随机字节 */
INT CryptoRandom(VOID* out, SIZE_T len);

/* 生成密码学安全随机 uint32 */
UINT32 CryptoRandomU32(VOID);

/* 计算文件 SHA-256 摘要，可选输出文件大小 */
INT CryptoSha256File(const WCHAR* path, ByteBuf* digest, UINT64* size_out);

/* AES-GCM 加密心跳数据（使用 root_key 派生密钥） */
INT CryptoEncryptHeartbeat(const CHAR* root_key, const ByteBuf* plain, ByteBuf* out);

/* AES-GCM 解密任务数据（使用 session_key） */
INT CryptoDecryptTask(const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* env, ByteBuf* out);

/* AES-GCM 加密结果数据（使用 session_key） */
INT CryptoEncryptResult(const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* plain, ByteBuf* out);
