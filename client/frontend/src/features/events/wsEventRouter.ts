/**
 * WebSocket 事件路由模块 - 分发实时推送事件到各业务处理器
 *
 * 接收 WebSocket 原始消息，解析事件类型后通过事件总线分发,
 * 同时记录事件到事件面板和更新相关 store 状态。
 *
 * router 不再直接 import store,改为 bus.emit,各 store 在
 * initSubscriptions 时订阅 ws:* 事件,彻底解除 router→store 的 await import 环。
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
} from './eventPayload'
import { handleCommandEvent } from './commandEventHandler'
import { handleTunnelEvent } from './tunnelEventHandler'
import { bus } from '../../shared/bus'

/**
 * 不记入事件面板的静默事件类型列表
 */
const QUIET_EVENT_TYPES = new Set<string>([
  EVENT_TYPE.BEACON_TICK,
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  EVENT_TYPE.TUNNEL_STATS,
])

// ─── 事件路由入口 ───

/**
 * 处理 WebSocket 原始消息，解析并分发到对应事件处理器
 * @param {string} rawData - WebSocket 接收的原始 JSON 字符串
 */
export async function handleWsEventMessage(rawData: unknown): Promise<void> {
  const event = normalizeWsEvent(rawData)
  const { raw: msg, rawType } = event

  if (event.status === 'unknown') {
    console.warn('[WS EVENT] unsupported event type ignored:', rawType)
    return
  }
  if (event.status === 'invalid') {
    console.warn('[WS EVENT] invalid event payload ignored:', event.error)
    return
  }

  if (!QUIET_EVENT_TYPES.has(event.type)) {
    // 通过事件总线通知 eventPanel 记录(原 await import eventPanelStore)
    bus.emit('ws:event-record', {
      rawType,
      type: event.type,
      data: event.data,
      raw: msg,
      commandId: getTaskCommandId(event.data, msg),
      phase: getCommandPhase(event.data, msg),
      status: getCommandStatus(event.data, msg),
      resultType: getCommandResultType(event.data, msg),
    })
  }

  switch (event.type) {
    case EVENT_TYPE.BEACON_REGISTERED:
      // 通过事件总线通知 agentStore(原 await import agentStore)
      bus.emit('ws:beacon-registered', { data: event.data })
      break

    case EVENT_TYPE.BEACON_TICK: {
      // agentStore 在订阅里设置 now + updateAgent(原 await import agentStore)
      const beaconid = event.data.beacon_id
      const receivedAt = Date.now()
      bus.emit('ws:beacon-tick', {
        beaconid,
        lastSeen: new Date(receivedAt).toISOString(),
        status: 'online',
      })
      break
    }

    case EVENT_TYPE.BEACON_REMOVED: {
      // 通过事件总线通知 agentStore(原 await import agentStore)
      bus.emit('ws:beacon-removed', { beaconid: event.data.beacon_id })
      break
    }

    case EVENT_TYPE.BEACON_META:
      bus.emit('ws:beacon-meta', { data: event.data })
      break

    case EVENT_TYPE.COMMAND_EVENT:
      await handleCommandEvent({
        data: event.data,
        raw: msg,
        commandId: String(getTaskCommandId(event.data, msg)),
        phase: getCommandPhase(event.data, msg),
        status: getCommandStatus(event.data, msg),
        resultType: getCommandResultType(event.data, msg),
      })
      break

    case EVENT_TYPE.LISTENER_STATE_CHANGED:
      // 通过事件总线通知 listenerStore(原 await import listenerStore)
      bus.emit('ws:listener-changed', { data: event.data })
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
      await handleTunnelEvent(event)
      break

  }
}
