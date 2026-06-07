/**
 * Tunnel 状态管理 Store
 * 管理端口转发/SOCKS 隧道的 CRUD、状态同步，
 * 以及 Tunnel 事件的规范化处理。
 */

import { defineStore } from 'pinia'
import * as tunnelApi from '../features/tunnel/api/tunnelApi.js'
import { pick, toNumber } from '../utils/object.js'

function toCount(value) {
  const number = toNumber(value)
  return number > 0 ? number : 0
}

function toBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  const text = String(value ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off', ''].includes(text)) return false
  return Boolean(value)
}

function normalizeTime(value) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const TUNNEL_TYPE_LABELS = {
  socks5: 'SOCKS5',
  port_forward: 'Port Forward',
  reverse_port_map: 'Reverse Port Map',
  http_proxy: 'HTTP Proxy',
  udp_proxy: 'UDP Proxy',
}

function normalizePagePayload(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      page: 1,
      pageSize: payload.length,
      total: payload.length,
      hasMore: false,
    }
  }

  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.Items) ? payload.Items : []
  return {
    items,
    page: toNumber(pick(payload, ['page', 'Page'], 1)),
    pageSize: toNumber(pick(payload, ['page_size', 'pageSize', 'PageSize'], items.length || 0)),
    total: toNumber(pick(payload, ['total', 'Total'], items.length || 0)),
    hasMore: toBool(pick(payload, ['has_more', 'hasMore', 'HasMore'], false)),
  }
}

function normalizeTunnel(item) {
  const tunnelId = String(pick(item, ['tunnel_id', 'tunnelId', 'TunnelID', 'TunnelId', 'id', 'ID']))
  const mode = String(pick(item, ['mode', 'Mode', 'type', 'Type'], 'unknown')).toLowerCase()
  const activeChannels = toCount(pick(item, ['active_channels', 'activeChannels', 'ActiveChannels', 'connections', 'Connections', 'conn_count', 'connCount'], 0))
  const metricsSource = pick(item, ['metrics', 'Metrics', 'stats', 'Stats'], item)
  return {
    tunnelId,
    beaconId: String(pick(item, ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId'])),
    mode,
    type: mode,
    typeLabel: TUNNEL_TYPE_LABELS[mode] || mode || '-',
    bindHost: String(pick(item, ['bind_host', 'bindHost', 'BindHost', 'listen_host', 'listenHost'], '127.0.0.1')),
    bindPort: toNumber(pick(item, ['bind_port', 'bindPort', 'BindPort', 'listen_port', 'listenPort'], 0)),
    remoteHost: String(pick(item, ['remote_host', 'remoteHost', 'RemoteHost', 'target_host', 'targetHost'], '')),
    remotePort: toNumber(pick(item, ['remote_port', 'remotePort', 'RemotePort', 'target_port', 'targetPort'], 0)),
    socksAuthMode: String(pick(item, ['socks_auth_mode', 'socksAuthMode', 'SocksAuthMode'], 'no_auth')).toLowerCase(),
    socksUsername: String(pick(item, ['socks_username', 'socksUsername', 'SocksUsername'], '')),
    socksUdpAssociate: toBool(pick(item, ['socks_udp_associate', 'socksUdpAssociate', 'SocksUdpAssociate'], false)),
    activeChannels,
    channelCount: activeChannels,
    bytesIn: toNumber(pick(item, ['bytes_in', 'bytesIn', 'BytesIn', 'in_bytes', 'inBytes'], 0)),
    bytesOut: toNumber(pick(item, ['bytes_out', 'bytesOut', 'BytesOut', 'out_bytes', 'outBytes'], 0)),
    status: String(pick(item, ['status', 'Status', 'state', 'State'], 'unknown')).toLowerCase(),
    errorMessage: String(pick(item, ['error_message', 'errorMessage', 'ErrorMessage'], '')),
    channelId: String(pick(metricsSource, ['channel_id', 'channelId', 'ChannelID', 'ChannelId'], '')),
    queueDepth: toCount(pick(metricsSource, ['queue_depth', 'queueDepth', 'QueueDepth'], 0)),
    dropCount: toCount(pick(metricsSource, ['drop_count', 'dropCount', 'DropCount'], 0)),
    timeoutCount: toCount(pick(metricsSource, ['timeout_count', 'timeoutCount', 'TimeoutCount'], 0)),
    openLatencyMs: toCount(pick(metricsSource, ['open_latency_ms', 'openLatencyMs', 'OpenLatencyMs'], 0)),
    createdAt: normalizeTime(pick(item, ['created_at', 'createdAt', 'CreatedAt', 'start_time', 'startTime', 'StartTime'], 0)),
    updatedAt: normalizeTime(pick(item, ['updated_at', 'updatedAt', 'UpdatedAt', 'last_seen', 'lastSeen', 'LastSeen'], 0)),
    raw: item,
  }
}

function normalizeChannel(item) {
  const targetAddress = String(pick(item, ['target_address', 'targetAddress', 'TargetAddress', 'target', 'Target'], ''))
  return {
    channelId: String(pick(item, ['channel_id', 'channelId', 'ChannelID', 'ChannelId', 'id', 'ID'])),
    tunnelId: String(pick(item, ['tunnel_id', 'tunnelId', 'TunnelID', 'TunnelId'])),
    targetAddress,
    remoteHost: String(pick(item, ['remote_host', 'remoteHost', 'RemoteHost', 'dst_addr', 'dstAddr', 'target_host', 'targetHost'], '')),
    remotePort: toNumber(pick(item, ['remote_port', 'remotePort', 'RemotePort', 'dst_port', 'dstPort', 'target_port', 'targetPort'], 0)),
    localHost: String(pick(item, ['local_host', 'localHost', 'LocalHost', 'src_addr', 'srcAddr', 'client_addr', 'clientAddr'], '')),
    localPort: toNumber(pick(item, ['local_port', 'localPort', 'LocalPort', 'src_port', 'srcPort', 'client_port', 'clientPort'], 0)),
    status: String(pick(item, ['status', 'Status', 'state', 'State'], 'unknown')).toLowerCase(),
    bytesIn: toNumber(pick(item, ['bytes_in', 'bytesIn', 'BytesIn', 'in_bytes', 'inBytes'])),
    bytesOut: toNumber(pick(item, ['bytes_out', 'bytesOut', 'BytesOut', 'out_bytes', 'outBytes'])),
    reason: String(pick(item, ['reason', 'Reason'], '')),
    createdAt: normalizeTime(pick(item, ['created_at', 'createdAt', 'CreatedAt', 'time', 'Time'], 0)),
    updatedAt: normalizeTime(pick(item, ['updated_at', 'updatedAt', 'UpdatedAt', 'last_seen', 'lastSeen', 'LastSeen'], 0)),
    raw: item,
  }
}

function sameTunnel(left, right) {
  if (left.tunnelId && right.tunnelId && left.tunnelId === right.tunnelId) return true
  return Boolean(
    left.beaconId &&
    right.beaconId &&
    left.type === right.type &&
    left.bindHost === right.bindHost &&
    left.bindPort === right.bindPort &&
    left.remoteHost === right.remoteHost &&
    left.remotePort === right.remotePort &&
    left.socksAuthMode === right.socksAuthMode &&
    left.socksUdpAssociate === right.socksUdpAssociate
  )
}

export const useTunnelStore = defineStore('tunnel', {
  state: () => ({
    tunnels: [],
    loading: false,
    error: '',
    channelsByTunnelId: {},
    channelsLoading: {},
    channelsError: {},
    activeTunnelId: '',
    lastUpdated: 0,
  }),

  getters: {
    getChannels: (state) => (tunnelId) => state.channelsByTunnelId[String(tunnelId)] || [],
  },

  actions: {
    async fetchTunnels({ silent = false } = {}) {
      if (!silent) this.loading = true
      this.error = ''

      try {
        const pageSize = 20
        let page = 1
        const list = []

        while (true) {
          const data = await tunnelApi.listTunnels(page, pageSize)
          const pageData = normalizePagePayload(data)
          list.push(...pageData.items)

          if (!pageData.hasMore || pageData.items.length === 0) break
          page += 1
        }

        this.tunnels = list.map(normalizeTunnel).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        this.lastUpdated = Date.now()
        return this.tunnels
      } catch (err) {
        this.error = err.message || '获取 Tunnel 列表失败'
        throw err
      } finally {
        if (!silent) this.loading = false
      }
    },

    async createTunnel(payload) {
      const result = await tunnelApi.createTunnel(payload)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async updateTunnel(tunnelId, payload) {
      const result = await tunnelApi.updateTunnel(tunnelId, payload)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async pauseTunnel(tunnelId) {
      const result = await tunnelApi.pauseTunnel(tunnelId)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async resumeTunnel(tunnelId) {
      const result = await tunnelApi.resumeTunnel(tunnelId)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async clearTunnel(tunnelId) {
      const result = await tunnelApi.clearTunnel(tunnelId)
      this.removeTunnelLocal(tunnelId)
      return result
    },

    async recycleTunnelChannels(tunnelId, recycledCount = 0) {
      const result = await tunnelApi.recycleTunnelChannels(tunnelId, recycledCount)
      await this.fetchChannels(tunnelId, { silent: true }).catch(() => {})
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async stopTunnel(tunnelId) {
      const result = await tunnelApi.stopTunnel(tunnelId)
      if (this.activeTunnelId === String(tunnelId)) {
        await this.fetchChannels(tunnelId, { silent: true }).catch(() => {})
      }
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    removeTunnelLocal(tunnelId) {
      const key = String(tunnelId)
      this.tunnels = this.tunnels.filter(item => item.tunnelId !== key)
      delete this.channelsByTunnelId[key]
      delete this.channelsLoading[key]
      delete this.channelsError[key]
      this.lastUpdated = Date.now()
    },

    async fetchChannels(tunnelId, { silent = false } = {}) {
      const key = String(tunnelId)
      if (!key) return []
      if (!silent) this.channelsLoading[key] = true
      this.channelsError[key] = ''

      try {
        const pageSize = 20
        let page = 1
        const list = []

        while (true) {
          const data = await tunnelApi.listTunnelChannels(key, page, pageSize)
          const pageData = normalizePagePayload(data)
          list.push(...pageData.items)

          if (!pageData.hasMore || pageData.items.length === 0) break
          page += 1
        }

        this.channelsByTunnelId[key] = list.map(normalizeChannel).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        return this.channelsByTunnelId[key]
      } catch (err) {
        this.channelsError[key] = err.message || '获取连接列表失败'
        throw err
      } finally {
        if (!silent) this.channelsLoading[key] = false
      }
    },

    upsertTunnel(item) {
      const next = normalizeTunnel(item)
      if (!next.tunnelId && !next.bindPort) return

      const index = this.tunnels.findIndex(current => sameTunnel(current, next))
      if (index >= 0) {
        this.tunnels.splice(index, 1, {
          ...this.tunnels[index],
          ...next,
        })
      } else {
        this.tunnels.unshift(next)
      }
      this.tunnels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      this.lastUpdated = Date.now()
    },

    clear() {
      this.tunnels = []
      this.error = ''
      this.channelsByTunnelId = {}
      this.channelsLoading = {}
      this.channelsError = {}
      this.activeTunnelId = ''
      this.lastUpdated = 0
    },
  },
})
