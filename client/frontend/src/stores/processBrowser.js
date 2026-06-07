/**
 * 进程浏览器 Store
 * 获取远程主机的进程列表，提供按 beaconid 隔离的缓存与加载状态。
 */

import { defineStore } from 'pinia'
import { sendProcessListCommand } from '../features/beacon/actions/beaconCommandActions.js'

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

function unwrapProcessPayload(payload) {
  let value = parseMaybeJson(payload)
  if (!value || typeof value !== 'object') return value

  value = value.processes || value.Processes ||
    value.process_list || value.processList || value.ProcessList ||
    value.ps_list || value.psList || value.PSList ||
    value.items || value.Items ||
    value.data || value.Data ||
    value.result || value.Result ||
    value

  return parseMaybeJson(value)
}

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

  const pid = process.pid ?? process.PID ?? process.process_id ?? process.processId ?? process.ProcessID
  const name = process.name ?? process.Name ?? process.image ?? process.Image ?? process.image_name ?? process.ImageName

  if (pid === undefined && !name) return null

  return {
    pid: String(pid ?? ''),
    ppid: String(process.ppid ?? process.PPID ?? process.parent_pid ?? process.parentPid ?? process.ParentPID ?? '-'),
    arch: String(process.arch_name ?? process.ArchName ?? process.Arch_Name ?? '') || normalizeArch(process.arch ?? process.Arch ?? process.architecture ?? process.Architecture),
    session: String(process.session_id ?? process.sessionId ?? process.SessionID ?? process.session ?? process.Session ?? '-'),
    user: String(process.user ?? process.User ?? process.username ?? process.Username ?? '-'),
    name: String(name ?? 'Unknown'),
    path: String(process.path ?? process.Path ?? process.exe ?? process.Exe ?? process.command_line ?? process.commandLine ?? process.CommandLine ?? '-'),
  }
}

function normalizeProcessList(payload) {
  const value = unwrapProcessPayload(payload)
  if (!Array.isArray(value)) return []
  return value.map(normalizeProcessInfo).filter(Boolean)
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
