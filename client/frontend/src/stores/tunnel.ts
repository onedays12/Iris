/**
 * Tunnel 状态管理 Store
 * 管理端口转发/SOCKS 隧道的 CRUD、状态同步，
 * 以及 Tunnel 事件的规范化处理。
 */

import { defineStore } from 'pinia'
import * as tunnelApi from '../features/tunnel/api/tunnelApi'
import { pick } from '../utils/object'
import { bus } from '../shared/bus'
import { i18n } from '../i18n/index'
import { pickTunnel as adaptTunnel } from '../shared/protocol/adapter'
import {
  mergeTunnel,
  normalizeChannel,
  normalizePagePayload,
  normalizeTunnel,
  sameTunnel,
} from '../features/tunnel/model'
import type { Tunnel, TunnelChannel } from '../features/tunnel/model'
import type { StartTunnelRequest, UpdateTunnelRequest } from '../features/tunnel/api/types'

interface TunnelAck {
  tunnelId: string
  channelId: string
  action: string
  receivedAt: number
  raw: unknown
}

interface TunnelState {
  tunnels: Tunnel[]
  loading: boolean
  error: string
  channelsByTunnelId: Record<string, TunnelChannel[]>
  channelsLoading: Record<string, boolean>
  channelsError: Record<string, string>
  activeTunnelId: string
  tunnelAcks: TunnelAck[]
  lastUpdated: number
  _subscribed: boolean
}

interface SilentOption { silent?: boolean }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const useTunnelStore = defineStore('tunnel', {
  state: (): TunnelState => ({
    tunnels: [],
    loading: false,
    error: '',
    channelsByTunnelId: {},
    channelsLoading: {},
    channelsError: {},
    activeTunnelId: '',
    tunnelAcks: [],
    lastUpdated: 0,
    _subscribed: false,
  }),

  getters: {
    getChannels: (state) => (tunnelId: string) => state.channelsByTunnelId[String(tunnelId)] || [],
  },

  actions: {
    async fetchTunnels({ silent = false }: SilentOption = {}): Promise<Tunnel[]> {
      if (!silent) this.loading = true
      this.error = ''

      try {
        const pageSize = 20
        let page = 1
        const list: unknown[] = []

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
        this.error = errorMessage(err, i18n.global.t('tunnelPage.fetchListFailed'))
        throw err
      } finally {
        if (!silent) this.loading = false
      }
    },

    async createTunnel(payload: StartTunnelRequest) {
      const result = await tunnelApi.createTunnel(payload)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async updateTunnel(tunnelId: string, payload: UpdateTunnelRequest) {
      const result = await tunnelApi.updateTunnel(tunnelId, payload)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async pauseTunnel(tunnelId: string) {
      const result = await tunnelApi.pauseTunnel(tunnelId)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async resumeTunnel(tunnelId: string) {
      const result = await tunnelApi.resumeTunnel(tunnelId)
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async clearTunnel(tunnelId: string) {
      const result = await tunnelApi.clearTunnel(tunnelId)
      this.removeTunnelLocal(tunnelId)
      return result
    },

    async recycleTunnelChannels(tunnelId: string, recycledCount = 0) {
      const result = await tunnelApi.recycleTunnelChannels(tunnelId, recycledCount)
      await this.fetchChannels(tunnelId, { silent: true }).catch(() => {})
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    async stopTunnel(tunnelId: string) {
      const result = await tunnelApi.stopTunnel(tunnelId)
      if (this.activeTunnelId === String(tunnelId)) {
        await this.fetchChannels(tunnelId, { silent: true }).catch(() => {})
      }
      await this.fetchTunnels({ silent: true }).catch(() => {})
      return result
    },

    removeTunnelLocal(tunnelId: string): void {
      const key = String(tunnelId)
      this.tunnels = this.tunnels.filter(item => item.tunnelId !== key)
      delete this.channelsByTunnelId[key]
      delete this.channelsLoading[key]
      delete this.channelsError[key]
      this.tunnelAcks = this.tunnelAcks.filter(item => item.tunnelId !== key)
      this.lastUpdated = Date.now()
    },

    removeByBeacon(beaconid: string): void {
      const bid = String(beaconid || '')
      if (!bid) return

      const removedIds = new Set(
        this.tunnels
          .filter(tunnel => tunnel.beaconId === bid)
          .map(tunnel => tunnel.tunnelId),
      )
      if (!removedIds.size) return

      this.tunnels = this.tunnels.filter(tunnel => !removedIds.has(tunnel.tunnelId))
      for (const tunnelId of removedIds) {
        delete this.channelsByTunnelId[tunnelId]
        delete this.channelsLoading[tunnelId]
        delete this.channelsError[tunnelId]
      }
      this.tunnelAcks = this.tunnelAcks.filter(ack => !removedIds.has(ack.tunnelId))
      if (removedIds.has(this.activeTunnelId)) this.activeTunnelId = ''
      this.lastUpdated = Date.now()
    },

    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true
      bus.on('agent:removed', ({ beaconid }) => {
        this.removeByBeacon(beaconid)
      })
    },

    async fetchChannels(tunnelId: string, { silent = false }: SilentOption = {}): Promise<TunnelChannel[]> {
      const key = String(tunnelId)
      if (!key) return []
      if (!silent) this.channelsLoading[key] = true
      this.channelsError[key] = ''

      try {
        const pageSize = 20
        let page = 1
        const list: unknown[] = []

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
        this.channelsError[key] = errorMessage(err, i18n.global.t('tunnelPage.fetchChannelsFailed'))
        throw err
      } finally {
        if (!silent) this.channelsLoading[key] = false
      }
    },

    upsertTunnel(item: unknown): void {
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

    upsertChannel(item: unknown): void {
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

    recordTunnelAck(item: unknown): void {
      if (!item || typeof item !== 'object') return
      const ack = adaptTunnel(item)
      const tunnelId = String(ack.tunnelId)
      if (!tunnelId) return

      this.tunnelAcks.unshift({
        tunnelId,
        channelId: String(pick(item, ['channel_id'], '')),
        action: String(pick(item, ['action'], '')),
        receivedAt: Date.now(),
        raw: item,
      })

      if (this.tunnelAcks.length > 40) {
        this.tunnelAcks.length = 40
      }
    },

    clear(): void {
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
