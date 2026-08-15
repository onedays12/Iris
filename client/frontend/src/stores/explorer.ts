/**
 * 文件系统浏览器 Store
 * 负责远程文件目录的缓存、分页加载、路径归一化、盘符发现，
 * 以及与 pwd 命令联动的 Linux 工作目录解析。
 */

import { defineStore } from 'pinia'
import { bus } from '../shared/bus'
import { i18n } from '../i18n/index'

import { sendPwdCommand } from '../features/beacon/actions/beaconCommandActions'
import { explorerFiles } from '../features/files/api/fileApi'
import { pick } from '../utils/object'

export interface ExplorerFileInfo {
  name: string
  path: string
  is_dir: boolean
  size: number
  mod_time: number
  permission: string
  owner: string
  is_hidden: boolean
}

export interface ExplorerCacheNode {
  isLoaded: boolean
  lastUpdate?: number
  items?: ExplorerFileInfo[]
  errorMessage?: string
  limit?: number
  offset?: number
  hasMore?: boolean
}

interface CwdResolver {
  resolve: (value: string) => void
  reject: (reason?: unknown) => void
  timer: ReturnType<typeof setTimeout>
  promise: Promise<string> | null
}

interface ExplorerState {
  /**
   * 双层 Map 缓存结构：{ [beaconid]: { [normalizedPath]: { isLoaded, lastUpdate, items, errorMessage } } }
   */
  cache: Record<string, Record<string, ExplorerCacheNode>>
  /**
   * 盘符列表：{ [beaconid]: ["C:\", "D:\", ...] }
   */
  drives: Record<string, string[]>
  /**
   * 正在加载的路径锁：{ [beaconid]: Set(['path1', 'path2']) }
   */
  loadingPaths: Record<string, Set<string>>
  /**
   * 对应 Beacon 的当前焦点路径 (未归一化，用于 UI 输入框显示)
   */
  uiCurrentPath: Record<string, string>
  /**
   * Linux/Unix Beacon 当前工作目录（由 pwd 获取）
   */
  workingDirectories: Record<string, string>
  /**
   * Beacon OS 镜像(替代原 import agent 取 os)。
   * 由 initSubscriptions 订阅 agent:registered/os-changed 维护,clearCache 时清除。
   */
  osByBeacon: Record<string, string>
  _subscribed: boolean
}

// ─── 路径工具（导出供外部使用） ───

/**
 * 路径归一化引擎
 * 将 Windows/Linux 路径统一为可比较的缓存键
 */
export function normalizePathKey(path: string): string {
  if (path === undefined || path === null) return ''
  let n = path.trim()
  if (!n) return ''

  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(n) || /^[a-zA-Z]:$/.test(n) || /^\\\\/.test(n) || n.includes('\\')
  if (isWindowsPath) {
    n = n.replace(/\//g, '\\')

    // 1. 统一转为小写 (Windows 路径不区分大小写)
    n = n.toLowerCase()

    // 2. 消除多余的重复斜杠
    n = n.replace(/\\+/g, '\\')

    // 3. 处理盘符根路径特例 (C: -> C:\)
    if (/^[a-z]:$/.test(n)) {
      n += '\\'
    }

    // 4. 统一末尾斜杠 (路径长度 > 3 的普通文件夹去除末尾斜杠，盘符根路径保留)
    if (n.length > 3 && n.endsWith('\\')) {
      n = n.substring(0, n.length - 1)
    }

    return n
  }

  n = n.replace(/\\/g, '/')
  n = n.replace(/\/+/g, '/')

  if (n.length > 1 && n.endsWith('/')) {
    n = n.substring(0, n.length - 1)
  }

  return n
}

/**
 * 智能路径拼接
 */
export function joinPaths(base: string, sub: string): string {
  const normalizedBase = normalizePathKey(base)
  const normalizedSub = normalizePathKey(sub)

  if (!normalizedBase) return normalizedSub
  if (!normalizedSub) return normalizedBase
  if (/^[a-zA-Z]:[\\/]/.test(normalizedSub) || /^\\\\/.test(normalizedSub) || normalizedSub.startsWith('/')) {
    return normalizedSub
  }

  const useWindowsSeparator = normalizedBase.includes('\\') || /^[a-zA-Z]:/.test(normalizedBase) || /^\\\\/.test(normalizedBase)
  const separator = useWindowsSeparator ? '\\' : '/'
  const baseWithSeparator = normalizedBase.endsWith(separator) ? normalizedBase : normalizedBase + separator
  const subWithoutSeparator = normalizedSub.startsWith(separator) ? normalizedSub.substring(1) : normalizedSub
  return normalizePathKey(baseWithSeparator + subWithoutSeparator)
}

// ─── 内部工具函数 ───

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return value
  try {
    return JSON.parse(text) as unknown
  } catch {
    return value
  }
}

function unwrapExplorerResult(result: unknown): unknown {
  // canonical: COMMAND_EVENT 的 data 直接是 {path, limit, offset, has_more, error_message, files}。
  // 历史版本支持过 explorer_files/result/data 等多层包裹, 已破坏性移除; 仅保留 JSON 字符串解析。
  return parseMaybeJson(parseMaybeJson(result))
}

function normalizeFileInfo(file: unknown): ExplorerFileInfo | null {
  if (!file || typeof file !== 'object') return null
  const record = file as Record<string, unknown>
  return {
    name: String(pick(record, ['name'], '')),
    path: String(pick(record, ['path'], '')),
    is_dir: Boolean(pick(record, ['is_dir'], false)),
    size: Number(pick(record, ['size'], 0)),
    mod_time: Number(pick(record, ['mod_time'], 0)),
    permission: String(pick(record, ['permission'], '')),
    owner: String(pick(record, ['owner'], '')),
    is_hidden: Boolean(pick(record, ['is_hidden'], false)),
  }
}

function isExplorerAbsolutePath(path: unknown): boolean {
  if (!path || typeof path !== 'string') return false
  return path.startsWith('/') || path.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(path)
}

function absolutizeExplorerFile(file: unknown, basePath: string, isWindowsAgent: boolean): ExplorerFileInfo | null {
  const normalized = normalizeFileInfo(file)
  if (!normalized) return normalized

  const fallbackPath = normalized.path || normalized.name || ''
  let nextPath = String(fallbackPath || '')

  if (!nextPath) return normalized

  if (!isExplorerAbsolutePath(nextPath)) {
    if (basePath) {
      nextPath = joinPaths(basePath, nextPath)
    } else if (!isWindowsAgent) {
      nextPath = normalizePathKey(`/${nextPath.replace(/^\/+/, '')}`)
    }
  } else {
    nextPath = normalizePathKey(nextPath)
  }

  return {
    ...normalized,
    path: nextPath,
  }
}

const explorerRequestTimers = new Map<string, ReturnType<typeof setTimeout>>()
const EXPLORER_REQUEST_TIMEOUT_MS = 15000
const cwdResolvers = new Map<string, CwdResolver>()
const CWD_REQUEST_TIMEOUT_MS = 10000

function getRequestTimerKey(beaconid: string, path: string): string {
  return `${beaconid}::${normalizePathKey(path)}`
}

function getTextResultContent(payload: unknown): string {
  if (payload === undefined || payload === null) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const text = record.text ?? record.Text ?? record.value ?? record.Value
    if (text !== undefined && text !== null && text !== '') return String(text)
  }
  return ''
}

// ─── Store 定义 ───

export const useExplorerStore = defineStore('explorer', {

  // ─── 状态 ───

  state: (): ExplorerState => ({
    cache: {},
    drives: {},
    loadingPaths: {},
    uiCurrentPath: {},
    workingDirectories: {},
    osByBeacon: {},
    _subscribed: false,
  }),

  // ─── 方法 ───

  actions: {

    // ─── 缓存查询 ───

    /**
     * 获取路径缓存节点
     */
    getCacheNode(beaconid: string, path: string): ExplorerCacheNode | null {
      const nPath = normalizePathKey(path)
      if (!this.cache[beaconid]) return null
      return this.cache[beaconid][nPath] || null
    },

    async requestCurrentDirectory(beaconid: string): Promise<string> {
      const existing = cwdResolvers.get(beaconid)
      if (existing?.promise) return existing.promise

      const promise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          cwdResolvers.delete(beaconid)
          reject(new Error(i18n.global.t('explorer.cwdTimeout')))
        }, CWD_REQUEST_TIMEOUT_MS)

        cwdResolvers.set(beaconid, {
          resolve,
          reject,
          timer,
          promise: null,
        })
      })

      const resolver = cwdResolvers.get(beaconid)
      if (resolver) resolver.promise = promise

      try {
        await sendPwdCommand(beaconid)
      } catch (err) {
        const pending = cwdResolvers.get(beaconid)
        if (pending) {
          clearTimeout(pending.timer)
          cwdResolvers.delete(beaconid)
          pending.reject(err)
        }
        throw err
      }

      return promise
    },

    // ─── 目录加载 ───

    /**
     * [核心] 加载目录逻辑 (对接 explorerFiles)
     * @param beaconid 目标 Beacon ID
     * @param path 目录路径
     * @param force 是否强制刷新
     */
    async loadDirectory(beaconid: string, path: string, force = false, options: { limit?: unknown; offset?: unknown; append?: unknown } = {}): Promise<void> {
      const agentOS = String(this.osByBeacon[beaconid] || '').toLowerCase()
      const isWindowsAgent = agentOS.includes('windows')
      let requestPath = path

      if ((!requestPath || !String(requestPath).trim()) && !isWindowsAgent) {
        requestPath = await this.requestCurrentDirectory(beaconid)
        this.workingDirectories[beaconid] = normalizePathKey(requestPath)
      }

      const nPath = normalizePathKey(requestPath)
      const limit = Math.min(5000, Math.max(1, Number(options.limit ?? 1000) || 1000))
      const offset = Math.max(0, Number(options.offset ?? 0) || 0)
      const append = Boolean(options.append && offset > 0)

      // 1. 同步 UI 路径展示
      this.uiCurrentPath[beaconid] = nPath

      // 2. 缓存检查
      const node = this.getCacheNode(beaconid, nPath)
      if (!force && !append && node?.isLoaded) {
        return
      }

      // 3. 加载防抖锁
      if (this.isPathLoading(beaconid, nPath)) {
        return
      }

      try {
        this.setPathLoading(beaconid, nPath, true)
        const timerKey = getRequestTimerKey(beaconid, nPath)
        clearTimeout(explorerRequestTimers.get(timerKey))
        explorerRequestTimers.set(timerKey, setTimeout(() => {
          if (!this.isPathLoading(beaconid, nPath)) return

          console.warn(`[ExplorerStore] 目录请求超时: ${nPath}`)
          if (!this.cache[beaconid]) this.cache[beaconid] = {}
          this.cache[beaconid][nPath] = {
            ...(this.cache[beaconid][nPath] || {}),
            isLoaded: false,
            errorMessage: i18n.global.t('explorer.dirLoadTimeout'),
          }
          this.setPathLoading(beaconid, nPath, false)
        }, EXPLORER_REQUEST_TIMEOUT_MS))

        // 核心接口调用：POST /api/v1/beacon/explorer/files
        await explorerFiles(beaconid, nPath, limit, offset)

        // 注意：无需处理返回数据，等待 WebSocket 推送 EXPLORERFILES 事件回调 handleExplorerResponse
      } catch (err) {
        console.error(`[ExplorerStore] 请求目录失败: ${nPath}`, err)
        // 更新错误状态
        if (!this.cache[beaconid]) this.cache[beaconid] = {}
        this.cache[beaconid][nPath] = {
          ...(this.cache[beaconid][nPath] || {}),
          isLoaded: false,
          errorMessage: err instanceof Error ? err.message : String(err)
        }
        this.setPathLoading(beaconid, nPath, false)
      }
    },

    // ─── 响应处理 ───

    /**
     * 处理后端响应
     */
    handleExplorerResponse(beaconid: string, result: unknown): void {
      const agentOS = String(this.osByBeacon[beaconid] || '').toLowerCase()
      const isWindowsAgent = agentOS.includes('windows')
      const value = unwrapExplorerResult(result)
      if (!value || typeof value !== 'object') {
        const fallbackPath = normalizePathKey(this.uiCurrentPath[beaconid] || '')
        console.warn(`[ExplorerStore] 无法解析目录响应，回退清理路径锁: ${fallbackPath}`)
        this.setPathLoading(beaconid, fallbackPath, false)
        return
      }

      const valueRecord = value as Record<string, unknown>
      const responsePath = String(pick(valueRecord, ['path'], this.uiCurrentPath[beaconid] ?? ''))
      const rawPath = responsePath === '' && !isWindowsAgent ? '/' : responsePath
      const nPath = normalizePathKey(rawPath)
      const rawFiles = pick(valueRecord, ['files'], [])
      const files = Array.isArray(rawFiles)
        ? rawFiles
          .map(file => absolutizeExplorerFile(file, rawPath === '/' ? '/' : rawPath, isWindowsAgent))
          .filter((file): file is ExplorerFileInfo => Boolean(file))
        : []
      const limit = Math.min(5000, Math.max(1, Number(pick(valueRecord, ['limit'], 1000)) || 1000))
      const offset = Math.max(0, Number(pick(valueRecord, ['offset'], 0)) || 0)
      const hasMore = Boolean(pick(valueRecord, ['has_more'], false))
      const errMsg = String(pick(valueRecord, ['error_message'], ''))
      const timerKey = getRequestTimerKey(beaconid, nPath)
      clearTimeout(explorerRequestTimers.get(timerKey))
      explorerRequestTimers.delete(timerKey)

      // 1. 释放锁
      this.setPathLoading(beaconid, nPath, false)

      // 2. 更新盘符列表
      if (responsePath === '' && isWindowsAgent && files.length > 0 && files.every(f => f.is_dir)) {
        this.drives[beaconid] = files.map(f => f.path || f.name)
      }

      // 3. 更新缓存表
      if (!this.cache[beaconid]) this.cache[beaconid] = {}
      const existingItems = offset > 0 && Array.isArray(this.cache[beaconid][nPath]?.items)
        ? this.cache[beaconid][nPath].items
        : []
      const mergedItems = offset > 0
        ? [...existingItems, ...files].filter((item, index, array) => {
            const currentKey = normalizePathKey(item?.path || item?.name || `${index}`)
            return array.findIndex(candidate => normalizePathKey(candidate?.path || candidate?.name || '') === currentKey) === index
          })
        : files

      this.cache[beaconid][nPath] = {
        isLoaded: true,
        lastUpdate: Date.now(),
        items: mergedItems,
        errorMessage: errMsg,
        limit,
        offset,
        hasMore,
      }

      // 4. 同步 UI 展示路径 (非归一化官方路径)
      this.uiCurrentPath[beaconid] = rawPath
    },

    handlePwdResponse(beaconid: string, result: unknown): void {
      const pending = cwdResolvers.get(beaconid)
      const text = normalizePathKey(getTextResultContent(result))
      if (!pending) return

      clearTimeout(pending.timer)
      cwdResolvers.delete(beaconid)

      if (!text) {
        pending.reject(new Error(i18n.global.t('explorer.noCwd')))
        return
      }

      this.workingDirectories[beaconid] = text
      pending.resolve(text)
    },

    // ─── 加载锁管理 ───

    /**
     * 设置路径加载锁
     */
    setPathLoading(beaconid: string, path: string, status: boolean): void {
      if (!this.loadingPaths[beaconid]) this.loadingPaths[beaconid] = new Set()
      const nPath = normalizePathKey(path)
      if (status) {
        this.loadingPaths[beaconid].add(nPath)
      } else {
        this.loadingPaths[beaconid].delete(nPath)
      }
    },

    /**
     * 检查路径是否正在加载
     */
    isPathLoading(beaconid: string, path: string): boolean {
      const nPath = normalizePathKey(path)
      return this.loadingPaths[beaconid]?.has(nPath) || false
    },

    /**
     * 内存回收：清空特定 Beacon 的全量缓存
     */
    clearCache(beaconid: string): void {
      const pending = cwdResolvers.get(beaconid)
      if (pending) {
        clearTimeout(pending.timer)
        cwdResolvers.delete(beaconid)
      }
      if (this.cache[beaconid]) delete this.cache[beaconid]
      if (this.drives[beaconid]) delete this.drives[beaconid]
      if (this.workingDirectories[beaconid]) delete this.workingDirectories[beaconid]
      if (this.loadingPaths[beaconid]) delete this.loadingPaths[beaconid]
      if (this.uiCurrentPath[beaconid]) delete this.uiCurrentPath[beaconid]
      if (this.osByBeacon[beaconid]) delete this.osByBeacon[beaconid]
    },

    /**
     * 初始化事件总线订阅(解除 explorer→agent 硬依赖)。
     * 幂等:用 _subscribed flag 去重。App.vue 启动时调用。
     * 维护 osByBeacon 镜像,替代原 import agent 取 os getter。
     */
    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true

      // agent 注册/更新时维护 os 镜像(原 loadDirectory/handleExplorerResponse 调 agentStore.getAgentById)
      bus.on('agent:registered', ({ beaconid, os }) => {
        if (beaconid) this.osByBeacon[beaconid] = os
      })
      bus.on('agent:os-changed', ({ beaconid, os }) => {
        if (beaconid) this.osByBeacon[beaconid] = os
      })

      // agent 删除时级联清理缓存(原 agent.removeBeacon/removeAgent 调 clearCache)
      bus.on('agent:removed', ({ beaconid }) => {
        this.clearCache(beaconid)
      })
    },
  }
})
