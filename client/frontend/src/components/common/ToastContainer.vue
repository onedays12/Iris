<script setup lang="ts">
/**
 * ToastContainer - 全局通知提示容器
 *
 * 渲染并管理页面右上角的 Toast 通知列表，支持不同类型（成功、错误、警告、信息）的提示样式。
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNotificationStore } from '../../stores/notification'
import { useEventPanelStore } from '../../stores/eventPanel'

const notificationStore = useNotificationStore()
const eventPanel = useEventPanelStore()
const route = useRoute()

const GAP = 24

const offsetRight = computed(() => {
  if (route.name === 'Login') return GAP
  const panelWidth = eventPanel.visible
    ? eventPanel.width + eventPanel.rightOffset
    : eventPanel.collapsedWidth + eventPanel.rightOffset
  return panelWidth + GAP
})
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" :style="{ right: `${offsetRight}px` }">
      <TransitionGroup name="toast" tag="div" class="toast-list">
        <div
          v-for="n in notificationStore.notifications"
          :key="n.id"
          class="toast-item glass-card"
          :class="n.type"
        >
          <span class="toast-icon">
            <template v-if="n.type === 'success'">✅</template>
            <template v-else-if="n.type === 'error'">🚨</template>
            <template v-else-if="n.type === 'warn'">⚠️</template>
            <template v-else>ℹ️</template>
          </span>
          <span class="toast-message">{{ n.message }}</span>
          <button class="toast-close" @click="notificationStore.remove(n.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  pointer-events: none;
}

.toast-list {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.toast-item {
  pointer-events: auto;
  min-width: 280px;
  max-width: 400px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.08) 38%, rgba(255, 255, 255, 0.02)),
    var(--glass-popover-bg);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(150%);
  border: 1px solid var(--glass-border-strong);
  box-shadow: var(--shadow-md);
  animation: slideIn 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}

.toast-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.2s;
}

.toast-close:hover {
  color: var(--text-primary);
}

/* 状态色 */
.toast-item.success { border-left: 4px solid #10b981; }
.toast-item.error { border-left: 4px solid #ef4444; }
.toast-item.warn { border-left: 4px solid #f59e0b; }
.toast-item.info { border-left: 4px solid var(--color-primary); }

/* 动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
