/**
 * 网络浏览器 Store
 * 获取远程主机的网络接口和活动连接信息，
 * 并提供按 beaconid 隔离的缓存与加载状态。
 */

import { defineStore } from 'pinia'
import { sendNetworkBrowserCommands } from '../features/beacon/actions/beaconCommandActions'
import { bus } from '../shared/bus'
import { clearLoadingTimer, setLoadingWithTimeout } from '../shared/requestLock'
import { i18n } from '../i18n/index'

const REQUEST_TIMEOUT = 15000

export interface NetworkInterfaceInfo {
  index: number
  name: string
  mtu: number
  flags: unknown[]
  hardwareAddr: string
  addrs: unknown[]
  isUp: boolean | null
  isLoopback: boolean | null
  isMulticast: boolean | null
}

export interface NetworkConnectionInfo {
  protocol: string
  localAddress: string
  localPort: number
  remoteAddress: string
  remotePort: number
  state: string
  pid: string
}

interface NetstatPending {
  netinfo: boolean
  netstat: boolean
}

interface NetworkBrowserState {
  interfaces: Record<string, NetworkInterfaceInfo[]>
  connections: Record<string, NetworkConnectionInfo[]>
  loading: Record<string, boolean>
  errorMessages: Record<string, string>
  lastUpdated: Record<string, string>
  timers: Record<string, ReturnType<typeof setTimeout>>
  pending: Record<string, NetstatPending>
  _subscribed: boolean
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) return false
  }
  return null
}

function normalizeInterface(item: unknown): NetworkInterfaceInfo | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>

  return {
    index: Number(record.index ?? 0) || 0,
    name: String(record.name ?? 'Unknown'),
    mtu: Number(record.mtu ?? 0) || 0,
    flags: Array.isArray(record.flags) ? [...record.flags] : [],
    hardwareAddr: String(record.hardware_addr ?? '-'),
    addrs: Array.isArray(record.addrs) ? [...record.addrs] : [],
    isUp: normalizeBoolean(record.is_up),
    isLoopback: normalizeBoolean(record.is_loopback),
    isMulticast: normalizeBoolean(record.is_multicast),
  }
}

function normalizeConnection(item: unknown): NetworkConnectionInfo | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>

  const localAddress = String(record.local_address ?? '-')
  const remoteAddress = String(record.remote_address ?? '-')

  return {
    protocol: String(record.protocol ?? 'unk').toUpperCase(),
    localAddress,
    localPort: Number(record.local_port ?? 0) || 0,
    remoteAddress,
    remotePort: Number(record.remote_port ?? 0) || 0,
    state: String(record.state ?? '-'),
    pid: String(record.pid ?? '-'),
  }
}

function normalizeInterfaces(payload: unknown): NetworkInterfaceInfo[] {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).interfaces : undefined
  if (!Array.isArray(value)) return []
  return value.map(normalizeInterface).filter((item): item is NetworkInterfaceInfo => Boolean(item)).sort((a, b) => a.index - b.index)
}

function normalizeConnections(payload: unknown): NetworkConnectionInfo[] {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).connections : undefined
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeConnection)
    .filter((item): item is NetworkConnectionInfo => Boolean(item))
    .sort((a, b) => {
      const protoCmp = a.protocol.localeCompare(b.protocol)
      if (protoCmp !== 0) return protoCmp
      const localCmp = `${a.localAddress}:${a.localPort}`.localeCompare(`${b.localAddress}:${b.localPort}`)
      if (localCmp !== 0) return localCmp
      return `${a.remoteAddress}:${a.remotePort}`.localeCompare(`${b.remoteAddress}:${b.remotePort}`)
    })
}

export const useNetworkBrowserStore = defineStore('networkBrowser', {
  state: (): NetworkBrowserState => ({
    interfaces: {},
    connections: {},
    loading: {},
    errorMessages: {},
    lastUpdated: {},
    timers: {},
    pending: {},
    _subscribed: false,
  }),

  getters: {
    getInterfaces: (state) => (beaconid: string) => state.interfaces[beaconid] || [],
    getConnections: (state) => (beaconid: string) => state.connections[beaconid] || [],
    isLoading: (state) => (beaconid: string) => Boolean(state.loading[beaconid]),
    getError: (state) => (beaconid: string) => state.errorMessages[beaconid] || '',
    getLastUpdated: (state) => (beaconid: string) => state.lastUpdated[beaconid] || null,
  },

  actions: {
    setLoading(beaconid: string, status: boolean): void {
      setLoadingWithTimeout(this, beaconid, status, i18n.global.t('networkBrowser.infoTimeout'), REQUEST_TIMEOUT)
    },

    async requestAll(beaconid: string): Promise<void> {
      if (!beaconid) return

      this.errorMessages[beaconid] = ''
      this.pending[beaconid] = {
        netinfo: true,
        netstat: true,
      }
      this.setLoading(beaconid, true)

      try {
        await sendNetworkBrowserCommands(beaconid)
      } catch (err) {
        this.setLoading(beaconid, false)
        this.errorMessages[beaconid] = (err instanceof Error ? err.message : String(err)) || i18n.global.t('networkBrowser.sendFailed')
      }
    },

    handleNetInfoResponse(beaconid: string, payload: unknown): void {
      this.interfaces[beaconid] = normalizeInterfaces(payload)
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.errorMessages[beaconid] = ''
      this.pending[beaconid] = {
        ...(this.pending[beaconid] || { netinfo: true, netstat: true }),
        netinfo: false,
      }

      if (!this.pending[beaconid].netinfo && !this.pending[beaconid].netstat) {
        this.setLoading(beaconid, false)
      }
    },

    handleNetInfoError(beaconid: string, message = i18n.global.t('networkBrowser.fetchInterfacesFailed')): void {
      this.interfaces[beaconid] = []
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.errorMessages[beaconid] = message
      this.pending[beaconid] = {
        ...(this.pending[beaconid] || { netinfo: true, netstat: true }),
        netinfo: false,
      }

      if (!this.pending[beaconid].netinfo && !this.pending[beaconid].netstat) {
        this.setLoading(beaconid, false)
      }
    },

    handleNetstatResponse(beaconid: string, payload: unknown): void {
      this.connections[beaconid] = normalizeConnections(payload)
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.errorMessages[beaconid] = ''
      this.pending[beaconid] = {
        ...(this.pending[beaconid] || { netinfo: true, netstat: true }),
        netstat: false,
      }

      if (!this.pending[beaconid].netinfo && !this.pending[beaconid].netstat) {
        this.setLoading(beaconid, false)
      }
    },

    handleNetstatError(beaconid: string, message = i18n.global.t('networkBrowser.fetchConnectionsFailed')): void {
      this.connections[beaconid] = []
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.errorMessages[beaconid] = message
      this.pending[beaconid] = {
        ...(this.pending[beaconid] || { netinfo: true, netstat: true }),
        netstat: false,
      }

      if (!this.pending[beaconid].netinfo && !this.pending[beaconid].netstat) {
        this.setLoading(beaconid, false)
      }
    },

    clear(beaconid: unknown): void {
      const key = String(beaconid || '')
      if (!key) return
      clearLoadingTimer(this, key)

      delete this.interfaces[key]
      delete this.connections[key]
      delete this.loading[key]
      delete this.errorMessages[key]
      delete this.lastUpdated[key]
      delete this.pending[key]
    },

    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true
      bus.on('agent:removed', ({ beaconid }) => {
        this.clear(beaconid)
      })
    },
  },
})
