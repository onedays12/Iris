#pragma once

#include "beacon_common.h"

/* HTTP 传输配置 */
typedef struct HttpProfile {
    CHAR method[16];
    CHAR target[256];
    CHAR uri[256];
    CHAR host_header[256];
    CHAR response_headers[1024];
    CHAR hb_header[64];
    CHAR hb_prefix[64];
    CHAR user_agent[256];
    CHAR content_type[128];
    CHAR encrypt_key[128];
    CHAR ssl_cert[1024];
    CHAR ssl_key[2048];
    INT ssl;
    INT x_forwarded_for;
    INT reconnect_count;
    INT reconnect_time_ms;
} HttpProfile;

typedef enum SleepObfTechnique {
    SLEEP_OBF_NONE = 0,
    SLEEP_OBF_EKKO = 1,
    SLEEP_OBF_ZILEAN = 2
} SleepObfTechnique;

/* Beacon 通信配置 */
typedef struct Profile {
    CHAR listener_name[128];
    CHAR listener_type[64];
    CHAR protocol[32];
    CHAR format[32];
    INT sleep_ms;
    INT jitter;
    INT conn_timeout_sec;
    BOOL sleep_obf_enabled;
    SleepObfTechnique sleep_obf_technique;
    HttpProfile http;
} Profile;

VOID ProfileLoad(Profile* profile);
