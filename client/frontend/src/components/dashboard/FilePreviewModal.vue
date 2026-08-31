<script setup lang="ts">
/**
 * FilePreviewModal - 文件预览弹窗
 *
 * 可拖拽 + 八向缩放窗口（与 FileBrowserModal 同形态）。
 * 文本预览支持复制；图片预览支持滚轮缩放与拖拽平移。
 * 底部提供「下载」按钮（走完整下载任务）与「关闭」（释放 server 内存）。
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '../../stores/agent'
import { useNotificationStore } from '../../stores/notification'
import { useFileTransferStore } from '../../stores/fileTransfer'
import { usePreviewStore } from '../../stores/preview'
import { useModalDragResize } from '../../composables/useModalDragResize'
import { sendDownloadCommand } from '../../features/beacon/actions/beaconCommandActions'

const { t } = useI18n()
const agentStore = useAgentStore()
const notificationStore = useNotificationStore()
const fileTransferStore = useFileTransferStore()
const previewStore = usePreviewStore()

const {
  winPos, winSize, isDragging, isResizing, resizeType,
  initWindowPosition, startResizeListener, stopResizeListener,
  startDrag, startResize, stopDrag, stopResize,
} = useModalDragResize({
  defaultWidth: 760,
  defaultHeight: 560,
  minWidth: 420,
  minHeight: 300,
})

// ─── 标题栏信息 ───

const targetAgent = computed(() => agentStore.getAgentById(previewStore.beaconId))
const titleText = computed(() => {
  const host = targetAgent.value?.hostname || ''
  const shortId = String(previewStore.beaconId || '').slice(0, 8)
  return host ? `${shortId}@${host}` : shortId
})

// ─── 文本复制 ───

const copied = ref(false)

async function copyContent() {
  if (!previewStore.content) return
  try {
    await navigator.clipboard.writeText(previewStore.content)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    notificationStore.error(t('preview.copyFailed'))
  }
}

// ─── 图片缩放 / 平移 ───

const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ mx: 0, my: 0, px: 0, py: 0 })

function onImageWheel(event: WheelEvent) {
  event.preventDefault()
  const factor = event.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.min(8, Math.max(0.1, zoom.value * factor))
}

function startImagePan(event: MouseEvent) {
  isPanning.value = true
  panStart.value = { mx: event.clientX, my: event.clientY, px: pan.value.x, py: pan.value.y }
  event.preventDefault()
}

function onImagePanMove(event: MouseEvent) {
  if (!isPanning.value) return
  pan.value = {
    x: panStart.value.px + (event.clientX - panStart.value.mx),
    y: panStart.value.py + (event.clientY - panStart.value.my),
  }
}

function stopImagePan() {
  isPanning.value = false
}

function resetImageView() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

const imageTransform = computed(() => `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`)

// ─── 下载（完整下载任务） ───

const downloading = ref(false)

async function handleDownload() {
  // 注意: 必须在函数体内访问 store 属性,不能解构(否则捕获 setup 时的旧值)
  const beaconId = previewStore.beaconId
  const remotePath = previewStore.remotePath
  const fileName = previewStore.fileName
  const size = previewStore.size
  if (!beaconId || !remotePath) return
  if (downloading.value) return
  downloading.value = true
  try {
    await sendDownloadCommand(beaconId, remotePath, 524288, 3)
    fileTransferStore.startDownload({
      beaconid: beaconId,
      taskId: '',
      remotePath,
      fileName: fileName || remotePath,
      size,
    })
    notificationStore.success(t('fileBrowser.downloadQueued', { name: fileName || remotePath }))
  } catch (err) {
    notificationStore.error(t('fileBrowser.downloadFailed', { message: err instanceof Error ? err.message : String(err) }))
  } finally {
    downloading.value = false
  }
}

// ─── 生命周期 ───

onMounted(() => {
  initWindowPosition()
})

onUnmounted(() => {
  stopDrag()
  stopResize()
})

// 每次打开时居中并监听视口变化
watch(() => previewStore.visible, (visible) => {
  if (visible) {
    initWindowPosition()
    startResizeListener()
    resetImageView()
  } else {
    stopResizeListener()
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="previewStore.visible" class="modal-overlay">
      <div
        class="modal-window"
        :style="{
          left: winPos.x + 'px',
          top: winPos.y + 'px',
          width: winSize.w + 'px',
          height: winSize.h + 'px'
        }"
        :class="{ 'is-dragging': isDragging }"
      >
        <!-- 八向拉伸手柄 -->
        <div class="resize-handle resizer-n" @mousedown="startResize('n', $event)"></div>
        <div class="resize-handle resizer-s" @mousedown="startResize('s', $event)"></div>
        <div class="resize-handle resizer-e" @mousedown="startResize('e', $event)"></div>
        <div class="resize-handle resizer-w" @mousedown="startResize('w', $event)"></div>
        <div class="resize-handle resizer-nw" @mousedown="startResize('nw', $event)"></div>
        <div class="resize-handle resizer-ne" @mousedown="startResize('ne', $event)"></div>
        <div class="resize-handle resizer-sw" @mousedown="startResize('sw', $event)"></div>
        <div class="resize-handle resizer-se" @mousedown="startResize('se', $event)"></div>

        <div class="preview-modal">
          <div class="modal-title" @mousedown="startDrag">
            <div class="title-left">
              <span class="icon">📄</span>
              <span class="file-name" :title="previewStore.remotePath">{{ previewStore.fileName }}</span>
              <span class="beacon-tag">{{ titleText }}</span>
            </div>
            <button class="close-btn" @click="previewStore.close()">×</button>
          </div>

          <div class="preview-body">
            <!-- 进度态 -->
            <div v-if="previewStore.isLoading" class="state-view">
              <div class="spinner"></div>
              <span>{{ t('preview.loading') }}</span>
            </div>

            <!-- 失败态 -->
            <div v-else-if="previewStore.hasError" class="state-view error">
              <span class="error-icon">⚠️</span>
              <span>{{ previewStore.errorMessage || t('preview.fetchFailed') }}</span>
            </div>

            <!-- 文本预览 -->
            <div v-else-if="previewStore.kind === 'text'" class="text-view">
              <pre class="text-content" readonly>{{ previewStore.content }}</pre>
            </div>

            <!-- 图片预览 -->
            <div
              v-else-if="previewStore.kind === 'image' && previewStore.content"
              class="image-view"
              @wheel="onImageWheel"
              @mousedown="startImagePan"
              @mousemove="onImagePanMove"
              @mouseup="stopImagePan"
              @mouseleave="stopImagePan"
              @dblclick="resetImageView"
            >
              <img
                class="preview-image"
                :src="previewStore.content"
                :style="{ transform: imageTransform }"
                draggable="false"
                alt="preview"
              />
              <div class="image-hint">{{ t('preview.imageHint') }}</div>
            </div>
          </div>

          <div class="modal-footer">
            <span v-if="previewStore.kind === 'text' && previewStore.status === 'ready'" class="size-tag">
              {{ previewStore.content.length }} chars
            </span>
            <div class="footer-actions">
              <button
                v-if="previewStore.status === 'ready' && previewStore.kind === 'text'"
                class="btn btn-secondary"
                :disabled="!previewStore.content"
                @click="copyContent"
              >
                {{ copied ? t('preview.copied') : t('preview.copy') }}
              </button>
              <button
                v-if="previewStore.status === 'ready'"
                class="btn btn-secondary"
                :disabled="downloading"
                @click="handleDownload"
              >
                {{ t('preview.download') }}
              </button>
              <button class="btn btn-ghost" @click="previewStore.close()">{{ t('common.close') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  z-index: 2000;
  animation: fadeIn 0.3s ease-out;
  pointer-events: auto;
}

.modal-window {
  position: fixed;
  z-index: 2001;
}

.preview-modal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.10) 38%, rgba(255, 255, 255, 0.04)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-modal-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  border-radius: 20px;
  border: 1px solid var(--glass-border-strong);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  user-select: none;
}

.modal-window.is-dragging .preview-modal {
  opacity: 0.9;
}

.modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.4);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}

.modal-title:active {
  cursor: grabbing;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 15px;
  color: #1e293b;
  letter-spacing: -0.02em;
  min-width: 0;
}

.icon {
  font-size: 18px;
  flex: 0 0 auto;
}

.file-name {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beacon-tag {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.16);
  border-radius: 999px;
  padding: 2px 8px;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  color: #64748b;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  transform: rotate(90deg);
}

.preview-body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.35);
}

.state-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #64748b;
  font-size: 13px;
}

.state-view.error {
  color: #dc2626;
}

.error-icon {
  font-size: 32px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(99, 102, 241, 0.15);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 文本预览 */
.text-view {
  height: 100%;
  overflow: auto;
}

.text-content {
  margin: 0;
  padding: 16px 20px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}

/* 图片预览 */
.image-view {
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  background:
    radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.04), transparent 60%),
    rgba(15, 23, 42, 0.03);
}

.image-view:active {
  cursor: grabbing;
}

.preview-image {
  max-width: none;
  max-height: none;
  transform-origin: center;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.image-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(100, 116, 139, 0.9);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 3px 10px;
  pointer-events: none;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.4);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.size-tag {
  font-size: 11px;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.btn-secondary {
  background: rgba(15, 23, 42, 0.05);
  color: #1e293b;
  border-color: rgba(15, 23, 42, 0.1);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  border-color: rgba(99, 102, 241, 0.2);
}

.btn-ghost {
  background: transparent;
  color: #64748b;
  border-color: rgba(15, 23, 42, 0.12);
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.04);
  color: #1e293b;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 八向缩放手柄 */
.resize-handle {
  position: absolute;
  z-index: 10;
}

.resizer-n { top: -3px; left: 10px; right: 10px; height: 6px; cursor: ns-resize; }
.resizer-s { bottom: -3px; left: 10px; right: 10px; height: 6px; cursor: ns-resize; }
.resizer-e { right: -3px; top: 10px; bottom: 10px; width: 6px; cursor: ew-resize; }
.resizer-w { left: -3px; top: 10px; bottom: 10px; width: 6px; cursor: ew-resize; }
.resizer-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
.resizer-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.resizer-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.resizer-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }

/* 暗色主题 */
:global(html[data-ui-theme="dark"] .preview-modal) {
  background:
    linear-gradient(180deg, rgba(30, 41, 73, 0.55), rgba(15, 23, 42, 0.85)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    rgba(15, 23, 42, 0.92);
  border-color: rgba(99, 102, 241, 0.28);
}

:global(html[data-ui-theme="dark"] .preview-modal .modal-title),
:global(html[data-ui-theme="dark"] .preview-modal .modal-footer) {
  background: rgba(15, 23, 42, 0.55);
  border-color: rgba(148, 163, 184, 0.12);
}

:global(html[data-ui-theme="dark"] .preview-modal .title-left),
:global(html[data-ui-theme="dark"] .preview-modal .text-content) {
  color: #e5e7eb;
}

:global(html[data-ui-theme="dark"] .preview-modal .beacon-tag) {
  color: #c4b5fd;
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(129, 140, 248, 0.3);
}

:global(html[data-ui-theme="dark"] .preview-modal .close-btn) {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .preview-modal .preview-body) {
  background: rgba(15, 23, 42, 0.6);
}

:global(html[data-ui-theme="dark"] .preview-modal .image-view) {
  background:
    radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.08), transparent 60%),
    rgba(2, 6, 23, 0.5);
}

:global(html[data-ui-theme="dark"] .preview-modal .state-view) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .preview-modal .btn-secondary) {
  background: rgba(148, 163, 184, 0.12);
  color: #e5e7eb;
  border-color: rgba(148, 163, 184, 0.2);
}

:global(html[data-ui-theme="dark"] .preview-modal .btn-secondary:hover:not(:disabled)) {
  background: rgba(99, 102, 241, 0.25);
  color: #c4b5fd;
}

:global(html[data-ui-theme="dark"] .preview-modal .btn-ghost) {
  color: #94a3b8;
  border-color: rgba(148, 163, 184, 0.2);
}

:global(html[data-ui-theme="dark"] .preview-modal .btn-ghost:hover:not(:disabled)) {
  background: rgba(148, 163, 184, 0.1);
  color: #e5e7eb;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
