/**
 * 事件面板 Store
 * 接收 WebSocket 推送的各类事件，规范化为统一格式后存入列表，
 * 供 EventPanel 组件展示（命令结果、连接/断开、Tunnel 等）。
 */

import { defineStore } from 'pinia'
import { COMMAND_ID, COMMAND_NAME } from '../constants/commands.js'
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
} from '../features/events/eventPayload.js'
import {
  COMMAND_RESULT_TYPE,
  isNetInfoResult,
  isNetstatResult,
  isProcessResult,
  isTransferResult,
} from '../features/events/commandResultProtocol.js'
import { formatTunnelReason } from '../utils/tunnel.js'
import { pick } from '../utils/object.js'

function getCommandName(commandId) {
  if (commandId === undefined || commandId === null || commandId === '') return ''
  const name = COMMAND_NAME[String(commandId)]
  return name || `command_${String(commandId)}`
}

function inferMigrateCommandName(data, raw = null) {
  const envelope = getCommandEnvelope(data, raw)
  const payload = getCommandResultPayload(envelope)
  const text = `${getTextResultContent(payload)} ${getTextResultContent(envelope)}`.toLowerCase()
  if (text.includes('migrate spawnto')) return 'spawnto'
  if (text.includes('migrate spawn')) return 'migrate_spawn'
  if (text.includes('migrate inject')) return 'migrate_inject'
  return ''
}

function resolveCommandName(commandId, data = null, raw = null) {
  const name = getCommandName(commandId)
  if (String(commandId) === String(COMMAND_ID.MIGRATE)) {
    return inferMigrateCommandName(data, raw) || name
  }
  return name
}

function stringifyPreview(value, limit = 220) {
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

function compactOneLine(value, limit = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function limitSummary(value, limit = 120) {
  return compactOneLine(value, limit) || '事件已接收'
}

function summarizeLs(text) {
  const match = String(text || '').match(/Listing directory:\s*([^\r\n]+?)(?:\s+Mode\b|\r?\n|$)/i)
  const path = compactOneLine(match?.[1] || '', 60)
  return path ? `目录列表已回传: ${path}` : '目录列表已回传'
}

function summarizeCommandText(commandName, text, status = '') {
  const name = String(commandName || '').toLowerCase()
  const compact = compactOneLine(text, 80)

  if (String(status || '').toLowerCase() === 'error') {
    return compact ? `任务失败: ${name || '命令'} - ${compact}` : `任务失败: ${name || '命令'}`
  }

  switch (name) {
    case 'ls':
      return summarizeLs(text)
    case 'pwd':
      return compact ? `当前目录: ${compact}` : '当前目录已回传'
    case 'whoami':
      return compact ? `用户信息: ${compact}` : '用户信息已回传'
    case 'shell':
      return 'Shell 命令已回传'
    case 'powershell':
      return 'PowerShell 命令已回传'
    case 'execution_bof':
    case 'exec-bof':
    case 'bof':
      return 'BOF 执行已回传'
    default:
      return name ? `任务回传: ${name}` : '任务回传'
  }
}

function getCommandEnvelope(data, raw = null) {
  if (data && typeof data === 'object') return data
  if (raw?.data && typeof raw.data === 'object') return raw.data
  return raw && typeof raw === 'object' ? raw : {}
}

function summarizeTransfer(data, status = '', phase = '', resultType = '', errorMessage = '') {
  const payloadDirection = getTransferDirection(data)
  const normalizedResultType = normalizeResultType(resultType)
  const transferDirection = isTransferResult(payloadDirection)
    ? payloadDirection
    : (isTransferResult(normalizedResultType) ? normalizedResultType : '')
  const actionLabel = transferDirection === COMMAND_RESULT_TYPE.UPLOAD ? '上传' : (transferDirection === COMMAND_RESULT_TYPE.DOWNLOAD ? '下载' : '传输')
  const totalChunks = pick(data, ['total_chunks', 'totalChunks', 'TotalChunks'], '')
  const receivedChunks = pick(data, ['received_chunks', 'receivedChunks', 'ReceivedChunks', 'chunk_index', 'chunkIndex'], '')
  const fileName = pick(data, ['file_name', 'fileName', 'FileName'], '')
  const error = errorMessage || getTransferError(data)
  const receivedNum = Number(receivedChunks)
  const totalNum = Number(totalChunks)
  const progress = (Number.isFinite(receivedNum) && Number.isFinite(totalNum) && totalNum > 0)
    ? `${receivedNum} / ${totalNum} chunks`
    : '传输进行中'

  if (status === 'error') {
    return error ? `${actionLabel}失败: ${error}` : `${actionLabel}失败`
  }
  if (status === 'queued') {
    return fileName ? `${actionLabel}排队: ${fileName}` : `${actionLabel}排队`
  }
  if (status === 'completed' || phase === 'result') {
    return fileName ? `${actionLabel}完成: ${fileName}` : `${actionLabel}完成`
  }
  return fileName ? `${actionLabel} ${fileName} - ${progress}` : `${actionLabel} - ${progress}`
}

function summarizeCommandEvent(data, raw = null, commandId = '', phase = '', status = '', resultType = '') {
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
    return summarizeTransfer(payload && typeof payload === 'object' ? payload : {}, normalizedStatus, normalizedPhase, normalizedResultType, error)
  }
  if (normalizedStatus === 'error') {
    const errorText = error || textContent
    const name = commandName || '命令'
    return errorText ? `任务失败: ${name} - ${errorText}` : `任务失败: ${name}`
  }
  if (normalizedResultType === COMMAND_RESULT_TYPE.TEXT) {
    return summarizeCommandText(commandName, textContent, normalizedStatus)
  }
  if (isProcessResult(normalizedResultType, rawCommandId)) {
    return Array.isArray(payload) && payload.length > 0 ? `进程列表: ${payload.length} 个进程` : '进程列表'
  }
  if (isNetInfoResult(normalizedResultType, rawCommandId)) {
    const count = Array.isArray(payload?.interfaces) ? payload.interfaces.length : 0
    return count > 0 ? `网络信息: ${count} 个接口` : '网络信息'
  }
  if (isNetstatResult(normalizedResultType, rawCommandId)) {
    const count = Array.isArray(payload?.connections) ? payload.connections.length : 0
    return count > 0 ? `网络连接: ${count} 条记录` : '网络连接'
  }
  if (normalizedResultType === COMMAND_RESULT_TYPE.CASCADE) {
    const action = pick(payload, ['action', 'Action'], '')
    const childId = pick(payload, ['child_id', 'childId', 'ChildID'], '')
    return [action ? `级联事件: ${action}` : '级联事件', childId].filter(Boolean).join(' - ')
  }
  if (commandName) return `任务回传: ${commandName}`
  if (normalizedResultType) return `任务回传: ${normalizedResultType}`
  return '任务回传'
}

export function formatEventSummary(type, data, raw = null, commandId = '', phase = '', status = '', resultType = '') {
  const bid = getBeaconId(data) || getBeaconId(raw?.data) || getBeaconId(raw)
  const eventData = (data && typeof data === 'object') ? data : {}
  const tunnelMode = pick(eventData, ['mode', 'Mode', 'type', 'Type'], '')
  const bindHost = pick(eventData, ['bind_host', 'bindHost', 'BindHost'], '')
  const bindPort = pick(eventData, ['bind_port', 'bindPort', 'BindPort'], '')
  const targetAddress = pick(eventData, ['target_address', 'targetAddress', 'TargetAddress'], '')
  const recycledCount = pick(eventData, ['recycled_count', 'recycledCount', 'RecycledCount'], '')
  const reason = pick(eventData, ['reason', 'Reason'], '')
  const error = getCommandError(eventData, raw) || pick(eventData, ['error', 'Error', 'error_message', 'errorMessage', 'message', 'Message'], '')

  switch (type) {
    case EVENT_TYPE.USER_ONLINE: {
      const username = pick(eventData, ['username', 'Username'], '')
      return username ? `用户上线: ${username}` : '用户上线'
    }
    case EVENT_TYPE.BEACON_REGISTERED:
      return bid ? `Beacon ${bid} 已上线` : 'Beacon 已上线'
    case EVENT_TYPE.BEACON_REMOVED:
      return bid ? `Beacon ${bid} 已下线` : 'Beacon 已下线'
    case EVENT_TYPE.COMMAND_EVENT:
      return summarizeCommandEvent(eventData, raw, commandId, phase, status, resultType)
    case EVENT_TYPE.LISTENER_STATE_CHANGED:
      return '监听器状态变更'
    case EVENT_TYPE.TUNNEL_STARTED:
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已启动: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已启动'
    case EVENT_TYPE.TUNNEL_PAUSED:
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已暂停: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已暂停'
    case EVENT_TYPE.TUNNEL_RESUMED:
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已恢复: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已恢复'
    case EVENT_TYPE.TUNNEL_UPDATED:
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已更新: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已更新'
    case EVENT_TYPE.TUNNEL_CLEARED:
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已清除: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已清除'
    case EVENT_TYPE.TUNNEL_STOPPED:
      return error ? `Tunnel 已停止: ${error}` : 'Tunnel 已停止'
    case EVENT_TYPE.TUNNEL_CHANNEL_OPEN:
      return targetAddress ? `Tunnel 连接已打开: ${targetAddress}` : 'Tunnel 连接已打开'
    case EVENT_TYPE.TUNNEL_CHANNEL_CLOSE:
      return targetAddress
        ? `Tunnel 连接已关闭: ${targetAddress}${reason ? ` (${formatTunnelReason(reason)})` : ''}`
        : 'Tunnel 连接已关闭'
    case EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED:
      return recycledCount ? `Tunnel 已回收 ${recycledCount} 个终态 channel` : 'Tunnel 连接已回收'
    case EVENT_TYPE.TUNNEL_STATS:
      return 'Tunnel 指标已更新'
    case EVENT_TYPE.TUNNEL_ACK: {
      const action = pick(eventData, ['action', 'Action'], '')
      return action ? `Tunnel 控制确认: ${action}` : 'Tunnel 控制确认'
    }
    default:
      return stringifyPreview(data, 180) || '事件已接收'
  }
}

function getTone(type, status = '') {
  const normalizedStatus = String(status || '').toLowerCase()
  if (normalizedStatus === 'error') return 'error'
  if (normalizedStatus === 'warn') return 'warn'
  if (normalizedStatus === 'success') return 'success'
  if ([EVENT_TYPE.BEACON_REMOVED, EVENT_TYPE.TUNNEL_STOPPED, EVENT_TYPE.TUNNEL_CLEARED, EVENT_TYPE.TUNNEL_CHANNEL_CLOSE, EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED].includes(type)) return 'warn'
  if ([EVENT_TYPE.USER_ONLINE, EVENT_TYPE.BEACON_REGISTERED, EVENT_TYPE.TUNNEL_STARTED, EVENT_TYPE.TUNNEL_RESUMED, EVENT_TYPE.TUNNEL_CHANNEL_OPEN, EVENT_TYPE.TUNNEL_ACK].includes(type)) return 'success'
  if (type === EVENT_TYPE.TUNNEL_PAUSED) return 'info'
  if (type === EVENT_TYPE.TUNNEL_UPDATED) return 'success'
  if (type === EVENT_TYPE.COMMAND_EVENT && normalizedStatus === 'completed') return 'success'
  return 'info'
}

export const useEventPanelStore = defineStore('eventPanel', {
  state: () => ({
    visible: true,
    events: [],
    maxEvents: 80,
    nextId: 1,
    width: 420,
    rightOffset: 24,
    collapsedWidth: 48,
  }),

  getters: {
    latest: (state) => state.events[0] || null,
    effectiveWidth: (state) => state.visible ? state.width + state.rightOffset : state.collapsedWidth,
  },

  actions: {
    toggleVisible() {
      this.visible = !this.visible
    },

    setWidth(w) {
      this.width = w
    },

    clear() {
      this.events = []
      this.nextId = 1
    },

    recordEvent({ rawType = '', type = '', data = null, raw = null, commandId = '', phase = '', status = '', resultType = '' }) {
      const normalizedType = normalizeEventType(type || rawType)
      if (!normalizedType || normalizedType === EVENT_TYPE.BEACON_TICK) return
      if ([EVENT_TYPE.TUNNEL_CHANNEL_OPEN, EVENT_TYPE.TUNNEL_CHANNEL_CLOSE, EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED, EVENT_TYPE.TUNNEL_STATS].includes(normalizedType)) return
      const resolvedCommandId = commandId ? String(commandId) : String(getTaskCommandId(data, raw))
      const resolvedStatus = String(status || getCommandStatus(data, raw))
      const commandName = resolveCommandName(resolvedCommandId, data, raw)

      const entry = {
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
  },
})
