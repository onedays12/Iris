/**
 * WebSocket 事件路由模块 - 分发实时推送事件到各业务处理器
 *
 * 接收 WebSocket 原始消息，解析事件类型后分发到对应的 handler，
 * 同时记录事件到事件面板和更新相关 store 状态。
 */

// ─── 导入 ───

import {
  getBeaconId,
  getCommandPhase,
  getCommandResultType,
  getCommandStatus,
  getTaskCommandId,
  normalizeEventData,
  normalizeEventType,
} from './eventPayload.js'
import { handleCommandEvent } from './commandEventHandler.js'
import { handleTunnelEvent } from './tunnelEventHandler.js'

// ─── 常量 ───

/**
 * 不记入事件面板的静默事件类型列表
 */
const QUIET_EVENT_TYPES = ['BEACONTICK', 'TUNNELCHANNELOPEN', 'TUNNELCHANNELCLOSE', 'TUNNELCHANNELRECYCLED', 'TUNNELSTATS']

// ─── 事件路由入口 ───

/**
 * 处理 WebSocket 原始消息，解析并分发到对应事件处理器
 * @param {string} rawData - WebSocket 接收的原始 JSON 字符串
 */
export async function handleWsEventMessage(rawData) {
  const msg = JSON.parse(rawData)
  const rawType = msg.type || msg.Type || msg.event || msg.Event || msg.event_type || msg.EventType
  const type = normalizeEventType(rawType)
  const data = normalizeEventData(msg.data ?? msg.Data ?? msg.payload ?? msg.Payload)

  console.log('[WS EVENT]', {
    type: rawType,
    normalizedType: type,
    data,
    raw: msg,
  })

  if (type !== 'BEACONTICK' && !QUIET_EVENT_TYPES.includes(type)) {
    const { useEventPanelStore } = await import('../../stores/eventPanel.js')
    useEventPanelStore().recordEvent({
      rawType,
      type,
      data: data && typeof data === 'object' ? data : msg,
      raw: msg,
      commandId: getTaskCommandId(data, msg),
      phase: getCommandPhase(data, msg),
      status: getCommandStatus(data, msg),
      resultType: getCommandResultType(data, msg),
    })
  }

  if (!data) return

  switch (type) {
    case 'BEACONREGISTERED':
    case 'BEACONONLINE':
      {
        const { useAgentStore } = await import('../../stores/agent.js')
        useAgentStore().addAgent(data)
      }
      break

    case 'BEACONTICK':
      {
        const { useAgentStore } = await import('../../stores/agent.js')
        const agentStore = useAgentStore()
        const receivedAt = Date.now()
        agentStore.now = receivedAt
        agentStore.updateAgent(getBeaconId(data), {
          lastSeen: new Date(receivedAt).toISOString(),
          status: 'online',
        })
      }
      break

    case 'BEACONREMOVED':
      {
        const bid = getBeaconId(data)
        const { useAgentStore } = await import('../../stores/agent.js')
        if (bid) useAgentStore().removeAgent(String(bid))
      }
      break

    case 'COMMANDEVENT':
      await handleCommandEvent({
        data,
        raw: msg,
        commandId: getTaskCommandId(data, msg),
        phase: getCommandPhase(data, msg),
        status: getCommandStatus(data, msg),
        resultType: getCommandResultType(data, msg),
      })
      break

    case 'LISTENERSTATECHANGE':
    case 'LISTENERSTATECHANGED':
      {
        const { useListenerStore } = await import('../../stores/listener.js')
        useListenerStore().fetchListeners()
      }
      break

    case 'TUNNELSTARTED':
    case 'TUNNELPAUSED':
    case 'TUNNELRESUMED':
    case 'TUNNELCLEARED':
    case 'TUNNELSTOPPED':
    case 'TUNNELUPDATED':
    case 'TUNNELCHANNELOPEN':
    case 'TUNNELCHANNELCLOSE':
    case 'TUNNELCHANNELRECYCLED':
    case 'TUNNELSTATS':
    case 'TUNNELERROR':
      await handleTunnelEvent({ type, data })
      break

    case 'SYSTEMLOG':
      console.log('[SYSTEM]', data.content || data)
      break
  }
}
