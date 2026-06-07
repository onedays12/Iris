/**
 * 网络浏览器 Store
 * 获取远程主机的网络接口和活动连接信息，
 * 并提供按 beaconid 隔离的缓存与加载状态。
 */

import { defineStore } from 'pinia'
import { sendNetworkBrowserCommands } from '../features/beacon/actions/beaconCommandActions.js'

const REQUEST_TIMEOUT = 15000

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function unwrapPayload(payload, arrayKeys = []) {
  let value = parseMaybeJson(payload)
  if (!value || typeof value !== 'object') return value

  for (const key of arrayKeys) {
    if (Array.isArray(value[key])) return value[key]
  }

  return parseMaybeJson(
    value.data || value.Data ||
    value.result || value.Result ||
    value.items || value.Items ||
    value
  )
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) return false
  }
  return null
}

function normalizeInterface(item) {
  if (!item || typeof item !== 'object') return null

  return {
    index: Number(item.index ?? item.Index ?? 0) || 0,
    name: String(item.name ?? item.Name ?? 'Unknown'),
    mtu: Number(item.mtu ?? item.MTU ?? 0) || 0,
    flags: Array.isArray(item.flags ?? item.Flags)
      ? [...(item.flags ?? item.Flags)]
      : String(item.flags ?? item.Flags ?? '').split(',').map(flag => flag.trim()).filter(Boolean),
    hardwareAddr: String(item.hardware_addr ?? item.hardwareAddr ?? item.HardwareAddr ?? item.mac ?? '-'),
    addrs: Array.isArray(item.addrs ?? item.Addrs)
      ? [...(item.addrs ?? item.Addrs)]
      : String(item.addrs ?? item.Addrs ?? '').split(',').map(addr => addr.trim()).filter(Boolean),
    isUp: normalizeBoolean(item.is_up ?? item.isUp ?? item.IsUp),
    isLoopback: normalizeBoolean(item.is_loopback ?? item.isLoopback ?? item.IsLoopback),
    isMulticast: normalizeBoolean(item.is_multicast ?? item.isMulticast ?? item.IsMulticast),
  }
}

function normalizeConnection(item) {
  if (!item || typeof item !== 'object') return null

  const localAddress = String(item.local_address ?? item.localAddress ?? item.LocalAddress ?? '-')
  const remoteAddress = String(item.remote_address ?? item.remoteAddress ?? item.RemoteAddress ?? '-')

  return {
    protocol: String(item.protocol ?? item.proto ?? item.Protocol ?? item.Proto ?? 'unk').toUpperCase(),
    localAddress,
    localPort: Number(item.local_port ?? item.localPort ?? item.LocalPort ?? 0) || 0,
    remoteAddress,
    remotePort: Number(item.remote_port ?? item.remotePort ?? item.RemotePort ?? 0) || 0,
    state: String(item.state ?? item.State ?? '-'),
    pid: String(item.pid ?? item.PID ?? '-'),
  }
}

function normalizeInterfaces(payload) {
  const value = unwrapPayload(payload, ['interfaces', 'Interfaces'])
  if (!Array.isArray(value)) return []
  return value.map(normalizeInterface).filter(Boolean).sort((a, b) => a.index - b.index)
}

function normalizeConnections(payload) {
  const value = unwrapPayload(payload, ['connections', 'Connections'])
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeConnection)
    .filter(Boolean)
    .sort((a, b) => {
      const protoCmp = a.protocol.localeCompare(b.protocol)
      if (protoCmp !== 0) return protoCmp
      const localCmp = `${a.localAddress}:${a.localPort}`.localeCompare(`${b.localAddress}:${b.localPort}`)
      if (localCmp !== 0) return localCmp
      return `${a.remoteAddress}:${a.remotePort}`.localeCompare(`${b.remoteAddress}:${b.remotePort}`)
    })
}

export const useNetworkBrowserStore = defineStore('networkBrowser', {
  state: () => ({
    interfaces: {},
    connections: {},
    loading: {},
    errorMessages: {},
    lastUpdated: {},
    timers: {},
    pending: {},
  }),

  getters: {
    getInterfaces: (state) => (beaconid) => state.interfaces[beaconid] || [],
    getConnections: (state) => (beaconid) => state.connections[beaconid] || [],
    isLoading: (state) => (beaconid) => Boolean(state.loading[beaconid]),
    getError: (state) => (beaconid) => state.errorMessages[beaconid] || '',
    getLastUpdated: (state) => (beaconid) => state.lastUpdated[beaconid] || null,
  },

  actions: {
    setLoading(beaconid, status) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid])
        delete this.timers[beaconid]
      }

      this.loading[beaconid] = status
      if (!status) return

      this.timers[beaconid] = setTimeout(() => {
        this.loading[beaconid] = false
        this.errorMessages[beaconid] = '等待网络信息结果超时，请稍后重试'
        delete this.timers[beaconid]
      }, REQUEST_TIMEOUT)
    },

    async requestAll(beaconid) {
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
        this.errorMessages[beaconid] = err.message || '下发网络浏览器指令失败'
      }
    },

    handleNetInfoResponse(beaconid, payload) {
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

    handleNetstatResponse(beaconid, payload) {
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

    clear(beaconid) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid])
        delete this.timers[beaconid]
      }

      this.loading[beaconid] = false
      this.errorMessages[beaconid] = ''
      delete this.pending[beaconid]
    },
  },
})
