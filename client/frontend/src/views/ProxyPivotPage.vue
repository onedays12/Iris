<script setup>
/**
 * ProxyPivotPage - 代理透视页面
 * 管理端口转发和 SOCKS 隧道的创建、查看、删除，
 * 展示 Tunnel 列表及实时状态。
 *
 * 纯函数移到 utils/tunnelFormat.js,
 * create/edit 弹窗移到 TunnelCreateDialog,明细弹窗移到 TunnelDetailDialog。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAgentStore } from '../stores/agent.js'
import { useModalStore } from '../stores/modal.js'
import { useNotificationStore } from '../stores/notification.js'
import { useTunnelStore } from '../stores/tunnel.js'
import {
  shortId,
  formatTime,
  formatBind,
  formatTarget,
  formatTunnelType,
  statusClass,
  statusLabel,
  isRunningTunnel,
  isPausedTunnel,
  formatBytes,
  formatCount,
  displayCount,
} from '../utils/tunnelFormat.js'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'
import TunnelCreateDialog from '../components/tunnel/TunnelCreateDialog.vue'
import TunnelDetailDialog from '../components/tunnel/TunnelDetailDialog.vue'

const agentStore = useAgentStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const tunnelStore = useTunnelStore()

const selectedBeaconId = ref('')
const createVisible = ref(false)
const detailVisible = ref(false)
const activeTunnelId = ref('')
const dialogMode = ref('create')
const editingTunnelId = ref('')

const tunnels = computed(() => tunnelStore.tunnels)
const loading = computed(() => tunnelStore.loading)
const errorMessage = computed(() => tunnelStore.error)
const activeChannels = computed(() => tunnelStore.getChannels(activeTunnelId.value))
const liveChannels = computed(() => activeChannels.value.filter(channel => ['pending', 'active'].includes(String(channel.status || '').toLowerCase())))
const historyChannels = computed(() => activeChannels.value.filter(channel => !['pending', 'active'].includes(String(channel.status || '').toLowerCase())))
const activeChannelLoading = computed(() => tunnelStore.channelsLoading[activeTunnelId.value] || false)
const activeChannelError = computed(() => tunnelStore.channelsError[activeTunnelId.value] || '')
const activeTunnel = computed(() => tunnels.value.find(item => item.tunnelId === activeTunnelId.value) || null)
const recyclableChannelCount = computed(() => historyChannels.value.filter(channel => ['closed', 'failed', 'timeout'].includes(String(channel.status || '').toLowerCase())).length)

const availableAgents = computed(() => {
  return [...agentStore.agents].sort((a, b) => {
    const left = a.hostname || a.beaconid || ''
    const right = b.hostname || b.beaconid || ''
    return left.localeCompare(right)
  })
})

// TunnelCreateDialog 组件引用(用于 edit 模式调用其 fillTunnelFormFromTunnel)
const createDialogRef = ref(null)

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

function findAgent(beaconId) {
  const id = String(beaconId || '')
  return availableAgents.value.find(agent => agent.beaconid === id || agent.beaconid.startsWith(id) || id.startsWith(agent.beaconid)) || null
}

function agentLabel(beaconId) {
  const agent = findAgent(beaconId)
  if (!agent) return shortId(beaconId)
  return `${agent.hostname || 'Unknown'} · ${shortId(agent.beaconid)}`
}

function openCreateModal(mode = 'socks5') {
  dialogMode.value = 'create'
  editingTunnelId.value = ''
  // 等 dialog 挂载后 reset 表单
  createVisible.value = true
  // 下一个 tick 后 ref 可用,调用子组件 expose 的 reset
  setTimeout(() => {
    createDialogRef.value?.resetTunnelForm(mode, selectedBeaconId.value || '')
  }, 0)
}

function openEditModal(tunnel) {
  if (!tunnel?.tunnelId) return
  if (!isPausedTunnel(tunnel)) {
    notificationStore.warn('仅暂停状态的 Tunnel 可编辑')
    return
  }

  dialogMode.value = 'edit'
  editingTunnelId.value = String(tunnel.tunnelId)
  createVisible.value = true
  // 等 dialog 挂载后填充表单
  setTimeout(() => {
    createDialogRef.value?.fillTunnelFormFromTunnel(tunnel)
  }, 0)
}

function closeTunnelDialog() {
  createVisible.value = false
  dialogMode.value = 'create'
  editingTunnelId.value = ''
}

async function refreshTunnels() {
  try {
    await tunnelStore.fetchTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 获取 Tunnel 列表失败:', err)
  }
}

// TunnelCreateDialog 提交成功后回调
function onCreateSubmitted() {
  createVisible.value = false
  editingTunnelId.value = ''
  refreshTunnels()
}

async function openChannels(tunnel) {
  if (!tunnel?.tunnelId) return
  activeTunnelId.value = tunnel.tunnelId
  detailVisible.value = true
  try {
    await tunnelStore.fetchChannels(tunnel.tunnelId)
  } catch (err) {
    console.error('[ProxyPivotPage] 获取 Tunnel 连接失败:', err)
  }
}

function closeChannels() {
  detailVisible.value = false
  activeTunnelId.value = ''
}

async function pauseTunnel(tunnel) {
  if (!tunnel?.tunnelId) return
  const confirmed = await modalStore.showConfirm({
    title: '暂停 Tunnel',
    message: `确定要暂停 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？`,
    type: 'warning',
  })

  if (!confirmed) return

  try {
    await tunnelStore.pauseTunnel(tunnel.tunnelId)
    notificationStore.success('Tunnel 已暂停')
    await refreshTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 暂停 Tunnel 失败:', err)
  }
}

async function stopTunnel(tunnel) {
  if (!tunnel?.tunnelId) return
  const confirmed = await modalStore.showConfirm({
    title: '停止 Tunnel',
    message: `确定要停止 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？\n这会关闭本地监听并保留记录，后续可清除。`,
    type: 'warning',
  })

  if (!confirmed) return

  try {
    await tunnelStore.stopTunnel(tunnel.tunnelId)
    notificationStore.success('Tunnel 已停止')
    await refreshTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 停止 Tunnel 失败:', err)
  }
}

async function resumeTunnel(tunnel) {
  if (!tunnel?.tunnelId) return
  const confirmed = await modalStore.showConfirm({
    title: '恢复 Tunnel',
    message: `确定要恢复 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？`,
    type: 'warning',
  })

  if (!confirmed) return

  try {
    await tunnelStore.resumeTunnel(tunnel.tunnelId)
    notificationStore.success('Tunnel 已恢复')
    await refreshTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 恢复 Tunnel 失败:', err)
  }
}

async function clearTunnel(tunnel) {
  if (!tunnel?.tunnelId) return
  const confirmed = await modalStore.showConfirm({
    title: '清除 Tunnel',
    message: `确定要清除 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？\n这会删除该 Tunnel 及其连接记录。`,
    type: 'warning',
  })

  if (!confirmed) return

  try {
    await tunnelStore.clearTunnel(tunnel.tunnelId)
    notificationStore.success('Tunnel 已清除')
    if (detailVisible.value && activeTunnelId.value === tunnel.tunnelId) {
      closeChannels()
    }
    await refreshTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 清除 Tunnel 失败:', err)
  }
}

async function recycleChannels() {
  if (!activeTunnel.value?.tunnelId) return
  const count = recyclableChannelCount.value
  if (!count) {
    notificationStore.info('当前没有可回收的终态 channel')
    return
  }

  try {
    await tunnelStore.recycleTunnelChannels(activeTunnel.value.tunnelId, count)
    notificationStore.success(`已回收 ${count} 个终态 channel`)
    await refreshTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 回收 channel 失败:', err)
  }
}

// 周期性 silent 刷新 tunnel 列表，作为 WS 推送的保险，确保 bytes_in/bytes_out 实时更新。
let statsTimer = null
onMounted(() => {
  refreshTunnels()
  statsTimer = setInterval(() => {
    tunnelStore.fetchTunnels({ silent: true }).catch(err => {
      console.warn('[ProxyPivotPage] tunnel 列表 silent 刷新失败:', err)
    })
  }, 3000)
})

onBeforeUnmount(() => {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
})

</script>

<template>
  <div class="page-container proxy-pivot-page">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <PageTitleIcon name="proxy" />
          代理与穿透
        </h1>
        <p class="page-subtitle">管理基于 Beacon 建立的统一 Tunnel</p>
      </div>

      <div class="header-actions">
          <button class="btn btn-secondary" :disabled="loading" @click="refreshTunnels">
          <span class="icon">↻</span>
          {{ loading ? '刷新中...' : '刷新列表' }}
        </button>
        <button class="btn btn-primary" @click="openCreateModal('socks5')">
          <span class="icon">➕</span>
          新建 Tunnel
        </button>
      </div>
    </header>

    <div class="content-panel">
      <div v-if="errorMessage" class="state-line error-state">
        {{ errorMessage }}
      </div>

      <div v-if="loading && tunnels.length === 0" class="state-line">
        正在读取 Tunnel 列表...
      </div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>开启时间</th>
              <th>Beacon</th>
              <th>主机名</th>
              <th>类型</th>
              <th>绑定地址</th>
              <th>远程地址</th>
              <th>活跃连接</th>
              <th>流入</th>
              <th>流出</th>
              <th>状态</th>
              <th class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tunnel in tunnels" :key="tunnel.tunnelId || `${tunnel.beaconId}-${tunnel.bindPort}`">
              <td class="cell-time">{{ formatTime(tunnel.createdAt || tunnel.updatedAt) }}</td>
              <td class="cell-id" :title="tunnel.beaconId">{{ shortId(tunnel.beaconId) }}</td>
              <td class="cell-hostname">{{ findAgent(tunnel.beaconId)?.hostname || '未知' }}</td>
              <td>
                <span class="tag-protocol">{{ formatTunnelType(tunnel.mode || tunnel.type) }}</span>
              </td>
              <td class="cell-port">{{ formatBind(tunnel) }}</td>
              <td class="cell-port">{{ formatTarget(tunnel) }}</td>
              <td class="cell-count">{{ displayCount(tunnel.activeChannels, tunnel.channelCount, tunnelStore.getChannels(tunnel.tunnelId).length) }}</td>
              <td class="cell-size">{{ formatBytes(tunnel.bytesIn) }}</td>
              <td class="cell-size">{{ formatBytes(tunnel.bytesOut) }}</td>
              <td>
                <span class="status-tag" :class="statusClass(tunnel.status)" :title="tunnel.errorMessage || ''">
                  {{ statusLabel(tunnel.status) }}
                </span>
              </td>
              <td class="actions-col">
                <button class="action-btn" @click="openChannels(tunnel)">连接</button>
                <button v-if="isPausedTunnel(tunnel)" class="action-btn" @click="openEditModal(tunnel)">编辑</button>
                <button v-if="isRunningTunnel(tunnel)" class="action-btn" @click="pauseTunnel(tunnel)">暂停</button>
                <button v-else-if="isPausedTunnel(tunnel)" class="action-btn" @click="resumeTunnel(tunnel)">恢复</button>
                <button v-if="isRunningTunnel(tunnel) || isPausedTunnel(tunnel)" class="action-btn" @click="stopTunnel(tunnel)">停止</button>
                <button class="action-btn danger" @click="clearTunnel(tunnel)">清除</button>
              </td>
            </tr>
            <tr v-if="tunnels.length === 0 && !loading">
              <td colspan="11" class="empty-cell">暂无活跃的代理隧道</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
<TunnelCreateDialog
        ref="createDialogRef"
        :visible="createVisible"
        :mode="dialogMode"
        :editing-tunnel-id="editingTunnelId"
        :beacon-id="selectedBeaconId"
        :agents="availableAgents"
        @close="closeTunnelDialog"
        @submitted="onCreateSubmitted"
      />

<TunnelDetailDialog
        :visible="detailVisible"
        :tunnel="activeTunnel"
        :channels="activeChannels"
        :channel-loading="activeChannelLoading"
        :channel-error="activeChannelError"
        :recyclable-count="recyclableChannelCount"
        @close="closeChannels"
        @recycle="recycleChannels"
      />
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

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
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

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.content-panel {
  flex: 1;
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

.error-state {
  color: var(--color-danger);
}

.table-scroll {
  flex: 1;
  overflow: auto;
  min-width: 0;
}

.data-table,
.detail-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table {
  min-width: 1120px;
}

.data-table th,
.detail-table th {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.data-table td,
.detail-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  vertical-align: middle;
  color: #0f172a;
}

.data-table tbody tr:hover,
.detail-table tbody tr:hover {
  background: #f8fafc;
}

.cell-time,
.cell-id,
.cell-port,
.cell-size,
.cell-count,
.cell-reason {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.cell-time,
.cell-size,
.cell-count {
  color: #64748b;
}

.cell-reason {
  color: #475569;
}

.cell-id {
  color: #0ea5e9;
}

.cell-hostname {
  font-weight: 500;
  color: var(--text-primary);
}

.tag-protocol {
  display: inline-block;
  padding: 2px 6px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.18);
  color: #6366f1;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.status-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.status-tag.online {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.18);
}

.status-tag.active {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.18);
}

.status-tag.warn {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.18);
}

.status-tag.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.18);
}

.actions-col {
  text-align: right;
  white-space: nowrap;
  min-width: 214px;
  position: sticky;
  right: 0;
  z-index: 2;
  background: #ffffff;
  box-shadow: -12px 0 18px rgba(15, 23, 42, 0.06);
}

tbody .actions-col {
  background: var(--bg-card);
}

tbody tr:hover .actions-col {
  background: #f8fafc;
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

.action-btn.danger:hover {
  color: #dc2626;
  background: #fef2f2;
}

.empty-cell {
  text-align: center;
  padding: 32px !important;
  color: #64748b;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
}

.modal-card,
.detail-card {
  width: min(760px, 92vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
}

.detail-card {
  width: min(960px, 94vw);
}

.modal-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.modal-title .icon {
  font-size: 24px;
}

.modal-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-title span {
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

.modal-body,
.detail-body {
  padding: 20px;
  overflow: auto;
}

.channel-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.channel-section {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.96);
}

.section-header {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(248, 250, 252, 0.96);
}

.section-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-header span {
  font-size: 12px;
  color: var(--text-muted);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  padding: 12px 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-card span {
  font-size: 11px;
  color: var(--text-muted);
}

.metric-card strong {
  font-size: 18px;
  color: var(--text-primary);
  line-height: 1.1;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group.span-2 {
  grid-column: span 2;
}

.form-group label {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1;
}

.form-control {
  height: 38px;
  padding: 0 12px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  color: #0f172a;
  font-size: 13px;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: var(--color-primary);
  outline: none;
}

.checkbox-row {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  color: #0f172a;
  font-size: 13px;
  cursor: pointer;
}

.checkbox-row input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--color-primary);
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.detail-table .cell-port {
  color: #0f172a;
}

.detail-table .cell-size {
  color: #64748b;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .page-title) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .page-subtitle),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .form-group label),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .modal-title span),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .section-header span),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .metric-card span) {
  color: #a7b3c8;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .content-panel),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .modal-card),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .detail-card) {
  background: rgba(15, 23, 42, 0.76);
  border-color: rgba(99, 102, 241, 0.22);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .state-line),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .state-line) {
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.88);
  border-bottom-color: rgba(148, 163, 184, 0.12);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .data-table th),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .detail-table th) {
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.96);
  border-bottom-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .actions-col) {
  background: rgba(15, 23, 42, 0.92);
  box-shadow: -12px 0 18px rgba(2, 6, 23, 0.30);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .data-table tbody tr),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .detail-table tbody tr) {
  background: rgba(30, 41, 73, 0.54);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .data-table tbody tr:hover),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .detail-table tbody tr:hover) {
  background: rgba(51, 65, 105, 0.74);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .data-table tbody tr:hover .actions-col) {
  background: rgba(51, 65, 105, 0.92);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .data-table td),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .detail-table td) {
  color: #e5e7eb;
  border-bottom-color: rgba(148, 163, 184, 0.10);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .cell-time),
:global(html[data-ui-theme="dark"] .proxy-pivot-page .cell-size),
:global(html[data-ui-theme="dark"] .proxy-pivot-page .cell-count),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .cell-size),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .cell-count) {
  color: #a7b3c8;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .cell-id),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .cell-id) {
  color: #22d3ee;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .cell-port),
:global(html[data-ui-theme="dark"] .proxy-pivot-page .cell-hostname),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .cell-port) {
  color: #f1f5f9;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-modal .cell-reason) {
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .tag-protocol) {
  color: #c4b5fd;
  background: rgba(99, 102, 241, 0.22);
  border-color: rgba(129, 140, 248, 0.34);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .status-tag.online),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .status-tag.online) {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(52, 211, 153, 0.30);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .status-tag.active),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .status-tag.active) {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(96, 165, 250, 0.30);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .status-tag.warn),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .status-tag.warn) {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.18);
  border-color: rgba(251, 191, 36, 0.30);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .status-tag.danger),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .status-tag.danger) {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(248, 113, 113, 0.30);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .action-btn) {
  color: #e5e7eb;
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(148, 163, 184, 0.24);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .action-btn:hover:not(:disabled)) {
  color: #c4b5fd;
  background: rgba(79, 70, 229, 0.18);
  border-color: rgba(129, 140, 248, 0.40);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .action-btn.danger) {
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .action-btn.danger:hover:not(:disabled)) {
  color: #fecaca;
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(248, 113, 113, 0.34);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-page .empty-cell),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .empty-cell) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .proxy-pivot-modal .modal-header),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .modal-footer),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .section-header) {
  background: rgba(15, 23, 42, 0.88);
  border-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-modal .channel-section),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .metric-card),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .checkbox-row) {
  background: rgba(15, 23, 42, 0.82);
  border-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .proxy-pivot-modal .modal-title h3),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .section-header h4),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .metric-card strong),
:global(html[data-ui-theme="dark"] .proxy-pivot-modal .checkbox-row) {
  color: #f8fafc;
}
</style>
