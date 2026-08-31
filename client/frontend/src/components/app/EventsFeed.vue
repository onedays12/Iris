<script setup lang="ts">
/**
 * EventsFeed - BottomDock「事件流」tab 内容
 *
 * 自原右侧 EventPanel 迁移:同一 eventPanel store 数据源,条目渲染/文案一致。
 * 与旧面板的差异:无宽度拖拽(高度由 dock 统一管理),列表容器加 contain: strict
 * 隔离重排,保证 dock 拖高时逐帧跟手。
 */
import { useI18n } from 'vue-i18n'
import { useEventPanelStore } from '../../stores/eventPanel'
import type { EventTone } from '../../stores/eventPanel'

const { t } = useI18n()
const eventPanel = useEventPanelStore()

function formatTypeLabel(type: string) {
  const labels: Record<string, string> = {
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
  return labels[type] || type
}

function shortBeaconId(value: string) {
  if (!value) return ''
  return value.length > 12 ? `${value.slice(0, 12)}…` : value
}

function toneClass(tone: EventTone) {
  return tone || 'info'
}
</script>

<template>
  <div class="events-feed">
    <div v-if="eventPanel.events.length === 0" class="feed-empty">
      {{ t('eventPanel.waitingTeamServerEvents') }}
    </div>
    <div v-else class="feed-list">
      <article
        v-for="entry in eventPanel.events"
        :key="entry.id"
        class="event-item"
        :class="toneClass(entry.tone)"
      >
        <div class="event-item-header">
          <span class="event-item-type">{{ formatTypeLabel(entry.type) }}</span>
          <span class="event-item-time">{{ new Date(entry.receivedAt).toLocaleTimeString(undefined, { hour12: false }) }}</span>
        </div>
        <div class="event-item-meta">
          <span v-if="entry.beaconId" class="event-tag">{{ t('eventPanel.beaconLabel', { id: shortBeaconId(entry.beaconId) }) }}</span>
          <span v-if="entry.commandName" class="event-tag">{{ t('eventPanel.commandLabel', { name: entry.commandName }) }}</span>
          <span v-if="entry.rawType && entry.rawType !== entry.type" class="event-tag muted">{{ entry.rawType }}</span>
        </div>
        <div class="event-item-summary">{{ entry.summary }}</div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.events-feed {
  height: 100%;
  overflow-y: auto;
  padding: 10px 14px;
  /* 拖拽 dock 高度时隔离内部重排,保证逐帧跟手 */
  contain: strict;
}

.feed-empty {
  padding: 12px 4px;
  color: var(--text-muted);
  font-size: 13px;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  padding: 8px 10px 8px;
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
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
}

.event-item-time {
  font-size: 11.5px;
  color: var(--text-muted);
  flex: 0 0 auto;
}

.event-item-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.event-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
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
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--text-secondary);
  word-break: break-word;
}

:global(html[data-ui-theme="dark"] .event-item) {
  background: rgba(15, 23, 42, 0.55);
  border-color: var(--border-light);
}

:global(html[data-ui-theme="dark"] .event-item:hover) {
  background: rgba(15, 23, 42, 0.72);
}
</style>
