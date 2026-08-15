<script setup lang="ts">
/**
 * TopologyCanvas - 网络拓扑画布
 * 渲染 Agent 节点和连接边，支持拖拽布局、
 * 缩放、节点选中、右键菜单。
 */

import { ref, reactive, computed } from 'vue'
import TopologyNode from './TopologyNode.vue'
import TopologyEdge from './TopologyEdge.vue'
import type { Beacon } from '../../features/beacon/model'
import type { TopologyPosition } from '../../features/topology/cascadeLayout'
import {
  buildBeaconLayerRows,
  isCascadeLike,
  resolveParentId,
} from '../../features/topology/cascadeLayout'

const props = defineProps<{
  agents: Beacon[]
  positions: Record<string, TopologyPosition | undefined>
  selectedId?: string
}>()

const emit = defineEmits(['updatePosition', 'select', 'contextMenu'])

const svgRef = ref<SVGSVGElement | null>(null)

const NODE_W = 248
const NODE_H = 104
const SERVER_W = 248
const SERVER_H = 78
const V_GAP = 190
const PADDING = 140
const TEAMSERVER_ID = '__teamserver__'

// Zoom / Pan state
const BASE_WIDTH = 1200
const BASE_HEIGHT = 800
const viewBox = reactive({ x: 0, y: -220, width: BASE_WIDTH, height: BASE_HEIGHT })
const zoom = ref(1)

// Pan state
const isPanning = ref(false)
const panStart = reactive({ mx: 0, my: 0, vx: 0, vy: 0 })

// Drag state
const dragState = ref<{ beaconid: string; startMouseX: number; startMouseY: number; startNodeX: number; startNodeY: number } | null>(null) // { beaconid, startMouseX, startMouseY, startNodeX, startNodeY }

const rootAgents = computed(() => {
  return props.agents
    .filter(agent => !resolveParentId(agent, props.agents))
    .sort((a, b) => a.beaconid.localeCompare(b.beaconid))
})

const teamServerPosition = computed(() => {
  const rootPositions = rootAgents.value
    .map(agent => props.positions[agent.beaconid])
    .filter((pos): pos is TopologyPosition => Boolean(pos))

  if (!rootPositions.length) {
    return { x: BASE_WIDTH / 2, y: -V_GAP }
  }

  const xs = rootPositions.map(pos => pos.x)
  const ys = rootPositions.map(pos => pos.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: Math.min(...ys) - V_GAP,
  }
})

const externalCount = computed(() => {
  return rootAgents.value.filter(agent => !isCascadeLike(agent)).length
})

const cascadeCount = computed(() => {
  return props.agents.length - rootAgents.value.length
})

const topologyRows = computed(() => {
  return [
    {
      key: 'teamserver',
      y: teamServerPosition.value.y,
      label: 'TeamServer',
      summary: `${externalCount.value} external / ${cascadeCount.value} cascade`,
      kind: 'server',
      height: SERVER_H + 54,
    },
    ...buildBeaconLayerRows(props.agents, props.positions, NODE_H),
  ]
})

// --- Edges ---

const edges = computed(() => {
  const result = []
  for (const a of props.agents) {
    const parentId = resolveParentId(a, props.agents)
    if (parentId) {
      const parentPos = props.positions[parentId]
      const childPos = props.positions[a.beaconid]
      if (parentPos && childPos) {
        result.push({
          key: `${parentId}-${a.beaconid}`,
          x1: parentPos.x,
          y1: parentPos.y,
          x2: childPos.x,
          y2: childPos.y,
          sourceHalfHeight: NODE_H / 2,
          targetHalfHeight: NODE_H / 2,
          linkProtocol: a.linkProtocol || 'tcp',
          linkAddr: a.linkAddr || '',
          edgeType: 'cascade',
        })
      }
      continue
    }

    const childPos = props.positions[a.beaconid]
    if (childPos) {
      const isOrphan = isCascadeLike(a)
      result.push({
        key: `${TEAMSERVER_ID}-${a.beaconid}`,
        x1: isOrphan ? teamServerPosition.value.x : childPos.x,
        y1: isOrphan ? teamServerPosition.value.y : childPos.y,
        x2: isOrphan ? childPos.x : teamServerPosition.value.x,
        y2: isOrphan ? childPos.y : teamServerPosition.value.y,
        sourceHalfHeight: isOrphan ? SERVER_H / 2 : NODE_H / 2,
        targetHalfHeight: isOrphan ? NODE_H / 2 : SERVER_H / 2,
        linkProtocol: isOrphan ? (a.linkProtocol || 'tcp') : 'external',
        linkAddr: a.linkAddr || '',
        edgeType: isOrphan ? 'orphan' : 'external',
      })
    }
  }
  return result
})

// --- Nodes with positions ---

const nodes = computed(() => {
  return props.agents.map(agent => ({
    agent,
    x: props.positions[agent.beaconid]?.x ?? 0,
    y: props.positions[agent.beaconid]?.y ?? 0,
  }))
})

// --- Coordinate Conversion ---

function screenToSvg(clientX: number, clientY: number) {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const rect = svg.getBoundingClientRect()
  return {
    x: (clientX - rect.left) / rect.width * viewBox.width + viewBox.x,
    y: (clientY - rect.top) / rect.height * viewBox.height + viewBox.y,
  }
}

// --- Zoom ---

function applyZoom(newZoom: number, focusClientX: number, focusClientY: number) {
  const clamped = Math.max(0.2, Math.min(3.0, newZoom))
  const svg = svgRef.value
  if (!svg) return

  const rect = svg.getBoundingClientRect()
  const ratioX = (focusClientX - rect.left) / rect.width
  const ratioY = (focusClientY - rect.top) / rect.height

  const newWidth = BASE_WIDTH / clamped
  const newHeight = BASE_HEIGHT / clamped

  viewBox.x += (viewBox.width - newWidth) * ratioX
  viewBox.y += (viewBox.height - newHeight) * ratioY
  viewBox.width = newWidth
  viewBox.height = newHeight
  zoom.value = clamped
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  applyZoom(zoom.value + delta, e.clientX, e.clientY)
}

// --- Pan ---

function onMouseDown(e: MouseEvent) {
  // Only start pan on left click on SVG background
  if (e.button !== 0) return
  if (e.target !== svgRef.value && !(e.target as Element).closest('.topo-canvas-bg')) return

  isPanning.value = true
  panStart.mx = e.clientX
  panStart.my = e.clientY
  panStart.vx = viewBox.x
  panStart.vy = viewBox.y
}

function onMouseMove(e: MouseEvent) {
  // Handle drag
  if (dragState.value) {
    const svg = svgRef.value
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = viewBox.width / rect.width
    const scaleY = viewBox.height / rect.height

    const dx = (e.clientX - dragState.value.startMouseX) * scaleX
    const dy = (e.clientY - dragState.value.startMouseY) * scaleY

    emit('updatePosition', dragState.value.beaconid, {
      x: dragState.value.startNodeX + dx,
      y: dragState.value.startNodeY + dy,
    })
    return
  }

  // Handle pan
  if (isPanning.value) {
    const svg = svgRef.value
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = viewBox.width / rect.width
    const scaleY = viewBox.height / rect.height

    viewBox.x = panStart.vx - (e.clientX - panStart.mx) * scaleX
    viewBox.y = panStart.vy - (e.clientY - panStart.my) * scaleY
  }
}

function onMouseUp() {
  isPanning.value = false
  dragState.value = null
}

// --- Node Events ---

function onNodeDragStart(payload: { beaconid: string; mouseX: number; mouseY: number; startX: number; startY: number }) {
  dragState.value = {
    beaconid: payload.beaconid,
    startMouseX: payload.mouseX,
    startMouseY: payload.mouseY,
    startNodeX: payload.startX,
    startNodeY: payload.startY,
  }
}

function onNodeSelect(beaconid: string) {
  emit('select', beaconid)
}

function onNodeContextMenu(payload: Record<string, any>) {
  emit('contextMenu', payload)
}

// --- Exposed Methods ---

function zoomIn() {
  const svg = svgRef.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  applyZoom(zoom.value + 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function zoomOut() {
  const svg = svgRef.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  applyZoom(zoom.value - 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function fitView() {
  const posArr = Object.values(props.positions).filter((pos): pos is TopologyPosition => Boolean(pos))
  if (!posArr.length) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  function includeNodeBounds({ x, y }: TopologyPosition, width: number, height: number) {
    minX = Math.min(minX, x - width / 2)
    minY = Math.min(minY, y - height / 2)
    maxX = Math.max(maxX, x + width / 2)
    maxY = Math.max(maxY, y + height / 2)
  }

  for (const pos of posArr) {
    includeNodeBounds(pos, NODE_W, NODE_H)
  }
  includeNodeBounds(teamServerPosition.value, SERVER_W, SERVER_H)

  const w = maxX - minX + PADDING * 2
  const h = maxY - minY + PADDING * 2

  viewBox.x = minX - PADDING
  viewBox.y = minY - PADDING
  viewBox.width = w
  viewBox.height = h

  // Update zoom to match
  zoom.value = Math.min(BASE_WIDTH / w, BASE_HEIGHT / h, 2)
}

defineExpose({ zoomIn, zoomOut, fitView })
</script>

<template>
  <svg
    ref="svgRef"
    class="topo-canvas"
    :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @contextmenu.prevent
  >
    <defs>
      <marker
        id="arrow-external"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-success)" />
      </marker>
      <marker
        id="arrow-tcp"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
      </marker>
      <marker
        id="arrow-smb"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-warning)" />
      </marker>
      <marker
        id="arrow-orphan"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-danger)" />
      </marker>
    </defs>

    <!-- Background for pan detection -->
    <rect
      class="topo-canvas-bg"
      :x="viewBox.x - 9999"
      :y="viewBox.y - 9999"
      :width="19998"
      :height="19998"
      fill="transparent"
    />

    <!-- Layer guides -->
    <g class="layer-guides">
      <g
        v-for="row in topologyRows"
        :key="row.key"
        :class="['layer-row', row.kind]"
      >
        <rect
          :x="viewBox.x + 28"
          :y="row.y - row.height / 2"
          :width="viewBox.width - 56"
          :height="row.height"
          rx="14"
          class="layer-band"
        />
        <text :x="viewBox.x + 46" :y="row.y - row.height / 2 + 24" class="layer-title">
          {{ row.label }}
        </text>
        <text :x="viewBox.x + 46" :y="row.y - row.height / 2 + 40" class="layer-summary">
          {{ row.summary }}
        </text>
      </g>
    </g>

    <!-- Edges (rendered first, below nodes) -->
    <TopologyEdge
      v-for="edge in edges"
      :key="edge.key"
      :x1="edge.x1"
      :y1="edge.y1"
      :x2="edge.x2"
      :y2="edge.y2"
      :link-protocol="edge.linkProtocol"
      :link-addr="edge.linkAddr"
      :edge-type="edge.edgeType"
      :source-half-height="edge.sourceHalfHeight"
      :target-half-height="edge.targetHalfHeight"
    />

    <!-- TeamServer root -->
    <g
      class="teamserver-node"
      :transform="`translate(${teamServerPosition.x}, ${teamServerPosition.y})`"
    >
      <rect
        :x="-SERVER_W / 2"
        :y="-SERVER_H / 2"
        :width="SERVER_W"
        :height="SERVER_H"
        rx="10"
        class="teamserver-bg"
      />
      <g :transform="`translate(${-SERVER_W / 2 + 18}, ${-SERVER_H / 2 + 14})`" class="server-icon">
        <rect x="0" y="0" width="38" height="34" rx="5" class="server-rack" />
        <line x1="7" y1="10" x2="31" y2="10" />
        <line x1="7" y1="21" x2="31" y2="21" />
        <circle cx="10" cy="28" r="2" />
        <circle cx="17" cy="28" r="2" />
      </g>
      <text :x="-SERVER_W / 2 + 68" y="-10" class="teamserver-title">TeamServer</text>
      <text :x="-SERVER_W / 2 + 68" y="10" class="teamserver-subtitle">External Beacon 入口</text>
      <text :x="SERVER_W / 2 - 14" y="23" class="teamserver-count">
        {{ externalCount }} 外联 / {{ cascadeCount }} 级联
      </text>
    </g>

    <!-- Nodes -->
    <TopologyNode
      v-for="node in nodes"
      :key="node.agent.beaconid"
      :agent="node.agent"
      :x="node.x"
      :y="node.y"
      :selected="selectedId === node.agent.beaconid"
      @drag-start="onNodeDragStart"
      @select="onNodeSelect"
      @context-menu="onNodeContextMenu"
    />
  </svg>
</template>

<style scoped>
.topo-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: default;
  --topo-layer-title: var(--text-secondary);
  --topo-layer-summary: var(--text-muted);
  --topo-band-fill: rgba(255, 255, 255, 0.58);
  --topo-band-stroke: rgba(79, 70, 229, 0.12);
  --topo-server-band-fill: rgba(16, 185, 129, 0.08);
  --topo-server-band-stroke: rgba(16, 185, 129, 0.24);
  --topo-external-band-fill: rgba(96, 165, 250, 0.08);
  --topo-external-band-stroke: rgba(96, 165, 250, 0.24);
  --topo-cascade-band-fill: rgba(129, 140, 248, 0.08);
  --topo-cascade-band-stroke: rgba(129, 140, 248, 0.22);
  --topo-node-title: #f8fafc;
  --topo-node-subtitle: #cbd5e1;
  --topo-node-muted: #94a3b8;
  --topo-node-bg: rgba(15, 23, 42, 0.92);
  --topo-node-border: rgba(148, 163, 184, 0.38);
  --topo-edge-halo: rgba(248, 250, 252, 0.82);
  --topo-edge-label-bg: rgba(255, 255, 255, 0.95);
  --topo-edge-label-border: rgba(15, 23, 42, 0.14);
  --topo-edge-label-external: #047857;
  --topo-edge-label-tcp: #4338ca;
  --topo-edge-label-smb: #b45309;
  --topo-edge-label-orphan: #dc2626;
}

.topo-canvas:active {
  cursor: grabbing;
}

:global(html[data-ui-theme="dark"]) .topo-canvas {
  --topo-band-fill: rgba(15, 23, 42, 0.38);
  --topo-band-stroke: rgba(148, 163, 184, 0.14);
  --topo-server-band-fill: rgba(16, 185, 129, 0.08);
  --topo-server-band-stroke: rgba(52, 211, 153, 0.22);
  --topo-external-band-fill: rgba(96, 165, 250, 0.08);
  --topo-external-band-stroke: rgba(96, 165, 250, 0.2);
  --topo-cascade-band-fill: rgba(129, 140, 248, 0.08);
  --topo-cascade-band-stroke: rgba(129, 140, 248, 0.2);
  --topo-node-bg: rgba(15, 23, 42, 0.9);
  --topo-node-border: rgba(148, 163, 184, 0.32);
  --topo-edge-halo: rgba(15, 23, 42, 0.86);
  --topo-edge-label-bg: rgba(2, 6, 23, 0.94);
  --topo-edge-label-border: rgba(148, 163, 184, 0.3);
  --topo-edge-label-external: #7dd3fc;
  --topo-edge-label-tcp: #dbeafe;
  --topo-edge-label-smb: #fef3c7;
  --topo-edge-label-orphan: #fecaca;
}

.layer-band {
  fill: var(--topo-band-fill);
  stroke: var(--topo-band-stroke);
  stroke-width: 1;
}

.layer-row.server .layer-band {
  fill: var(--topo-server-band-fill);
  stroke: var(--topo-server-band-stroke);
}

.layer-row.external .layer-band {
  fill: var(--topo-external-band-fill);
  stroke: var(--topo-external-band-stroke);
}

.layer-row.cascade .layer-band {
  fill: var(--topo-cascade-band-fill);
  stroke: var(--topo-cascade-band-stroke);
}

.layer-title,
.layer-summary {
  font-family: 'Inter', sans-serif;
  text-anchor: start;
  pointer-events: none;
}

.layer-title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  fill: var(--topo-layer-title);
}

.layer-summary {
  font-size: 10px;
  font-weight: 700;
  fill: var(--topo-layer-summary);
}

.teamserver-bg {
  fill: var(--topo-node-bg);
  stroke: rgba(52, 211, 153, 0.34);
  stroke-width: 1.2;
  filter: drop-shadow(0 14px 26px rgba(15, 23, 42, 0.24));
}

.server-icon .server-rack {
  fill: rgba(52, 211, 153, 0.14);
  stroke: rgba(52, 211, 153, 0.55);
  stroke-width: 1;
}

.server-icon line {
  stroke: rgba(52, 211, 153, 0.72);
  stroke-width: 1;
}

.server-icon circle {
  fill: var(--color-success);
}

.teamserver-title {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 800;
  fill: var(--topo-node-title);
}

.teamserver-subtitle,
.teamserver-count {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 600;
  fill: var(--topo-node-subtitle);
}

.teamserver-count {
  text-anchor: end;
}
</style>
