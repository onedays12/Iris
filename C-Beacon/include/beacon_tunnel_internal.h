/*
 * beacon_tunnel_internal.h - 隧道子系统的内部接口
 *
 * 把原本集中在 tunnel.c 的实现拆成三个文件后，需要跨文件调用的
 * 辅助函数在此声明。对外公共 API 仍由 beacon_tunnel.h 暴露。
 *
 *   tunnel_frame.c  —— 帧编解码、字符串工具、错误码映射
 *   tunnel_client.c —— 主动拨号、套接字发送
 *   tunnel_server.c —— 管理器生命周期、通道管理、工作线程、命令处理
 */
#pragma once

#include "beacon_tunnel.h"
#include "beacon_commands.h"
#include "beacon_context.h"

/* ===== tunnel_frame.c ===== */

/* 返回空数据包列表（无条目） */
PacketList TunnelEmptyList(VOID);

/* 返回包含单个文本结果的数据包列表 */
PacketList TunnelTextResult(const CHAR* text);

/* 释放各请求中堆分配的字段 */
VOID TunnelFreeStart(TunnelStartRequest* req);
VOID TunnelFreeControl(TunnelControlRequest* req);
VOID TunnelFreeData(TunnelDataRequest* req);

/* 规范化并验证请求；失败时填充 error */
INT TunnelNormalizeStart(TunnelStartRequest* req, CHAR* error, SIZE_T error_len);
INT TunnelNormalizeControl(TunnelControlRequest* req, CHAR* error, SIZE_T error_len);

/* 从二进制解析器解析请求 */
INT TunnelParseStart(Parser* parser, TunnelStartRequest* req, CHAR* error, SIZE_T error_len);
INT TunnelParseControl(Parser* parser, TunnelControlRequest* req, const CHAR* action_override,
                       CHAR* error, SIZE_T error_len);
INT TunnelParseData(Parser* parser, TunnelDataRequest* req, CHAR* error, SIZE_T error_len);

/* 将请求打包为 ByteBuf */
ByteBuf TunnelPackStart(const TunnelStartRequest* req);
ByteBuf TunnelPackControl(const CHAR* tunnel_id, const CHAR* channel_id, const CHAR* action, INT reason);
ByteBuf TunnelPackData(const CHAR* tunnel_id, const CHAR* channel_id, const BYTE8* data, SIZE_T len);

/* 将 Winsock 错误码映射为隧道原因码 */
INT TunnelWsaReason(INT err);

/* ===== tunnel_client.c ===== */

/* 解析并连接到目标地址，返回已连接的套接字 */
SOCKET TunnelDialTarget(const TunnelStartRequest* req, INT* reason);

/* 在套接字上发送全部数据；成功返回 1 */
INT TunnelSendAll(SOCKET s, const BYTE8* data, SIZE_T len);

/* ===== tunnel_server.c 内部使用，不导出 =====
 * TunnelPushControlPacket / TunnelPushDataPacket / TunnelSend*Packet /
 * TunnelFindLocked / TunnelFindJobLocked / TunnelCloseChannel /
 * TunnelManagerAdd / TunnelWorker / TunnelCleanup* 都留在 server.c 内 static。
 */
