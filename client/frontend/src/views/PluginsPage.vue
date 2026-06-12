<script setup>
/**
 * PluginsPage - 插件管理页面
 *
 * 展示已加载的插件列表，支持查看插件详情、执行插件操作和管理插件状态。
 */

import { computed, onMounted } from 'vue'
import { Dialogs } from '@wailsio/runtime'
import { useModalStore } from '../stores/modal.js'
import { useNotificationStore } from '../stores/notification.js'
import { usePluginStore } from '../stores/plugin.js'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'

const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const pluginStore = usePluginStore()

const plugins = computed(() => pluginStore.plugins)
const selectedPlugin = computed(() => pluginStore.selectedPlugin)

function statusClass(status) {
  const value = String(status || '').toLowerCase()
  if (['ready', 'loaded', 'running', 'active', 'ok'].includes(value)) return 'online'
  if (['loading'].includes(value)) return 'connecting'
  if (['error', 'failed'].includes(value)) return 'error'
  return 'offline'
}

function statusLabel(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'ready') return '就绪'
  if (value === 'loaded') return '已加载'
  if (value === 'loading') return '加载中'
  if (value === 'error' || value === 'failed') return '异常'
  if (value === 'running' || value === 'active') return '运行中'
  return value || '-'
}

function formatPath(value) {
  const text = String(value || '').trim()
  return text || '-'
}

function getSelectedPluginLabel() {
  if (!selectedPlugin.value) return '未选择'
  return selectedPlugin.value.displayName || selectedPlugin.value.name || selectedPlugin.value.id || 'Plugin'
}

function selectPlugin(pluginId) {
  pluginStore.selectPlugin(pluginId)
}

async function handleAddPlugin() {
  try {
    const picked = await Dialogs.OpenFile({
      Title: '选择 plugin.json',
      Message: '请选择插件根目录中的 plugin.json 文件',
      CanChooseFiles: true,
      AllowsMultipleSelection: false,
      Filters: [
        { DisplayName: '插件元数据', Pattern: '*.json' },
      ],
    })
    const sourcePath = Array.isArray(picked) ? picked[0] : picked
    if (!sourcePath) return

    if (!/[/\\]plugin\.json$/i.test(String(sourcePath))) {
      notificationStore.warn('请选择 plugin.json 文件')
      return
    }

    await pluginStore.addPlugin(sourcePath)
    notificationStore.success('插件已添加')
  } catch (err) {
    notificationStore.error(err.message || '添加插件失败')
    console.error('[PluginsPage] 添加插件失败:', err)
  }
}

async function handleDeletePlugin() {
  if (!selectedPlugin.value) {
    notificationStore.warn('请先选择一个插件')
    return
  }

  const confirmed = await modalStore.showConfirm({
    title: '删除插件',
    message: `确定要删除插件 [${getSelectedPluginLabel()}] 吗？\n这会移除插件目录并重新加载插件列表。`,
    type: 'danger',
  })

  if (!confirmed) return

  try {
    await pluginStore.deletePlugin(selectedPlugin.value.id)
    notificationStore.success('插件已删除')
  } catch (err) {
    notificationStore.error(err.message || '删除插件失败')
    console.error('[PluginsPage] 删除插件失败:', err)
  }
}

async function handleReloadPlugins() {
  try {
    await pluginStore.reloadPlugins()
    notificationStore.success('插件已重新加载')
  } catch (err) {
    notificationStore.error(err.message || '重新加载插件失败')
    console.error('[PluginsPage] 重新加载插件失败:', err)
  }
}

onMounted(async () => {
  try {
    await pluginStore.fetchPlugins()
  } catch (err) {
    console.error('[PluginsPage] 获取插件列表失败:', err)
  }
})
</script>

<template>
  <div class="plugin-page">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <div class="page-icon">
            <PageTitleIcon name="plugins" :size="22" />
          </div>
          <h1 class="page-title">插件系统</h1>
        </div>
        <p class="page-subtitle">
          只展示插件条目与管理按钮。右键 Beacon 时会按插件主题展开为树状动作菜单。
        </p>
      </div>

      <div class="page-actions">
        <button class="btn btn-ghost" type="button" :disabled="pluginStore.loading" @click="handleAddPlugin">添加插件</button>
        <button class="btn btn-ghost danger" type="button" :disabled="pluginStore.loading || !selectedPlugin" @click="handleDeletePlugin">删除插件</button>
        <button class="btn btn-primary" type="button" :disabled="pluginStore.loading" @click="handleReloadPlugins">重新加载插件</button>
      </div>
    </header>

    <section class="list-section glass-card">
      <div class="panel-heading">
        <div>
          <div class="panel-title">插件列表</div>
          <div class="panel-subtitle">
            {{ plugins.length }} 个插件
            <span v-if="selectedPlugin"> · 已选择 {{ getSelectedPluginLabel() }}</span>
          </div>
        </div>
        <div class="panel-status" :class="statusClass(pluginStore.loading ? 'loading' : selectedPlugin?.status)">
          {{ pluginStore.loading ? '加载中' : (selectedPlugin ? statusLabel(selectedPlugin.status) : '未选择') }}
        </div>
      </div>

      <div v-if="pluginStore.error" class="error-banner">
        {{ pluginStore.error }}
      </div>

      <table v-if="plugins.length" class="data-table plugin-table">
        <thead>
          <tr>
            <th style="width: 32px"></th>
            <th>插件名称</th>
            <th>路径</th>
            <th>作用</th>
            <th style="width: 120px">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="plugin in plugins"
            :key="plugin.id"
            :class="{ selected: plugin.id === pluginStore.selectedPluginId }"
            @click="selectPlugin(plugin.id)"
          >
            <td>
              <span class="status-dot" :class="statusClass(plugin.status)"></span>
            </td>
            <td>
              <div class="cell-name">{{ plugin.displayName }}</div>
            </td>
            <td class="cell-path">{{ formatPath(plugin.path) }}</td>
            <td class="cell-desc">{{ plugin.description || '暂无描述' }}</td>
            <td>
              <span class="plugin-status" :class="statusClass(plugin.status)">{{ statusLabel(plugin.status) }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <div class="empty-icon">🧩</div>
        <div class="empty-title">还没有加载插件</div>
        <div class="empty-text">点击「添加插件」选择一个 plugin.json，或者先重新加载当前目录。</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.plugin-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  padding: 24px;
  min-width: 0;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(79, 70, 229, 0.12);
  color: var(--color-primary);
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 8px 0 0;
  color: var(--text-muted);
}

.page-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn.danger {
  color: var(--color-danger);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.glass-card {
  border-radius: 16px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
}

.list-section {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  min-width: 0;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.panel-status {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-muted);
}

.panel-status.online {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.panel-status.connecting {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.panel-status.error {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.error-banner {
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  font-size: 12px;
}

.plugin-table {
  width: 100%;
}

.cell-name {
  font-weight: 600;
  color: var(--text-primary);
}

.cell-path,
.cell-desc {
  color: var(--text-secondary);
  word-break: break-all;
}

.cell-path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.plugin-status {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-muted);
}

.plugin-status.online {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.plugin-status.connecting {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.plugin-status.error {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #94a3b8;
}

.status-dot.online {
  background: #10b981;
}

.status-dot.connecting {
  background: #f59e0b;
}

.status-dot.error {
  background: #ef4444;
}

.empty-state {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 30px;
}

.empty-title {
  font-weight: 700;
  color: var(--text-primary);
}

.empty-text {
  font-size: 13px;
  max-width: 360px;
  text-align: center;
}

.plugin-table tbody tr {
  cursor: pointer;
}

.plugin-table tbody tr.selected {
  background: var(--color-primary-dim);
}

@media (max-width: 1200px) {
  .page-header {
    flex-direction: column;
  }

  .page-actions {
    width: 100%;
  }
}
</style>
