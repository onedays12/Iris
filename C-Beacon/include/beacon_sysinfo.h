#pragma once

#include "beacon_common.h"

/* 从主机收集的系统信息 */
typedef struct MetaData {
    CHAR os[128];
    CHAR arch[32];
    CHAR hostname[128];
    CHAR username[256];
    CHAR internal_ip[64];
    CHAR process_name[260];
    UINT32 pid;
    INT is_admin;
    UINT32 acp;
} MetaData;

VOID SysinfoCollect(MetaData* meta);
