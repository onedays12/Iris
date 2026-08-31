<script setup lang="ts">
/**
 * BottomDock - 底部多合一停靠面板(应用骨架的一部分)
 *
 * workspace 纵向布局:main.content(独立滚动) + BottomDock。
 * 三个 tab:控制台(每 beacon 会话,复用 ConsolePanel) / 事件流 / 传输监控。
 * 高度由分隔条拖拽控制:rAF 合帧 + CSS 变量 --dock-h 提交,拖拽中不加过渡,
 * feed 列表各自 contain: strict —— 保证逐帧跟手(替代原右侧面板的卡顿拖拽)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDockStore } from '../../stores/dock'
import { useConsoleStore } from '../../stores/console'
import { useEventPanelStore } from '../../stores/eventPanel'
import { useFileTransferStore } from '../../stores/fileTransfer'
import ConsolePanel from '../dashboard/ConsolePanel.vue'
import EventsFeed from './EventsFeed.vue'
import TransferFeed from './TransferFeed.vue'

const { t } = useI18n()
const dock = useDockStore()
const consoleStore = useConsoleStore()
const eventPanel = useEventPanelStore()
const transferStore = useFileTransferStore()

const dragHandleRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

let rafId = 0
let pendingHeight = 0
let startY = 0
let startHeight = 0

function onHandleMouseDown(event: MouseEvent) {
  if (dock.collapsed) return
  event.preventDefault()
  dragging.value = true
  startY = event.clientY
  startHeight = dock.height
  pendingHeight = startHeight
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event: MouseEvent) {
  // 向上拖拽增高;目标值先记录,由 rAF 每帧提交一次
  pendingHeight = startHeight + (startY - event.clientY)
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      rafId = 0
      dock.setHeight(pendingHeight)
    })
  }
}

function onMouseUp() {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
    dock.setHeight(pendingHeight)
  }
  dragging.value = false
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  onMouseUp()
})

function onWindowResize() {
  // 视口缩小时把超限高度拉回上限内
  dock.setHeight(dock.height)
}

const consoleActive = computed(() => consoleStore.consolePanelVisible && consoleStore.activeConsoles.length > 0)
const eventCount = computed(() => eventPanel.events.length)
const transferCount = computed(() =>
  transferStore.transfers.filter(tr => ['queued', 'running', 'receiving', 'uploading'].includes(tr.status)).length)

const tabs = computed(() => [
  { key: 'console' as const, label: t('dock.consoleTab'), badge: consoleStore.activeConsoles.length, dot: consoleActive.value },
  { key: 'events' as const, label: t('dock.eventsTab'), badge: eventCount.value, dot: false },
  { key: 'transfers' as const, label: t('transfer.monitor'), badge: transferCount.value, dot: transferCount.value > 0 },
])
</script>

<template>
  <section
    class="bottom-dock"
    :class="{ dragging, collapsed: dock.collapsed }"
    :style="{ '--dock-h': `${dock.effectiveHeight}px` }"
  >
    <!-- 高度分隔条 -->
    <div
      ref="dragHandleRef"
      class="dock-resize-handle"
      :class="{ collapsed: dock.collapsed }"
      title=""
      @mousedown="onHandleMouseDown"
      @dblclick="dock.toggleCollapsed()"
    ><span class="handle-grip"></span></div>

    <!-- 收起态:极简条 -->
    <div v-if="dock.collapsed" class="dock-collapsed-bar" @click="dock.setCollapsed(false)">
      <span class="collapsed-tabs">
        <span v-for="tab in tabs" :key="tab.key" class="collapsed-tab">{{ tab.label }}<template v-if="tab.badge"> {{ tab.badge }}</template></span>
      </span>
      <span class="collapsed-hint">{{ t('common.expand') }} ⤢</span>
    </div>

    <!-- 展开态 -->
    <template v-else>
      <header class="dock-header">
        <div class="dock-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="dock-tab"
            :class="{ active: dock.activeTab === tab.key }"
            @click="dock.setTab(tab.key)"
          >
            <span v-if="tab.dot && tab.key !== dock.activeTab" class="tab-dot"></span>
            {{ tab.label }}
            <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
          </button>
        </div>
        <div class="dock-actions">
          <button
            v-if="dock.activeTab === 'events' && eventCount > 0"
            type="button"
            class="dock-action"
            @click="eventPanel.clear()"
          >{{ t('eventPanel.clear') }}</button>
          <button
            type="button"
            class="dock-action"
            :title="t('dock.collapse')"
            @click="dock.setCollapsed(true)"
          >⤓</button>
        </div>
      </header>

      <div class="dock-body">
        <template v-if="dock.activeTab === 'console'">
          <ConsolePanel v-if="consoleActive" />
          <div v-else class="dock-empty">{{ t('dock.consoleEmptyHint') }}</div>
        </template>
        <EventsFeed v-else-if="dock.activeTab === 'events'" />
        <TransferFeed v-else />
      </div>
    </template>
  </section>
</template>

<style scoped>
.bottom-dock {
  flex: 0 0 var(--dock-h);
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-left: var(--sidebar-w);
  border-top: 1px solid var(--border-light);
  background: var(--bg-primary);
  position: relative;
  /* 必须低于 .content 的 z-index(10):页面内的 fixed 弹窗(监听器/文件浏览器等,
     z-index 1000)没有 Teleport 到 body,被困在 .content 的层叠上下文里,
     底坞若高于 .content 就会整块盖住弹窗(2026-08 监听器弹窗被控制台遮挡)。 */
  z-index: 1;
  overflow: hidden;
}

/* 分隔条:拖拽期间不加任何过渡 */
.dock-resize-handle {
  flex: 0 0 6px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.dock-resize-handle:hover .handle-grip,
.bottom-dock.dragging .handle-grip {
  background: var(--color-primary);
}

.handle-grip {
  width: 42px;
  height: 3px;
  border-radius: 2px;
  background: rgba(15, 23, 42, 0.18);
  transition: background 0.15s ease;
}

.dock-collapsed-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  cursor: pointer;
  user-select: none;
  font-size: 11.5px;
  color: var(--text-secondary);
  min-height: 0;
}

.dock-collapsed-bar:hover {
  background: rgba(99, 102, 241, 0.08);
}

.collapsed-tabs {
  display: inline-flex;
  gap: 14px;
  min-width: 0;
  overflow: hidden;
}

.collapsed-tab {
  white-space: nowrap;
}

.collapsed-hint {
  margin-left: auto;
  opacity: 0.6;
}

.dock-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 12px 2px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-secondary);
  min-height: 28px;
}

.dock-tabs {
  display: inline-flex;
  gap: 2px;
}

.dock-tab {
  border: none;
  background: transparent;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dock-tab:hover {
  color: var(--text-primary);
  background: rgba(99, 102, 241, 0.08);
}

.dock-tab.active {
  color: var(--color-primary);
  background: rgba(99, 102, 241, 0.12);
}

.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #52c41a;
}

.tab-badge {
  font-size: 10px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(var(--color-primary-rgb), 0.14);
  color: var(--color-primary);
}

.dock-actions {
  display: inline-flex;
  gap: 4px;
}

.dock-action {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.dock-action:hover {
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-primary);
}

.dock-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dock-body > * {
  flex: 1 1 auto;
  min-height: 0;
}

.dock-empty {
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

/* 拖拽中禁用文本选择与 iframe 捕获 */
.bottom-dock.dragging {
  user-select: none;
  cursor: row-resize;
}

:global(html[data-ui-theme="dark"]) .bottom-dock {
  background: var(--bg-primary);
}

:global(html[data-ui-theme="dark"]) .dock-tab:hover {
  background: rgba(99, 102, 241, 0.16);
}

:global(html[data-ui-theme="dark"]) .dock-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

:global(html[data-ui-theme="dark"]) .handle-grip {
  background: rgba(255, 255, 255, 0.22);
}
</style>
