<script setup lang="ts">
/**
 * EventPanel - 全局事件面板
 * 展示 WebSocket 推送的实时事件（命令结果、连接/断开、Tunnel 等），
 * 支持拖拽调整宽度、事件过滤、自动滚动。
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEventPanelStore } from '../../stores/eventPanel'
import type { EventTone } from '../../stores/eventPanel'

const { t, locale } = useI18n()
const eventPanel = useEventPanelStore()

const latest = computed(() => eventPanel.latest)

const PANEL_STORAGE_KEY = 'c2.event-panel.width'
const PANEL_RIGHT_OFFSET = 24
const PANEL_MIN_WIDTH = 320
const PANEL_MAX_WIDTH = 640
const PANEL_DEFAULT_WIDTH = 420
const PANEL_COLLAPSED_WIDTH = 48

const panelWidth = ref(PANEL_DEFAULT_WIDTH)
const resizing = ref(false)

function clampWidth(value: number) {
  if (typeof window === 'undefined') return value
  const safeMax = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, window.innerWidth - 160))
  return Math.min(safeMax, Math.max(PANEL_MIN_WIDTH, value))
}

function loadWidth() {
  if (typeof window === 'undefined') return PANEL_DEFAULT_WIDTH
  const raw = Number(window.localStorage.getItem(PANEL_STORAGE_KEY))
  return clampWidth(Number.isFinite(raw) && raw > 0 ? raw : PANEL_DEFAULT_WIDTH)
}

function persistWidth() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PANEL_STORAGE_KEY, String(panelWidth.value))
  eventPanel.setWidth(panelWidth.value)
}

function syncWidthToViewport() {
  panelWidth.value = clampWidth(panelWidth.value)
}

function startResize(event: MouseEvent) {
  if (!eventPanel.visible) return
  resizing.value = true
  event.preventDefault()
  event.stopPropagation()
  document.body.style.userSelect = 'none'
}

function onMouseMove(event: MouseEvent) {
  if (!resizing.value) return
  const nextWidth = window.innerWidth - PANEL_RIGHT_OFFSET - event.clientX
  panelWidth.value = clampWidth(nextWidth)
}

function stopResize() {
  if (!resizing.value) return
  resizing.value = false
  document.body.style.userSelect = ''
  persistWidth()
}

function formatTime(ts: number) {
  if (!ts) return '--:--:--'
  return new Date(ts).toLocaleTimeString(locale.value, { hour12: false })
}

function formatTypeLabel(type: string) {
  const labels = {
    USER_ONLINE: t('eventPanel.userOnline'),
    BEACON_REGISTERED: t('eventPanel.beaconOnline'),
    BEACON_REMOVED: t('eventPanel.beaconOffline'),
    COMMAND_EVENT: t('eventPanel.commandEvent'),
    LISTENER_STATE_CHANGED: t('eventPanel.listenerState'),
    TUNNEL_STARTED: t('eventPanel.tunnelStarted'),
    TUNNEL_PAUSED: t('eventPanel.tunnelPaused'),
    TUNNEL_RESUMED: t('eventPanel.tunnelResumed'),
    TUNNEL_UPDATED: t('eventPanel.tunnelUpdated'),
    TUNNEL_CLEARED: t('eventPanel.tunnelCleared'),
    TUNNEL_STOPPED: t('eventPanel.tunnelStopped'),
    TUNNEL_CHANNEL_OPEN: t('eventPanel.tunnelChannelOpened'),
    TUNNEL_CHANNEL_CLOSE: t('eventPanel.tunnelChannelClosed'),
    TUNNEL_CHANNEL_RECYCLED: t('eventPanel.tunnelChannelRecycled'),
    TUNNEL_STATS: t('eventPanel.tunnelStats'),
    TUNNEL_ACK: t('eventPanel.tunnelAck'),
  }
  return labels[type as keyof typeof labels] || type
}

function shortBeaconId(value: string) {
  if (!value) return ''
  return value.length > 12 ? `${value.slice(0, 12)}…` : value
}

function toneClass(tone: EventTone) {
  return tone || 'info'
}

function togglePanel() {
  eventPanel.toggleVisible()
  if (eventPanel.visible) {
    syncWidthToViewport()
  }
}

watch(
  () => eventPanel.visible,
  (visible) => {
    if (visible) syncWidthToViewport()
  }
)

watch(panelWidth, (w) => {
  eventPanel.setWidth(w)
})

onMounted(() => {
  panelWidth.value = loadWidth()
  eventPanel.setWidth(panelWidth.value)
  syncWidthToViewport()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', stopResize)
  window.addEventListener('resize', syncWidthToViewport)
})

onUnmounted(() => {
  stopResize()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', stopResize)
  window.removeEventListener('resize', syncWidthToViewport)
})
</script>

<template>
  <aside
    class="event-panel-shell"
    :class="{ collapsed: !eventPanel.visible, resizing }"
    :style="{ width: eventPanel.visible ? `${panelWidth}px` : `${PANEL_COLLAPSED_WIDTH}px` }"
  >
    <div class="event-panel glass-card" :class="{ collapsed: !eventPanel.visible, resizing }">
      <template v-if="eventPanel.visible">
        <div class="resize-handle" @mousedown="startResize" />

          <header class="event-panel-header">
            <button class="panel-title" type="button" @click="togglePanel">
              <span class="panel-icon">🧾</span>
              <span class="panel-name">{{ t('eventPanel.title') }}</span>
              <span class="panel-count">{{ eventPanel.events.length }}</span>
            </button>

            <div class="panel-actions">
              <button type="button" class="panel-action" @click="eventPanel.clear()">{{ t('eventPanel.clear') }}</button>
              <button type="button" class="panel-action" @click="togglePanel">{{ t('eventPanel.collapse') }}</button>
            </div>
          </header>

          <div class="event-panel-body">
            <div v-if="eventPanel.events.length === 0" class="event-empty">
              {{ t('eventPanel.waitingTeamServerEvents') }}
            </div>

            <div v-else class="event-list">
              <article
                v-for="entry in eventPanel.events"
                :key="entry.id"
                class="event-item"
                :class="toneClass(entry.tone)"
              >
                <div class="event-item-header">
                  <span class="event-item-type">{{ formatTypeLabel(entry.type) }}</span>
                  <span class="event-item-time">{{ formatTime(entry.receivedAt) }}</span>
                </div>

                <div class="event-item-meta">
                  <span v-if="entry.beaconId" class="event-tag">{{ t('eventPanel.beaconLabel', { id: shortBeaconId(entry.beaconId) }) }}</span>
                  <span v-if="entry.commandName" class="event-tag">{{ t('eventPanel.commandLabel', { name: entry.commandName }) }}</span>
                  <span v-if="entry.rawType && entry.rawType !== entry.type" class="event-tag muted">{{ entry.rawType }}</span>
                </div>

                <div class="event-item-summary">
                  {{ entry.summary }}
                </div>
              </article>
            </div>
          </div>
      </template>

      <template v-else>
        <button
          class="event-panel-collapsed-tab"
          type="button"
          @click="togglePanel"
          :aria-label="latest?.summary || t('eventPanel.expandEventPanel')"
          :title="latest?.summary || t('eventPanel.waitingTeamServerEvents')"
        >
          <span class="collapsed-icon">🧾</span>
          <span class="collapsed-count">{{ eventPanel.events.length }}</span>
          <span class="collapsed-label">{{ t('eventPanel.title') }}</span>
          <span class="collapsed-hint">{{ t('eventPanel.expand') }}</span>
        </button>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.event-panel-shell {
  position: relative;
  height: 100%;
  min-height: 0;
  margin-right: 24px;
  flex: 0 0 auto;
  pointer-events: none;
  transition: width 0.2s ease;
}

.event-panel-shell.collapsed {
  width: 48px;
}

.event-panel {
  pointer-events: auto;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.08) 38%, rgba(255, 255, 255, 0.02)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-panel-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-md)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(150%);
  box-shadow: var(--shadow-sm);
}

.event-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 12px 18px;
  border-bottom: 1px solid var(--border-light);
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  padding: 0;
  min-width: 0;
}

.panel-icon {
  font-size: 18px;
  flex: 0 0 auto;
}

.panel-name {
  font-size: 14px;
  font-weight: 700;
}

.panel-count,
.collapsed-count {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--color-primary-rgb), 0.16);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.panel-action {
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.panel-action:hover {
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-primary);
}

.event-panel-body {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}

.event-empty {
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-item {
  padding: 12px 12px 11px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.64);
  border: 1px solid var(--border-light);
  border-left: 4px solid var(--color-primary);
  cursor: default;
  user-select: text;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.event-item:hover {
  background: rgba(255, 255, 255, 0.72);
  border-color: var(--border);
}

.event-item.success { border-left-color: #10b981; }
.event-item.warn { border-left-color: #f59e0b; }
.event-item.error { border-left-color: #ef4444; }
.event-item.info { border-left-color: var(--color-primary); }

.event-item-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.event-item-type {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.event-item-time {
  font-size: 12px;
  color: var(--text-muted);
  flex: 0 0 auto;
}

.event-item-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.event-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--color-primary-rgb), 0.12);
  color: var(--color-primary);
  font-size: 11px;
}

.event-tag.muted {
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-muted);
}

.event-item-summary {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-word;
}

.resize-handle {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  touch-action: none;
  z-index: 3;
}

.resize-handle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 14px;
  bottom: 14px;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  opacity: 0.45;
  transition: opacity 0.2s ease, background 0.2s ease;
}

.resize-handle:hover::before,
.event-panel.resizing .resize-handle::before {
  opacity: 1;
  background: rgba(var(--color-primary-rgb), 0.55);
}

.event-panel-collapsed-tab {
  width: 100%;
  height: 100%;
  border: none;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.08) 38%, rgba(255, 255, 255, 0.02)),
    var(--glass-panel-bg);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 0;
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  border-left: 1px solid var(--border-light);
}

.collapsed-icon {
  font-size: 20px;
  flex: 0 0 auto;
}

.collapsed-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  color: var(--text-primary);
}

.collapsed-hint {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 11px;
  line-height: 1;
  color: var(--text-muted);
}

:global(html[data-ui-theme="dark"] .event-panel) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.04) 42%, rgba(2, 6, 23, 0.02)),
    radial-gradient(rgba(255, 255, 255, 0.06) 0.5px, transparent 0.5px),
    rgba(15, 23, 42, 0.88);
  background-size: auto, 3px 3px, auto;
  border-color: rgba(148, 163, 184, 0.22);
}

:global(html[data-ui-theme="dark"] .event-panel-header) {
  background: rgba(15, 23, 42, 0.72);
  border-bottom-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .panel-title) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .panel-count),
:global(html[data-ui-theme="dark"] .collapsed-count) {
  background: rgba(129, 140, 248, 0.22);
  color: #c7d2fe;
}

:global(html[data-ui-theme="dark"] .panel-action) {
  background: rgba(30, 41, 59, 0.78);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .panel-action:hover) {
  background: rgba(51, 65, 85, 0.92);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .event-empty) {
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .event-item) {
  background: rgba(30, 41, 59, 0.82);
  border-color: rgba(148, 163, 184, 0.16);
  border-left-color: var(--color-primary);
}

:global(html[data-ui-theme="dark"] .event-item:hover) {
  background: rgba(39, 52, 80, 0.92);
  border-color: rgba(129, 140, 248, 0.28);
}

:global(html[data-ui-theme="dark"] .event-item.success) {
  border-left-color: #34d399;
}

:global(html[data-ui-theme="dark"] .event-item.warn) {
  border-left-color: #fbbf24;
}

:global(html[data-ui-theme="dark"] .event-item.error) {
  border-left-color: #f87171;
}

:global(html[data-ui-theme="dark"] .event-item-type) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .event-item-time) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .event-tag) {
  background: rgba(129, 140, 248, 0.2);
  color: #c7d2fe;
  font-weight: 650;
}

:global(html[data-ui-theme="dark"] .event-tag.muted) {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .event-item-summary) {
  color: #dbeafe;
}

:global(html[data-ui-theme="dark"] .event-panel-collapsed-tab) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.04)),
    rgba(15, 23, 42, 0.88);
  border-left-color: rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .collapsed-label) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .collapsed-hint) {
  color: #94a3b8;
}
</style>
