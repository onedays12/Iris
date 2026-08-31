<script setup lang="ts">
/**
 * TransferFeed - BottomDock「传输监控」tab 内容
 *
 * 全局聚合视图:跨 beacon 的最近传输(recentAll)。文件浏览器内仍嵌 TransferPanel
 * 显示当前 beacon 进度;本 tab 负责全局面板。列表容器 contain: strict,拖拽 dock 高度时不参与重排。
 */
import { useI18n } from 'vue-i18n'
import { useFileTransferStore } from '../../stores/fileTransfer'
import type { TransferItem } from '../../stores/fileTransfer'

const { t } = useI18n()
const store = useFileTransferStore()

const RECENT_LIMIT = 10

function statusLabel(transfer: TransferItem): string {
  if (transfer.status === 'completed') return t('transfer.statusCompleted')
  if (transfer.status === 'cancelled') return t('transfer.statusCancelled')
  if (transfer.status === 'error') return t('transfer.statusFailed')
  if (transfer.status === 'stale') return t('transfer.statusStale')
  return `${transfer.progress}%`
}

function formatSize(bytes: number) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k))
  return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function beaconShort(id: string) {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id
}
</script>

<template>
  <div class="transfer-feed">
    <div v-if="store.recentAll(RECENT_LIMIT).length === 0" class="feed-empty">
      {{ t('dock.transfersEmpty') }}
    </div>
    <div v-else class="feed-list">
      <div
        v-for="transfer in store.recentAll(RECENT_LIMIT)"
        :key="transfer.transferKey || `${transfer.beaconId}:${transfer.direction}:${transfer.remotePath}`"
        class="transfer-item"
        :class="[transfer.status, transfer.direction]"
      >
        <span class="t-icon">{{ transfer.direction === 'upload' ? '📤' : '📥' }}</span>
        <span class="t-name" :title="`${transfer.beaconId} · ${transfer.remotePath}`">
          {{ transfer.fileName || transfer.remotePath }}
          <span class="t-beacon">@{{ beaconShort(transfer.beaconId) }}</span>
        </span>
        <span class="t-status">{{ statusLabel(transfer) }}</span>
        <span v-if="transfer.size > 0" class="t-bytes">{{ formatSize(transfer.receivedBytes) }}/{{ formatSize(transfer.size) }}</span>
        <span class="t-chunks">{{ transfer.receivedChunks }}/{{ transfer.totalChunks }} chks</span>
        <div class="t-bar">
          <div class="t-bar-fill" :style="{ width: transfer.progress + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transfer-feed {
  height: 100%;
  overflow-y: auto;
  padding: 8px 14px;
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
}

.transfer-item {
  position: relative;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
  overflow: hidden;
}

.transfer-item:last-child {
  border-bottom: none;
}

.t-icon {
  flex: 0 0 auto;
}

.t-name {
  min-width: 0;
  max-width: 340px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.t-beacon {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 11px;
}

.t-status {
  flex: 0 0 auto;
  font-size: 11px;
  opacity: 0.75;
  font-weight: 600;
}

.t-bytes,
.t-chunks {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-muted);
}

.t-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: rgba(0, 0, 0, 0.05);
}

.t-bar-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.transfer-item.upload .t-bar-fill { background: #722ed1; }
.transfer-item.download .t-bar-fill { background: #1890ff; }
.transfer-item.completed .t-bar-fill { background: #52c41a; }
.transfer-item.error .t-bar-fill { background: #ff4d4f; }
.transfer-item.stale .t-bar-fill { background: #faad14; }

.transfer-item.stale .t-status {
  color: #faad14;
  opacity: 1;
}
</style>
