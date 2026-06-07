<script setup>
/**
 * AgentTable - Agent 列表表格
 * 展示所有 Beacon 的主机名、用户、IP、操作系统、状态等信息，
 * 支持右键菜单操作和搜索过滤。
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agent.js'
import { useConsoleStore } from '../../stores/console.js'
import BeaconContextMenu from '../beacon/BeaconContextMenu.vue'

const props = defineProps({
  searchQuery: { type: String, default: '' }
})

const agentStore = useAgentStore()
const consoleStore = useConsoleStore()
const selectedBeaconId = ref(null)
const contextMenu = ref({ visible: false, x: 0, y: 0, beaconid: null })
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    agentStore.tick()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function selectAgent(beaconid) {
  selectedBeaconId.value = beaconid
}

function openConsole(beaconid) {
  consoleStore.openConsole(beaconid)
}

function onRowContextMenu(e, agent) {
  e.preventDefault()
  selectedBeaconId.value = agent.beaconid
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    beaconid: agent.beaconid,
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function formatTime(iso) {
  if (!iso) return '-'
  const d = new Date(iso).getTime()
  // 修正：引用 agentStore.now 确保响应式更新
  const diff = Math.max(0, Math.floor((agentStore.now - d) / 1000))
  
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

function getBeaconStatus(agent) {
  return agentStore.beaconStatus(agent)
}

function getStatusClass(agent) {
  return getBeaconStatus(agent).class
}

function getStatusLabel(agent) {
  return getBeaconStatus(agent).label
}

function getStatusDotClass(agent) {
  return getBeaconStatus(agent).dotClass
}

function getCascadeDetail(agent) {
  if (getBeaconStatus(agent).kind !== 'cascade') return ''
  const parentId = String(agent.parentId || '')
  const parent = parentId ? `经由 ${parentId.substring(0, 8)}` : '经由父级'
  const protocol = agent.linkProtocol ? String(agent.linkProtocol).toLowerCase() : 'unknown'
  return `${parent} / ${protocol} / 最后观测 ${formatTime(agent.lastSeen)}`
}

function getStatusTitle(agent) {
  const cascadeDetail = getCascadeDetail(agent)
  if (cascadeDetail) return cascadeDetail

  const state = String(agent.linkState || '').toLowerCase()
  if ((String(agent.listenerType || '').toLowerCase() === 'internal' || Number(agent.depth || 0) > 0 || agent.parentId) && state) {
    return `链路 ${state} / 最后观测 ${formatTime(agent.lastSeen)}`
  }
  return `最后心跳 ${formatTime(agent.lastSeen)}`
}

const filteredAgents = computed(() => {
  if (!props.searchQuery) return agentStore.agents
  
  const q = props.searchQuery.toLowerCase()
  return agentStore.agents.filter(agent => {
    // 增加健壮性检查：确保属性存在后再调用 toLowerCase
    const bid = (agent.beaconid || '').toLowerCase()
    const host = (agent.hostname || '').toLowerCase()
    const user = (agent.username || '').toLowerCase()
    const ip = (agent.ip || '').toLowerCase()
    const extIp = (agent.externalIp || '').toLowerCase()
    const proc = (agent.processName || '').toLowerCase()
    const os = (agent.os || '').toLowerCase()
    const pid = (agent.parentId || '').toLowerCase()

    return (
      bid.includes(q) ||
      host.includes(q) ||
      user.includes(q) ||
      ip.includes(q) ||
      extIp.includes(q) ||
      proc.includes(q) ||
      os.includes(q) ||
      pid.includes(q)
    )
  })
})

/**
 * 格式化进程名：移除冗余的 .exe 后缀以便美观显示
 */
function formatProcessName(name) {
  if (!name) return '-'
  return name.replace(/\.exe$/i, '')
}
</script>

<template>
  <div class="agent-table-wrapper" @click="closeContextMenu">
    <table class="data-table" v-if="filteredAgents.length > 0">
      <thead>
        <tr>
          <th style="width: 40px"></th>
          <th>ID</th>
          <th>主机名</th>
          <th>用户</th>
          <th>系统 / 架构</th>
          <th>内网 IP</th>
          <th>外网 IP</th>
          <th>进程 (PID)</th>
          <th>策略 (S/J)</th>
          <th>拓扑</th>
          <th>最后心跳</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="agent in filteredAgents"
          :key="agent.beaconid"
          :class="{ selected: selectedBeaconId === agent.beaconid }"
          @click="selectAgent(agent.beaconid)"
          @dblclick="openConsole(agent.beaconid)"
          @contextmenu="onRowContextMenu($event, agent)"
          class="agent-row"
        >
          <td>
            <span class="status-dot" :class="getStatusDotClass(agent)"></span>
          </td>
          <td class="cell-id">{{ agent.beaconid.substring(0, 8) }}</td>
          <td>
            <span class="cell-hostname">{{ agent.hostname }}</span>
          </td>
          <td :title="agent.username">
            <span :class="{ 'admin-user': agent.isAdmin }">
              {{ agent.username }}{{ agent.isAdmin ? '*' : '' }}
            </span>
          </td>
          <td>
            <div class="os-info">
              <span class="os-badge">{{ agent.os }}</span>
              <span class="arch-text">{{ agent.arch }}</span>
            </div>
          </td>
          <td class="cell-ip">{{ agent.ip }}</td>
          <td class="cell-ip">{{ agent.externalIp }}</td>
          <td>
            <div class="process-info" :title="agent.processName">
              <span class="proc-name">{{ formatProcessName(agent.processName) }}</span>
              <span class="pid-tag">[{{ agent.pid }}]</span>
            </div>
          </td>
          <td class="cell-policy">{{ agent.sleep }}s / {{ agent.jitter }}%</td>
          <td class="cell-topology">
            <template v-if="agent.depth > 0">
              <span class="topo-depth" :style="{ paddingLeft: (agent.depth - 1) * 12 + 'px' }">
                <span v-if="agent.linkProtocol" class="topo-tag" :class="'topo-' + agent.linkProtocol.toLowerCase()">
                  {{ agent.linkProtocol.toUpperCase() }}
                </span>
                <span v-if="agent.linkState" class="topo-state" :class="'state-' + agent.linkState.toLowerCase()">
                  {{ agent.linkState }}
                </span>
                <span v-if="agent.parentId" class="topo-parent" :title="agent.parentId">
                  {{ agent.parentId.substring(0, 8) }}
                </span>
              </span>
            </template>
          </td>
          <td class="cell-time">{{ formatTime(agent.lastSeen) }}</td>
          <td :title="getStatusTitle(agent)">
            <div class="status-cell">
              <span class="tag" :class="getStatusClass(agent)">
                {{ getStatusLabel(agent) }}
              </span>
              <span v-if="getCascadeDetail(agent)" class="status-detail">
                {{ getCascadeDetail(agent) }}
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 空状态 (基础) -->
    <div v-else-if="agentStore.agents.length === 0" class="empty-state">
      <div class="icon">📡</div>
      <div class="title">等待 Agent 上线</div>
      <div class="desc">
        当 Agent 连接到服务器后，会自动显示在此表格中
      </div>
      <div class="pulse-ring"></div>
    </div>

    <!-- 搜索无结果 -->
    <div v-else class="empty-state">
      <div class="icon">🔍</div>
      <div class="title">没有找到匹配的 Agent</div>
      <div class="desc">
        试着搜索其他的关键词，如主机名或 IP
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:20px" @click="$emit('clearSearch')">
        清除搜索
      </button>
    </div>

    <!-- 右键菜单 -->
    <BeaconContextMenu
      v-if="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :beaconid="contextMenu.beaconid"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped>
.agent-table-wrapper {
  position: relative;
  min-height: 200px;
}

.agent-row {
  cursor: pointer;
}

.agent-row:active {
  background: rgba(79, 70, 229, 0.1) !important;
}

.cell-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--color-accent);
  letter-spacing: 0.5px;
}

.cell-hostname {
  font-weight: 500;
  color: var(--text-primary);
}

.os-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.arch-text {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.os-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border);
  border-radius: 4px;
  text-transform: capitalize;
  color: var(--text-secondary);
}

.admin-user {
  color: var(--color-warning);
  font-weight: 600;
}

.process-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.proc-name {
  color: var(--text-secondary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pid-tag {
  color: var(--text-muted);
  font-size: 11px;
}

.cell-policy {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-muted);
}

.cell-ip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.cell-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-muted);
}

.status-dot.cascade {
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

.status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.status-detail {
  max-width: 180px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-topology {
  font-size: 11px;
  white-space: nowrap;
}

.topo-depth {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.topo-tag {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

.topo-tcp {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.topo-smb {
  background: rgba(168, 85, 247, 0.12);
  color: #7c3aed;
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.topo-state {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
}

.state-connected {
  color: var(--color-success);
}

.state-disconnected {
  color: var(--color-danger);
}

.topo-parent {
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
}

/* 空状态脉冲动画 */
.pulse-ring {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 2px solid var(--color-primary-dim);
  animation: pulse-expand 2s infinite;
  margin-top: 16px;
}

@keyframes pulse-expand {
  0% {
    transform: scale(0.8);
    opacity: 1;
    border-color: rgba(99, 102, 241, 0.4);
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
    border-color: rgba(99, 102, 241, 0);
  }
}
</style>
