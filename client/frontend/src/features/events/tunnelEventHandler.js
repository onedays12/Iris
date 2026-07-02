/**
 * Tunnel 事件处理模块 - 处理隧道相关的 WS 事件
 *
 * 根据事件类型（启动、暂停、恢复、停止、通道开闭等）
 * 更新 tunnelStore 中的隧道状态和通道列表。
 */

// ─── 导入 ───

import { EVENT_TYPE, getCommandField } from './eventPayload.js'

// ─── 事件处理入口 ───

/**
 * 处理隧道事件
 * @param {Object} params - 事件参数
 * @param {string} params.type - 事件类型
 * @param {Object} params.data - 事件数据
 */
export async function handleTunnelEvent({ type, data }) {
  const { useTunnelStore } = await import('../../stores/tunnel.js')
  const tunnelStore = useTunnelStore()
  const tunnelId = String(getCommandField(data, null, ['tunnel_id', 'tunnelId', 'TunnelID', 'TunnelId', 'id', 'ID'], ''))

  if ([
    EVENT_TYPE.TUNNEL_STARTED,
    EVENT_TYPE.TUNNEL_PAUSED,
    EVENT_TYPE.TUNNEL_RESUMED,
    EVENT_TYPE.TUNNEL_STOPPED,
    EVENT_TYPE.TUNNEL_UPDATED,
    EVENT_TYPE.TUNNEL_STATS,
  ].includes(type)) {
    if (data && typeof data === 'object') {
      tunnelStore.upsertTunnel(data)
    }
    return
  }

  if (type === EVENT_TYPE.TUNNEL_CLEARED) {
    if (tunnelId) {
      tunnelStore.removeTunnelLocal(tunnelId)
    }
    return
  }

  if ([
    EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
    EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  ].includes(type)) {
    if (data && typeof data === 'object') {
      tunnelStore.upsertChannel(data)
    }
    return
  }

  if (type === EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED) {
    if (tunnelId) {
      tunnelStore.fetchChannels(tunnelId, { silent: true }).catch(err => {
        console.warn('[TUNNEL] 连接列表刷新失败:', err)
      })
    }
    return
  }

  if (type === EVENT_TYPE.TUNNEL_ACK) {
    tunnelStore.recordTunnelAck(data)
  }
}
