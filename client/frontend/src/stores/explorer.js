/**
 * 文件系统浏览器 Store
 * 负责远程文件目录的缓存、分页加载、路径归一化、盘符发现，
 * 以及与 pwd 命令联动的 Linux 工作目录解析。
 */

import { defineStore } from 'pinia'
import { useAgentStore } from './agent.js'
import { sendPwdCommand } from '../features/beacon/actions/beaconCommandActions.js'
import { explorerFiles } from '../features/files/api/fileApi.js'

// ─── 路径工具（导出供外部使用） ───

/**
 * 路径归一化引擎
 * 将 Windows/Linux 路径统一为可比较的缓存键
 */
export function normalizePathKey(path) {
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
export function joinPaths(base, sub) {
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

function unwrapExplorerResult(result) {
  let value = parseMaybeJson(result)
  if (!value || typeof value !== 'object') return value
  value = value.explorer_files || value.explorerFiles || value.ExplorerFiles ||
    value.result || value.Result || value.data || value.Data || value
  return parseMaybeJson(value)
}

function normalizeFileInfo(file) {
  if (!file || typeof file !== 'object') return file
  const isDir = file.is_dir ?? file.isDir ?? file.IsDir ?? false
  return {
    name: file.name ?? file.Name ?? '',
    path: file.path ?? file.Path ?? '',
    is_dir: Boolean(isDir),
    size: Number(file.size ?? file.Size ?? 0),
    mod_time: Number(file.mod_time ?? file.modTime ?? file.ModTime ?? 0),
    permission: file.permission ?? file.Permission ?? '',
    owner: file.owner ?? file.Owner ?? '',
    is_hidden: Boolean(file.is_hidden ?? file.isHidden ?? file.IsHidden ?? false),
  }
}

function isExplorerAbsolutePath(path) {
  if (!path || typeof path !== 'string') return false
  return path.startsWith('/') || path.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(path)
}

function absolutizeExplorerFile(file, basePath, isWindowsAgent) {
  const normalized = normalizeFileInfo(file)
  if (!normalized || typeof normalized !== 'object') return normalized

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

const explorerRequestTimers = new Map()
const EXPLORER_REQUEST_TIMEOUT_MS = 15000
const cwdResolvers = new Map()
const CWD_REQUEST_TIMEOUT_MS = 10000

function getRequestTimerKey(beaconid, path) {
  return `${beaconid}::${normalizePathKey(path)}`
}

function getTextResultContent(payload) {
  if (payload === undefined || payload === null) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object') {
    const text = payload.text ?? payload.Text ?? payload.value ?? payload.Value
    if (text !== undefined && text !== null && text !== '') return String(text)
  }
  return ''
}

// ─── Store 定义 ───

export const useExplorerStore = defineStore('explorer', {

  // ─── 状态 ───

  state: () => ({
    /** 
     * 双层 Map 缓存结构：{ [beaconid]: { [normalizedPath]: { isLoaded, lastUpdate, items, errorMessage } } } 
     */
    cache: {},
    /** 
     * 盘符列表：{ [beaconid]: ["C:\", "D:\", ...] } 
     */
    drives: {},
    /** 
     * 正在加载的路径锁：{ [beaconid]: Set(['path1', 'path2']) } 
     */
    loadingPaths: {},
    /** 
     * 对应 Beacon 的当前焦点路径 (未归一化，用于 UI 输入框显示) 
     */
    uiCurrentPath: {},
    /**
     * Linux/Unix Beacon 当前工作目录（由 pwd 获取）
     */
    workingDirectories: {}
  }),

  // ─── 方法 ───

  actions: {

    // ─── 缓存查询 ───

    /**
     * 获取路径缓存节点
     */
    getCacheNode(beaconid, path) {
      const nPath = normalizePathKey(path)
      if (!this.cache[beaconid]) return null
      return this.cache[beaconid][nPath] || null
    },

    async requestCurrentDirectory(beaconid) {
      const existing = cwdResolvers.get(beaconid)
      if (existing?.promise) return existing.promise

      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cwdResolvers.delete(beaconid)
          reject(new Error('获取当前工作目录超时，请重试'))
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
     * @param {string} beaconid 
     * @param {string} path 
     * @param {boolean} force 是否强制刷新
     */
    async loadDirectory(beaconid, path, force = false, options = {}) {
      const agentStore = useAgentStore()
      const agentOS = String(agentStore.getAgentById(beaconid)?.os || '').toLowerCase()
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
        console.log(`[ExplorerStore] 命中缓存: ${nPath}`)
        return
      }

      // 3. 加载防抖锁
      if (this.isPathLoading(beaconid, nPath)) {
        console.log(`[ExplorerStore] 正在加载中，跳过重复请求: ${nPath}`)
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
            errorMessage: '目录加载超时，请重试或检查后端事件返回',
          }
          this.setPathLoading(beaconid, nPath, false)
        }, EXPLORER_REQUEST_TIMEOUT_MS))
        console.log(`[ExplorerStore] 发起目录刷新请求: ${nPath} (force=${force}, offset=${offset}, limit=${limit}, append=${append})`)
        
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
          errorMessage: err.message || String(err)
        }
        this.setPathLoading(beaconid, nPath, false)
      }
    },

    // ─── 响应处理 ───

    /**
     * 处理后端响应
     */
    handleExplorerResponse(beaconid, result) {
      const agentStore = useAgentStore()
      const agentOS = String(agentStore.getAgentById(beaconid)?.os || '').toLowerCase()
      const isWindowsAgent = agentOS.includes('windows')
      const value = unwrapExplorerResult(result)
      if (!value || typeof value !== 'object') {
        const fallbackPath = normalizePathKey(this.uiCurrentPath[beaconid] || '')
        console.warn(`[ExplorerStore] 无法解析目录响应，回退清理路径锁: ${fallbackPath}`)
        this.setPathLoading(beaconid, fallbackPath, false)
        return
      }

      const responsePath = String(value.path ?? value.Path ?? this.uiCurrentPath[beaconid] ?? '')
      const rawPath = responsePath === '' && !isWindowsAgent ? '/' : responsePath
      const nPath = normalizePathKey(rawPath)
      const rawFiles = value.files ?? value.Files ?? []
      const files = Array.isArray(rawFiles)
        ? rawFiles.map(file => absolutizeExplorerFile(file, rawPath === '/' ? '/' : rawPath, isWindowsAgent))
        : []
      const limit = Math.min(5000, Math.max(1, Number(value.limit ?? value.Limit ?? 1000) || 1000))
      const offset = Math.max(0, Number(value.offset ?? value.Offset ?? 0) || 0)
      const hasMore = Boolean(value.has_more ?? value.hasMore ?? value.HasMore ?? false)
      const errMsg = String(value.error_message ?? value.errorMessage ?? value.ErrorMessage ?? '')
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

      console.log(`[ExplorerStore] Path updated: ${nPath} for ${beaconid}. Items: ${files.length}`)
    },

    handlePwdResponse(beaconid, result) {
      const pending = cwdResolvers.get(beaconid)
      const text = normalizePathKey(getTextResultContent(result))
      if (!pending) return

      clearTimeout(pending.timer)
      cwdResolvers.delete(beaconid)

      if (!text) {
        pending.reject(new Error('未获取到有效的当前工作目录'))
        return
      }

      this.workingDirectories[beaconid] = text
      pending.resolve(text)
    },

    // ─── 加载锁管理 ───

    /**
     * 设置路径加载锁
     */
    setPathLoading(beaconid, path, status) {
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
    isPathLoading(beaconid, path) {
      const nPath = normalizePathKey(path)
      return this.loadingPaths[beaconid]?.has(nPath) || false
    },

    /**
     * 内存回收：清空特定 Beacon 的全量缓存
     */
    clearCache(beaconid) {
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
      console.log(`[ExplorerStore] Memory recovered for beacon: ${beaconid}`)
    }
  }
})
