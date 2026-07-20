/**
 * Tunnel 状态管理 Store
 * 管理端口转发/SOCKS 隧道的 CRUD、状态同步，
 * 以及 Tunnel 事件的规范化处理。
 */

import { defineStore } from 'pinia'
import * as tunnelApi from '../features/tunnel/api/tunnelApi.js'
import { pick, toNumber } from '../utils/object.js'
import { pickTunnel as adaptTunnel, pickChannel as adaptChannel } from '../shared/protocol/adapter.js'
import { TUNNEL_FIELDS } from '../shared/protocol/fieldMap.js'

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

function hasAny(item, keys) {
  if (!item || typeof item !== 'object') return false
  return keys.some(key => item[key] !== undefined && item[key] !== null && item[key] !== '')
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
  const c = adaptTunnel(item)
  const metricsSource = pick(item, ['metrics', 'Metrics', 'stats', 'Stats'], item)
  const mode = String(c.mode || 'unknown').toLowerCase()
  const activeChannels = toCount(c.activeChannels)
  return {
    tunnelId: String(c.tunnelId),
    beaconId: String(c.beaconId),
    mode,
    type: mode,
    typeLabel: TUNNEL_TYPE_LABELS[mode] || mode || '-',
    bindHost: String(c.bindHost || '127.0.0.1'),
    bindPort: toNumber(c.bindPort),
    remoteHost: String(c.remoteHost),
    remotePort: toNumber(c.remotePort),
    socksAuthMode: String(c.socksAuthMode || 'no_auth').toLowerCase(),
    socksUsername: String(c.socksUsername),
    socksUdpAssociate: toBool(c.socksUdpAssociate),
    activeChannels,
    channelCount: activeChannels,
    bytesIn: toNumber(c.bytesIn),
    bytesOut: toNumber(c.bytesOut),
    status: String(c.status || 'unknown').toLowerCase(),
    errorMessage: String(c.errorMessage),
    channelId: String(pick(metricsSource, ['channel_id', 'channelId', 'ChannelID', 'ChannelId'], '')),
    queueDepth: toCount(pick(metricsSource, ['queue_depth', 'queueDepth', 'QueueDepth'], 0)),
    dropCount: toCount(pick(metricsSource, ['drop_count', 'dropCount', 'DropCount'], 0)),
    timeoutCount: toCount(pick(metricsSource, ['timeout_count', 'timeoutCount', 'TimeoutCount'], 0)),
    openLatencyMs: toCount(pick(metricsSource, ['open_latency_ms', 'openLatencyMs', 'OpenLatencyMs'], 0)),
    createdAt: normalizeTime(c.createdAt),
    updatedAt: normalizeTime(c.updatedAt),
    raw: item,
  }
}

function normalizeChannel(item) {
  const c = adaptChannel(item)
  return {
    channelId: String(c.channelId),
    tunnelId: String(c.tunnelId),
    targetAddress: String(c.targetAddress),
    remoteHost: String(c.remoteHost),
    remotePort: toNumber(c.remotePort),
    localHost: String(c.localHost),
    localPort: toNumber(c.localPort),
    status: String(c.status || 'unknown').toLowerCase(),
    bytesIn: toNumber(c.bytesIn),
    bytesOut: toNumber(c.bytesOut),
    reason: String(c.reason),
    createdAt: normalizeTime(c.createdAt),
    updatedAt: normalizeTime(c.updatedAt),
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

function mergeTunnel(current, next) {
  const raw = next.raw || {}
  const merged = { ...current, ...next }
  // 遍历 TUNNEL_FIELDS(单一来源:fieldMap.js)决定字段取 next 还是 current:
  // raw 里有该字段别名的任一个,说明 next 携带了新值,取 next;否则保留 current。
  for (const [field, keys] of Object.entries(TUNNEL_FIELDS)) {
    merged[field] = hasAny(raw, keys) ? next[field] : current[field]
  }

  merged.channelCount = merged.activeChannels
  merged.type = merged.mode
  merged.typeLabel = TUNNEL_TYPE_LABELS[merged.mode] || merged.mode || '-'
  merged.raw = {
    ...(current.raw || {}),
    ...(next.raw || {}),
  }
  return merged
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
    tunnelAcks: [],
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
      this.tunnelAcks = this.tunnelAcks.filter(item => item.tunnelId !== key)
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
        this.tunnels.splice(index, 1, mergeTunnel(this.tunnels[index], next))
      } else {
        this.tunnels.unshift(next)
      }
      this.tunnels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      this.lastUpdated = Date.now()
    },

    upsertChannel(item) {
      const next = normalizeChannel(item)
      if (!next.tunnelId || !next.channelId) return

      const key = String(next.tunnelId)
      const list = this.channelsByTunnelId[key] || []
      const index = list.findIndex(current => current.channelId === next.channelId)

      if (index >= 0) {
        list.splice(index, 1, {
          ...list[index],
          ...next,
          raw: {
            ...(list[index].raw || {}),
            ...(next.raw || {}),
          },
        })
      } else {
        list.unshift(next)
      }

      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      this.channelsByTunnelId[key] = list
      this.lastUpdated = Date.now()
    },

    recordTunnelAck(item) {
      if (!item || typeof item !== 'object') return
      const ack = adaptTunnel(item)
      const tunnelId = String(ack.tunnelId)
      if (!tunnelId) return

      this.tunnelAcks.unshift({
        tunnelId,
        channelId: String(pick(item, ['channel_id', 'channelId', 'ChannelID', 'ChannelId'], '')),
        action: String(pick(item, ['action', 'Action'], '')),
        receivedAt: Date.now(),
        raw: item,
      })

      if (this.tunnelAcks.length > 40) {
        this.tunnelAcks.length = 40
      }
    },

    clear() {
      this.tunnels = []
      this.error = ''
      this.channelsByTunnelId = {}
      this.channelsLoading = {}
      this.channelsError = {}
      this.activeTunnelId = ''
      this.tunnelAcks = []
      this.lastUpdated = 0
    },
  },
})
