/**
 * 事件载荷解析模块 - 统一处理 WS 推送数据的字段提取与归一化
 *
 * 针对后端事件载荷中大小写不一致、字段名不统一等问题，
 * 提供一套标准化的字段读取工具函数。
 */

// ─── 事件类型与数据归一化 ───

export const EVENT_TYPE = Object.freeze({
  USER_ONLINE: 'USER_ONLINE',
  BEACON_REGISTERED: 'BEACON_REGISTERED',
  BEACON_TICK: 'BEACON_TICK',
  BEACON_REMOVED: 'BEACON_REMOVED',
  COMMAND_EVENT: 'COMMAND_EVENT',
  LISTENER_STATE_CHANGED: 'LISTENER_STATE_CHANGED',
  TUNNEL_STARTED: 'TUNNEL_STARTED',
  TUNNEL_PAUSED: 'TUNNEL_PAUSED',
  TUNNEL_RESUMED: 'TUNNEL_RESUMED',
  TUNNEL_STOPPED: 'TUNNEL_STOPPED',
  TUNNEL_CLEARED: 'TUNNEL_CLEARED',
  TUNNEL_CHANNEL_OPEN: 'TUNNEL_CHANNEL_OPEN',
  TUNNEL_CHANNEL_CLOSE: 'TUNNEL_CHANNEL_CLOSE',
  TUNNEL_CHANNEL_RECYCLED: 'TUNNEL_CHANNEL_RECYCLED',
  TUNNEL_STATS: 'TUNNEL_STATS',
  TUNNEL_UPDATED: 'TUNNEL_UPDATED',
  TUNNEL_ACK: 'TUNNEL_ACK',
})

const EVENT_TYPE_ALIASES = Object.freeze({
  USER_ONLINE: EVENT_TYPE.USER_ONLINE,
  USERONLINE: EVENT_TYPE.USER_ONLINE,
  BEACON_REGISTERED: EVENT_TYPE.BEACON_REGISTERED,
  BEACONREGISTERED: EVENT_TYPE.BEACON_REGISTERED,
  BEACON_ONLINE: EVENT_TYPE.BEACON_REGISTERED,
  BEACONONLINE: EVENT_TYPE.BEACON_REGISTERED,
  BEACON_TICK: EVENT_TYPE.BEACON_TICK,
  BEACONTICK: EVENT_TYPE.BEACON_TICK,
  BEACON_REMOVED: EVENT_TYPE.BEACON_REMOVED,
  BEACONREMOVED: EVENT_TYPE.BEACON_REMOVED,
  COMMAND_EVENT: EVENT_TYPE.COMMAND_EVENT,
  COMMANDEVENT: EVENT_TYPE.COMMAND_EVENT,
  LISTENER_STATE_CHANGED: EVENT_TYPE.LISTENER_STATE_CHANGED,
  LISTENERSTATECHANGED: EVENT_TYPE.LISTENER_STATE_CHANGED,
  TUNNEL_STARTED: EVENT_TYPE.TUNNEL_STARTED,
  TUNNELSTARTED: EVENT_TYPE.TUNNEL_STARTED,
  TUNNEL_PAUSED: EVENT_TYPE.TUNNEL_PAUSED,
  TUNNELPAUSED: EVENT_TYPE.TUNNEL_PAUSED,
  TUNNEL_RESUMED: EVENT_TYPE.TUNNEL_RESUMED,
  TUNNELRESUMED: EVENT_TYPE.TUNNEL_RESUMED,
  TUNNEL_STOPPED: EVENT_TYPE.TUNNEL_STOPPED,
  TUNNELSTOPPED: EVENT_TYPE.TUNNEL_STOPPED,
  TUNNEL_CLEARED: EVENT_TYPE.TUNNEL_CLEARED,
  TUNNELCLEARED: EVENT_TYPE.TUNNEL_CLEARED,
  TUNNEL_CHANNEL_OPEN: EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  TUNNELCHANNELOPEN: EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  TUNNEL_CHANNEL_CLOSE: EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  TUNNELCHANNELCLOSE: EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  TUNNEL_CHANNEL_RECYCLED: EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  TUNNELCHANNELRECYCLED: EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  TUNNEL_STATS: EVENT_TYPE.TUNNEL_STATS,
  TUNNELSTATS: EVENT_TYPE.TUNNEL_STATS,
  TUNNEL_UPDATED: EVENT_TYPE.TUNNEL_UPDATED,
  TUNNELUPDATED: EVENT_TYPE.TUNNEL_UPDATED,
  TUNNEL_ACK: EVENT_TYPE.TUNNEL_ACK,
  TUNNELACK: EVENT_TYPE.TUNNEL_ACK,
})

const RESULT_TYPE_ALIASES = Object.freeze({
  EXPLORERFILES: 'explorer_files',
  EXPLORER_FILES: 'explorer_files',
  NETINFO: 'net_info',
  NET_INFO: 'net_info',
  PSLIST: 'ps_list',
  PS_LIST: 'ps_list',
  POSTEXARTIFACT: 'postex_artifact',
  POSTEX_ARTIFACT: 'postex_artifact',
  POSTEXFRAME: 'postex_frame',
  POSTEX_FRAME: 'postex_frame',
  POSTEXOUTPUT: 'postex_output',
  POSTEX_OUTPUT: 'postex_output',
  POSTEXDEAD: 'postex_dead',
  POSTEX_DEAD: 'postex_dead',
  CASCADE: 'cascade',
})

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

/**
 * 归一化事件类型字符串：统一为文档中的大写下划线事件名
 * @param {string} type - 原始事件类型
 * @returns {string} 归一化后的事件类型
 */
export function normalizeEventType(type) {
  const key = normalizeKey(type)
  const withoutEventPrefix = key.startsWith('EVENT_') ? key.slice(6) : key
  const compact = withoutEventPrefix.replace(/_/g, '')
  const compactWithoutEventPrefix = compact.startsWith('EVENT') ? compact.slice(5) : compact
  return EVENT_TYPE_ALIASES[withoutEventPrefix]
    || EVENT_TYPE_ALIASES[compact]
    || EVENT_TYPE_ALIASES[compactWithoutEventPrefix]
    || withoutEventPrefix
}

/**
 * 归一化命令结果类型：统一为小写下划线，兼容历史紧凑写法
 * @param {string} type - 原始结果类型
 * @returns {string} 归一化后的结果类型
 */
export function normalizeResultType(type) {
  const key = normalizeKey(type)
  const compact = key.replace(/_/g, '')
  const normalized = RESULT_TYPE_ALIASES[key] || RESULT_TYPE_ALIASES[compact] || key.toLowerCase()
  return normalized
}

/**
 * 解析 WebSocket 原始消息，并归一化事件 envelope
 * @param {string|Object} rawData - WebSocket 接收的原始消息
 * @returns {{raw: Object, rawType: string, type: string, data: *}}
 */
export function normalizeWsEvent(rawData) {
  const raw = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData || {})
  const rawType = raw.type || raw.Type || raw.event || raw.Event || raw.event_type || raw.EventType || ''
  const data = normalizeEventData(raw.data ?? raw.Data ?? raw.payload ?? raw.Payload)
  return {
    raw,
    rawType,
    type: normalizeEventType(rawType),
    data,
  }
}

/**
 * 归一化事件数据：若为 JSON 字符串则自动解析
 * @param {*} data - 原始事件数据
 * @returns {*} 解析后的数据
 */
export function normalizeEventData(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
  return data
}

// ─── Beacon 字段提取 ───

/**
 * 从事件数据中提取 Beacon ID（兼容多种字段命名）
 * @param {Object} data - 事件数据对象
 * @returns {string} Beacon ID
 */
export function getBeaconId(data) {
  if (!data || typeof data !== 'object') return ''
  return data.beacon_id || data.beaconid || data.beaconId || data.BeaconID || data.BeaconId || data.id || data.ID || data.uuid || data.UUID || ''
}

// ─── 命令结果载荷提取 ───

/**
 * 提取命令结果的实际载荷数据
 * @param {Object} data - 事件数据对象
 * @returns {*} 结果载荷
 */
export function getCommandResultPayload(data) {
  if (!data || typeof data !== 'object') return data
  const payload = data.data ?? data.Data ?? data.result ?? data.Result ?? data.content ?? data.Content ?? data.payload ?? data.Payload
  return payload === undefined ? data : normalizeEventData(payload)
}

/**
 * 从结果载荷中提取文本内容
 * @param {*} payload - 结果载荷
 * @returns {string} 文本内容
 */
export function getTextResultContent(payload) {
  if (payload === undefined || payload === null) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object') {
    const text = payload.text ?? payload.Text ?? payload.value ?? payload.Value
    if (text !== undefined && text !== null && text !== '') return String(text)
  }
  return ''
}

/**
 * 判断文本是否为 zip 成功结果
 * @param {string} text - 结果文本
 * @returns {boolean}
 */
export function isZipSuccessResult(text) {
  return String(text || '').trim().toLowerCase().startsWith('zip success:')
}

// ─── 命令元信息提取 ───

/**
 * 提取命令任务 ID
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 命令 ID
 */
export function getTaskCommandId(data, raw = null) {
  if (!data || typeof data !== 'object') return raw?.command_id || raw?.commandId || raw?.CommandID || raw?.CommandId || ''
  return data.command_id || data.commandId || data.CommandID || data.CommandId
    || raw?.command_id || raw?.commandId || raw?.CommandID || raw?.CommandId
    || ''
}

/**
 * 通用字段提取：按优先级在 data 和 raw 中查找多个候选键
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @param {string[]} keys - 候选键名列表
 * @param {*} fallback - 默认值
 * @returns {*} 字段值
 */
export function getCommandField(data, raw, keys, fallback = '') {
  if (data && typeof data === 'object') {
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key]
    }
  }
  if (raw && typeof raw === 'object') {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') return raw[key]
    }
  }
  return fallback
}

/**
 * 提取命令执行阶段
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 阶段标识
 */
export function getCommandPhase(data, raw = null) {
  return String(getCommandField(data, raw, ['phase', 'Phase'])).toLowerCase()
}

/**
 * 提取命令执行状态
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 状态标识
 */
export function getCommandStatus(data, raw = null) {
  return String(getCommandField(data, raw, ['status', 'Status'])).toLowerCase()
}

/**
 * 提取命令错误信息。TeamServer 标准错误字段位于 CommandEvent.error。
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 错误信息
 */
export function getCommandError(data, raw = null) {
  return String(getCommandField(data, raw, ['error', 'Error'], '') || '').trim()
}

/**
 * 提取命令结果类型
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 结果类型标识
 */
export function getCommandResultType(data, raw = null) {
  const value = getCommandField(data, raw, ['result_type', 'resultType', 'ResultType'])
  if (value !== '') return String(value).toLowerCase()
  if (data && typeof data === 'object' && data.type !== undefined && data.type !== null && data.type !== '') {
    return String(data.type).toLowerCase()
  }
  if (data && typeof data === 'object' && data.Type !== undefined && data.Type !== null && data.Type !== '') {
    return String(data.Type).toLowerCase()
  }
  return ''
}

// ─── 文件传输字段提取 ───

/**
 * 提取文件传输方向（upload / download）
 * @param {Object} data - 传输事件数据
 * @returns {string} 传输方向
 */
export function getTransferDirection(data) {
  if (!data || typeof data !== 'object') return ''
  return String(data.direction || data.Direction || '').toLowerCase()
}

/**
 * 提取传输文件 ID
 * @param {Object} data - 传输事件数据
 * @returns {string} 文件 ID
 */
export function getTransferFileId(data) {
  if (!data || typeof data !== 'object') return ''
  return data.file_id || data.fileId || data.FileID || data.FileId || ''
}

/**
 * 提取传输文件名
 * @param {Object} data - 传输事件数据
 * @returns {string} 文件名
 */
export function getTransferFileName(data) {
  if (!data || typeof data !== 'object') return 'download.bin'
  return data.file_name || data.fileName || data.FileName || 'download.bin'
}

/**
 * 提取下载 URL
 * @param {Object} data - 传输事件数据
 * @returns {string} 下载地址
 */
export function getTransferDownloadUrl(data) {
  if (!data || typeof data !== 'object') return ''
  return data.download_url || data.downloadUrl || data.DownloadURL || data.DownloadUrl || ''
}

/**
 * 提取传输错误信息
 * @param {Object} data - 传输事件数据
 * @returns {string} 错误信息
 */
export function getTransferError(data) {
  if (!data || typeof data !== 'object') return String(data || '文件传输失败')
  return data.error || data.Error || data.error_message || data.errorMessage || data.message || data.Message || '文件传输失败'
}
