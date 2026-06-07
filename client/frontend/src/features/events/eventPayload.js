/**
 * 事件载荷解析模块 - 统一处理 WS 推送数据的字段提取与归一化
 *
 * 针对后端事件载荷中大小写不一致、字段名不统一等问题，
 * 提供一套标准化的字段读取工具函数。
 */

// ─── 事件类型与数据归一化 ───

/**
 * 归一化事件类型字符串：去除特殊字符、转大写、去掉 EVENT 前缀
 * @param {string} type - 原始事件类型
 * @returns {string} 归一化后的事件类型
 */
export function normalizeEventType(type) {
  const normalized = String(type || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return normalized.startsWith('EVENT') ? normalized.slice(5) : normalized
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
