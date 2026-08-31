<script setup lang="ts">
/**
 * AgentTable - Agent 列表表格
 * 展示所有 Beacon 的主机名、用户、IP、操作系统、状态等信息，
 * 支持右键菜单操作和搜索过滤。
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '../../stores/agent'
import type { BeaconStatus } from '../../stores/agent'
import { useConsoleStore } from '../../stores/console'
import { useDockStore } from '../../stores/dock'
import type { Beacon } from '../../features/beacon/model'
import BeaconContextMenu from '../beacon/BeaconContextMenu.vue'
import { groupBeacons, matchesBeaconSearch, UNGROUPED_KEY } from '../../features/beacon/groupBeacons'

const props = defineProps({
  searchQuery: { type: String, default: '' }
})

const { t } = useI18n()
const agentStore = useAgentStore()
const consoleStore = useConsoleStore()
const selectedBeaconId = ref<string | null>(null)
const checkedIds = ref<string[]>([])
const collapsedGroups = ref<Record<string, boolean>>({})
const contextMenu = ref<{ visible: boolean; x: number; y: number; beaconid: string; beaconIds: string[] }>({
  visible: false, x: 0, y: 0, beaconid: '', beaconIds: [],
})
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    agentStore.tick()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function selectAgent(beaconid: string) {
  selectedBeaconId.value = beaconid
}

function openConsole(beaconid: string) {
  consoleStore.openConsole(beaconid)
  // M2:双击 → 展开 BottomDock 控制台 tab 并聚焦输入框
  useDockStore().openConsoleTab()
  consoleStore.requestFocus()
}

function onRowContextMenu(e: MouseEvent, agent: Beacon) {
  e.preventDefault()
  selectedBeaconId.value = agent.beaconid
  const ids = checkedIds.value.includes(agent.beaconid) && checkedIds.value.length > 0
    ? [...checkedIds.value]
    : [agent.beaconid]
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    beaconid: agent.beaconid,
    beaconIds: ids,
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function formatTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso).getTime()
  // 修正：引用 agentStore.now 确保响应式更新
  const diff = Math.max(0, Math.floor((agentStore.now - d) / 1000))
  
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

function getBeaconStatus(agent: Beacon) {
  return agentStore.beaconStatus(agent)
}

function getStatusClass(agent: Beacon) {
  return getBeaconStatus(agent).class
}

function getStatusLabel(agent: Beacon) {
  const status = getBeaconStatus(agent)
  return status.labelKey || (status as BeaconStatus & { label?: string }).label || 'agent.status.offline'
}

function getStatusDotClass(agent: Beacon) {
  return getBeaconStatus(agent).dotClass
}

function getCascadeDetail(agent: Beacon) {
  if (getBeaconStatus(agent).kind !== 'cascade') return ''
  const parentId = String(agent.parentId || '')
  const parent = parentId ? t('agentTable.via', { id: parentId.substring(0, 8) }) : t('agentTable.viaParent')
  const protocol = agent.linkProtocol ? String(agent.linkProtocol).toLowerCase() : 'unknown'
  return `${parent} / ${protocol} / ${t('agentTable.lastObserved', { time: formatTime(agent.lastSeen) })}`
}

function getStatusTitle(agent: Beacon) {
  const cascadeDetail = getCascadeDetail(agent)
  if (cascadeDetail) return cascadeDetail

  const state = String(agent.linkState || '').toLowerCase()
  if ((String(agent.listenerType || '').toLowerCase() === 'internal' || Number(agent.depth || 0) > 0 || agent.parentId) && state) {
    return `${t('agentTable.linkState', { state })} / ${t('agentTable.lastObserved', { time: formatTime(agent.lastSeen) })}`
  }
  return t('agentTable.lastHeartbeat', { time: formatTime(agent.lastSeen) })
}

const filteredAgents = computed(() => {
  return agentStore.agents.filter((agent) => matchesBeaconSearch(agent, props.searchQuery))
})

const groupedAgents = computed(() => groupBeacons(filteredAgents.value))
const visibleIds = computed(() => filteredAgents.value.map((agent) => agent.beaconid))

watch(() => agentStore.agents.map((agent) => agent.beaconid), (liveIds) => {
  const live = new Set(liveIds)
  const next = checkedIds.value.filter((id) => live.has(id))
  if (next.length !== checkedIds.value.length) checkedIds.value = next
})
const allVisibleChecked = computed(() => visibleIds.value.length > 0 && visibleIds.value.every((id) => checkedIds.value.includes(id)))
const someVisibleChecked = computed(() => visibleIds.value.some((id) => checkedIds.value.includes(id)))

function isChecked(id: string): boolean {
  return checkedIds.value.includes(id)
}

function setChecked(id: string, on: boolean): void {
  if (on) {
    if (!checkedIds.value.includes(id)) checkedIds.value = [...checkedIds.value, id]
    return
  }
  checkedIds.value = checkedIds.value.filter((item) => item !== id)
}

function toggleChecked(id: string, event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  setChecked(id, on)
}

function toggleAllVisible(event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  if (on) {
    const merged = new Set(checkedIds.value)
    for (const id of visibleIds.value) merged.add(id)
    checkedIds.value = [...merged]
    return
  }
  const visible = new Set(visibleIds.value)
  checkedIds.value = checkedIds.value.filter((id) => !visible.has(id))
}

function groupIds(agents: Beacon[]): string[] {
  return agents.map((agent) => agent.beaconid)
}

function groupAllChecked(agents: Beacon[]): boolean {
  const ids = groupIds(agents)
  return ids.length > 0 && ids.every((id) => checkedIds.value.includes(id))
}

function groupSomeChecked(agents: Beacon[]): boolean {
  return groupIds(agents).some((id) => checkedIds.value.includes(id))
}

function toggleGroupChecked(agents: Beacon[], event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  const ids = groupIds(agents)
  if (on) {
    const merged = new Set(checkedIds.value)
    for (const id of ids) merged.add(id)
    checkedIds.value = [...merged]
    return
  }
  const drop = new Set(ids)
  checkedIds.value = checkedIds.value.filter((id) => !drop.has(id))
}

function groupLabel(key: string): string {
  return key === UNGROUPED_KEY ? t('agentTable.ungrouped') : key
}

function isGroupCollapsed(key: string): boolean {
  return Boolean(collapsedGroups.value[key])
}

function toggleGroupCollapsed(key: string): void {
  collapsedGroups.value = { ...collapsedGroups.value, [key]: !collapsedGroups.value[key] }
}

/**
 * 格式化进程名：移除冗余的 .exe 后缀以便美观显示
 */
function formatProcessName(name: string) {
  const text = String(name || '').trim()
  if (!text) return '-'
  return text.replace(/\.exe$/i, '')
}

function protocolClass(agent: Beacon) {
  return `proto-${String(agent.protocol || 'http').toLowerCase()}`
}

function protocolText(agent: Beacon) {
  return String(agent.protocol || 'http').toUpperCase()
}
</script>

<template>
  <div class="agent-table-wrapper" @click="closeContextMenu">
    <table class="data-table" v-if="filteredAgents.length > 0">
      <thead>
        <tr>
          <th style="width: 36px">
            <input
              :key="`all-check-${allVisibleChecked}-${someVisibleChecked}`"
              type="checkbox"
              :checked="allVisibleChecked"
              :indeterminate="someVisibleChecked && !allVisibleChecked"
              @click.stop
              @change="toggleAllVisible"
            >
          </th>
          <th style="width: 40px"></th>
          <th>ID</th>
          <th>{{ t('agentTable.colHostname') }}</th>
          <th>{{ t('agentTable.colNote') }}</th>
          <th>{{ t('agentTable.colUser') }}</th>
          <th>{{ t('agentTable.colOs') }}</th>
          <th>{{ t('agentTable.colProtocol') }}</th>
          <th>{{ t('agentTable.colLocalIp') }}</th>
          <th>{{ t('agentTable.colExternalIp') }}</th>
          <th>{{ t('agentTable.colProcess') }}</th>
          <th>{{ t('agentTable.colPolicy') }}</th>
          <th>{{ t('agentTable.colTopology') }}</th>
          <th>{{ t('agentTable.colLastSeen') }}</th>
          <th>{{ t('agentTable.colStatus') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in groupedAgents" :key="group.key || '__ungrouped'">
          <tr class="group-header-row" @click="toggleGroupCollapsed(group.key)">
            <td @click.stop>
              <input
                :key="`group-check-${group.key}-${groupAllChecked(group.agents)}-${groupSomeChecked(group.agents)}`"
                type="checkbox"
                :checked="groupAllChecked(group.agents)"
                :indeterminate="groupSomeChecked(group.agents) && !groupAllChecked(group.agents)"
                @change="toggleGroupChecked(group.agents, $event)"
              >
            </td>
            <td colspan="14" class="group-header-cell">
              <span class="group-toggle">{{ isGroupCollapsed(group.key) ? '▶' : '▼' }}</span>
              <span class="group-title">{{ groupLabel(group.key) }}</span>
              <span class="group-count">{{ group.agents.length }}</span>
            </td>
          </tr>
          <tr
            v-for="agent in group.agents"
            v-show="!isGroupCollapsed(group.key)"
            :key="agent.beaconid"
            :class="{ selected: selectedBeaconId === agent.beaconid, checked: isChecked(agent.beaconid) }"
            @click="selectAgent(agent.beaconid)"
            @dblclick="openConsole(agent.beaconid)"
            @contextmenu="onRowContextMenu($event, agent)"
            class="agent-row"
          >
          <td @click.stop>
            <input type="checkbox" :checked="isChecked(agent.beaconid)" @change="toggleChecked(agent.beaconid, $event)">
          </td>
          <td>
            <span class="status-dot" :class="getStatusDotClass(agent)"></span>
          </td>
          <td class="cell-id">{{ String(agent.beaconid).substring(0, 8) }}</td>
          <td>
            <span class="cell-hostname">{{ agent.hostname }}</span>
          </td>
          <td class="cell-note" :title="agent.note">{{ agent.note || '—' }}</td>
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
          <td>
            <span class="protocol-tag" :class="protocolClass(agent)">
              {{ protocolText(agent) }}
            </span>
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
                <span v-if="agent.linkProtocol" class="topo-tag" :class="'topo-' + String(agent.linkProtocol).toLowerCase()">
                  {{ String(agent.linkProtocol).toUpperCase() }}
                </span>
                <span v-if="agent.linkState" class="topo-state" :class="'state-' + String(agent.linkState).toLowerCase()">
                  {{ agent.linkState }}
                </span>
                <span v-if="agent.parentId" class="topo-parent" :title="String(agent.parentId)">
                  {{ String(agent.parentId).substring(0, 8) }}
                </span>
              </span>
            </template>
          </td>
          <td class="cell-time">{{ formatTime(agent.lastSeen) }}</td>
          <td :title="getStatusTitle(agent)">
            <div class="status-cell">
              <span class="tag" :class="getStatusClass(agent)">
                {{ t(getStatusLabel(agent)) }}
              </span>
              <span v-if="getCascadeDetail(agent)" class="status-detail">
                {{ getCascadeDetail(agent) }}
              </span>
            </div>
          </td>
        </tr>
        </template>
      </tbody>
    </table>

    <!-- 空状态 (基础) -->
    <div v-else-if="agentStore.agents.length === 0" class="empty-state">
      <div class="icon">📡</div>
      <div class="title">{{ t('agentTable.emptyTitle') }}</div>
      <div class="desc">
        {{ t('agentTable.emptyDesc') }}
      </div>
      <div class="pulse-ring"></div>
    </div>

    <!-- 搜索无结果 -->
    <div v-else class="empty-state">
      <div class="icon">🔍</div>
      <div class="title">{{ t('agentTable.noMatchTitle') }}</div>
      <div class="desc">
        {{ t('agentTable.noMatchDesc') }}
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:20px" @click="$emit('clearSearch')">
        {{ t('agentTable.clearSearch') }}
      </button>
    </div>

    <!-- 右键菜单 -->
    <BeaconContextMenu
      v-if="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :beaconid="contextMenu.beaconid"
      :beacon-ids="contextMenu.beaconIds"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped>
/* 操作员需要复制 beacon 会话字段(ID/主机/IP/进程等):放开数据单元格的文本选择 */
.agent-table-wrapper :deep(.data-table tbody td) {
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

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

.agent-row.checked {
  background: rgba(99, 102, 241, 0.08);
}

.group-header-row {
  cursor: pointer;
  background: rgba(15, 23, 42, 0.04);
}

.group-header-row:hover {
  background: rgba(99, 102, 241, 0.08);
}

.group-header-cell {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  padding: 8px 12px !important;
}

.group-toggle {
  display: inline-block;
  width: 14px;
  color: #64748b;
}

.group-title {
  margin-left: 6px;
}

.group-count {
  margin-left: 8px;
  font-weight: 600;
  color: #94a3b8;
}

.cell-note {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #475569;
  font-size: 12px;
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

.protocol-tag {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

.proto-http,
.proto-https {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.proto-tcp {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.proto-smb {
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
