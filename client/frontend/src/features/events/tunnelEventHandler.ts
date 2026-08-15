/**
 * Tunnel 事件处理模块 - 处理隧道相关的 WS 事件
 *
 * 根据事件类型（启动、暂停、恢复、停止、通道开闭等）
 * 更新 tunnelStore 中的隧道状态和通道列表。
 */

// ─── 导入 ───

import { EVENT_TYPE, getCommandField } from './eventPayload'
import type { KnownWsEvent } from './types'

type TunnelEvent = Extract<KnownWsEvent, { type: `TUNNEL_${string}` }>

// ─── 事件处理入口 ───

/**
 * 处理隧道事件
 * @param {Object} params - 事件参数
 * @param {string} params.type - 事件类型
 * @param {Object} params.data - 事件数据
 */
export async function handleTunnelEvent(event: TunnelEvent): Promise<void> {
  const { useTunnelStore } = await import('../../stores/tunnel')
  const tunnelStore = useTunnelStore()
  const { data } = event
  const tunnelId = String(getCommandField(data, null, ['tunnel_id', 'tunnelId', 'TunnelID', 'TunnelId', 'id', 'ID'], ''))

  switch (event.type) {
    case EVENT_TYPE.TUNNEL_STARTED:
    case EVENT_TYPE.TUNNEL_PAUSED:
    case EVENT_TYPE.TUNNEL_RESUMED:
    case EVENT_TYPE.TUNNEL_STOPPED:
    case EVENT_TYPE.TUNNEL_UPDATED:
    case EVENT_TYPE.TUNNEL_STATS:
      tunnelStore.upsertTunnel(data)
      return
    case EVENT_TYPE.TUNNEL_CLEARED:
      tunnelStore.removeTunnelLocal(tunnelId)
      return
    case EVENT_TYPE.TUNNEL_CHANNEL_OPEN:
    case EVENT_TYPE.TUNNEL_CHANNEL_CLOSE:
      tunnelStore.upsertChannel(data)
      return
    case EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED:
      tunnelStore.fetchChannels(tunnelId, { silent: true }).catch(err => {
        console.warn('[TUNNEL] 连接列表刷新失败:', err)
      })
      return
    case EVENT_TYPE.TUNNEL_ACK:
      tunnelStore.recordTunnelAck(data)
  }
}
