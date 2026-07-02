/**
 * WebSocket 事件路由模块 - 分发实时推送事件到各业务处理器
 *
 * 接收 WebSocket 原始消息，解析事件类型后分发到对应的 handler，
 * 同时记录事件到事件面板和更新相关 store 状态。
 */

// ─── 导入 ───

import {
  EVENT_TYPE,
  getBeaconId,
  getCommandPhase,
  getCommandResultType,
  getCommandStatus,
  getTaskCommandId,
  normalizeWsEvent,
} from './eventPayload.js'
import { handleCommandEvent } from './commandEventHandler.js'
import { handleTunnelEvent } from './tunnelEventHandler.js'

// ─── 常量 ───

const CURRENT_EVENT_TYPES = new Set(Object.values(EVENT_TYPE))

/**
 * 不记入事件面板的静默事件类型列表
 */
const QUIET_EVENT_TYPES = [
  EVENT_TYPE.BEACON_TICK,
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  EVENT_TYPE.TUNNEL_STATS,
]

// ─── 事件路由入口 ───

/**
 * 处理 WebSocket 原始消息，解析并分发到对应事件处理器
 * @param {string} rawData - WebSocket 接收的原始 JSON 字符串
 */
export async function handleWsEventMessage(rawData) {
  const { raw: msg, rawType, type, data } = normalizeWsEvent(rawData)

  console.log('[WS EVENT]', {
    type: rawType,
    normalizedType: type,
    data,
    raw: msg,
  })

  if (!CURRENT_EVENT_TYPES.has(type)) {
    console.warn('[WS EVENT] unsupported event type ignored:', rawType)
    return
  }

  if (type !== EVENT_TYPE.BEACON_TICK && !QUIET_EVENT_TYPES.includes(type)) {
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
    case EVENT_TYPE.BEACON_REGISTERED:
      {
        const { useAgentStore } = await import('../../stores/agent.js')
        useAgentStore().addAgent(data)
      }
      break

    case EVENT_TYPE.BEACON_TICK:
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

    case EVENT_TYPE.BEACON_REMOVED:
      {
        const bid = getBeaconId(data)
        const { useAgentStore } = await import('../../stores/agent.js')
        if (bid) useAgentStore().removeAgent(String(bid))
      }
      break

    case EVENT_TYPE.COMMAND_EVENT:
      await handleCommandEvent({
        data,
        raw: msg,
        commandId: getTaskCommandId(data, msg),
        phase: getCommandPhase(data, msg),
        status: getCommandStatus(data, msg),
        resultType: getCommandResultType(data, msg),
      })
      break

    case EVENT_TYPE.LISTENER_STATE_CHANGED:
      {
        const { useListenerStore } = await import('../../stores/listener.js')
        useListenerStore().upsertListener(data)
      }
      break

    case EVENT_TYPE.TUNNEL_STARTED:
    case EVENT_TYPE.TUNNEL_PAUSED:
    case EVENT_TYPE.TUNNEL_RESUMED:
    case EVENT_TYPE.TUNNEL_CLEARED:
    case EVENT_TYPE.TUNNEL_STOPPED:
    case EVENT_TYPE.TUNNEL_UPDATED:
    case EVENT_TYPE.TUNNEL_CHANNEL_OPEN:
    case EVENT_TYPE.TUNNEL_CHANNEL_CLOSE:
    case EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED:
    case EVENT_TYPE.TUNNEL_STATS:
    case EVENT_TYPE.TUNNEL_ACK:
      await handleTunnelEvent({ type, data })
      break

  }
}
