#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#define POSTEX_PIPE_NAME_MAX 128u
#define POSTEX_MODULE_ARGS_MAX 512u

#define POSTEX_CONFIG_MAGIC 0x32584550u
#define POSTEX_CONFIG_VERSION 2u
#define POSTEX_CONFIG_FLAG_REMOTE 0x00000001u

#define POSTEX_CONFIG_CONTROL_CANCEL 0x00000001u

#define POSTEX_CANCEL_REASON_USER    1u
#define POSTEX_CANCEL_REASON_TIMEOUT 2u
#define POSTEX_CANCEL_REASON_IDLE    3u

#define POSTEX_OUTPUT_FRAME 2u

#define POSTEX_FRAME_MAGIC 0x46584550u
#define POSTEX_FRAME_VERSION 1u

#define POSTEX_FRAME_TYPE_TEXT     1u
#define POSTEX_FRAME_TYPE_ERROR    2u
#define POSTEX_FRAME_TYPE_METADATA 3u
#define POSTEX_FRAME_TYPE_PROGRESS 4u
#define POSTEX_FRAME_TYPE_ARTIFACT 5u
#define POSTEX_FRAME_TYPE_DONE     6u

#define POSTEX_ERROR_GENERIC       1u
#define POSTEX_ERROR_INVALID_ARGS  2u
#define POSTEX_ERROR_OPEN_PROCESS  3u
#define POSTEX_ERROR_REMOTE_START  4u
#define POSTEX_ERROR_PIPE_IO       5u
#define POSTEX_ERROR_MODULE        6u
#define POSTEX_ERROR_CANCELLED     7u

#define POSTEX_STAGE_GENERAL       0u
#define POSTEX_STAGE_PARSE_ARGS    10u
#define POSTEX_STAGE_OPEN_PIPE     20u
#define POSTEX_STAGE_MODULE_RUN    30u
#define POSTEX_STAGE_DONE          150u
#define POSTEX_STAGE_CANCELLED     151u

typedef struct PostExConfig {
    DWORD magic;
    DWORD version;
    DWORD flags;
    volatile DWORD stage;
    volatile DWORD last_error;
    WCHAR pipe_name[POSTEX_PIPE_NAME_MAX];
    DWORD output_format;
    CHAR args[POSTEX_MODULE_ARGS_MAX];
    volatile DWORD control_flags;
    volatile DWORD cancel_reason;
} PostExConfig;

typedef struct PostExFrameHeader {
    DWORD magic;
    DWORD version;
    DWORD type;
    DWORD flags;
    DWORD seq;
    DWORD length;
} PostExFrameHeader;
