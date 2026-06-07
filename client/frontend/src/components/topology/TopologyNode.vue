<script setup>
/**
 * TopologyNode - 拓扑图节点组件
 *
 * 渲染网络拓扑图中的单个 Beacon 节点，支持拖拽、选中高亮和右键菜单交互。
 */

import { computed } from 'vue'

const props = defineProps({
  agent: { type: Object, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  selected: { type: Boolean, default: false },
})

const emit = defineEmits(['dragStart', 'select', 'contextMenu'])

const NODE_W = 248
const NODE_H = 104
const HALF_W = NODE_W / 2
const HALF_H = NODE_H / 2

function truncate(value, max) {
  const text = String(value || '')
  return text.length > max ? `${text.substring(0, max - 1)}...` : text
}

const osKind = computed(() => {
  const os = String(props.agent.os || '').toLowerCase()
  if (os.includes('windows')) return 'windows'
  if (os.includes('linux')) return 'linux'
  if (os.includes('darwin') || os.includes('mac')) return 'mac'
  return 'unknown'
})

const osLabel = computed(() => {
  if (osKind.value === 'windows') return 'WIN'
  if (osKind.value === 'linux') return 'LINUX'
  if (osKind.value === 'mac') return 'macOS'
  return 'OS'
})

const roleLabel = computed(() => {
  const listenerType = String(props.agent.listenerType || '').toLowerCase()
  const depth = Number(props.agent.depth || 0)
  return listenerType === 'internal' || depth > 0 || props.agent.parentId ? 'INTERNAL' : 'EXTERNAL'
})

const roleClass = computed(() => {
  return roleLabel.value === 'EXTERNAL' ? 'role-external' : 'role-internal'
})

const statusClass = computed(() => {
  const s = String(props.agent.status || '').toLowerCase()
  if (s === 'online') return 'status-online'
  if (s === 'sleeping') return 'status-sleeping'
  return 'status-offline'
})

const truncatedHostname = computed(() => truncate(props.agent.hostname || 'Unknown', 18))
const truncatedUsername = computed(() => truncate(props.agent.username || '-', 15))
const shortId = computed(() => String(props.agent.beaconid || '').substring(0, 8))
const metaLine = computed(() => {
  const ip = props.agent.ip && props.agent.ip !== '0.0.0.0' ? props.agent.ip : props.agent.externalIp
  return truncate(ip || props.agent.os || '-', 24)
})

function onMouseDown(e) {
  if (e.button !== 0) return
  emit('dragStart', {
    beaconid: props.agent.beaconid,
    startX: props.x,
    startY: props.y,
    mouseX: e.clientX,
    mouseY: e.clientY,
  })
}

function onClick() {
  emit('select', props.agent.beaconid)
}

function onContextMenu(e) {
  emit('contextMenu', {
    targetType: 'beacon',
    clientX: e.clientX,
    clientY: e.clientY,
    beaconid: props.agent.beaconid,
  })
}
</script>

<template>
  <g
    :transform="`translate(${x}, ${y})`"
    :class="['topo-node', `os-${osKind}`, { selected }]"
    @mousedown.stop="onMouseDown"
    @click.stop="onClick"
    @contextmenu.stop.prevent="onContextMenu"
  >
    <rect
      :x="-HALF_W"
      :y="-HALF_H"
      :width="NODE_W"
      :height="NODE_H"
      rx="10"
      class="node-bg"
    />
    <rect
      :x="-HALF_W"
      :y="-HALF_H"
      width="4"
      :height="NODE_H"
      rx="2"
      class="node-accent"
    />

    <g :transform="`translate(${-HALF_W + 18}, ${-HALF_H + 20})`" class="computer-icon">
      <rect x="0" y="0" width="50" height="34" rx="5" class="computer-screen" />
      <rect x="19" y="34" width="12" height="7" rx="1" class="computer-neck" />
      <rect x="11" y="41" width="28" height="4" rx="2" class="computer-base" />

      <g v-if="osKind === 'windows'" class="os-glyph windows-glyph">
        <rect x="14" y="8" width="9" height="9" />
        <rect x="25" y="8" width="9" height="9" />
        <rect x="14" y="19" width="9" height="9" />
        <rect x="25" y="19" width="9" height="9" />
      </g>
      <g v-else-if="osKind === 'mac'" class="os-glyph mac-glyph">
        <circle cx="25" cy="17" r="9" />
        <circle cx="21" cy="14" r="1.4" class="mac-dot" />
        <circle cx="28" cy="14" r="1.4" class="mac-dot" />
        <path d="M20 21 Q25 24 31 21" />
      </g>
      <g v-else-if="osKind === 'linux'" class="os-glyph linux-glyph">
        <rect x="13" y="8" width="24" height="21" rx="3" />
        <text x="17" y="22">$</text>
      </g>
      <text v-else x="25" y="22" class="unknown-glyph">?</text>
    </g>

    <circle :cx="-HALF_W + 86" :cy="-HALF_H + 22" r="4" :class="statusClass" />
    <text :x="-HALF_W + 96" :y="-HALF_H + 26" class="node-hostname">{{ truncatedHostname }}</text>

    <rect
      :x="HALF_W - 84"
      :y="HALF_H - 28"
      width="72"
      height="18"
      rx="5"
      class="role-badge-bg"
      :class="roleClass"
    />
    <text :x="HALF_W - 48" :y="HALF_H - 15" class="role-badge-text" :class="roleClass">
      {{ roleLabel }}
    </text>

    <text :x="-HALF_W + 86" y="-6" class="node-id">{{ shortId }}</text>
    <text :x="-HALF_W + 86" y="14" class="node-meta">{{ metaLine }}</text>
    <text :x="-HALF_W + 86" y="34" class="node-username">{{ truncatedUsername }}</text>

    <rect :x="-HALF_W + 18" :y="HALF_H - 24" width="54" height="18" rx="5" class="os-badge-bg" />
    <text :x="-HALF_W + 45" :y="HALF_H - 11" class="os-badge-text">{{ osLabel }}</text>
  </g>
</template>

<style scoped>
.node-bg {
  fill: var(--topo-node-bg, rgba(15, 23, 42, 0.92));
  stroke: var(--topo-node-border, rgba(148, 163, 184, 0.38));
  stroke-width: 1;
  transition: all 0.2s;
  cursor: grab;
  filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.22));
}

.topo-node:hover .node-bg {
  stroke: rgba(var(--color-primary-rgb), 0.38);
  filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.25));
}

.topo-node.selected .node-bg {
  stroke: var(--color-primary);
  stroke-width: 2;
  filter: drop-shadow(0 14px 30px rgba(129, 140, 248, 0.22));
}

.node-accent {
  fill: #94a3b8;
}

.topo-node.os-windows .node-accent,
.topo-node.os-windows .computer-screen,
.topo-node.os-windows .os-badge-bg {
  stroke: #60a5fa;
}

.topo-node.os-windows .node-accent,
.topo-node.os-windows .os-glyph,
.topo-node.os-windows .os-badge-bg {
  fill: #60a5fa;
}

.topo-node.os-mac .node-accent,
.topo-node.os-mac .computer-screen,
.topo-node.os-mac .os-badge-bg {
  stroke: #c084fc;
}

.topo-node.os-mac .node-accent,
.topo-node.os-mac .os-badge-bg {
  fill: #c084fc;
}

.topo-node.os-linux .node-accent,
.topo-node.os-linux .computer-screen,
.topo-node.os-linux .os-badge-bg {
  stroke: #fbbf24;
}

.topo-node.os-linux .node-accent,
.topo-node.os-linux .os-badge-bg {
  fill: #fbbf24;
}

.computer-screen {
  fill: rgba(15, 23, 42, 0.9);
  stroke: rgba(148, 163, 184, 0.38);
  stroke-width: 1.2;
}

.computer-neck,
.computer-base {
  fill: rgba(148, 163, 184, 0.32);
}

.os-glyph {
  fill: rgba(255, 255, 255, 0.92);
}

.mac-glyph circle {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 1.4;
}

.mac-glyph .mac-dot {
  fill: rgba(255, 255, 255, 0.9);
  stroke: none;
}

.mac-glyph path {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 1.3;
  stroke-linecap: round;
}

.linux-glyph rect {
  fill: rgba(251, 191, 36, 0.22);
  stroke: rgba(255, 255, 255, 0.78);
  stroke-width: 1;
}

.linux-glyph text,
.unknown-glyph {
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px;
  font-weight: 800;
  fill: rgba(255, 255, 255, 0.92);
}

.status-online {
  fill: var(--color-success);
}

.status-offline {
  fill: #94a3b8;
}

.status-sleeping {
  fill: var(--color-warning);
}

.node-hostname {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 800;
  fill: var(--topo-node-title, #f8fafc);
}

.node-id,
.node-meta,
.node-username {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 650;
  fill: var(--topo-node-muted, #94a3b8);
}

.node-id {
  font-weight: 800;
  fill: var(--topo-node-subtitle, #cbd5e1);
}

.role-badge-bg {
  stroke-width: 0.8;
}

.role-badge-bg.role-external {
  fill: rgba(16, 185, 129, 0.16);
  stroke: var(--color-success);
}

.role-badge-bg.role-internal {
  fill: rgba(129, 140, 248, 0.18);
  stroke: var(--color-primary);
}

.role-badge-text,
.os-badge-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: central;
}

.role-badge-text.role-external {
  fill: #34d399;
}

.role-badge-text.role-internal {
  fill: #a5b4fc;
}

.os-badge-bg {
  fill-opacity: 0.16;
  stroke-width: 0.8;
}

.os-badge-text {
  fill: var(--topo-node-title, #f8fafc);
}
</style>
