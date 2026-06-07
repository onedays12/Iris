<script setup>
/**
 * DownloadsPage - 文件下载管理页面
 *
 * 展示从 Beacon 下载的文件列表，支持文件预览和保存到本地磁盘。
 */

import { onMounted, ref } from 'vue'
import { Dialogs } from '@wailsio/runtime'
import * as FileService from '../../bindings/changeme/service/fileservice.js'
import { downloadFileBase64, listDownloads } from '../features/files/api/fileApi.js'
import { useNotificationStore } from '../stores/notification.js'

const notificationStore = useNotificationStore()

const downloads = ref([])
const loading = ref(false)
const savingFileId = ref('')
const errorMessage = ref('')

function formatSize(bytes) {
  const value = Number(bytes || 0)
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatTime(iso) {
  if (!iso) return '-'
  const numeric = Number(iso)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(iso)
  return date.toLocaleString('zh-CN', {
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
    errorMessage.value = err.message || '获取下载列表失败'
  } finally {
    loading.value = false
  }
}

async function saveDownload(file) {
  if (!file?.file_id && !file?.download_url) return

  const savePath = await Dialogs.SaveFile({
    Title: '保存下载文件',
    Filename: file.file_name || 'download.bin',
  })
  if (!savePath) return

  savingFileId.value = file.file_id || file.download_url
  try {
    const base64Data = await downloadFileBase64({
      fileId: file.file_id,
      downloadUrl: file.download_url,
    })
    await FileService.WriteBinaryFile(savePath, base64Data)
    notificationStore.success(`已保存: ${file.file_name || 'download.bin'}`)
  } catch (err) {
    notificationStore.error(`保存失败: ${err.message || err}`)
  } finally {
    savingFileId.value = ''
  }
}

onMounted(fetchDownloads)
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">下载文件</h1>
        <p class="page-subtitle">查看 TeamServer 已接收完成、可保存到本地的文件</p>
      </div>
      <button class="btn btn-primary" :disabled="loading" @click="fetchDownloads">
        <span class="icon">↻</span>
        {{ loading ? '刷新中...' : '刷新列表' }}
      </button>
    </header>

    <div class="content-panel">
      <div v-if="errorMessage" class="state-line error-state">
        {{ errorMessage }}
      </div>

      <div v-if="loading && downloads.length === 0" class="state-line">
        正在读取下载列表...
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>修改时间</th>
            <th>SHA256</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in downloads" :key="file.file_id || file.download_url">
            <td class="cell-name">
              <span class="file-icon">📄</span>
              {{ file.file_name || '-' }}
            </td>
            <td class="cell-size">{{ formatSize(file.size) }}</td>
            <td class="cell-time">{{ formatTime(file.mod_time) }}</td>
            <td class="cell-hash" :title="file.sha256 || file.file_id">
              {{ file.sha256 || file.file_id || '-' }}
            </td>
            <td class="actions-col">
              <button
                class="action-btn"
                :disabled="savingFileId === (file.file_id || file.download_url)"
                @click="saveDownload(file)"
              >
                {{ savingFileId === (file.file_id || file.download_url) ? '保存中...' : '保存到本地' }}
              </button>
            </td>
          </tr>
          <tr v-if="downloads.length === 0 && !loading">
            <td colspan="5" class="empty-cell">TeamServer 暂无可下载文件</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-container { padding: 24px; height: 100%; display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; }
.page-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.page-subtitle { font-size: 13px; color: var(--text-muted); }

.btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

.content-panel { flex: 1; background: var(--bg-card); border: 1px solid var(--glass-border); border-radius: var(--radius-lg); backdrop-filter: blur(var(--glass-blur-md)) saturate(150%); box-shadow: var(--shadow-sm); overflow: hidden; display: flex; flex-direction: column; }
.state-line { padding: 18px 20px; color: var(--text-muted); font-size: 13px; border-bottom: 1px solid var(--border-light); }
.error-state { color: var(--color-danger); }

.data-table { width: 100%; border-collapse: collapse; text-align: left; }
.data-table th { padding: 12px 16px; font-size: 12px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border-light); background: rgba(255, 255, 255, 0.72); }
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
