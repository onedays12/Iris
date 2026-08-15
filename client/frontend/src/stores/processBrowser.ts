/**
 * 进程浏览器 Store
 * 获取远程主机的进程列表，提供按 beaconid 隔离的缓存与加载状态。
 */

import { defineStore } from 'pinia'
import { sendProcessListCommand } from '../features/beacon/actions/beaconCommandActions'
import { bus } from '../shared/bus'
import { clearLoadingTimer, setLoadingWithTimeout } from '../shared/requestLock'
import { i18n } from '../i18n/index'

const REQUEST_TIMEOUT = 15000

export interface ProcessInfo {
  pid: string
  ppid: string
  arch: string
  session: string
  user: string
  name: string
  path: string
}

interface ProcessBrowserState {
  processes: Record<string, ProcessInfo[]>
  loading: Record<string, boolean>
  errorMessages: Record<string, string>
  lastUpdated: Record<string, string>
  timers: Record<string, ReturnType<typeof setTimeout>>
  pendingRefreshAfterKill: Record<string, boolean>
  pendingRefreshTimers: Record<string, ReturnType<typeof setTimeout>>
  _subscribed: boolean
}

function normalizeArch(value: unknown): string {
  switch (Number(value)) {
    case 0: return 'x86'
    case 1: return 'x64'
    case 2: return 'arm64'
    default: return value ? String(value) : 'unk'
  }
}

function normalizeProcessInfo(process: unknown): ProcessInfo | null {
  if (!process || typeof process !== 'object') return null
  const record = process as Record<string, unknown>

  const pid = record.pid
  const name = record.name

  if (pid === undefined && !name) return null

  return {
    pid: String(pid ?? ''),
    ppid: String(record.ppid ?? '-'),
    arch: String(record.arch_name ?? '') || normalizeArch(record.arch),
    session: String(record.session_id ?? '-'),
    user: String(record.user ?? '-'),
    name: String(name ?? 'Unknown'),
    path: String(record.path ?? '-'),
  }
}

function normalizeProcessList(payload: unknown): ProcessInfo[] {
  if (!Array.isArray(payload)) return []
  return payload.map(normalizeProcessInfo).filter((item): item is ProcessInfo => Boolean(item))
}

export const useProcessBrowserStore = defineStore('processBrowser', {
  state: (): ProcessBrowserState => ({
    processes: {},
    loading: {},
    errorMessages: {},
    lastUpdated: {},
    timers: {},
    pendingRefreshAfterKill: {},
    pendingRefreshTimers: {},
    _subscribed: false,
  }),

  getters: {
    getProcesses: (state) => (beaconid: string) => state.processes[beaconid] || [],
    isLoading: (state) => (beaconid: string) => Boolean(state.loading[beaconid]),
    getError: (state) => (beaconid: string) => state.errorMessages[beaconid] || '',
    getLastUpdated: (state) => (beaconid: string) => state.lastUpdated[beaconid] || null,
  },

  actions: {
    setLoading(beaconid: string, status: boolean): void {
      setLoadingWithTimeout(this, beaconid, status, i18n.global.t('processBrowser.psTimeout'), REQUEST_TIMEOUT)
    },

    markRefreshAfterKill(beaconid: unknown): void {
      const key = String(beaconid || '')
      if (!key) return

      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key])
        delete this.pendingRefreshTimers[key]
      }

      this.pendingRefreshAfterKill[key] = true
      this.pendingRefreshTimers[key] = setTimeout(() => {
        delete this.pendingRefreshAfterKill[key]
        delete this.pendingRefreshTimers[key]
      }, 120000)
    },

    consumeRefreshAfterKill(beaconid: unknown): boolean {
      const key = String(beaconid || '')
      if (!key) return false

      const shouldRefresh = Boolean(this.pendingRefreshAfterKill[key])
      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key])
        delete this.pendingRefreshTimers[key]
      }
      delete this.pendingRefreshAfterKill[key]
      return shouldRefresh
    },

    clearRefreshAfterKill(beaconid: unknown): void {
      const key = String(beaconid || '')
      if (!key) return

      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key])
        delete this.pendingRefreshTimers[key]
      }
      delete this.pendingRefreshAfterKill[key]
    },

    async requestProcesses(beaconid: string): Promise<void> {
      if (!beaconid) return

      this.errorMessages[beaconid] = ''
      this.setLoading(beaconid, true)

      try {
        await sendProcessListCommand(beaconid)
      } catch (err) {
        this.setLoading(beaconid, false)
        this.errorMessages[beaconid] = (err instanceof Error ? err.message : String(err)) || i18n.global.t('processBrowser.sendFailed')
      }
    },

    handleProcessResponse(beaconid: string, payload: unknown): void {
      const list = normalizeProcessList(payload)

      this.processes[beaconid] = list
      this.errorMessages[beaconid] = list.length ? '' : i18n.global.t('processBrowser.noData')
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.setLoading(beaconid, false)
    },

    handleProcessError(beaconid: string, message = i18n.global.t('processBrowser.fetchFailed')): void {
      this.processes[beaconid] = []
      this.errorMessages[beaconid] = message
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.setLoading(beaconid, false)
    },

    clear(beaconid: unknown): void {
      const key = String(beaconid || '')
      if (!key) return
      clearLoadingTimer(this, key)
      this.clearRefreshAfterKill(key)
      delete this.processes[key]
      delete this.loading[key]
      delete this.errorMessages[key]
      delete this.lastUpdated[key]
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
