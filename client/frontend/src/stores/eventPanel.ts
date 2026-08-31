/**
 * 事件面板 Store
 * 接收 WebSocket 推送的各类事件，规范化为统一格式后存入列表，
 * 供 EventPanel 组件展示（命令结果、连接/断开、Tunnel 等）。
 */

import { defineStore } from 'pinia'
import { i18n } from '../i18n/index'
import { COMMAND_ID, COMMAND_NAME } from '../constants/commands'
import {
  EVENT_TYPE,
  getBeaconId,
  getCommandError,
  getCommandPhase,
  getCommandResultPayload,
  getCommandResultType,
  getCommandStatus,
  getTaskCommandId,
  getTextResultContent,
  getTransferDirection,
  getTransferError,
  normalizeEventType,
  normalizeResultType,
} from '../features/events/eventPayload'
import {
  COMMAND_RESULT_TYPE,
  isNetInfoResult,
  isNetstatResult,
  isProcessResult,
  isTransferResult,
} from '../features/events/commandResultProtocol'
import { formatTunnelReasonKey } from '../utils/tunnel'
import { pick } from '../utils/object'
import { bus } from '../shared/bus'
import type { WsEventRecordPayload } from '../shared/bus'
import type { EventRecord } from '../features/events/types'

// ─── 类型定义 ───

export type EventTone = 'error' | 'warn' | 'success' | 'info'

export interface EventPanelEntry {
  id: number
  rawType: string
  type: string
  tone: EventTone
  beaconId: string
  commandId: string
  commandName: string
  phase: string
  status: string
  resultType: string
  summary: string
  data: EventRecord
  raw: EventRecord
  receivedAt: number
}

interface EventPanelState {
  visible: boolean
  events: EventPanelEntry[]
  maxEvents: number
  nextId: number
  width: number
  rightOffset: number
  collapsedWidth: number
  _subscribed: boolean
}

// ─── 翻译辅助 (带 Node 回退) ───
// 在浏览器中 message 已加载, i18n.global.t(key) 返回翻译;
// 在纯 Node 检查脚本中 message 未加载, t(key) 返回 key 本身,
// 此时回退到 zhFallback 里的中文文案, 以兼容 check 脚本对中文断言的依赖。
const zhFallback: Record<string, string> = {
  'eventPanel.eventReceived': '事件已接收',
  'eventPanel.taskFailed': '任务失败: {name}',
  'eventPanel.taskFailedWithError': '任务失败: {name} - {error}',
  'eventPanel.directoryListingReturned': '目录列表已回传',
  'eventPanel.directoryListingReturnedPath': '目录列表已回传: {path}',
  'eventPanel.currentDirectory': '当前目录: {path}',
  'eventPanel.currentDirectoryReturned': '当前目录已回传',
  'eventPanel.userInfo': '用户信息: {value}',
  'eventPanel.userInfoReturned': '用户信息已回传',
  'eventPanel.shellCommandReturned': 'Shell 命令已回传',
  'eventPanel.powershellCommandReturned': 'PowerShell 命令已回传',
  'eventPanel.bofExecutionReturned': 'BOF 执行已回传',
  'eventPanel.taskReturned': '任务回传: {name}',
  'eventPanel.taskReturnedGeneric': '任务回传',
  'eventPanel.upload': '上传',
  'eventPanel.download': '下载',
  'eventPanel.transfer': '传输',
  'eventPanel.transferInProgress': '传输进行中',
  'eventPanel.transferFailedSuffix': '失败: {error}',
  'eventPanel.transferFailedPlain': '失败',
  'eventPanel.transferQueuedSuffix': '排队: {fileName}',
  'eventPanel.transferQueuedPlain': '排队',
  'eventPanel.transferCompletedSuffix': '完成: {fileName}',
  'eventPanel.transferCompletedPlain': '完成',
  'eventPanel.processListCount': '进程列表: {count} 个进程',
  'eventPanel.processList': '进程列表',
  'eventPanel.networkInfoCount': '网络信息: {count} 个接口',
  'eventPanel.networkInfo': '网络信息',
  'eventPanel.networkConnectionsCount': '网络连接: {count} 条记录',
  'eventPanel.networkConnections': '网络连接',
  'eventPanel.command': '命令',
  'eventPanel.cascadeEvent': '级联事件: {action}',
  'eventPanel.cascadeEventGeneric': '级联事件',
  'eventPanel.userOnline': '用户上线',
  'eventPanel.userOnlineWithName': '用户上线: {name}',
  'eventPanel.beaconOnlineWithId': 'Beacon {id} 已上线',
  'eventPanel.beaconOnlineGeneric': 'Beacon 已上线',
  'eventPanel.beaconOfflineWithId': 'Beacon {id} 已下线',
  'eventPanel.beaconOfflineGeneric': 'Beacon 已下线',
  'eventPanel.listenerState': '监听器状态变更',
  'eventPanel.tunnelStartedWithDetails': 'Tunnel 已启动: {details}',
  'eventPanel.tunnelStartedGeneric': 'Tunnel 已启动',
  'eventPanel.tunnelPausedWithDetails': 'Tunnel 已暂停: {details}',
  'eventPanel.tunnelPausedGeneric': 'Tunnel 已暂停',
  'eventPanel.tunnelResumedWithDetails': 'Tunnel 已恢复: {details}',
  'eventPanel.tunnelResumedGeneric': 'Tunnel 已恢复',
  'eventPanel.tunnelUpdatedWithDetails': 'Tunnel 已更新: {details}',
  'eventPanel.tunnelUpdatedGeneric': 'Tunnel 已更新',
  'eventPanel.tunnelClearedWithDetails': 'Tunnel 已清除: {details}',
  'eventPanel.tunnelClearedGeneric': 'Tunnel 已清除',
  'eventPanel.tunnelStoppedWithError': 'Tunnel 已停止: {error}',
  'eventPanel.tunnelStoppedGeneric': 'Tunnel 已停止',
  'eventPanel.tunnelConnectionOpenedWithAddress': 'Tunnel 连接已打开: {address}',
  'eventPanel.tunnelConnectionOpenedGeneric': 'Tunnel 连接已打开',
  'eventPanel.tunnelConnectionClosedWithReason': 'Tunnel 连接已关闭: {address} ({reason})',
  'eventPanel.tunnelConnectionClosedWithAddress': 'Tunnel 连接已关闭: {address}',
  'eventPanel.tunnelConnectionClosedGeneric': 'Tunnel 连接已关闭',
  'eventPanel.tunnelConnectionsRecycled': 'Tunnel 已回收 {count} 个终态 channel',
  'eventPanel.tunnelConnectionRecycled': 'Tunnel 连接已回收',
  'eventPanel.tunnelMetricsUpdated': 'Tunnel 指标已更新',
  'eventPanel.tunnelControlAcknowledged': 'Tunnel 控制确认: {action}',
  'eventPanel.tunnelControlAcknowledgedGeneric': 'Tunnel 控制确认',
}

function t(key: string, args?: Record<string, unknown>): string {
  const translated = i18n.global.t(key, args ?? {})
  // message 未加载时 t(key) 返回 key 本身 → 回退中文
  if (translated !== key) return translated
  const fallback = zhFallback[key]
  if (fallback === undefined) return key
  if (!args) return fallback
  return String(fallback).replace(/\{(\w+)\}/g, (_, name) => (args[name] !== undefined ? String(args[name]) : `{${name}}`))
}

function getCommandName(commandId: unknown): string {
  if (commandId === undefined || commandId === null || commandId === '') return ''
  const name = COMMAND_NAME[String(commandId)]
  return name || `command_${String(commandId)}`
}

function inferMigrateCommandName(data: unknown, raw: unknown = null): string {
  const envelope = getCommandEnvelope(data, raw)
  const payload = getCommandResultPayload(envelope)
  const text = `${getTextResultContent(payload)} ${getTextResultContent(envelope)}`.toLowerCase()
  if (text.includes('migrate spawnto')) return 'spawnto'
  if (text.includes('migrate spawn')) return 'migrate_spawn'
  if (text.includes('migrate inject')) return 'migrate_inject'
  return ''
}

function resolveCommandName(commandId: unknown, data: unknown = null, raw: unknown = null): string {
  const name = getCommandName(commandId)
  if (String(commandId) === String(COMMAND_ID.MIGRATE)) {
    return inferMigrateCommandName(data, raw) || name
  }
  return name
}

function stringifyPreview(value: unknown, limit = 220): string {
  if (value === undefined || value === null) return ''
  let text = ''
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function compactOneLine(value: unknown, limit = 120): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function limitSummary(value: unknown, limit = 120): string {
  return compactOneLine(value, limit) || t('eventPanel.eventReceived')
}

function summarizeLs(text: unknown): string {
  const match = String(text || '').match(/Listing directory:\s*([^\r\n]+?)(?:\s+Mode\b|\r?\n|$)/i)
  const path = compactOneLine(match?.[1] || '', 60)
  return path ? t('eventPanel.directoryListingReturnedPath', { path }) : t('eventPanel.directoryListingReturned')
}

function summarizeCommandText(commandName: unknown, text: unknown, status = ''): string {
  const name = String(commandName || '').toLowerCase()
  const compact = compactOneLine(text, 80)

  if (String(status || '').toLowerCase() === 'error') {
    return compact
      ? t('eventPanel.taskFailedWithError', { name: commandName || t('eventPanel.taskFailed'), error: compact })
      : t('eventPanel.taskFailed', { name: commandName || t('eventPanel.taskFailed') })
  }

  switch (name) {
    case 'ls':
      return summarizeLs(text)
    case 'pwd':
      return compact ? t('eventPanel.currentDirectory', { path: compact }) : t('eventPanel.currentDirectoryReturned')
    case 'whoami':
      return compact ? t('eventPanel.userInfo', { value: compact }) : t('eventPanel.userInfoReturned')
    case 'shell':
      return t('eventPanel.shellCommandReturned')
    case 'powershell':
      return t('eventPanel.powershellCommandReturned')
    case 'execution_bof':
    case 'exec-bof':
    case 'bof':
      return t('eventPanel.bofExecutionReturned')
    default:
      return name ? t('eventPanel.taskReturned', { name }) : t('eventPanel.taskReturnedGeneric')
  }
}

function getCommandEnvelope(data: unknown, raw: unknown = null): EventRecord {
  if (data && typeof data === 'object') return data as EventRecord
  const rawRecord = raw && typeof raw === 'object' ? raw as EventRecord : null
  if (rawRecord?.data && typeof rawRecord.data === 'object') return rawRecord.data as EventRecord
  return rawRecord ?? {}
}

function summarizeTransfer(data: unknown, status = '', phase = '', resultType = '', errorMessage = ''): string {
  const payloadDirection = getTransferDirection(data)
  const normalizedResultType = normalizeResultType(resultType)
  const transferDirection = isTransferResult(payloadDirection)
    ? payloadDirection
    : (isTransferResult(normalizedResultType) ? normalizedResultType : '')
  const actionLabel = transferDirection === COMMAND_RESULT_TYPE.UPLOAD ? t('eventPanel.upload') : (transferDirection === COMMAND_RESULT_TYPE.DOWNLOAD ? t('eventPanel.download') : t('eventPanel.transfer'))
  const totalChunks = pick(data, ['total_chunks'], '')
  // 契约: download 进度带 received_chunks,upload 确认带 acked_chunks;缺一即恒显 0。
  const receivedChunks = pick(data, ['received_chunks', 'acked_chunks'], '')
  const fileName = pick(data, ['file_name'], '')
  const error = errorMessage || getTransferError(data)
  const receivedNum = Number(receivedChunks)
  const totalNum = Number(totalChunks)
  const progress = (Number.isFinite(receivedNum) && Number.isFinite(totalNum) && totalNum > 0)
    ? `${receivedNum} / ${totalNum} chunks`
    : t('eventPanel.transferInProgress')

  if (status === 'error') {
    return error ? `${actionLabel}${t('eventPanel.transferFailedSuffix', { error })}` : `${actionLabel}${t('eventPanel.transferFailedPlain')}`
  }
  if (status === 'queued') {
    return fileName ? `${actionLabel}${t('eventPanel.transferQueuedSuffix', { fileName })}` : `${actionLabel}${t('eventPanel.transferQueuedPlain')}`
  }
  if (status === 'completed' || phase === 'result') {
    return fileName ? `${actionLabel}${t('eventPanel.transferCompletedSuffix', { fileName })}` : `${actionLabel}${t('eventPanel.transferCompletedPlain')}`
  }
  return fileName ? `${actionLabel} ${fileName} - ${progress}` : `${actionLabel} - ${progress}`
}

function summarizeCommandEvent(data: unknown, raw: unknown = null, commandId = '', phase = '', status = '', resultType = ''): string {
  const envelope = getCommandEnvelope(data, raw)
  const payload = getCommandResultPayload(envelope)
  const normalizedPhase = String(phase || getCommandPhase(envelope, raw)).toLowerCase()
  const normalizedStatus = String(status || getCommandStatus(envelope, raw)).toLowerCase()
  const normalizedResultType = normalizeResultType(resultType || getCommandResultType(envelope, raw))
  const rawCommandId = commandId || getTaskCommandId(envelope, raw)
  const commandName = resolveCommandName(rawCommandId, envelope, raw)
  const error = getCommandError(envelope, raw)
  const textContent = getTextResultContent(payload)

  if (isTransferResult(normalizedResultType)) {
    return summarizeTransfer(payload && typeof payload === 'object' ? payload as EventRecord : {}, normalizedStatus, normalizedPhase, normalizedResultType, error)
  }
  if (normalizedStatus === 'error') {
    const errorText = error || textContent
    const name = commandName || t('eventPanel.command')
    return errorText ? t('eventPanel.taskFailedWithError', { name, error: errorText }) : t('eventPanel.taskFailed', { name })
  }
  if (normalizedResultType === COMMAND_RESULT_TYPE.TEXT) {
    return summarizeCommandText(commandName, textContent, normalizedStatus)
  }
  if (isProcessResult(normalizedResultType, rawCommandId)) {
    return Array.isArray(payload) && payload.length > 0 ? t('eventPanel.processListCount', { count: payload.length }) : t('eventPanel.processList')
  }
  if (isNetInfoResult(normalizedResultType, rawCommandId)) {
    const payloadRecord = payload && typeof payload === 'object' ? payload as EventRecord : null
    const count = Array.isArray(payloadRecord?.interfaces) ? payloadRecord.interfaces.length : 0
    return count > 0 ? t('eventPanel.networkInfoCount', { count }) : t('eventPanel.networkInfo')
  }
  if (isNetstatResult(normalizedResultType, rawCommandId)) {
    const payloadRecord = payload && typeof payload === 'object' ? payload as EventRecord : null
    const count = Array.isArray(payloadRecord?.connections) ? payloadRecord.connections.length : 0
    return count > 0 ? t('eventPanel.networkConnectionsCount', { count }) : t('eventPanel.networkConnections')
  }
  if (normalizedResultType === COMMAND_RESULT_TYPE.CASCADE) {
    const action = pick(payload, ['action'], '')
    const childId = pick(payload, ['child_id'], '')
    return [action ? t('eventPanel.cascadeEvent', { action }) : t('eventPanel.cascadeEventGeneric'), childId].filter(Boolean).join(' - ')
  }
  if (commandName) return t('eventPanel.taskReturned', { name: commandName })
  if (normalizedResultType) return t('eventPanel.taskReturned', { name: normalizedResultType })
  return t('eventPanel.taskReturnedGeneric')
}

export function formatEventSummary(type: string, data: unknown, raw: unknown = null, commandId = '', phase = '', status = '', resultType = ''): string {
  const rawRecord = raw && typeof raw === 'object' ? raw as EventRecord : null
  const bid = getBeaconId(data) || getBeaconId(rawRecord?.data) || getBeaconId(raw)
  const eventData = (data && typeof data === 'object') ? data as EventRecord : {}
  const tunnelMode = pick(eventData, ['mode'], '')
  const bindHost = pick(eventData, ['bind_host'], '')
  const bindPort = pick(eventData, ['bind_port'], '')
  const targetAddress = pick(eventData, ['target_address'], '')
  const recycledCount = pick(eventData, ['recycled_count'], '')
  const reason = pick(eventData, ['reason'], '')
  const error = getCommandError(eventData, raw) || pick(eventData, ['error'], '')

  switch (type) {
    case EVENT_TYPE.USER_ONLINE: {
      const username = pick(eventData, ['username'], '')
      return username ? t('eventPanel.userOnlineWithName', { name: username }) : t('eventPanel.userOnline')
    }
    case EVENT_TYPE.BEACON_REGISTERED:
      return bid ? t('eventPanel.beaconOnlineWithId', { id: bid }) : t('eventPanel.beaconOnlineGeneric')
    case EVENT_TYPE.BEACON_REMOVED:
      return bid ? t('eventPanel.beaconOfflineWithId', { id: bid }) : t('eventPanel.beaconOfflineGeneric')
    case EVENT_TYPE.BEACON_META: {
      const operator = String(pick(eventData, ['operator'], '') || '')
      const action = String(pick(eventData, ['action'], '') || '')
      const groupName = String(pick(eventData, ['group_name'], '') || '')
      if (action === 'group') {
        return groupName
          ? t('eventPanel.beaconMetaGroup', { operator: operator || '?', group: groupName })
          : t('eventPanel.beaconMetaUngroup', { operator: operator || '?' })
      }
      return t('eventPanel.beaconMetaNote', { operator: operator || '?' })
    }
    case EVENT_TYPE.COMMAND_EVENT:
      return summarizeCommandEvent(eventData, raw, commandId, phase, status, resultType)
    case EVENT_TYPE.LISTENER_STATE_CHANGED:
      return t('eventPanel.listenerState')
    case EVENT_TYPE.TUNNEL_STARTED: {
      const details = [tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')
      return tunnelMode || bindHost || bindPort ? t('eventPanel.tunnelStartedWithDetails', { details }) : t('eventPanel.tunnelStartedGeneric')
    }
    case EVENT_TYPE.TUNNEL_PAUSED: {
      const details = [tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')
      return tunnelMode || bindHost || bindPort ? t('eventPanel.tunnelPausedWithDetails', { details }) : t('eventPanel.tunnelPausedGeneric')
    }
    case EVENT_TYPE.TUNNEL_RESUMED: {
      const details = [tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')
      return tunnelMode || bindHost || bindPort ? t('eventPanel.tunnelResumedWithDetails', { details }) : t('eventPanel.tunnelResumedGeneric')
    }
    case EVENT_TYPE.TUNNEL_UPDATED: {
      const details = [tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')
      return tunnelMode || bindHost || bindPort ? t('eventPanel.tunnelUpdatedWithDetails', { details }) : t('eventPanel.tunnelUpdatedGeneric')
    }
    case EVENT_TYPE.TUNNEL_CLEARED: {
      const details = [tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')
      return tunnelMode || bindHost || bindPort ? t('eventPanel.tunnelClearedWithDetails', { details }) : t('eventPanel.tunnelClearedGeneric')
    }
    case EVENT_TYPE.TUNNEL_STOPPED:
      return error ? t('eventPanel.tunnelStoppedWithError', { error }) : t('eventPanel.tunnelStoppedGeneric')
    case EVENT_TYPE.TUNNEL_CHANNEL_OPEN:
      return targetAddress ? t('eventPanel.tunnelConnectionOpenedWithAddress', { address: targetAddress }) : t('eventPanel.tunnelConnectionOpenedGeneric')
    case EVENT_TYPE.TUNNEL_CHANNEL_CLOSE: {
      const reasonKey = formatTunnelReasonKey(reason as string | number)
      const reasonText = reasonKey
        ? t(reasonKey)
        : String(reason ?? '').trim()
      if (!targetAddress) return t('eventPanel.tunnelConnectionClosedGeneric')
      return reason
        ? t('eventPanel.tunnelConnectionClosedWithReason', { address: targetAddress, reason: reasonText })
        : t('eventPanel.tunnelConnectionClosedWithAddress', { address: targetAddress })
    }
    case EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED:
      return recycledCount ? t('eventPanel.tunnelConnectionsRecycled', { count: recycledCount }) : t('eventPanel.tunnelConnectionRecycled')
    case EVENT_TYPE.TUNNEL_STATS:
      return t('eventPanel.tunnelMetricsUpdated')
    case EVENT_TYPE.TUNNEL_ACK: {
      const action = pick(eventData, ['action'], '')
      return action ? t('eventPanel.tunnelControlAcknowledged', { action }) : t('eventPanel.tunnelControlAcknowledgedGeneric')
    }
    default:
      return stringifyPreview(data, 180) || t('eventPanel.eventReceived')
  }
}

// 不记入事件面板的静默事件类型（recordEvent 防御性过滤，与 wsEventRouter 的
// QUIET_EVENT_TYPES 一致，兼容直接调用 recordEvent 的场景）
const QUIET_EVENT_PANEL_TYPES: readonly string[] = [
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  EVENT_TYPE.TUNNEL_STATS,
]

const WARN_TONE_TYPES: readonly string[] = [
  EVENT_TYPE.BEACON_REMOVED,
  EVENT_TYPE.TUNNEL_STOPPED,
  EVENT_TYPE.TUNNEL_CLEARED,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
]

const SUCCESS_TONE_TYPES: readonly string[] = [
  EVENT_TYPE.USER_ONLINE,
  EVENT_TYPE.BEACON_REGISTERED,
  EVENT_TYPE.TUNNEL_STARTED,
  EVENT_TYPE.TUNNEL_RESUMED,
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_ACK,
]

function getTone(type: string, status = ''): EventTone {
  const normalizedStatus = String(status || '').toLowerCase()
  if (normalizedStatus === 'error') return 'error'
  if (normalizedStatus === 'warn') return 'warn'
  if (normalizedStatus === 'success') return 'success'
  if (WARN_TONE_TYPES.includes(type)) return 'warn'
  if (SUCCESS_TONE_TYPES.includes(type)) return 'success'
  if (type === EVENT_TYPE.TUNNEL_PAUSED) return 'info'
  if (type === EVENT_TYPE.TUNNEL_UPDATED) return 'success'
  if (type === EVENT_TYPE.COMMAND_EVENT && normalizedStatus === 'completed') return 'success'
  return 'info'
}

export const useEventPanelStore = defineStore('eventPanel', {
  state: (): EventPanelState => ({
    visible: true,
    events: [],
    maxEvents: 80,
    nextId: 1,
    width: 420,
    rightOffset: 24,
    collapsedWidth: 48,
    _subscribed: false,
  }),

  getters: {
    latest: (state): EventPanelEntry | null => state.events[0] || null,
    effectiveWidth: (state): number => state.visible ? state.width + state.rightOffset : state.collapsedWidth,
  },

  actions: {
    toggleVisible(): void {
      this.visible = !this.visible
    },

    setWidth(w: number): void {
      this.width = w
    },

    clear(): void {
      this.events = []
      this.nextId = 1
    },

    recordEvent(payload: WsEventRecordPayload): void {
      const { rawType = '', type = '', data, raw, commandId = '', phase = '', status = '', resultType = '' } = payload
      const normalizedType = normalizeEventType(type || rawType)
      if (!normalizedType || normalizedType === EVENT_TYPE.BEACON_TICK) return
      if (QUIET_EVENT_PANEL_TYPES.includes(normalizedType)) return
      const resolvedCommandId = commandId ? String(commandId) : String(getTaskCommandId(data, raw))
      const resolvedStatus = String(status || getCommandStatus(data, raw))
      const commandName = resolveCommandName(resolvedCommandId, data, raw)

      const entry: EventPanelEntry = {
        id: this.nextId++,
        rawType: String(rawType || normalizedType),
        type: normalizedType,
        tone: getTone(normalizedType, resolvedStatus),
        beaconId: String(getBeaconId(data) || getBeaconId(raw?.data) || getBeaconId(raw)),
        commandId: resolvedCommandId,
        commandName,
        phase: String(phase || getCommandPhase(data, raw)),
        status: resolvedStatus,
        resultType: String(resultType || getCommandResultType(data, raw)),
        summary: limitSummary(formatEventSummary(normalizedType, data, raw, resolvedCommandId, phase, resolvedStatus, resultType)),
        data,
        raw: raw ?? data,
        receivedAt: Date.now(),
      }

      this.events.unshift(entry)
      if (this.events.length > this.maxEvents) {
        this.events.length = this.maxEvents
      }
    },

    /**
     * 初始化事件总线订阅(解除 wsEventRouter→eventPanel 硬依赖)。
     * 幂等:用 _subscribed flag 去重。App.vue 启动时调用。
     */
    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true

      // 来自 wsEventRouter 的事件记录(原 await import eventPanelStore)
      bus.on('ws:event-record', (payload) => {
        this.recordEvent(payload)
      })
    },
  },
})
