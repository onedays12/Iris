/**
 * 命令参数构建模块 - Beacon 命令参数的类型化封装与校验
 *
 * 提供参数类型判断、数值解析和各命令的参数组装逻辑，
 * 确保下发到 Beacon 的命令参数格式正确且经过校验。
 */

// ─── 导入 ───

import { COMMAND_ID, PLUGIN_COMMAND_ID } from '../../../constants/commands.js'

// ─── 参数类型判断与构造 ───

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
  return { kind, value }
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
 * 可选 int32 参数解析，空值时返回 fallback
 * @param {*} value - 待解析值
 * @param {number} fallback - 默认值
 * @param {string} label - 参数标签
 * @returns {number} 解析结果或默认值
 */
export function parseOptionalInt32Arg(value, fallback, label) {
  if (value === undefined || value === null) return fallback
  const text = String(value).trim()
  if (!text) return fallback
  return parseInt32Arg(text, label)
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

// ─── 参数归一化 ───

/**
 * 将任意值归一化为标准的 Beacon 类型化参数
 * @param {*} arg - 原始参数值
 * @returns {{kind: string, value: *}} 归一化后的参数对象
 */
export function normalizeBeaconArg(arg) {
  if (isBeaconArg(arg)) {
    const kind = String(arg.kind || 'string').trim().toLowerCase()
    if (kind === 'bool') {
      return makeBeaconArg('bool', parseBoolArg(arg.value))
    }
    if (kind === 'int32') {
      return makeBeaconArg('int32', parseInt32Arg(arg.value))
    }
    if (kind === 'short' || kind === 'int16') {
      return makeBeaconArg('short', parseInt16Arg(arg.value))
    }
    if (kind === 'bytes') {
      return makeBeaconArg('bytes', String(arg.value ?? '').trim())
    }
    return makeBeaconArg('string', String(arg.value ?? ''))
  }

  if (typeof arg === 'boolean') {
    return makeBeaconArg('bool', arg)
  }

  if (typeof arg === 'number') {
    return makeBeaconArg('int32', parseInt32Arg(arg))
  }

  return makeBeaconArg('string', String(arg ?? ''))
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

  const targetPath = String(source[0] ?? '').trim()
  if (!targetPath) {
    throw new Error('targetPath 不能为空')
  }

  const flag = parseInt32Arg(source[1], 'ModifyFlag')
  const typedArgs = [
    makeBeaconArg('string', targetPath),
    makeBeaconArg('int32', flag),
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
    typedArgs.push(makeBeaconArg('string', String(nextValue('new_name') ?? '')))
  }
  if (flag & 2) {
    typedArgs.push(makeBeaconArg('string', String(nextValue('MTime') ?? '')))
  }
  if (flag & 4) {
    typedArgs.push(makeBeaconArg('string', String(nextValue('ATime') ?? '')))
  }
  if (flag & 8) {
    typedArgs.push(makeBeaconArg('string', String(nextValue('CTime') ?? '')))
  }
  if (flag & 16) {
    typedArgs.push(makeBeaconArg('int32', parseInt32Arg(nextValue('WinAttributes'), 'WinAttributes')))
  }
  if (flag & 32) {
    typedArgs.push(makeBeaconArg('int32', parseInt32Arg(nextValue('LinuxMode'), 'LinuxMode')))
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
    case COMMAND_ID.SHELL:
    case COMMAND_ID.POWERSHELL: {
      if (source.length !== 1) {
        throw new Error('Shell / PowerShell 命令必须只传 1 个 raw command 字符串')
      }
      const rawArg = normalizeBeaconArg(source[0])
      if (rawArg.kind !== 'string') {
        throw new Error('Shell / PowerShell 命令参数必须是 string')
      }
      if (!String(rawArg.value || '').trim()) {
        throw new Error('Shell / PowerShell raw command 不能为空')
      }
      return [makeBeaconArg('string', String(rawArg.value))]
    }

    default:
      break
  }

  if (source.length === 0) return []

  if (source.every(isBeaconArg)) {
    const normalized = source.map(normalizeBeaconArg)
    if (Number(commandId) === PLUGIN_COMMAND_ID.EXECUTION_BOF && normalized[0]?.kind !== 'bytes') {
      throw new Error('BOF 命令第一个参数必须是 bytes 工件内容')
    }
    return normalized
  }

  switch (Number(commandId)) {
    case PLUGIN_COMMAND_ID.EXECUTION_BOF:
      throw new Error('BOF 命令必须使用 typed args：bytes 工件 + BOF 参数规格')

    case COMMAND_ID.SLEEP:
      return [
        makeBeaconArg('int32', parseInt32Arg(source[0], 'sleep_ms')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[1], 0, 'jitter')),
      ]

    case COMMAND_ID.DOWNLOAD:
      return [
        makeBeaconArg('string', String(source[0] ?? '')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[1], 524288, 'chunk_size')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[2], 3, 'chunks_per_heartbeat')),
      ]

    case COMMAND_ID.UPLOAD:
      return [
        makeBeaconArg('string', String(source[0] ?? '')),
        makeBeaconArg('string', String(source[1] ?? '')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[2], 524288, 'chunk_size')),
      ]

    case COMMAND_ID.KILLJOB:
      return [
        makeBeaconArg('int32', new Int32Array(new Uint32Array([parseUint32Arg(source[0], 'job_id')]).buffer)[0]),
      ]

    case COMMAND_ID.CASCADE_CONNECT_TCP:
      return [
        makeBeaconArg('string', String(source[0] || '')),
        makeBeaconArg('string', String(source[1] || '')),
        makeBeaconArg('int32', parseInt32Arg(source[2], 'port')),
      ]
    case COMMAND_ID.CASCADE_LINK_SMB:
      return [
        makeBeaconArg('string', String(source[0] || '')),
        makeBeaconArg('string', String(source[1] || '')),
      ]
    case COMMAND_ID.KILL:
    case COMMAND_ID.STEAL_TOKEN:
      return [
        makeBeaconArg('int32', parseInt32Arg(source[0], 'pid')),
      ]

    case COMMAND_ID.SCREENSHOT:
      return [
        makeBeaconArg('int32', parseOptionalInt32Arg(source[0], 0, 'monitor_id')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[1], 80, 'quality')),
      ]

    case COMMAND_ID.SETATTR:
      return buildSetAttrArgs(source)

    case COMMAND_ID.ZIP:
      return [
        makeBeaconArg('string', String(source[0] ?? '')),
        makeBeaconArg('string', String(source[1] ?? '')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[2], 0, 'overwrite')),
        makeBeaconArg('int32', parseOptionalInt32Arg(source[3], 1, 'include_root')),
      ]

    case COMMAND_ID.POSTEX:
    case COMMAND_ID.POSTEX_SPAWN_DLL:
    case COMMAND_ID.POSTEX_INJECT_DLL:
      // Args 已由 ConsolePanel 预构建：[subcmd, wait_ms, max_runtime_ms, idle_timeout_ms, ...]
      // postex_spawn_dll:  [5, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, spawn_path, spawn_args, {kind:'bytes',value:b64}]
      // postex_inject_dll: [6, wait_ms, max_runtime_ms, idle_timeout_ms, description, module_args, pid, {kind:'bytes',value:b64}]
      {
        const subcmd = parseInt(source[0]) || 5
        if (subcmd === 6) {
          const injectDllBytes = source[7]
          return [
            makeBeaconArg('int32', 6),
            makeBeaconArg('int32', parseInt(source[1]) || 3000),
            makeBeaconArg('int32', parseOptionalInt32Arg(source[2], 0, 'max_runtime_ms')),
            makeBeaconArg('int32', parseOptionalInt32Arg(source[3], 0, 'idle_timeout_ms')),
            makeBeaconArg('string', String(source[4] || 'postex')),
            makeBeaconArg('string', String(source[5] || '')),
            makeBeaconArg('int32', parseInt(source[6]) || 0),
            ...(injectDllBytes && injectDllBytes.kind === 'bytes' ? [injectDllBytes] : []),
          ]
        }
        // postex_spawn_dll (subcmd=5)
        const spawnDllBytes = source[8]
        return [
          makeBeaconArg('int32', 5),
          makeBeaconArg('int32', parseInt(source[1]) || 3000),
          makeBeaconArg('int32', parseOptionalInt32Arg(source[2], 0, 'max_runtime_ms')),
          makeBeaconArg('int32', parseOptionalInt32Arg(source[3], 0, 'idle_timeout_ms')),
          makeBeaconArg('string', String(source[4] || 'postex')),
          makeBeaconArg('string', String(source[5] || '')),
          makeBeaconArg('string', String(source[6] || '')),
          makeBeaconArg('string', String(source[7] || '')),
          ...(spawnDllBytes && spawnDllBytes.kind === 'bytes' ? [spawnDllBytes] : []),
        ]
      }

    default:
      return source.map(normalizeBeaconArg)
  }
}
