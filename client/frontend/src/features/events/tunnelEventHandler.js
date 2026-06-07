/**
 * Tunnel 事件处理模块 - 处理隧道相关的 WS 事件
 *
 * 根据事件类型（启动、暂停、恢复、停止、通道开闭等）
 * 更新 tunnelStore 中的隧道状态和通道列表。
 */

// ─── 导入 ───

import { getCommandField } from './eventPayload.js'

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

  if (['TUNNELSTARTED', 'TUNNELPAUSED', 'TUNNELRESUMED', 'TUNNELSTOPPED', 'TUNNELUPDATED'].includes(type)) {
    if (data && typeof data === 'object') {
      tunnelStore.upsertTunnel(data)
    }
    tunnelStore.fetchTunnels({ silent: true }).catch(err => {
      console.warn('[TUNNEL] 列表刷新失败:', err)
    })
    return
  }

  if (type === 'TUNNELCLEARED') {
    if (tunnelId) {
      tunnelStore.removeTunnelLocal(tunnelId)
    }
    tunnelStore.fetchTunnels({ silent: true }).catch(err => {
      console.warn('[TUNNEL] 列表刷新失败:', err)
    })
    return
  }

  if (type === 'TUNNELSTATS') {
    if (data && typeof data === 'object') {
      tunnelStore.upsertTunnel(data)
    }
    return
  }

  if (['TUNNELCHANNELOPEN', 'TUNNELCHANNELCLOSE', 'TUNNELCHANNELRECYCLED'].includes(type)) {
    if (tunnelId) {
      tunnelStore.fetchChannels(tunnelId, { silent: true }).catch(err => {
        console.warn('[TUNNEL] 连接列表刷新失败:', err)
      })
      tunnelStore.fetchTunnels({ silent: true }).catch(err => {
        console.warn('[TUNNEL] 列表刷新失败:', err)
      })
    }
    return
  }

  if (type === 'TUNNELERROR') {
    tunnelStore.error = String(getCommandField(data, null, ['error', 'Error', 'message', 'Message', 'error_message', 'errorMessage'], 'Tunnel 事件异常'))
  }
}
