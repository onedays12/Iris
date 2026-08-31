<script setup lang="ts">
/**
 * TransferPanel - 文件传输监控面板
 *
 * 显示当前 beacon 的活跃传输任务列表,支持:
 * - 拖拽分栏调整高度
 * - 收起/展开切换
 *
 * 从 FileBrowserModal 拆出,主组件通过 props 传 activeTransfers,
 * v-model:collapsed 双向绑定收起状态。
 */

import { ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TransferItem } from '../../stores/fileTransfer'

const props = defineProps<{
  activeTransfers: TransferItem[]
  collapsed?: boolean
}>()

const emit = defineEmits(['update:collapsed'])

const { t } = useI18n()

const TRANSFER_PANEL_DEFAULT_HEIGHT = 140
const TRANSFER_PANEL_MIN_HEIGHT = 60
const TRANSFER_PANEL_MAX_HEIGHT = 400
const transferPanelHeight = ref(TRANSFER_PANEL_DEFAULT_HEIGHT)
let transferResizeState: { startY: number; startHeight: number } | null = null // { startY, startHeight }

function getTransferKey(transfer: TransferItem) {
  return transfer.transferKey || `${transfer.beaconId}:${transfer.direction}:${transfer.fileName || transfer.remotePath}`
}

function startTransferResize(event: MouseEvent) {
  event.preventDefault()
  transferResizeState = {
    startY: event.clientY,
    startHeight: transferPanelHeight.value,
  }
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onTransferResizeMove)
  window.addEventListener('mouseup', stopTransferResize)
}

function onTransferResizeMove(event: MouseEvent) {
  if (!transferResizeState) return
  const delta = transferResizeState.startY - event.clientY
  const next = transferResizeState.startHeight + delta
  transferPanelHeight.value = Math.min(
    TRANSFER_PANEL_MAX_HEIGHT,
    Math.max(TRANSFER_PANEL_MIN_HEIGHT, next),
  )
}

function stopTransferResize() {
  transferResizeState = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', onTransferResizeMove)
  window.removeEventListener('mouseup', stopTransferResize)
}

onUnmounted(() => {
  stopTransferResize()
})

// 格式化文件大小(从主组件迁移,供模板内使用)
function formatSize(bytes: number) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k))
  return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <template v-if="activeTransfers.length">
    <!-- 拖拽分隔条（仅在展开时显示） -->
    <div
      v-if="!collapsed"
      class="transfer-resizer"
      @mousedown="startTransferResize"
    ><span class="resizer-grip"></span></div>

    <!-- 收起态：极简状态条 -->
    <div v-if="collapsed" class="transfer-panel-collapsed" @click="emit('update:collapsed', false)">
      <span class="collapsed-icon">📤📥</span>
      <span class="collapsed-text">{{ t('transfer.taskCount', { n: activeTransfers.length }) }}</span>
      <span class="collapsed-expand" :title="t('common.expand')">⤢</span>
    </div>

    <!-- 展开态：完整面板 -->
    <div
      v-else
      class="transfer-panel-compact shadow-lg"
      :style="{ height: transferPanelHeight + 'px' }"
    >
      <div class="transfer-compact-header">
        <span class="title">{{ t('transfer.monitor') }}</span>
        <span class="count">{{ t('transfer.recordCount', { n: activeTransfers.length }) }}</span>
        <button class="collapse-btn" :title="t('common.collapse')" @click="emit('update:collapsed', true)">⤓</button>
      </div>
      <div class="transfer-compact-list">
        <div
          v-for="transfer in activeTransfers"
          :key="getTransferKey(transfer)"
          class="compact-item"
          :class="[transfer.status, transfer.direction]"
        >
          <div class="item-main">
            <span class="icon">{{ transfer.direction === 'upload' ? '📤' : '📥' }}</span>
            <span class="name" :title="transfer.remotePath">{{ transfer.fileName || transfer.remotePath }}</span>
            <span class="status-text">{{ transfer.status === 'completed' ? t('transfer.statusCompleted') : transfer.status === 'cancelled' ? t('transfer.statusCancelled') : transfer.status === 'error' ? t('transfer.statusFailed') : transfer.status === 'stale' ? t('transfer.statusStale') : transfer.progress + '%' }}</span>
          </div>
          <div class="item-progress">
            <div class="progress-fill" :style="{ width: transfer.progress + '%' }"></div>
          </div>
          <div class="item-side">
            <span v-if="transfer.size > 0" class="bytes">{{ formatSize(transfer.receivedBytes || 0) }}/{{ formatSize(transfer.size) }}</span>
            <span class="chunks">{{ transfer.receivedChunks }}/{{ transfer.totalChunks }} chks</span>
          </div>
          <div v-if="transfer.error" class="error-msg" :title="transfer.error">
            <i class="fas fa-exclamation-circle"></i>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* 从父组件 FileBrowserModal 迁移的传输面板样式。
   scoped 只命中本组件模板,避免污染全局。 */

/* 极致压缩传输面板 (底部固定样式) */
.transfer-panel-compact {
  position: relative;
  flex-shrink: 0;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  z-index: 5;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.9);
  overflow: hidden;
}

/* 可拖拽横向分隔条 */
.transfer-resizer {
  flex-shrink: 0;
  height: 6px;
  cursor: row-resize;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 6;
}
.transfer-resizer:hover .resizer-grip,
.transfer-resizer:active .resizer-grip {
  background: var(--primary-color, #6366f1);
}
.resizer-grip {
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.18);
  transition: background 0.15s;
}

/* 收起态：极简状态条 */
.transfer-panel-collapsed {
  flex-shrink: 0;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  user-select: none;
  z-index: 5;
}
.transfer-panel-collapsed:hover {
  background: rgba(99, 102, 241, 0.08);
}
.transfer-panel-collapsed .collapsed-icon {
  font-size: 12px;
}
.transfer-panel-collapsed .collapsed-text {
  flex: 1;
  font-weight: 600;
}
.transfer-panel-collapsed .collapsed-expand {
  opacity: 0.6;
  font-size: 14px;
}

/* 收起按钮（展开态 header 内） */
.transfer-compact-header .collapse-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  opacity: 0.6;
}
.transfer-compact-header .collapse-btn:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.06);
}

.transfer-compact-header {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 15px;
  background: var(--bg-secondary);
  font-size: 11px;
  font-weight: 600;
  opacity: 0.8;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.transfer-compact-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.compact-item {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 15px;
  gap: 15px;
  border-bottom: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.compact-item:last-child {
  border-bottom: none;
}

.compact-item .item-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
  z-index: 2;
}

.compact-item .name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
  font-weight: 500;
}

.compact-item .status-text {
  font-size: 10px;
  opacity: 0.6;
  font-weight: 600;
}

.compact-item .item-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: rgba(0, 0, 0, 0.05);
  z-index: 1;
}

.compact-item .progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.3s ease;
}

.compact-item.upload .progress-fill {
  background: #722ed1; /* 上传用紫色 */
}

.compact-item.download .progress-fill {
  background: #1890ff; /* 下载用蓝色 */
}

.compact-item.completed .progress-fill {
  background: #52c41a;
}

/* stale:进度信号中断、状态未知,用琥珀色警示而非假装进行中 */
.compact-item.stale .progress-fill {
  background: #faad14;
}

.compact-item.stale .status-text {
  color: #faad14;
  opacity: 1;
}

.compact-item.error .progress-fill {
  background: #ff4d4f;
}

.compact-item .item-side {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  opacity: 0.7;
  z-index: 2;
}

.compact-item .error-msg {
  color: #ff4d4f;
  font-size: 14px;
  z-index: 2;
}

.compact-item.error {
  background: rgba(255, 77, 79, 0.03);
}
</style>
