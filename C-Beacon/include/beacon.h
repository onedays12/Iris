#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif

#include "beacon_agent.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Beacon 入口点：初始化并运行代理主循环 */
INT BeaconRun(Agent* agent);

#ifdef __cplusplus
}
#endif
