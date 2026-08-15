/**
 * 事件载荷解析模块 - 统一处理 WS 推送数据的字段提取与归一化
 *
 * 针对后端事件载荷中大小写不一致、字段名不统一等问题，
 * 提供一套标准化的字段读取工具函数。
 */

// ─── 事件类型与数据归一化 ───

import { EVENT_TYPE } from './types'
import type { EventRecord, EventType, KnownWsEvent, NormalizedWsEvent } from './types'

export { EVENT_TYPE } from './types'
export type { EventType, KnownWsEvent, NormalizedWsEvent } from './types'

function asRecord(value: unknown): EventRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EVENT_TYPE))

function normalizeKey(value: unknown): string {
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
export function normalizeEventType(type: unknown): string {
  const key = normalizeKey(type)
  return key.startsWith('EVENT_') ? key.slice(6) : key
}

/**
 * 归一化命令结果类型：统一为小写下划线
 * @param {string} type - 原始结果类型
 * @returns {string} 归一化后的结果类型
 */
export function normalizeResultType(type: unknown): string {
  return normalizeKey(type).toLowerCase()
}

/**
 * 解析 WebSocket 原始消息，并归一化事件 envelope
 * @param {string|Object} rawData - WebSocket 接收的原始消息
 * @returns {{raw: Object, rawType: string, type: string, data: *}}
 */
export function normalizeWsEvent(rawData: unknown): NormalizedWsEvent {
  const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
  const raw = asRecord(parsed) ?? {}
  const rawType = String(raw.type ?? '')
  const type = normalizeEventType(rawType)
  const data = normalizeEventData(raw.data)

  if (!KNOWN_EVENT_TYPES.has(type)) {
    return { status: 'unknown', raw, rawType, type, data }
  }

  const record = asRecord(data)
  if (!record) {
    return {
      status: 'invalid',
      raw,
      rawType,
      type: type as EventType,
      data,
      error: `${type} requires an object data payload`,
    }
  }

  const normalized = normalizeKnownEventData(type as EventType, record)
  if (typeof normalized === 'string') {
    return {
      status: 'invalid',
      raw,
      rawType,
      type: type as EventType,
      data: record,
      error: normalized,
    }
  }

  return {
    status: 'known',
    raw,
    rawType,
    type: type as EventType,
    data: normalized,
  } as KnownWsEvent
}

function firstValue(record: EventRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

function canonicalId(record: EventRecord, field: string, aliases: readonly string[]): string {
  const value = firstValue(record, aliases)
  if (value !== '') record[field] = String(value)
  return String(value)
}

function normalizeKnownEventData(type: EventType, data: EventRecord): EventRecord | string {
  const normalized = { ...data }

  if (type === EVENT_TYPE.USER_ONLINE) {
    const username = firstValue(normalized, ['username'])
    if (username === '') return `${type} requires data.username`
    normalized.username = String(username)
    return normalized
  }

  if (type === EVENT_TYPE.BEACON_REGISTERED || type === EVENT_TYPE.BEACON_TICK || type === EVENT_TYPE.BEACON_REMOVED) {
    if (!canonicalId(normalized, 'beacon_id', ['beacon_id'])) {
      return `${type} requires data.beacon_id`
    }
    return normalized
  }

  if (type === EVENT_TYPE.LISTENER_STATE_CHANGED) {
    const id = canonicalId(normalized, 'id', ['id'])
    const name = canonicalId(normalized, 'name', ['name'])
    if (!id && !name) return `${type} requires data.id or data.name`
    return normalized
  }

  if (type === EVENT_TYPE.COMMAND_EVENT) return normalized

  if (!canonicalId(normalized, 'tunnel_id', ['tunnel_id'])) {
    return `${type} requires data.tunnel_id`
  }

  if (type === EVENT_TYPE.TUNNEL_CHANNEL_OPEN || type === EVENT_TYPE.TUNNEL_CHANNEL_CLOSE || type === EVENT_TYPE.TUNNEL_ACK) {
    if (!canonicalId(normalized, 'channel_id', ['channel_id'])) {
      return `${type} requires data.channel_id`
    }
  }

  canonicalId(normalized, 'beacon_id', ['beacon_id'])
  return normalized
}

/**
 * 归一化事件数据：若为 JSON 字符串则自动解析
 * @param {*} data - 原始事件数据
 * @returns {*} 解析后的数据
 */
export function normalizeEventData(data: unknown): unknown {
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
 * 从事件数据中提取 Beacon ID（canonical beacon_id）
 * @param {Object} data - 事件数据对象
 * @returns {string} Beacon ID
 */
export function getBeaconId(data: unknown): string {
  const rec = asRecord(data)
  if (!rec) return ''
  return String(rec.beacon_id ?? '')
}

// ─── 命令结果载荷提取 ───

/**
 * 提取命令结果的实际载荷数据
 * @param {Object} data - 事件数据对象
 * @returns {*} 结果载荷
 */
export function getCommandResultPayload(data: unknown): unknown {
  const rec = asRecord(data)
  if (!rec) return data
  const payload = rec.data
  return payload === undefined ? data : normalizeEventData(payload)
}

/**
 * 从结果载荷中提取文本内容
 * @param {*} payload - 结果载荷
 * @returns {string} 文本内容
 */
export function getTextResultContent(payload: unknown): string {
  if (payload === undefined || payload === null) return ''
  if (typeof payload === 'string') return payload
  const rec = asRecord(payload)
  if (rec) {
    const text = rec.text
    if (text !== undefined && text !== null && text !== '') return String(text)
  }
  return ''
}

/**
 * 判断文本是否为 zip 成功结果
 * @param {string} text - 结果文本
 * @returns {boolean}
 */
export function isZipSuccessResult(text: unknown): boolean {
  return String(text || '').trim().toLowerCase().startsWith('zip success:')
}

// ─── 命令元信息提取 ───

/**
 * 提取命令任务 ID
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 命令 ID
 */
export function getTaskCommandId(data: unknown, raw: unknown = null): string | number {
  const dataRec = asRecord(data)
  const rawRec = asRecord(raw)
  const value = dataRec?.command_id || rawRec?.command_id
  return typeof value === 'string' || typeof value === 'number' ? value : ''
}

/**
 * 通用字段提取：按优先级在 data 和 raw 中查找多个候选键
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @param {string[]} keys - 候选键名列表
 * @param {*} fallback - 默认值
 * @returns {*} 字段值
 */
export function getCommandField(data: unknown, raw: unknown, keys: readonly string[], fallback: unknown = ''): unknown {
  const dataRec = asRecord(data)
  if (dataRec) {
    for (const key of keys) {
      if (dataRec[key] !== undefined && dataRec[key] !== null && dataRec[key] !== '') return dataRec[key]
    }
  }
  const rawRec = asRecord(raw)
  if (rawRec) {
    for (const key of keys) {
      if (rawRec[key] !== undefined && rawRec[key] !== null && rawRec[key] !== '') return rawRec[key]
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
export function getCommandPhase(data: unknown, raw: unknown = null): string {
  return String(getCommandField(data, raw, ['phase'])).toLowerCase()
}

/**
 * 提取命令执行状态
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 状态标识
 */
export function getCommandStatus(data: unknown, raw: unknown = null): string {
  return String(getCommandField(data, raw, ['status'])).toLowerCase()
}

/**
 * 提取命令错误信息。TeamServer 标准错误字段位于 CommandEvent.error。
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 错误信息
 */
export function getCommandError(data: unknown, raw: unknown = null): string {
  return String(getCommandField(data, raw, ['error'], '') || '').trim()
}

/**
 * 提取命令结果类型
 * @param {Object} data - 事件数据
 * @param {Object} raw - 原始消息
 * @returns {string} 结果类型标识
 */
export function getCommandResultType(data: unknown, raw: unknown = null): string {
  const value = getCommandField(data, raw, ['result_type'])
  if (value !== '') return String(value).toLowerCase()
  return ''
}

// ─── 文件传输字段提取 ───

/**
 * 提取文件传输方向（upload / download）
 * @param {Object} data - 传输事件数据
 * @returns {string} 传输方向
 */
export function getTransferDirection(data: unknown): string {
  const rec = asRecord(data)
  if (!rec) return ''
  return String(rec.direction || '').toLowerCase()
}

/**
 * 提取传输文件 ID
 * @param {Object} data - 传输事件数据
 * @returns {string} 文件 ID
 */
export function getTransferFileId(data: unknown): unknown {
  const rec = asRecord(data)
  if (!rec) return ''
  return rec.file_id || ''
}

/**
 * 提取传输文件名
 * @param {Object} data - 传输事件数据
 * @returns {string} 文件名
 */
export function getTransferFileName(data: unknown): unknown {
  const rec = asRecord(data)
  if (!rec) return 'download.bin'
  return rec.file_name || 'download.bin'
}

/**
 * 提取下载 URL
 * @param {Object} data - 传输事件数据
 * @returns {string} 下载地址
 */
export function getTransferDownloadUrl(data: unknown): unknown {
  const rec = asRecord(data)
  if (!rec) return ''
  return rec.download_url || ''
}

/**
 * 提取传输错误信息
 * @param {Object} data - 传输事件数据
 * @returns {string} 错误信息
 */
export function getTransferError(data: unknown): unknown {
  const rec = asRecord(data)
  if (!rec) return String(data || '文件传输失败')
  return rec.error || '文件传输失败'
}
