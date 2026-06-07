<script setup>
/**
 * GlobalConsoleDock - 全局控制台停靠面板
 *
 * 在页面底部以抽屉形式展示 Beacon 控制台面板，当存在活跃的控制台会话时自动显示。
 */

import { computed } from 'vue'
import { useConsoleStore } from '../../stores/console.js'
import { useEventPanelStore } from '../../stores/eventPanel.js'
import ConsolePanel from '../dashboard/ConsolePanel.vue'

const consoleStore = useConsoleStore()
const eventPanelStore = useEventPanelStore()
const visible = computed(() => consoleStore.consolePanelVisible && consoleStore.activeConsoles.length > 0)
const dockRight = computed(() => `${eventPanelStore.effectiveWidth}px`)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="global-console-dock" :style="{ right: dockRight }">
      <ConsolePanel />
    </div>
  </Teleport>
</template>

<style scoped>
.global-console-dock {
  position: fixed;
  left: var(--sidebar-w);
  bottom: 0;
  z-index: 200;
  min-width: 360px;
  pointer-events: auto;
  transition: right 0.2s ease;
}

@media (max-width: 1180px) {
  .global-console-dock {
    right: 72px !important;
  }
}

@media (max-width: 720px) {
  .global-console-dock {
    left: 0;
    right: 0 !important;
  }
}
</style>
