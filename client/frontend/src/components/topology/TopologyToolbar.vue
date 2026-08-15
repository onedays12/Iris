<script setup lang="ts">
/**
 * TopologyToolbar - 拓扑图工具栏
 *
 * 提供拓扑图的视图控制按钮，包括自动布局、放大、缩小和适应视图等操作。
 */

const emit = defineEmits(['autoLayout', 'zoomIn', 'zoomOut', 'fitView'])
</script>

<template>
  <div class="topo-toolbar">
    <button class="toolbar-btn" @click="emit('autoLayout')" title="重新布局">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="8" y="14" width="8" height="7" rx="1"/>
        <line x1="6.5" y1="10" x2="6.5" y2="14"/>
        <line x1="17.5" y1="10" x2="17.5" y2="14"/>
      </svg>
      <span>布局</span>
    </button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn icon-only" @click="emit('zoomIn')" title="放大">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>
    <button class="toolbar-btn icon-only" @click="emit('zoomOut')" title="缩小">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>
    <button class="toolbar-btn icon-only" @click="emit('fitView')" title="适配视图">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
        <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
        <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
        <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
    </button>
    <div class="toolbar-divider"></div>
    <div class="legend">
      <span class="legend-item">
        <span class="legend-line external"></span>External
      </span>
      <span class="legend-item">
        <span class="legend-line tcp"></span>TCP
      </span>
      <span class="legend-item">
        <span class="legend-line smb"></span>SMB
      </span>
      <span class="legend-item">
        <span class="legend-line orphan"></span>Parent Lost
      </span>
    </div>
  </div>
</template>

<style scoped>
.topo-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--glass-popover-bg);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(155%);
  border: 1px solid var(--glass-border-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: rgba(var(--color-primary-rgb), 0.1);
  color: var(--text-primary);
}

.toolbar-btn.icon-only {
  padding: 6px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border-light);
  margin: 0 2px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
}

.legend-line {
  display: inline-block;
  width: 14px;
  height: 0;
  border-top-width: 2px;
  border-top-style: solid;
}

.legend-line.external {
  border-top-color: var(--color-success);
}

.legend-line.tcp {
  border-top-color: var(--color-primary);
}

.legend-line.smb {
  border-top-color: var(--color-warning);
  border-top-style: dashed;
}

.legend-line.orphan {
  border-top-color: var(--color-danger);
  border-top-style: dashed;
}
</style>
