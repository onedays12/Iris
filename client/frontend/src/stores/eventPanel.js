/**
 * 事件面板 Store
 * 接收 WebSocket 推送的各类事件，规范化为统一格式后存入列表，
 * 供 EventPanel 组件展示（命令结果、连接/断开、Tunnel 等）。
 */

import { defineStore } from 'pinia'
import { COMMAND_NAME } from '../constants/commands.js'
import { formatTunnelReason } from '../utils/tunnel.js'
import { pick } from '../utils/object.js'

function normalizeType(type) {
  const normalized = String(type || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return normalized.startsWith('EVENT') ? normalized.slice(5) : normalized
}

function pickArray(data, keys, fallback = []) {
  if (!data || typeof data !== 'object') return fallback
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key]
  }
  return fallback
}

function unwrapPayload(data) {
  if (!data || typeof data !== 'object') return data
  const payload = pick(data, ['data', 'Data', 'result', 'Result', 'content', 'Content', 'payload', 'Payload'], undefined)
  return payload === undefined ? data : payload
}

function getTextContent(payload) {
  if (payload === undefined || payload === null) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object') {
    const text = pick(payload, ['text', 'Text', 'value', 'Value'], '')
    if (text !== '') return String(text)
  }
  return ''
}

function getCommandName(commandId) {
  if (commandId === undefined || commandId === null || commandId === '') return ''
  const name = COMMAND_NAME[String(commandId)]
  return name || `command_${String(commandId)}`
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

function formatSummary(type, data, raw = null, commandId = '', phase = '', status = '', resultType = '') {
  const bid = pick(data, ['beacon_id', 'beaconId', 'BeaconId', 'BeaconID']) || pick(raw, ['beacon_id', 'beaconId', 'BeaconId', 'BeaconID'])
  const envelope = (data && typeof data === 'object') ? data : (raw && typeof raw === 'object' ? raw : {})
  const detail = unwrapPayload(envelope)
  const detailSource = detail && typeof detail === 'object' ? detail : envelope
  const normalizedPhase = String(phase || pick(envelope, ['phase', 'Phase'], pick(raw, ['phase', 'Phase'], ''))).toLowerCase()
  const normalizedStatus = String(status || pick(envelope, ['status', 'Status'], pick(raw, ['status', 'Status'], ''))).toLowerCase()
  const normalizedResultType = String(resultType || pick(envelope, ['result_type', 'resultType', 'ResultType', 'type', 'Type'], pick(raw, ['result_type', 'resultType', 'ResultType'], ''))).toLowerCase()
  const totalChunks = pick(detailSource, ['total_chunks', 'totalChunks', 'TotalChunks'], pick(envelope, ['total_chunks', 'totalChunks', 'TotalChunks'], ''))
  const receivedChunks = pick(detailSource, ['received_chunks', 'receivedChunks', 'ReceivedChunks', 'chunk_index', 'chunkIndex'], pick(envelope, ['received_chunks', 'receivedChunks', 'ReceivedChunks', 'chunk_index', 'chunkIndex'], ''))
  const error = pick(detailSource, ['error', 'Error', 'error_message', 'errorMessage', 'message', 'Message'], pick(envelope, ['error', 'Error', 'error_message', 'errorMessage', 'message', 'Message'], ''))
  const fileName = pick(detailSource, ['file_name', 'fileName', 'FileName', 'name', 'Name'], pick(envelope, ['file_name', 'fileName', 'FileName', 'name', 'Name'], ''))
  const tunnelMode = pick(detailSource, ['mode', 'Mode', 'type', 'Type'], pick(envelope, ['mode', 'Mode', 'type', 'Type'], ''))
  const bindHost = pick(detailSource, ['bind_host', 'bindHost', 'BindHost'], pick(envelope, ['bind_host', 'bindHost', 'BindHost'], ''))
  const bindPort = pick(detailSource, ['bind_port', 'bindPort', 'BindPort'], pick(envelope, ['bind_port', 'bindPort', 'BindPort'], ''))
  const targetAddress = pick(detailSource, ['target_address', 'targetAddress', 'TargetAddress'], pick(envelope, ['target_address', 'targetAddress', 'TargetAddress'], ''))
  const recycledCount = pick(detailSource, ['recycled_count', 'recycledCount', 'RecycledCount'], pick(envelope, ['recycled_count', 'recycledCount', 'RecycledCount'], ''))
  const reason = pick(detailSource, ['reason', 'Reason'], pick(envelope, ['reason', 'Reason'], ''))
  const textContent = getTextContent(detailSource)
  const netInfoCount = pickArray(detailSource, ['interfaces', 'Interfaces'], pickArray(envelope, ['interfaces', 'Interfaces'], [])).length
  const netstatCount = pickArray(detailSource, ['connections', 'Connections'], pickArray(envelope, ['connections', 'Connections'], [])).length
  const rawCommandId = commandId || pick(envelope, ['command_id', 'commandId', 'CommandID', 'CommandId'])
    || pick(raw, ['command_id', 'commandId', 'CommandID', 'CommandId'])
  const commandName = getCommandName(rawCommandId)
  const receivedNum = Number(receivedChunks)
  const totalNum = Number(totalChunks)
  const progress = (Number.isFinite(receivedNum) && Number.isFinite(totalNum) && totalNum > 0)
    ? `${receivedNum} / ${totalNum} chunks`
    : '传输进行中'

  switch (type) {
    case 'BEACONREGISTERED':
      return bid ? `Beacon ${bid} 已上线` : 'Beacon 已上线'
    case 'BEACONREMOVED':
      return bid ? `Beacon ${bid} 已下线` : 'Beacon 已下线'
    case 'COMMANDEVENT':
      if (normalizedResultType === 'text') {
        return summarizeCommandText(commandName, textContent, normalizedStatus)
      }
      if (['download', 'upload'].includes(normalizedResultType)) {
        const actionLabel = normalizedResultType === 'upload' ? '上传' : '下载'
        if (normalizedStatus === 'error') {
          return error ? `${actionLabel}失败: ${error}` : `${actionLabel}失败`
        }
        if (normalizedStatus === 'queued') {
          return fileName ? `${actionLabel}排队: ${fileName}` : `${actionLabel}排队`
        }
        if (normalizedStatus === 'completed' || normalizedPhase === 'result') {
          return fileName ? `${actionLabel}完成: ${fileName}` : `${actionLabel}完成`
        }
        return fileName ? `${actionLabel} ${fileName} - ${progress}` : `${actionLabel} - ${progress}`
      }
      if (normalizedStatus === 'error') {
        return error ? `任务失败: ${commandName} - ${error}` : `任务失败: ${commandName}`
      }
      if (normalizedResultType === 'net_info' || normalizedResultType === 'netinfo' || commandName === 'netinfo') {
        return netInfoCount > 0 ? `网络信息: ${netInfoCount} 个接口` : '网络信息'
      }
      if (normalizedResultType === 'netstat' || commandName === 'netstat') {
        return netstatCount > 0 ? `网络连接: ${netstatCount} 条记录` : '网络连接'
      }
      if (commandName) return `任务回传: ${commandName}`
      if (normalizedResultType) return `任务回传: ${normalizedResultType}`
      return '任务回传'
    case 'LISTENERSTATECHANGE':
    case 'LISTENERSTATECHANGED':
      return '监听器状态变更'
    case 'TUNNELSTARTED':
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已启动: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已启动'
    case 'TUNNELPAUSED':
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已暂停: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已暂停'
    case 'TUNNELRESUMED':
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已恢复: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已恢复'
    case 'TUNNELUPDATED':
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已更新: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已更新'
    case 'TUNNELCLEARED':
      return tunnelMode || bindHost || bindPort
        ? `Tunnel 已清除: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(':')].filter(Boolean).join(' · ')}`
        : 'Tunnel 已清除'
    case 'TUNNELSTOPPED':
      return error ? `Tunnel 已停止: ${error}` : 'Tunnel 已停止'
    case 'TUNNELCHANNELOPEN':
      return targetAddress ? `Tunnel 连接已打开: ${targetAddress}` : 'Tunnel 连接已打开'
    case 'TUNNELCHANNELCLOSE':
      return targetAddress
        ? `Tunnel 连接已关闭: ${targetAddress}${reason ? ` (${formatTunnelReason(reason)})` : ''}`
        : 'Tunnel 连接已关闭'
    case 'TUNNELCHANNELRECYCLED':
      return recycledCount ? `Tunnel 已回收 ${recycledCount} 个终态 channel` : 'Tunnel 连接已回收'
    case 'TUNNELERROR':
      return error ? `Tunnel 异常: ${error}` : 'Tunnel 异常'
    case 'SYSTEMLOG':
      return stringifyPreview(pick(data, ['content', 'Content'], data), 180) || '系统日志'
    case 'PLUGINNOTIFY': {
      const pluginMessage = pick(detailSource, ['message', 'Message', 'msg', 'Msg'], pick(envelope, ['message', 'Message', 'msg', 'Msg'], ''))
      return pluginMessage ? `插件通知: ${pluginMessage}` : '插件通知'
    }
    default:
      return stringifyPreview(data, 180) || '事件已接收'
  }
}

function getTone(type, status = '') {
  const normalizedStatus = String(status || '').toLowerCase()
  if (normalizedStatus === 'error' || type === 'TUNNELERROR') return 'error'
  if (normalizedStatus === 'warn') return 'warn'
  if (normalizedStatus === 'success') return 'success'
  if (type === 'BEACONREMOVED' || type === 'TUNNELSTOPPED' || type === 'TUNNELCLEARED' || type === 'TUNNELCHANNELCLOSE' || type === 'TUNNELCHANNELRECYCLED') return 'warn'
  if (type === 'BEACONREGISTERED' || type === 'TUNNELSTARTED' || type === 'TUNNELRESUMED' || type === 'TUNNELCHANNELOPEN') return 'success'
  if (type === 'TUNNELPAUSED') return 'info'
  if (type === 'TUNNELUPDATED') return 'success'
  if (type === 'COMMANDEVENT' && normalizedStatus === 'completed') return 'success'
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
      const normalizedType = normalizeType(type || rawType)
      if (!normalizedType || normalizedType === 'BEACONTICK') return
      if (['TUNNELCHANNELOPEN', 'TUNNELCHANNELCLOSE', 'TUNNELCHANNELRECYCLED', 'TUNNELSTATS'].includes(normalizedType)) return
      const commandName = getCommandName(commandId)

      const entry = {
        id: this.nextId++,
        rawType: String(rawType || normalizedType),
        type: normalizedType,
        tone: getTone(normalizedType, status),
        beaconId: String(pick(data, ['beacon_id', 'beaconId', 'BeaconId', 'BeaconID'], '')),
        commandId: commandId ? String(commandId) : String(pick(data, ['command_id', 'commandId', 'CommandID', 'CommandId'], '')),
        commandName,
        phase: String(phase || pick(data, ['phase', 'Phase'], '')),
        status: String(status || pick(data, ['status', 'Status'], '')),
        resultType: String(resultType || pick(data, ['result_type', 'resultType', 'ResultType', 'type', 'Type'], '')),
        summary: limitSummary(formatSummary(normalizedType, data, raw, commandId, phase, status, resultType)),
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
