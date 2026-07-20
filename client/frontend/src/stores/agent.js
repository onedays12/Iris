/**
 * Agent 状态管理 Store
 * 负责 Agent 实体的 CRUD、在线状态判定（含级联链路递归检测）、
 * 心跳维护，以及与控制台/文件浏览器的联动清理。
 */

import { defineStore } from 'pinia'
import * as beaconApi from '../features/beacon/api/beaconApi.js'
import { pickBeacon, pickBeaconId } from '../shared/protocol/adapter.js'
import { bus } from '../shared/bus.js'

// ─── 内部工具函数 ───

function unwrapAgentPayload(agent) {
  if (!agent || typeof agent !== 'object') return agent
  // 如果当前层没有特征字段但包含子对象键名，则递归钻取
  if (agent.beacon) return agent.beacon
  if (agent.Beacon) return agent.Beacon
  if (agent.agent) return agent.agent
  if (agent.Agent) return agent.Agent
  if (agent.data && typeof agent.data === 'object' && !agent.data.beacon_id) return agent.data
  if (agent.Data && typeof agent.Data === 'object' && !agent.Data.BeaconID) return agent.Data
  return agent
}

function getAgentId(agent) {
  return pickBeaconId(agent)
}

function normalizeLastSeen(value, now = Date.now()) {
  const fallback = new Date(now).toISOString()
  if (!value) return fallback

  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return fallback

  return time > now ? fallback : value
}

function isCascadeAgent(agent) {
  if (!agent) return false
  const c = pickBeacon(agent)
  const listenerType = String(c.listenerType || '').toLowerCase()
  const depth = Number(c.depth || 0)
  return listenerType === 'internal' || depth > 0 || Boolean(c.parentId)
}

function isLinkClosed(agent) {
  const c = pickBeacon(agent)
  const state = String(c.linkState || '').toLowerCase()
  return ['lost', 'closed', 'disconnected', 'failed', 'error'].includes(state)
}

function isHeartbeatAlive(agent, now) {
  if (!agent?.lastSeen) return false
  const lastSeenTime = new Date(agent.lastSeen).getTime()
  if (!Number.isFinite(lastSeenTime)) return false
  const diffSeconds = (now - lastSeenTime) / 1000
  return diffSeconds < 60
}

function getParentBeaconId(agent) {
  return String(pickBeacon(agent).parentId || '')
}

function findAgentById(agents, beaconid) {
  const id = String(beaconid || '')
  if (!id) return null
  return agents.find(item => item.beaconid === id || item.beaconid.startsWith(id) || id.startsWith(item.beaconid)) || null
}

// 状态判定递归深度上限，防止恶意成环导致栈溢出
const maxResolveDepth = 16

function resolveBeaconStatus(agent, agents, now, visited = new Set(), depth = 0) {
  if (!agent) {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  if (depth >= maxResolveDepth) {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  if (!isCascadeAgent(agent)) {
    const online = isHeartbeatAlive(agent, now)
    return {
      kind: online ? 'online' : 'offline',
      label: online ? '在线' : '离线',
      class: online ? 'tag-success' : 'tag-danger',
      dotClass: online ? 'online' : 'offline',
    }
  }

  if (isLinkClosed(agent)) {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  const parentId = getParentBeaconId(agent)
  if (!parentId) {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  if (visited.has(parentId)) {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  const parent = findAgentById(agents, parentId)
  if (!parent) {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  visited.add(parentId)
  const parentStatus = resolveBeaconStatus(parent, agents, now, visited, depth+1)
  if (parentStatus.kind === 'offline') {
    return { kind: 'offline', label: '离线', class: 'tag-danger', dotClass: 'offline' }
  }

  return { kind: 'cascade', label: '级联', class: 'tag-info', dotClass: 'cascade' }
}

/**
 * useAgentStore
 * 职责：Agent 实体数据的 CRUD、在线状态、心跳维护
 * 不关心：控制台 UI 状态、弹窗状态
 */
// ─── Store 定义 ───

export const useAgentStore = defineStore('agent', {

  // ─── 状态 ───

  state: () => ({
    /** @type {Array<{beaconid: string, hostname: string, username: string, os: string, arch: string, ip: string, lastSeen: string, status: string, listenerType: string, parentId: string, linkState: string}>} */
    agents: [],
    /** 响应式时钟，用于驱动状态判定 */
    now: Date.now(),
    /** 状态缓存：beaconid -> resolveBeaconStatus 结果，在 tick/addAgent/updateAgent/removeAgent 时重算 */
    statusCache: {},
  }),

  // ─── 计算属性 ───

  getters: {
    /** 统一判定单个 Agent 是否在线（查缓存，O(1)） */
    isOnline: (state) => (agent) => {
      const id = agent ? getAgentId(agent) : ''
      const cached = id ? state.statusCache[id] : undefined
      return cached ? cached.kind === 'online' : resolveBeaconStatus(agent, state.agents, state.now).kind === 'online'
    },

    /** 统一返回 Agent 可达状态：online / offline / cascade（查缓存，O(1)） */
    beaconStatus: (state) => (agent) => {
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
    getAgentById: (state) => (beaconid) => state.agents.find(a => a.beaconid === beaconid),
  },

  // ─── 方法 ───

  actions: {
    /** 重建状态缓存：遍历一次 agents，把每个 beacon 的判定结果存入 statusCache */
    rebuildStatusCache() {
      const cache = {}
      for (const a of this.agents) {
        cache[a.beaconid] = resolveBeaconStatus(a, this.agents, this.now)
      }
      this.statusCache = cache
    },

    /** 添加或更新 Agent */
    addAgent(agent) {
      agent = unwrapAgentPayload(agent)
      // 超级兼容性处理：支持各种可能的 ID 键名变体
      const beaconid = getAgentId(agent)
      if (!beaconid) {
        console.warn('[AgentStore] Agent missing ID field:', agent)
        return
      }

      const beaconKey = String(beaconid)
      const idx = this.agents.findIndex(a => a.beaconid === beaconKey)

      const c = pickBeacon(agent)
      const mappedAgent = {
        beaconid: beaconKey,
        hostname: c.hostname || 'Unknown',
        username: (c.username || 'Unknown').split('\\').pop(),
        os: c.os || 'Unknown',
        arch: c.arch || 'Unknown',
        ip: c.internalIp || '0.0.0.0',
        externalIp: c.externalIp || '-',
        lastSeen: normalizeLastSeen(c.lastSeen),
        status: c.status || 'online',
        processName: c.processName || '-',
        pid: Number(c.pid) || 0,
        acp: Number(c.acp) || 0,
        isAdmin: Boolean(c.isAdmin) || false,
        sleep: Number(c.sleep) || 0,
        jitter: Number(c.jitter) || 0,
        protocol: c.protocol || 'http',
        listener: c.listener || '-',
        listenerType: c.listenerType || '',
        parentId: c.parentId || '',
        gatewayId: c.gatewayId || '',
        depth: Number(c.depth) || 0,
        linkProtocol: c.linkProtocol || '',
        linkState: c.linkState || '',
        linkHint: c.linkHint || '',
        linkAddr: c.linkAddr || '',
      }

      if (idx >= 0) {
        this.agents[idx] = { ...this.agents[idx], ...mappedAgent }
        console.log(`%c[AgentStore] UPDATED Agent: ${beaconKey}`, 'color: #3b82f6')
      } else {
        this.agents.push(mappedAgent)
        console.log(`%c[AgentStore] NEW Agent Registered: ${beaconKey}`, 'color: #10b981; font-weight: bold', mappedAgent)
      }
      this.rebuildStatusCache()

      // 通知 explorer 维护 os 镜像(新增或更新都 emit,explorer 幂等覆盖)
      bus.emit('agent:registered', { beaconid: beaconKey, os: mappedAgent.os })
    },

    /** 全量获取并同步 Agent 列表 */
    async fetchAgents() {
      try {
        const data = await beaconApi.listBeacons()
        if (Array.isArray(data)) {
          // 清空当前列表并根据后端数据重新初始化，使用已有的 addAgent 逻辑进行映射
          this.agents = []
          data.forEach(item => this.addAgent(item))
        }
      } catch (err) {
        console.error('获取 Beacon 列表失败:', err)
      }
    },

    /** 彻底注销并删除 Agent */
    async removeBeacon(beaconid) {
      try {
        await beaconApi.removeBeacon(beaconid)
        // 只有 API 调用成功后，才从本地列表移除
        this.agents = this.agents.filter(a => a.beaconid !== beaconid)

        // 通过事件总线通知 console/explorer 清理(解除 agent→console/explorer 硬依赖)
        bus.emit('agent:removed', { beaconid: String(beaconid) })

        this.rebuildStatusCache()
        return true
      } catch (err) {
        console.error('删除会话失败:', err)
        throw err
      }
    },

    /** 移除本地 Agent (仅前端清理，如 WS 断开等场景) */
    removeAgent(beaconid) {
      this.agents = this.agents.filter(a => a.beaconid !== beaconid)

      // 通过事件总线通知 console/explorer 清理(解除 agent→console/explorer 硬依赖)
      bus.emit('agent:removed', { beaconid: String(beaconid) })

      this.rebuildStatusCache()
    },

    /** 更新 Agent 部分字段 */
    updateAgent(beaconid, data) {
      beaconid = String(beaconid || '')
      const agent = this.agents.find(a => a.beaconid === beaconid)
      if (agent) {
        // 只更新 data 中非 undefined 的字段，防止心跳包覆盖掉已有的静态信息（如 IP）
        Object.keys(data).forEach(key => {
          if (data[key] !== undefined && data[key] !== null) {
            agent[key] = key === 'lastSeen' ? normalizeLastSeen(data[key], this.now) : data[key]
          }
        })

        // os 字段变化时通知 explorer 更新镜像(仅 os 变化才 emit,避免 BEACON_TICK 高频触发)
        if (data.os !== undefined && data.os !== null && data.os !== agent.os) {
          bus.emit('agent:os-changed', { beaconid, os: agent.os })
        }
      } else if (beaconid) {
        this.addAgent({ ...data, beaconid })
        return
      }
      this.rebuildStatusCache()
    },

    /** 驱动时钟脉冲 (每秒调用一次) */
    tick() {
      this.now = Date.now()
      this.rebuildStatusCache()
    },

    /**
     * 初始化事件总线订阅(解除 wsEventRouter→agent 与 console→agent 循环依赖)。
     * 幂等:重复调用不会重复注册(用 _subscribed flag 去重)。
     * 必须在 App.vue 启动时、wsStore.connect 之前调用。
     */
    initSubscriptions() {
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
    },
  },
})
