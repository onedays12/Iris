<script setup lang="ts">
/**
 * DownloadsPage - 文件下载管理页面
 *
 * 展示从 Beacon 下载的文件列表，支持文件预览和保存到本地磁盘。
 */

import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import * as FileService from '../../bindings/irisclient/service/fileservice'
import { downloadFileBase64, listDownloads } from '../features/files/api/fileApi'
import type { StoredFile } from '../features/files/model'
import { useNotificationStore } from '../stores/notification'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'
import { openSaveFileDialog } from '../utils/saveFileDialog'

const { t, locale } = useI18n()
const notificationStore = useNotificationStore()

const downloads = ref<StoredFile[]>([])
const loading = ref(false)
const savingFileId = ref('')
const errorMessage = ref('')

function formatSize(bytes: number) {
  const value = Number(bytes || 0)
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatTime(iso: string) {
  if (!iso) return '-'
  // 契约: 下载池时间字段为 unix 毫秒数字或 ISO 字符串（FILE_FIELDS.mod_time）
  const numeric = Number(iso)
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(iso)
  return date.toLocaleString(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

async function fetchDownloads() {
  loading.value = true
  errorMessage.value = ''
  try {
    downloads.value = await listDownloads()
  } catch (err) {
    errorMessage.value = (err instanceof Error ? err.message : String(err)) || t('downloads.fetchError')
  } finally {
    loading.value = false
  }
}

async function saveDownload(file: StoredFile) {
  if (!file?.fileId && !file?.downloadUrl) return

  const savePath = await openSaveFileDialog({
    Title: t('downloads.saveDialogTitle'),
    Filename: file.fileName || 'download.bin',
  })
  if (!savePath) return

  savingFileId.value = file.fileId || file.downloadUrl
  try {
    const base64Data = await downloadFileBase64({
      fileId: file.fileId,
      downloadUrl: file.downloadUrl,
    })
    await FileService.WriteBinaryFile(savePath, base64Data)
    notificationStore.success(t('downloads.saveSuccess', { name: file.fileName || 'download.bin' }))
  } catch (err) {
    notificationStore.error(t('downloads.saveError', { error: err instanceof Error ? err.message : String(err) }))
  } finally {
    savingFileId.value = ''
  }
}

onMounted(() => {
  fetchDownloads()
  window.addEventListener('downloads:refresh', fetchDownloads)
})

onUnmounted(() => {
  window.removeEventListener('downloads:refresh', fetchDownloads)
})
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <PageTitleIcon name="downloads" />
          {{ t('downloads.title') }}
        </h1>
        <p class="page-subtitle">{{ t('downloads.subtitle') }}</p>
      </div>
      <button class="btn btn-primary" :disabled="loading" @click="fetchDownloads">
        <span class="icon">↻</span>
        {{ loading ? t('downloads.refreshing') : t('downloads.refresh') }}
      </button>
    </header>

    <div class="content-panel">
      <div v-if="errorMessage" class="state-line error-state">
        {{ errorMessage }}
      </div>

      <div v-if="loading && downloads.length === 0" class="state-line">
        {{ t('downloads.loadingList') }}
      </div>

      <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('downloads.filename') }}</th>
            <th>{{ t('downloads.size') }}</th>
            <th>{{ t('downloads.modificationTime') }}</th>
            <th>{{ t('downloads.sha256') }}</th>
            <th class="actions-col">{{ t('downloads.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in downloads" :key="file.fileId || file.downloadUrl">
            <td class="cell-name">
              <span class="file-icon">📄</span>
              {{ file.fileName || '-' }}
            </td>
            <td class="cell-size">{{ formatSize(file.size) }}</td>
            <td class="cell-time">{{ formatTime(file.modTime) }}</td>
            <td class="cell-hash" :title="file.sha256 || file.fileId">
              {{ file.sha256 || file.fileId || '-' }}
            </td>
            <td class="actions-col">
              <button
                class="action-btn"
                :disabled="savingFileId === (file.fileId || file.downloadUrl)"
                @click="saveDownload(file)"
              >
                {{ savingFileId === (file.fileId || file.downloadUrl) ? t('downloads.saving') : t('downloads.saveLocal') }}
              </button>
            </td>
          </tr>
          <tr v-if="downloads.length === 0 && !loading">
            <td colspan="5" class="empty-cell">{{ t('downloads.empty') }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container { padding: 24px; height: 100%; display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; }
.page-title { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.page-subtitle { font-size: 13px; color: var(--text-muted); }

.btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

.content-panel { flex: 1; background: var(--bg-card); border: 1px solid var(--glass-border); border-radius: var(--radius-lg); backdrop-filter: blur(var(--glass-blur-md)) saturate(150%); box-shadow: var(--shadow-sm); overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.table-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.state-line { padding: 18px 20px; color: var(--text-muted); font-size: 13px; border-bottom: 1px solid var(--border-light); }
.error-state { color: var(--color-danger); }

.data-table { width: 100%; border-collapse: collapse; text-align: left; }
.data-table th { padding: 12px 16px; font-size: 12px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border-light); background: rgba(255, 255, 255, 0.72); position: sticky; top: 0; z-index: 1; }
.data-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.data-table tbody tr:hover { background: rgba(15, 23, 42, 0.035); }

.cell-name { color: var(--text-primary); font-weight: 500; }
.file-icon { margin-right: 8px; }
.cell-size, .cell-time, .cell-hash { color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.cell-hash { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-col { text-align: right; }
.action-btn { border: 1px solid var(--border-light); background: rgba(15, 23, 42, 0.035); color: var(--text-primary); border-radius: var(--radius-sm); padding: 6px 10px; font-size: 12px; cursor: pointer; transition: var(--transition); }
.action-btn:hover:not(:disabled) { color: var(--color-primary); background: rgba(var(--color-primary-rgb), 0.08); border-color: rgba(var(--color-primary-rgb), 0.16); }
.action-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.empty-cell { text-align: center; padding: 32px !important; color: var(--text-muted); }
</style>
