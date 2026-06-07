/**
 * Agent 状态管理 Store
 * 负责 Agent 实体的 CRUD、在线状态判定（含级联链路递归检测）、
 * 心跳维护，以及与控制台/文件浏览器的联动清理。
 */

import { defineStore } from 'pinia'
import * as beaconApi from '../features/beacon/api/beaconApi.js'
import { useConsoleStore } from './console.js'
import { useExplorerStore } from './explorer.js'

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
  if (!agent || typeof agent !== 'object') return ''
  // 必须严格遵守优先级：后端原生标签 > 驼峰 > 通用 ID
  const id = agent.beacon_id || agent.beaconid || agent.beaconId || agent.BeaconID || agent.BeaconId || agent.id || agent.ID || agent.uuid || agent.UUID
  return id ? String(id) : ''
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
  const listenerType = String(agent.listenerType || agent.listener_type || '').toLowerCase()
  const depth = Number(agent.depth || agent.Depth || 0)
  return listenerType === 'internal' || depth > 0 || Boolean(agent.parentId || agent.parent_id)
}

function isLinkClosed(agent) {
  const state = String(agent?.linkState || agent?.link_state || '').toLowerCase()
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
  return String(agent?.parentId || agent?.parent_id || '')
}

function findAgentById(agents, beaconid) {
  const id = String(beaconid || '')
  if (!id) return null
  return agents.find(item => item.beaconid === id || item.beaconid.startsWith(id) || id.startsWith(item.beaconid)) || null
}

function resolveBeaconStatus(agent, agents, now, visited = new Set()) {
  if (!agent) {
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
  const parentStatus = resolveBeaconStatus(parent, agents, now, visited)
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
  }),

  // ─── 计算属性 ───

  getters: {
    /** 统一判定单个 Agent 是否在线 */
    isOnline: (state) => (agent) => {
      return resolveBeaconStatus(agent, state.agents, state.now).kind === 'online'
    },

    /** 统一返回 Agent 可达状态：online / offline / cascade */
    beaconStatus: (state) => (agent) => {
      return resolveBeaconStatus(agent, state.agents, state.now)
    },

    /** 直连在线 Agent 数量 */
    onlineCount(state) {
      return state.agents.filter(a => this.isOnline(a)).length
    },

    /** 级联可达 Agent 数量 */
    cascadeCount(state) {
      return state.agents.filter(a => this.beaconStatus(a).kind === 'cascade').length
    },

    /** 通过 ID 查询 Agent */
    getAgentById: (state) => (beaconid) => state.agents.find(a => a.beaconid === beaconid),
  },

  // ─── 方法 ───

  actions: {
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
      
      const mappedAgent = {
        beaconid: beaconKey, // 强制转为字符串，防止 substring 崩溃
        hostname: agent.hostname || agent.Hostname || agent.host_name || agent.HostName || 'Unknown',
        // 净化用户名：剔除 MACHINE\User 或 DOMAIN\User 中的前缀
        username: (agent.username || agent.Username || agent.user_name || agent.UserName || 'Unknown').split('\\').pop(),
        os: agent.os || agent.OS || 'Unknown',
        arch: agent.arch || agent.Arch || 'Unknown',
        ip: agent.internal_ip || agent.internalIp || agent.ip || agent.InternalIP || agent.InternalIp || '0.0.0.0',
        externalIp: agent.external_ip || agent.externalIp || agent.ExternalIP || agent.ExternalIp || '-',
        lastSeen: normalizeLastSeen(agent.last_seen || agent.LastSeen || agent.lastSeen),
        status: agent.status || agent.Status || 'online',
        processName: agent.process_name || agent.ProcessName || agent.processName || agent.process || agent.Process || '-',
        pid: agent.pid || agent.PID || 0,
        acp: agent.acp || agent.ACP || 0,
        isAdmin: agent.is_admin || agent.IsAdmin || agent.isAdmin || false,
        sleep: agent.sleep || agent.Sleep || 0,
        jitter: agent.jitter || agent.Jitter || 0,
        protocol: agent.protocol || agent.Protocol || 'http',
        listener: agent.listener || agent.Listener || '-',
        listenerType: agent.listener_type || agent.ListenerType || '',
        parentId: agent.parent_id || agent.ParentId || agent.ParentID || '',
        gatewayId: agent.gateway_id || agent.GatewayId || agent.GatewayID || '',
        depth: agent.depth || agent.Depth || 0,
        linkProtocol: agent.link_protocol || agent.LinkProtocol || '',
        linkState: agent.link_state || agent.LinkState || '',
        linkHint: agent.link_hint || agent.LinkHint || '',
        linkAddr: agent.link_addr || agent.LinkAddr || agent.linkAddr || ''
      }

      if (idx >= 0) {
        this.agents[idx] = { ...this.agents[idx], ...mappedAgent }
        console.log(`%c[AgentStore] UPDATED Agent: ${beaconKey}`, 'color: #3b82f6')
      } else {
        this.agents.push(mappedAgent)
        console.log(`%c[AgentStore] NEW Agent Registered: ${beaconKey}`, 'color: #10b981; font-weight: bold', mappedAgent)
      }
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
        
        // 同时清理可能开启的控制台
        const consoleStore = useConsoleStore()
        consoleStore.closeConsole(beaconid)

        // 内存回收：清理文件浏览器状态
        const explorerStore = useExplorerStore()
        explorerStore.clearCache(beaconid)
        
        return true
      } catch (err) {
        console.error('删除会话失败:', err)
        throw err
      }
    },

    /** 移除本地 Agent (仅前端清理，如 WS 断开等场景) */
    removeAgent(beaconid) {
      this.agents = this.agents.filter(a => a.beaconid !== beaconid)
      
      const consoleStore = useConsoleStore()
      consoleStore.closeConsole(beaconid)

      // 内存回收：清理文件浏览器状态
      const explorerStore = useExplorerStore()
      explorerStore.clearCache(beaconid)
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
      } else if (beaconid) {
        this.addAgent({ ...data, beaconid })
      }
    },

    /** 驱动时钟脉冲 (每秒调用一次) */
    tick() {
      this.now = Date.now()
    }
  },
})
