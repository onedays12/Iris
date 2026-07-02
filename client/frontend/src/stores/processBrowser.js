/**
 * 进程浏览器 Store
 * 获取远程主机的进程列表，提供按 beaconid 隔离的缓存与加载状态。
 */

import { defineStore } from 'pinia'
import { sendProcessListCommand } from '../features/beacon/actions/beaconCommandActions.js'

const REQUEST_TIMEOUT = 15000

function normalizeArch(value) {
  switch (Number(value)) {
    case 0: return 'x86'
    case 1: return 'x64'
    case 2: return 'arm64'
    default: return value ? String(value) : 'unk'
  }
}

function normalizeProcessInfo(process) {
  if (!process || typeof process !== 'object') return null

  const pid = process.pid
  const name = process.name

  if (pid === undefined && !name) return null

  return {
    pid: String(pid ?? ''),
    ppid: String(process.ppid ?? '-'),
    arch: String(process.arch_name ?? '') || normalizeArch(process.arch),
    session: String(process.session_id ?? '-'),
    user: String(process.user ?? '-'),
    name: String(name ?? 'Unknown'),
    path: String(process.path ?? '-'),
  }
}

function normalizeProcessList(payload) {
  if (!Array.isArray(payload)) return []
  return payload.map(normalizeProcessInfo).filter(Boolean)
}

export const useProcessBrowserStore = defineStore('processBrowser', {
  state: () => ({
    processes: {},
    loading: {},
    errorMessages: {},
    lastUpdated: {},
    timers: {},
    pendingRefreshAfterKill: {},
    pendingRefreshTimers: {},
  }),

  getters: {
    getProcesses: (state) => (beaconid) => state.processes[beaconid] || [],
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

      if (status) {
        this.timers[beaconid] = setTimeout(() => {
          this.loading[beaconid] = false
          this.errorMessages[beaconid] = '等待 ps 结果超时，请稍后重试'
          delete this.timers[beaconid]
        }, REQUEST_TIMEOUT)
      }
    },

    markRefreshAfterKill(beaconid) {
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

    consumeRefreshAfterKill(beaconid) {
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

    clearRefreshAfterKill(beaconid) {
      const key = String(beaconid || '')
      if (!key) return

      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key])
        delete this.pendingRefreshTimers[key]
      }
      delete this.pendingRefreshAfterKill[key]
    },

    async requestProcesses(beaconid) {
      if (!beaconid) return

      this.errorMessages[beaconid] = ''
      this.setLoading(beaconid, true)

      try {
        await sendProcessListCommand(beaconid)
      } catch (err) {
        this.setLoading(beaconid, false)
        this.errorMessages[beaconid] = err.message || '下发 ps 指令失败'
      }
    },

    handleProcessResponse(beaconid, payload) {
      const list = normalizeProcessList(payload)

      this.processes[beaconid] = list
      this.errorMessages[beaconid] = list.length ? '' : '未获取到进程数据'
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.setLoading(beaconid, false)
    },

    handleProcessError(beaconid, message = '获取进程数据失败') {
      this.processes[beaconid] = []
      this.errorMessages[beaconid] = message
      this.lastUpdated[beaconid] = new Date().toISOString()
      this.setLoading(beaconid, false)
    },

    clear(beaconid) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid])
        delete this.timers[beaconid]
      }
      this.clearRefreshAfterKill(beaconid)
      this.loading[beaconid] = false
      this.errorMessages[beaconid] = ''
    },
  },
})
