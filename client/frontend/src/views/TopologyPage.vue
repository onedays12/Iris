<script setup>
/**
 * TopologyPage - 网络拓扑可视化页面
 *
 * 以图形化方式展示 Beacon 之间的网络拓扑关系，支持节点拖拽、右键操作和自动布局。
 */

import { reactive, ref, computed, watch, nextTick, onMounted } from 'vue'
import { useAgentStore } from '../stores/agent.js'
import TopologyCanvas from '../components/topology/TopologyCanvas.vue'
import TopologyToolbar from '../components/topology/TopologyToolbar.vue'
import BeaconContextMenu from '../components/beacon/BeaconContextMenu.vue'

const agentStore = useAgentStore()
const canvasRef = ref(null)

const selectedBeaconId = ref('')
const contextMenu = reactive({ visible: false, x: 0, y: 0, targetType: '', beaconid: '' })

const NODE_W = 248
const H_GAP = 320
const V_GAP = 190

// --- Layout Algorithm ---

function computeLayout(agents) {
  if (!agents.length) return {}

  const childrenMap = new Map()

  for (const a of agents) {
    const pid = resolveParentId(a, agents)
    if (pid) {
      if (!childrenMap.has(pid)) childrenMap.set(pid, [])
      childrenMap.get(pid).push(a)
    }
  }

  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.beaconid.localeCompare(b.beaconid))
  }

  const roots = agents.filter(a => !resolveParentId(a, agents))
  roots.sort((a, b) => a.beaconid.localeCompare(b.beaconid))

  const result = {}
  let globalX = 0

  function layoutSubtree(node, depth) {
    const children = childrenMap.get(node.beaconid) || []

    if (children.length === 0) {
      const x = globalX + NODE_W / 2
      const y = depth * V_GAP
      result[node.beaconid] = { x, y }
      globalX += H_GAP
      return H_GAP
    }

    const startX = globalX
    let totalWidth = 0
    const childCenters = []

    for (const child of children) {
      const cx0 = globalX
      const w = layoutSubtree(child, depth + 1)
      childCenters.push((cx0 + globalX) / 2)
      totalWidth += w
    }

    const minX = childCenters[0]
    const maxX = childCenters[childCenters.length - 1]
    result[node.beaconid] = { x: (minX + maxX) / 2, y: depth * V_GAP }

    return totalWidth
  }

  for (const root of roots) {
    layoutSubtree(root, 0)
  }

  for (const a of agents) {
    if (!result[a.beaconid]) {
      result[a.beaconid] = { x: globalX + NODE_W / 2, y: 0 }
      globalX += H_GAP
    }
  }

  return result
}

function resolveParentId(agent, agents) {
  const parentId = String(agent.parentId || '')
  if (!parentId) return ''
  const selfId = String(agent.beaconid || '')
  const parent = agents.find(a => {
    if (a.beaconid === selfId) return false
    return a.beaconid === parentId || a.beaconid.startsWith(parentId) || parentId.startsWith(a.beaconid)
  })
  return parent?.beaconid || ''
}

// --- Positions State ---

const positions = reactive({})

// Initialize positions for all agents
function initPositions() {
  const layout = computeLayout(agentStore.agents)
  for (const [id, pos] of Object.entries(layout)) {
    if (!positions[id]) {
      positions[id] = { x: pos.x, y: pos.y }
    }
  }
}

// Watch for new agents and add their positions
watch(() => agentStore.agents.length, () => {
  const layout = computeLayout(agentStore.agents)
  for (const a of agentStore.agents) {
    if (!positions[a.beaconid] && layout[a.beaconid]) {
      positions[a.beaconid] = { x: layout[a.beaconid].x, y: layout[a.beaconid].y }
    }
  }
  scheduleFitView()
}, { immediate: true })

// Initialize on mount
initPositions()

onMounted(() => {
  scheduleFitView()
})

function scheduleFitView() {
  nextTick(() => {
    requestAnimationFrame(() => canvasRef.value?.fitView())
  })
}

// --- Actions ---

function resetLayout() {
  const layout = computeLayout(agentStore.agents)
  // Clear and reassign
  for (const key of Object.keys(positions)) {
    delete positions[key]
  }
  for (const [id, pos] of Object.entries(layout)) {
    positions[id] = { x: pos.x, y: pos.y }
  }
  scheduleFitView()
}

function onUpdatePosition(beaconid, newPos) {
  if (positions[beaconid]) {
    positions[beaconid].x = newPos.x
    positions[beaconid].y = newPos.y
  }
}

function onSelectNode(beaconid) {
  selectedBeaconId.value = selectedBeaconId.value === beaconid ? '' : beaconid
}

function onContextMenu(payload) {
  contextMenu.visible = true
  contextMenu.x = payload.clientX
  contextMenu.y = payload.clientY
  contextMenu.targetType = payload.targetType || 'beacon'
  contextMenu.beaconid = payload.beaconid
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.targetType = ''
}

const hasAgents = computed(() => agentStore.agents.length > 0)
</script>

<template>
  <div class="topology-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="page-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="5" r="3"/>
          <circle cx="5" cy="19" r="3"/>
          <circle cx="19" cy="19" r="3"/>
          <line x1="12" y1="8" x2="5" y2="16"/>
          <line x1="12" y1="8" x2="19" y2="16"/>
        </svg>
        <span>网络拓扑</span>
      </div>
      <div class="header-stats">
        <div class="header-stats-inner">
          <div class="stat-item">
            <span class="stat-value">{{ agentStore.agents.length }}</span>
            <span class="stat-label">节点</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value online">{{ agentStore.onlineCount }}</span>
            <span class="stat-label">在线</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Topology Container -->
    <div class="topology-container glass-card">
      <TopologyToolbar
        @auto-layout="resetLayout"
        @zoom-in="canvasRef?.zoomIn()"
        @zoom-out="canvasRef?.zoomOut()"
        @fit-view="canvasRef?.fitView()"
      />

      <TopologyCanvas
        v-if="hasAgents"
        ref="canvasRef"
        :agents="agentStore.agents"
        :positions="positions"
        :selected-id="selectedBeaconId"
        @update-position="onUpdatePosition"
        @select="onSelectNode"
        @context-menu="onContextMenu"
      />

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="icon">📡</div>
        <div class="title">等待 Agent 上线</div>
        <div class="desc">
          当 Agent 连接到服务器后，会自动显示拓扑关系图
        </div>
        <div class="pulse-ring"></div>
      </div>
    </div>

    <!-- Context Menu -->
    <BeaconContextMenu
      v-if="contextMenu.visible && contextMenu.targetType === 'beacon'"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :beaconid="contextMenu.beaconid"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped>
.topology-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  flex-shrink: 0;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-title svg {
  color: var(--color-primary);
}

.header-stats-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(150%);
  box-shadow: var(--shadow-sm);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-value.online {
  color: var(--color-success);
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-divider {
  width: 1px;
  height: 30px;
  background: var(--border);
}

.topology-container {
  flex: 1;
  margin: 0 24px 24px;
  position: relative;
  overflow: hidden;
  padding: 0;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.empty-state .icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state .title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.empty-state .desc {
  font-size: 13px;
  text-align: center;
  max-width: 300px;
}

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
