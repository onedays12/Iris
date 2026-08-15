<script setup lang="ts">
/**
 * TopologyEdge - 拓扑图连线组件
 *
 * 渲染两个 Beacon 节点之间的连接线，支持级联和代理两种边类型，显示连接协议标签。
 */

import { computed } from 'vue'

const props = defineProps({
  x1: { type: Number, required: true },
  y1: { type: Number, required: true },
  x2: { type: Number, required: true },
  y2: { type: Number, required: true },
  linkProtocol: { type: String, default: '' },
  linkAddr: { type: String, default: '' },
  edgeType: { type: String, default: 'cascade' },
  sourceHalfHeight: { type: Number, default: 44 },
  targetHalfHeight: { type: Number, default: 44 },
})

const normalizedProtocol = computed(() => String(props.linkProtocol || '').toLowerCase())
const edgeClass = computed(() => {
  if (props.edgeType === 'external') return 'edge-external'
  if (props.edgeType === 'orphan') return 'edge-orphan'
  return normalizedProtocol.value === 'smb' ? 'edge-smb' : 'edge-tcp'
})
const markerEnd = computed(() => {
  if (props.edgeType === 'external') return 'url(#arrow-external)'
  if (props.edgeType === 'orphan') return 'url(#arrow-orphan)'
  return normalizedProtocol.value === 'smb' ? 'url(#arrow-smb)' : 'url(#arrow-tcp)'
})
const label = computed(() => {
  if (props.edgeType === 'external') return props.linkAddr || 'EXTERNAL'
  if (props.edgeType === 'orphan') return 'PARENT LOST'
  if (props.linkAddr) return props.linkAddr
  return normalizedProtocol.value ? normalizedProtocol.value.toUpperCase() : 'TCP'
})
const isUpward = computed(() => props.y2 < props.y1)
const startY = computed(() => props.y1 + (isUpward.value ? -props.sourceHalfHeight : props.sourceHalfHeight))
const endY = computed(() => props.y2 + (isUpward.value ? props.targetHalfHeight : -props.targetHalfHeight))
const midY = computed(() => (startY.value + endY.value) / 2)
const labelX = computed(() => (props.x1 + props.x2) / 2)
const labelY = computed(() => midY.value - 8)
const labelWidth = computed(() => Math.max(46, label.value.length * 6.8 + 14))
const pathD = computed(() => (
  `M ${props.x1} ${startY.value} C ${props.x1} ${midY.value}, ${props.x2} ${midY.value}, ${props.x2} ${endY.value}`
))
</script>

<template>
  <g class="topology-edge">
    <path
      :d="pathD"
      class="edge-halo"
    />
    <path
      :d="pathD"
      :class="edgeClass"
      :marker-end="markerEnd"
    />
    <rect
      :x="labelX - labelWidth / 2"
      :y="labelY - 8"
      :width="labelWidth"
      height="17"
      rx="5"
      class="edge-label-bg"
      :class="edgeClass"
    />
    <text :x="labelX" :y="labelY" class="edge-label" :class="edgeClass">
      {{ label }}
    </text>
  </g>
</template>

<style scoped>
.edge-halo {
  stroke: var(--topo-edge-halo, rgba(248, 250, 252, 0.82));
  stroke-width: 6;
  stroke-linecap: round;
  fill: none;
  opacity: 0.9;
}

.edge-external {
  stroke: var(--color-success);
  stroke-width: 2.4;
  stroke-linecap: round;
  fill: none;
}

.edge-tcp {
  stroke: var(--color-primary);
  stroke-width: 2.2;
  stroke-linecap: round;
  fill: none;
}

.edge-smb {
  stroke: var(--color-warning);
  stroke-width: 2.2;
  stroke-dasharray: 8 4;
  stroke-linecap: round;
  fill: none;
}

.edge-orphan {
  stroke: var(--color-danger);
  stroke-width: 2;
  stroke-dasharray: 4 4;
  stroke-linecap: round;
  fill: none;
}

.edge-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  font-weight: 800;
  stroke: none;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
  text-rendering: geometricPrecision;
}

.edge-label-bg {
  fill: var(--topo-edge-label-bg, rgba(255, 255, 255, 0.94));
  stroke: var(--topo-edge-label-border, rgba(15, 23, 42, 0.12));
  stroke-width: 1;
  filter: drop-shadow(0 2px 5px rgba(15, 23, 42, 0.18));
  pointer-events: none;
}

.edge-label.edge-external {
  fill: var(--topo-edge-label-external, var(--color-success));
}

.edge-label.edge-tcp {
  fill: var(--topo-edge-label-tcp, var(--color-primary));
}

.edge-label.edge-smb {
  fill: var(--topo-edge-label-smb, var(--color-warning));
}

.edge-label.edge-orphan {
  fill: var(--topo-edge-label-orphan, var(--color-danger));
}

.edge-label-bg.edge-external {
  stroke: rgba(16, 185, 129, 0.38);
}

.edge-label-bg.edge-tcp {
  stroke: rgba(var(--color-primary-rgb), 0.38);
}

.edge-label-bg.edge-smb {
  stroke: rgba(245, 158, 11, 0.4);
}

.edge-label-bg.edge-orphan {
  stroke: rgba(239, 68, 68, 0.4);
}
</style>
