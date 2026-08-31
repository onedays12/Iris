/**
 * Agent 状态管理 Store
 * 负责 Agent 实体的 CRUD、在线状态判定（含级联链路递归检测）、
 * 心跳维护，以及与控制台/文件浏览器的联动清理。
 */

import { defineStore } from 'pinia'
import * as beaconApi from '../features/beacon/api/beaconApi'
import { getBeaconId, normalizeBeacon, normalizeLastSeen, unwrapBeaconPayload } from '../features/beacon/model'
import { pickBeacon } from '../shared/protocol/adapter'
import { bus } from '../shared/bus'
import type { Beacon } from '../features/beacon/model'
import { useAuthStore } from './auth'
import { useNotificationStore } from './notification'
import { i18n } from '../i18n/index'

export interface BeaconStatus {
  kind: 'online' | 'offline' | 'cascade'
  labelKey: string
  class: string
  dotClass: string
}

interface AgentState {
  agents: Beacon[]
  now: number
  statusCache: Record<string, BeaconStatus>
  _subscribed: boolean
}

type BeaconUpdate = Partial<Beacon>

// ─── 内部工具函数 ───
// 破坏性收敛后: 这些函数只接收 normalizeBeacon 产出的 Beacon 模型对象,
// 直接按 camelCase 属性访问, 不再经 pickBeacon(其 canonical 为 snake_case wire 契约)。

function getAgentId(agent: unknown): string {
  return getBeaconId(agent)
}

function isCascadeAgent(agent: Beacon | null | undefined): boolean {
  if (!agent) return false
  const listenerType = String(agent.listenerType || '').toLowerCase()
  const depth = Number(agent.depth || 0)
  return listenerType === 'internal' || depth > 0 || Boolean(agent.parentId)
}

function isLinkClosed(agent: Beacon | null | undefined): boolean {
  if (!agent) return false
  const state = String(agent.linkState || '').toLowerCase()
  return ['lost', 'closed', 'disconnected', 'failed', 'error'].includes(state)
}

function isHeartbeatAlive(agent: Beacon, now: number): boolean {
  if (!agent?.lastSeen) return false
  const lastSeenTime = new Date(agent.lastSeen).getTime()
  if (!Number.isFinite(lastSeenTime)) return false
  const diffSeconds = (now - lastSeenTime) / 1000
  return diffSeconds < 60
}

function getParentBeaconId(agent: Beacon | null | undefined): string {
  return String(agent?.parentId || '')
}

function findAgentById(agents: Beacon[], beaconid: string): Beacon | null {
  const id = String(beaconid || '')
  if (!id) return null
  return agents.find(item => item.beaconid === id || item.beaconid.startsWith(id) || id.startsWith(item.beaconid)) || null
}

// 状态判定递归深度上限，防止恶意成环导致栈溢出
const maxResolveDepth = 16

export function resolveBeaconStatus(
  agent: Beacon | null | undefined,
  agents: Beacon[],
  now: number,
  visited = new Set<string>(),
  depth = 0,
): BeaconStatus {
  if (!agent) {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  if (depth >= maxResolveDepth) {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  if (!isCascadeAgent(agent)) {
    const online = isHeartbeatAlive(agent, now)
    return {
      kind: online ? 'online' : 'offline',
      labelKey: online ? 'agent.status.online' : 'agent.status.offline',
      class: online ? 'tag-success' : 'tag-danger',
      dotClass: online ? 'online' : 'offline',
    }
  }

  if (isLinkClosed(agent)) {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  const parentId = getParentBeaconId(agent)
  if (!parentId) {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  if (visited.has(parentId)) {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  const parent = findAgentById(agents, parentId)
  if (!parent) {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  visited.add(parentId)
  const parentStatus = resolveBeaconStatus(parent, agents, now, visited, depth+1)
  if (parentStatus.kind === 'offline') {
    return { kind: 'offline', labelKey: 'agent.status.offline', class: 'tag-danger', dotClass: 'offline' }
  }

  return { kind: 'cascade', labelKey: 'agent.status.cascade', class: 'tag-info', dotClass: 'cascade' }
}

/**
 * useAgentStore
 * 职责：Agent 实体数据的 CRUD、在线状态、心跳维护
 * 不关心：控制台 UI 状态、弹窗状态
 */
// ─── Store 定义 ───

export const useAgentStore = defineStore('agent', {

  // ─── 状态 ───

  state: (): AgentState => ({
    agents: [],
    /** 响应式时钟，用于驱动状态判定 */
    now: Date.now(),
    /** 状态缓存：beaconid -> resolveBeaconStatus 结果，在 tick/addAgent/updateAgent/removeAgent 时重算 */
    statusCache: {},
    _subscribed: false,
  }),

  // ─── 计算属性 ───

  getters: {
    /** 统一判定单个 Agent 是否在线（查缓存，O(1)） */
    isOnline: (state) => (agent: Beacon) => {
      const id = agent ? getAgentId(agent) : ''
      const cached = id ? state.statusCache[id] : undefined
      return cached ? cached.kind === 'online' : resolveBeaconStatus(agent, state.agents, state.now).kind === 'online'
    },

    /** 统一返回 Agent 可达状态：online / offline / cascade（查缓存，O(1)） */
    beaconStatus: (state) => (agent: Beacon) => {
      const id = agent ? getAgentId(agent) : ''
      const cached = id ? state.statusCache[id] : undefined
      return cached || resolveBeaconStatus(agent, state.agents, state.now)
    },

    /** 直连在线 Agent 数量 */
    onlineCount(state) {
      let n = 0
      for (const a of state.agents) {
        const s = state.statusCache[a.beaconid]
        if (s ? s.kind === 'online' : this.isOnline(a)) n++
      }
      return n
    },

    /** 级联可达 Agent 数量 */
    cascadeCount(state) {
      let n = 0
      for (const a of state.agents) {
        const s = state.statusCache[a.beaconid]
        const kind = s ? s.kind : this.beaconStatus(a).kind
        if (kind === 'cascade') n++
      }
      return n
    },

    /** 通过 ID 查询 Agent */
    getAgentById: (state) => (beaconid: string) => state.agents.find(a => a.beaconid === beaconid),
  },

  // ─── 方法 ───

  actions: {
    /** 重建状态缓存：遍历一次 agents，把每个 beacon 的判定结果存入 statusCache */
    rebuildStatusCache(): void {
      const cache: Record<string, BeaconStatus> = {}
      for (const a of this.agents) {
        cache[a.beaconid] = resolveBeaconStatus(a, this.agents, this.now)
      }
      this.statusCache = cache
    },

    /** 添加或更新 Agent */
    addAgent(value: unknown): void {
      const agent = unwrapBeaconPayload(value)
      const mappedAgent = normalizeBeacon(agent)
      if (!mappedAgent) {
        console.warn('[AgentStore] Agent missing ID field:', agent)
        return
      }

      const beaconKey = mappedAgent.beaconid
      const idx = this.agents.findIndex(a => a.beaconid === beaconKey)

      if (idx >= 0) {
        this.agents[idx] = { ...this.agents[idx], ...mappedAgent }
      } else {
        this.agents.push(mappedAgent)
      }
      this.rebuildStatusCache()

      // 通知 explorer 维护 os 镜像(新增或更新都 emit,explorer 幂等覆盖)
      bus.emit('agent:registered', { beaconid: beaconKey, os: mappedAgent.os })
    },

    /** 全量获取并同步 Agent 列表 */
    async fetchAgents(): Promise<void> {
      try {
        // 在请求发出前记录本地集合，避免并发 WS 注册的新 Beacon 被"清空+重建"覆盖
        const preFetchIds = new Set(this.agents.map(a => a.beaconid))
        const data = await beaconApi.listBeacons()
        const list = Array.isArray(data) ? data : []
        const fetchedIds = new Set<string>()
        list.forEach(item => {
          const mapped = normalizeBeacon(unwrapBeaconPayload(item))
          if (mapped) fetchedIds.add(mapped.beaconid)
          this.addAgent(item)
        })
        // 只移除"拉取前已存在且服务端列表不再包含"的项，保留拉取期间新注册的项
        this.agents = this.agents.filter(a => !preFetchIds.has(a.beaconid) || fetchedIds.has(a.beaconid))
        this.rebuildStatusCache()
      } catch (err) {
        console.error('获取 Beacon 列表失败:', err)
      }
    },

    /** 彻底注销并删除 Agent */
    async removeBeacon(beaconid: string): Promise<boolean> {
      return this.removeBeacons([beaconid])
    },

    /** 批量彻底注销并删除 Agent */
    async removeBeacons(beaconIds: string[]): Promise<boolean> {
      const ids = [...new Set(beaconIds.map(id => String(id || '')).filter(Boolean))]
      if (!ids.length) return false
      try {
        if (ids.length === 1) {
          await beaconApi.removeBeacon(ids[0])
        } else {
          await beaconApi.removeBeacons(ids)
        }
        const drop = new Set(ids)
        this.agents = this.agents.filter(a => !drop.has(a.beaconid))
        for (const beaconid of ids) {
          bus.emit('agent:removed', { beaconid })
        }
        this.rebuildStatusCache()
        return true
      } catch (err) {
        console.error('删除会话失败:', err)
        throw err
      }
    },

    /** 移除本地 Agent (仅前端清理，如 WS 断开等场景) */
    removeAgent(beaconid: string): void {
      this.agents = this.agents.filter(a => a.beaconid !== beaconid)

      // 通过事件总线通知 console/explorer 清理(解除 agent→console/explorer 硬依赖)
      bus.emit('agent:removed', { beaconid: String(beaconid) })

      this.rebuildStatusCache()
    },

    /** 更新 Agent 部分字段 */
    updateAgent(beaconid: string, data: BeaconUpdate): void {
      beaconid = String(beaconid || '')
      const agent = this.agents.find(a => a.beaconid === beaconid)
      if (agent) {
        const previousOs = agent.os
        // 只更新 data 中非 undefined 的字段，防止心跳包覆盖掉已有的静态信息（如 IP）。
        // 先收集到 patch, 再一次性 Object.assign, 避免对 agent 逐字段做联合类型强转。
        const patch: Record<string, unknown> = {}
        for (const key of Object.keys(data) as Array<keyof Beacon>) {
          const value = data[key]
          if (value !== undefined && value !== null) patch[key] = value
        }
        if (patch.lastSeen !== undefined) {
          patch.lastSeen = normalizeLastSeen(patch.lastSeen, this.now)
        }
        Object.assign(agent, patch as BeaconUpdate)

        // os 字段变化时通知 explorer 更新镜像(仅 os 变化才 emit,避免 BEACON_TICK 高频触发)
        if (data.os !== undefined && data.os !== null && previousOs !== agent.os) {
          bus.emit('agent:os-changed', { beaconid, os: agent.os })
        }
      } else if (beaconid) {
        this.addAgent({ ...data, beaconid })
        return
      }
      this.rebuildStatusCache()
    },

    /** 驱动时钟脉冲 (每秒调用一次) */
    tick(): void {
      this.now = Date.now()
      this.rebuildStatusCache()
    },

    /**
     * 初始化事件总线订阅(解除 wsEventRouter→agent 与 console→agent 循环依赖)。
     * 幂等:重复调用不会重复注册(用 _subscribed flag 去重)。
     * 必须在 App.vue 启动时、wsStore.connect 之前调用。
     */
    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true

      // 来自 console 的 SLEEP 命令回写(原 console.js:95 的 await import agent)
      bus.on('agent:update-sleep', ({ beaconid, sleep, jitter }) => {
        this.updateAgent(beaconid, { sleep, jitter })
      })

      // 来自 wsEventRouter 的 BEACON_REGISTERED(原 wsEventRouter.js:77 await import)
      bus.on('ws:beacon-registered', ({ data }) => {
        this.addAgent(data)
      })

      // 来自 wsEventRouter 的 BEACON_TICK(原 wsEventRouter.js:84 await import)
      bus.on('ws:beacon-tick', ({ beaconid, lastSeen, status }) => {
        this.now = Date.now()
        this.updateAgent(beaconid, { lastSeen, status })
      })

      // 来自 wsEventRouter 的 BEACON_REMOVED(原 wsEventRouter.js:98 await import)
      bus.on('ws:beacon-removed', ({ beaconid }) => {
        if (beaconid) this.removeAgent(String(beaconid))
      })

      bus.on('ws:beacon-meta', ({ data }) => {
        this.applyBeaconMeta(data)
      })
    },

    applyBeaconMeta(raw: unknown): void {
      const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      const items = Array.isArray(record.items) ? record.items : []
      const fallbackIds = Array.isArray(record.beacon_ids) ? record.beacon_ids.map(String) : []
      const operator = String(record.operator || '').trim()
      const action = String(record.action || '').trim()
      const names: string[] = []

      if (items.length) {
        for (const item of items) {
          const rec = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          const id = String(rec.beacon_id || '')
          if (!id) continue
          this.updateAgent(id, {
            note: rec.note === undefined ? undefined : String(rec.note ?? ''),
            groupName: rec.group_name === undefined ? undefined : String(rec.group_name ?? ''),
          })
          names.push(String(rec.hostname || id.substring(0, 8)))
        }
      } else {
        const note = record.note === undefined ? undefined : String(record.note ?? '')
        const groupName = record.group_name === undefined ? undefined : String(record.group_name ?? '')
        for (const id of fallbackIds) {
          this.updateAgent(id, { note, groupName })
          names.push(id.substring(0, 8))
        }
      }

      const self = useAuthStore().getCachedCredentials()?.username || ''
      if (!operator || (self && operator === self) || names.length === 0) return
      const label = names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '')
      const t = i18n.global.t
      if (action === 'group') {
        const groupName = String(record.group_name || '').trim()
        useNotificationStore().info(groupName
          ? t('agentTable.metaMovedGroup', { operator, names: label, group: groupName })
          : t('agentTable.metaUngrouped', { operator, names: label }))
      } else {
        useNotificationStore().info(t('agentTable.metaUpdatedNote', { operator, names: label }))
      }
    },
  },
})
