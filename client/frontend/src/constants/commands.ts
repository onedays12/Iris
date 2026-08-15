/**
 * 命令常量定义
 * 与 TeamServer 后端保持一致的指令 ID 映射表、指令名称映射、
 * 以及 Tab 补全所需的命令元数据。
 */

// ─── 指令 ID 映射 ───

export const COMMAND_ID = {
  // 通用控制 (1-9)
  SLEEP: 1,
  EXIT: 2,

  // 基础执行 (10-19)
  SHELL: 10,
  POWERSHELL: 11,

  // 文件系统 (20-39)
  CD: 20,
  LS: 21,
  PWD: 22,
  CAT: 23,
  MKDIR: 24,
  RM: 25,
  MV: 26,
  CP: 27,

  // 数据传输
  DOWNLOAD: 28,
  UPLOAD: 29,
  SETATTR: 31,
  ZIP: 32,

  // 进程与令牌 / 网络 / 截图 (40-59)
  PS: 40,
  KILLJOB: 41,
  KILL: 42,
  STEAL_TOKEN: 43,
  JOBS: 44,
  WHOAMI: 50,
  SCREENSHOT: 51,
  NETINFO: 52,
  NETSTAT: 53,

  // Cascade 级联 (80-89)
  CASCADE_CONNECT_TCP: 80,
  CONNECT: 80,
  CASCADE_LINK_SMB: 81,
  LINK: 81,
  CASCADE_ROUTE: 82,
  CASCADE_CLOSE: 83,
  CASCADE_OPEN: 84,
  CASCADE_READ: 85,
  CASCADE_DEAD: 86,
  CASCADE_PING: 87,

  // Post-Ex (90, 93)
  POSTEX: 90,
  POSTEX_SPAWN_DLL: 90,
  POSTEX_INJECT_DLL: 90,
  POSTEX_EVENT: 93,

  // Migrate (100)
  MIGRATE: 100,
  SPAWNTO: 100,
  MIGRATE_SPAWN: 100,
  MIGRATE_INJECT: 100,
} as const

export type CommandName = keyof typeof COMMAND_ID
export type CommandId = (typeof COMMAND_ID)[CommandName]

/**
 * 执行与注入 (70+)
 * 职责：供插件动作与 BOF 工件执行链路使用
 */
export const PLUGIN_COMMAND_ID = {
  EXECUTION_BOF: 70,
  POSTEX: COMMAND_ID.POSTEX,
} as const

/**
 * 反向查找表：根据 ID 获取指令名 (用于日志展示等)
 */
export const COMMAND_NAME: Record<string, string> = Object.fromEntries(
  [
    ...Object.entries(COMMAND_ID),
    ...Object.entries(PLUGIN_COMMAND_ID),
  ].map(([key, value]) => [value, key.toLowerCase()])
);

COMMAND_NAME[String(COMMAND_ID.POSTEX)] = 'postex';
COMMAND_NAME[String(COMMAND_ID.MIGRATE)] = 'migrate';

/**
 * 字符串指令名到 ID 的查找助手
 */
export function getCommandId(name: string | null | undefined): CommandId | null {
  if (!name) return null
  const upperName = name.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(COMMAND_ID, upperName)) {
    return COMMAND_ID[upperName as CommandName]
  }
  return null
}

/**
 * 指令帮助清单
 * 职责：为终端获取帮助 (help) 提供文本说明
 */
export interface CommandHelpEntry {
  usage: string
  desc: string
  notes: string
}

export const COMMAND_HELP: Record<string, CommandHelpEntry> = {
  SLEEP: {
    usage: 'sleep <ms> [jitter]',
    desc: '设置 Beacon 心跳间隔和抖动比例',
    notes: '例如: sleep 5000 10 (建议 ms 不要低于 1000)'
  },
  EXIT: {
    usage: 'exit',
    desc: '终止当前 Beacon 会话',
    notes: '此操作将彻底关闭目标上的 Beacon 进程'
  },
  SHELL: {
    usage: 'shell <raw_command>',
    desc: '通过 cmd.exe 执行系统命令',
    notes: '固定只传 1 个原始命令字符串；前端不会按空格拆分。引号、括号、管道、重定向等字符会保留。例如: shell copy "C:\\Temp\\a (1).txt" C:\\Temp\\b.txt'
  },
  POWERSHELL: {
    usage: 'powershell <raw_command>',
    desc: '执行 PowerShell 命令',
    notes: '固定只传 1 个原始命令字符串；前端不会按空格拆分。路径建议使用 -LiteralPath 并保留引号。例如: powershell Copy-Item -LiteralPath "C:\\Users\\Administrator\\Desktop\\inject (2).exe" -Destination "C:\\Users\\Administrator\\Desktop\\message111.exe"'
  },
  CD: {
    usage: 'cd <path>',
    desc: '切换工作目录',
    notes: '支持绝对/相对路径；查看当前路径请使用 pwd'
  },
  LS: {
    usage: 'ls [path]',
    desc: '列出目录内容',
    notes: '若不带路径则列出当前目录'
  },
  PWD: {
    usage: 'pwd',
    desc: '显示当前完整路径',
    notes: '获取 Beacon 所在的当前绝对路径'
  },
  CAT: {
    usage: 'cat <file>',
    desc: '读取并显示文本文件内容',
    notes: '安全限制：最大支持读取 10MB 以内的文件'
  },
  MKDIR: {
    usage: 'mkdir <name>',
    desc: '创建新目录',
    notes: '支持创建单层或多层目录'
  },
  RM: {
    usage: 'rm <path>',
    desc: '删除文件或目录',
    notes: '警告：此操作不可恢复，请谨慎使用'
  },
  MV: {
    usage: 'mv <src> <dst>',
    desc: '移动或重命名文件/目录',
    notes: '跨分区移动可能会触发复制操作'
  },
  CP: {
    usage: 'cp <src> <dst>',
    desc: '复制文件或目录',
    notes: '备份重要文件时的常用指令'
  },
  SETATTR: {
    usage: 'setattr <TargetPath> <ModifyFlag> [new_name] [MTime] [ATime] [CTime] [WinAttributes] [LinuxMode]',
    desc: '修改文件或文件夹属性',
    notes: [
      '参数按前端实际选择的顺序发送，未启用的字段不发送。',
      'ModifyFlag 位掩码：1=new_name，2=MTime，4=ATime，8=CTime，16=WinAttributes，32=LinuxMode。',
      '例如：3 表示同时修改 new_name 和 MTime；16 表示仅修改 Windows 属性。',
      '示例：setattr C:\\test.txt 3 renamed.txt 1730000000'
    ].join('\n')
  },
  ZIP: {
    usage: 'zip <source_path> <zip_path> [overwrite] [include_root]',
    desc: '压缩文件或目录为 ZIP 文件',
    notes: [
      'source_path 为要压缩的文件或目录。',
      'zip_path 为输出 zip 文件路径。',
      'overwrite 默认 0；1 表示覆盖已存在 zip，0 表示已存在时返回失败。',
      'include_root 默认 1；压缩目录时 1 表示包含根目录名，0 表示只压缩目录内容。',
      '例如：zip C:\\Temp\\logs C:\\Temp\\logs.zip 1 1'
    ].join('\n')
  },
  PS: {
    usage: 'ps',
    desc: '列出系统运行中进程',
    notes: '返回 PID, PPID, 名称, 路径等信息'
  },
  KILLJOB: {
    usage: 'killjob <job_id>',
    desc: '停止指定后台 job',
    notes: [
      'job_id 当前等于创建该后台 job 时返回的 task_id。',
      '参数必须是 int32 正整数。',
      '例如：killjob 123'
    ].join('\n')
  },
  KILL: {
    usage: 'kill <PID>',
    desc: '终止指定进程',
    notes: '请确认 PID 正确，强制结束无法撤销'
  },
  STEAL_TOKEN: {
    usage: 'steal_token <PID>',
    desc: '窃取目标进程令牌',
    notes: '提升权限或切换身份时使用'
  },
  JOBS: {
    usage: 'jobs',
    desc: '查看当前 Beacon 后台 job 列表',
    notes: [
      '无参数。',
      '返回当前 Beacon 内存中的后台 job 列表。',
      'job_id 当前等于创建该后台 job 时对应的 task_id。'
    ].join('\n')
  },
  WHOAMI: {
    usage: 'whoami',
    desc: '查看当前用户权限信息',
    notes: '显示当前会话的完整用户信息'
  },
  SCREENSHOT: {
    usage: 'screenshot [monitor_id] [quality]',
    desc: '获取屏幕截图',
    notes: [
      'monitor_id 默认 0，表示主显示器。',
      'quality 默认 80，取值范围 1-100。',
      '前端下发时直接发送参数，Beacon 侧再解析为整数。'
    ].join('\n')
  },
  NETINFO: {
    usage: 'netinfo',
    desc: '列出网络接口信息',
    notes: [
      '无参数。',
      '返回接口索引、名称、MTU、flags、MAC、地址等信息。'
    ].join('\n')
  },
  NETSTAT: {
    usage: 'netstat',
    desc: '列出网络连接快照',
    notes: [
      '无参数。',
      '返回协议、本地/远端地址、状态和 PID。'
    ].join('\n')
  },
  CASCADE_CONNECT_TCP: {
    usage: 'connect [child_id] <host> <port>',
    desc: '通过 TCP 连接子 Beacon',
    notes: 'child_id 可选，留空则由服务端自动分配'
  },
  CASCADE_LINK_SMB: {
    usage: 'link [child_id] <pipe_name>',
    desc: '通过 SMB pipe 连接子 Beacon',
    notes: 'child_id 可选，留空则由服务端自动分配'
  },
  HELP: {
    usage: 'help [command]',
    desc: '显示指令帮助信息',
    notes: '不带参数显示全部，带参数显示特定指令详情'
  },
  POSTEX_SPAWN_DLL: {
    usage: 'postex_spawn_dll <dll_path> <wait_ms> <max_runtime_ms> <idle_timeout_ms> <description> <spawn_path> <spawn_args> [module_args]',
    desc: '创建挂起进程并注入 reflective DLL（读取本地 DLL 文件字节发送给 Beacon）',
    notes: [
      'dll_path: 本地 DLL 文件路径（Client 读取文件字节后发送给 Server）。',
      'wait_ms: 等待连接超时毫秒数，默认 3000。',
      'max_runtime_ms: 最大运行时长，0 表示关闭。',
      'idle_timeout_ms: 无输出空闲超时，0 表示关闭。',
      'description: job 描述，默认 postex。',
      'spawn_path: 目标进程路径，例如 C:\\Windows\\System32\\notepad.exe。',
      'spawn_args: 目标进程启动参数（无参数传 ""）。',
      'module_args: 传递给 DLL 的额外参数（可选，用引号包裹）。',
      '示例：postex_spawn_dll "C:\\tools\\module.x64.dll" 3000 15000 0 refl-spawn "C:\\Windows\\System32\\notepad.exe" "" "--count 100 --delay 1000"'
    ].join('\n')
  },
  POSTEX_INJECT_DLL: {
    usage: 'postex_inject_dll <dll_path> <wait_ms> <max_runtime_ms> <idle_timeout_ms> <description> <pid> [module_args]',
    desc: '注入 reflective DLL 到指定进程（读取本地 DLL 文件字节发送给 Beacon）',
    notes: [
      'dll_path: 本地 DLL 文件路径（Client 读取文件字节后发送给 Server）。',
      'wait_ms: 等待连接超时毫秒数，默认 3000。',
      'max_runtime_ms: 最大运行时长，0 表示关闭。',
      'idle_timeout_ms: 无输出空闲超时，0 表示关闭。',
      'description: job 描述，默认 postex。',
      'pid: 目标进程 PID。',
      'module_args: 传递给 DLL 的额外参数（可选，用引号包裹）。',
      '示例：postex_inject_dll "C:\\tools\\module.x64.dll" 3000 15000 0 refl-inject 43808 "--count 100 --delay 1000"'
    ].join('\n')
  },
  POSTEX_LIST: {
    usage: 'postex_list',
    desc: '列出当前 Beacon 的 Post-Ex job 列表（等同 jobs）',
    notes: 'PostEx job 已接入 jobs 管理器，此命令等同 jobs。'
  },
  POSTEX_KILL: {
    usage: 'postex_kill <job_id>',
    desc: '终止指定 Post-Ex job（等同 killjob）',
    notes: [
      'PostEx job 已接入 jobs 管理器，此命令等同 killjob。',
      '示例：postex_kill 123'
    ].join('\n')
  },
  SPAWNTO: {
    usage: 'spawnto <x86|x64> <spawn_path>',
    desc: '设置当前 Beacon 内存中的默认 migrate spawn path',
    notes: [
      'x64 常用: C:\\Windows\\System32\\cmd.exe',
      'x86 常用: C:\\Windows\\SysWOW64\\cmd.exe',
      '示例: spawnto x64 "C:\\Windows\\System32\\cmd.exe"'
    ].join('\n')
  },
  MIGRATE_SPAWN: {
    usage: 'migrate_spawn <listener> <x86|x64> [spawn_path] [spawn_args]',
    desc: '生成 listener 对应的 direct-stage DLL，并在新进程中执行新 Beacon',
    notes: [
      'listener 是监听器名称，不是 ID；支持 started 的 external HTTP/HTTPS/TCP、internal TCP、internal SMB listener。',
      'external listener 会让新 Beacon 直接回连 TeamServer。',
      'internal TCP listener 会启动 child Beacon，并由父 Beacon 自动 connect；迁移时使用任务专属动态端口，避免误连旧 child。',
      'internal SMB listener 会启动 child Beacon，并由父 Beacon 自动 link 到对应 pipe。',
      'spawn_path 为空字符串时，Beacon 使用当前 arch 对应的 spawnto 默认值。',
      'external 示例: migrate_spawn http-listener x64 "" "/c ping -n 120 127.0.0.1"',
      'internal TCP 示例: migrate_spawn 4444 x64 "" "/c ping -n 120 127.0.0.1"',
      'internal SMB 示例: migrate_spawn beacon_internal x64 "" "/c ping -n 120 127.0.0.1"'
    ].join('\n')
  },
  MIGRATE_INJECT: {
    usage: 'migrate_inject <listener> <x86|x64> <pid>',
    desc: '生成 listener 对应的 direct-stage DLL，并注入到指定 PID 执行新 Beacon',
    notes: [
      'listener 是监听器名称，不是 ID；支持 started 的 external HTTP/HTTPS/TCP、internal TCP、internal SMB listener。',
      'external listener 会让新 Beacon 直接回连 TeamServer。',
      'internal TCP listener 会让新 Beacon 作为当前 Beacon 的 child，通过 TCP 级联上线。',
      'internal SMB listener 会让新 Beacon 作为当前 Beacon 的 child，通过 SMB pipe 级联上线。',
      'pid 架构必须与 x86/x64 参数匹配；x86 Beacon 不能向 x64 目标生成 x64 stage 注入。',
      '示例: migrate_inject http-listener x64 1234',
      '示例: migrate_inject 4444 x64 1234',
      '示例: migrate_inject beacon_internal x86 4321'
    ].join('\n')
  },
};

export const COMMAND_HELP_ALIASES: Record<string, string> = {
  CONNECT: 'CASCADE_CONNECT_TCP',
  LINK: 'CASCADE_LINK_SMB',
}

export const LOCAL_COMMAND_HELP: Record<string, CommandHelpEntry> = {
  'EXEC-BOF': {
    usage: 'exec-bof',
    desc: '打开 BOF 执行窗口',
    notes: '这是控制台本地入口，不直接发送给 Beacon；会弹出 BOF 执行对话框。'
  }
}

const MENU_ACTION_COMMAND_MAP: Record<string, number> = {
  'exec-bof': PLUGIN_COMMAND_ID.EXECUTION_BOF,
}

const PLATFORM_UNSUPPORTED_COMMANDS: Record<string, { names: Set<string>; ids?: Set<number> }> = {
  linux: {
    names: new Set(['powershell']),
  },
}

export type BeaconPlatform = 'windows' | 'linux' | 'darwin' | 'unknown'

export function normalizeBeaconPlatform(os: unknown): BeaconPlatform {
  const text = String(os || '').toLowerCase()
  if (text.includes('windows')) return 'windows'
  if (text.includes('linux')) return 'linux'
  if (text.includes('darwin') || text.includes('mac')) return 'darwin'
  return 'unknown'
}

export function normalizeBeaconArch(arch: unknown): string {
  const text = String(arch || '').trim().toLowerCase()
  if (['amd64', 'x64', 'x86_64'].includes(text)) return 'amd64'
  if (['x86', 'i386', '386'].includes(text)) return 'x86'
  return text || 'unknown'
}

export function isCommandSupportedForOS(command: string | number, os: unknown): boolean {
  const platform = normalizeBeaconPlatform(os)
  const rules = PLATFORM_UNSUPPORTED_COMMANDS[platform]
  if (!rules) return true

  if (typeof command === 'number') {
    if (rules.ids?.has(command)) return false
    const mappedName = String(COMMAND_NAME[command] || '').toLowerCase()
    return mappedName ? !rules.names?.has(mappedName) : true
  }

  const normalizedName = String(command || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  if (!normalizedName) return true
  return !rules.names?.has(normalizedName)
}

export function getSupportedCommandNamesForOS(os: unknown): string[] {
  return Object.keys(COMMAND_ID)
    .map(name => name.toLowerCase())
    .filter(name => isCommandSupportedForOS(name, os))
}

export function getSupportedLocalCommandNamesForOS(os: unknown): string[] {
  return Object.keys(LOCAL_COMMAND_HELP)
    .map(name => name.toLowerCase())
    .filter(name => isCommandSupportedForOS(name, os))
}

export function getSupportedCommandHelpEntriesForOS(os: unknown): Array<[string, CommandHelpEntry]> {
  return Object.entries(COMMAND_HELP).filter(([name]) => isCommandSupportedForOS(name, os))
}

export function getSupportedLocalCommandHelpEntriesForOS(os: unknown): Array<[string, CommandHelpEntry]> {
  return Object.entries(LOCAL_COMMAND_HELP).filter(([name]) => isCommandSupportedForOS(name, os))
}

export function getUnsupportedCommandMessage(commandName: string, os: unknown): string {
  const platform = normalizeBeaconPlatform(os)
  const platformLabel = platform === 'linux' ? 'Linux' : platform === 'windows' ? 'Windows' : '当前'
  return `当前 ${platformLabel} Beacon 不支持命令 "${commandName}"。`
}

export function isMenuActionSupportedForOS(action: unknown, os: unknown, commandId: number | null = null): boolean {
  if (typeof commandId === 'number' && Number.isFinite(commandId)) {
    return isCommandSupportedForOS(commandId, os)
  }

  const mappedCommandId = MENU_ACTION_COMMAND_MAP[String(action || '').trim().toLowerCase()]
  if (typeof mappedCommandId === 'number') {
    return isCommandSupportedForOS(mappedCommandId, os)
  }

  return true
}
