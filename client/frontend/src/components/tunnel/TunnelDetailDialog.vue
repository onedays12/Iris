<script setup lang="ts">
/**
 * TunnelDetailDialog - 隧道连接明细弹窗
 *
 * 从 ProxyPivotPage 拆出。展示 tunnel 指标 + channel 列表(活跃/历史分组)。
 * 纯展示组件,数据由主组件通过 props 传入,动作通过 emit 通知主组件。
 */

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatTunnelReasonKey } from '../../utils/tunnel'
import type { Tunnel, TunnelChannel } from '../../features/tunnel/model'
import {
  formatBind,
  formatTunnelType,
  statusClass,
  statusLabel,
  statusLabelKey,
  formatCount,
  displayCount,
  formatLatency,
  formatBytes,
} from '../../utils/tunnelFormat'

const props = defineProps<{
  visible?: boolean
  tunnel?: Tunnel | null
  channels?: TunnelChannel[]
  channelLoading?: boolean
  channelError?: string
  recyclableCount?: number
}>()

const emit = defineEmits(['close', 'recycle'])

const { t } = useI18n()

const liveChannels = computed(() =>
  (props.channels ?? []).filter(channel => ['pending', 'active'].includes(String(channel.status || '').toLowerCase()))
)

const historyChannels = computed(() =>
  (props.channels ?? []).filter(channel => !['pending', 'active'].includes(String(channel.status || '').toLowerCase()))
)

const channelSections = computed(() => [
  {
    key: 'live',
    title: t('tunnelDetail.liveChannels'),
    items: liveChannels.value,
    emptyText: t('tunnelDetail.noLiveChannels'),
  },
  {
    key: 'history',
    title: t('tunnelDetail.historyChannels'),
    items: historyChannels.value,
    emptyText: t('tunnelDetail.noHistoryChannels'),
  },
])

function channelDisplayValue(channel: TunnelChannel) {
  const target = channel.targetAddress || [channel.remoteHost, channel.remotePort].filter(Boolean).join(':') || [channel.localHost, channel.localPort].filter(Boolean).join(':') || '-'
  const reasonKey = formatTunnelReasonKey(channel.reason)
  return {
    target,
    reason: reasonKey ? t(reasonKey) : (String(channel.reason || '').trim() || '-'),
  }
}
</script>

<template>
  <div v-if="visible" class="modal-overlay proxy-pivot-modal">
    <div class="detail-card">
      <header class="modal-header">
        <div class="modal-title">
          <span class="icon">🔗</span>
          <div>
            <h3>{{ t('tunnelDetail.title') }}</h3>
            <span>{{ tunnel ? `${formatTunnelType(tunnel.mode || tunnel.type)} · ${formatBind(tunnel)}` : t('tunnelDetail.subtitle') }}</span>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')">×</button>
      </header>

      <div class="detail-body">
        <div v-if="tunnel" class="metrics-grid">
          <div class="metric-card">
            <span>{{ t('tunnelDetail.metricActive') }}</span>
            <strong>{{ displayCount(tunnel.activeChannels, tunnel.channelCount) }}</strong>
          </div>
          <div class="metric-card">
            <span>{{ t('tunnelDetail.metricQueue') }}</span>
            <strong>{{ formatCount(tunnel.queueDepth) }}</strong>
          </div>
          <div class="metric-card">
            <span>{{ t('tunnelDetail.metricDrops') }}</span>
            <strong>{{ formatCount(tunnel.dropCount) }}</strong>
          </div>
          <div class="metric-card">
            <span>{{ t('tunnelDetail.metricTimeouts') }}</span>
            <strong>{{ formatCount(tunnel.timeoutCount) }}</strong>
          </div>
          <div class="metric-card">
            <span>{{ t('tunnelDetail.metricFirstResponse') }}</span>
            <strong>{{ formatLatency(tunnel.openLatencyMs) }}</strong>
          </div>
        </div>

        <div v-if="channelLoading" class="state-line">{{ t('tunnelDetail.loading') }}</div>
        <div v-else-if="channelError" class="state-line error-state">{{ channelError }}</div>
        <div v-else class="channel-sections">
          <section v-for="section in channelSections" :key="section.key" class="channel-section">
            <div class="section-header">
              <h4>{{ section.title }}</h4>
              <span>{{ section.items.length }}</span>
            </div>
            <table class="detail-table">
              <thead>
                <tr>
                  <th>{{ t('tunnelDetail.colChannelId') }}</th>
                  <th>{{ t('tunnelDetail.colTarget') }}</th>
                  <th>{{ t('tunnelDetail.colIn') }}</th>
                  <th>{{ t('tunnelDetail.colOut') }}</th>
                  <th>{{ t('tunnelDetail.colStatus') }}</th>
                  <th>{{ t('tunnelDetail.colReason') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="channel in section.items" :key="channel.channelId || `${channel.localHost}-${channel.localPort}-${channel.remoteHost}-${channel.remotePort}`">
                  <td class="cell-id">{{ channel.channelId || '-' }}</td>
                  <td class="cell-port">{{ channelDisplayValue(channel).target }}</td>
                  <td class="cell-size">{{ formatBytes(channel.bytesIn) }}</td>
                  <td class="cell-size">{{ formatBytes(channel.bytesOut) }}</td>
                  <td>
                    <span class="status-tag" :class="statusClass(channel.status)">
                      {{ statusLabelKey(channel.status) ? t(statusLabelKey(channel.status) ?? '') : statusLabel(channel.status) }}
                    </span>
                  </td>
                  <td class="cell-reason">{{ channelDisplayValue(channel).reason }}</td>
                </tr>
                <tr v-if="section.items.length === 0">
                  <td colspan="6" class="empty-cell">{{ section.emptyText }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-secondary" :disabled="!recyclableCount" @click="emit('recycle')">
          {{ t('tunnelDetail.recycle', { count: recyclableCount }) }}
        </button>
        <button class="btn btn-ghost" @click="emit('close')">{{ t('common.close') }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 本组件通过 Teleport 挂到 body,父页面 ProxyPivotPage 的 scoped 样式无法命中,
   故对话框所需的全部布局样式在此自包含定义(与 TunnelCreateDialog 同模式)。 */
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

.detail-card {
  width: min(960px, 94vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
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

.detail-body {
  padding: 20px;
  overflow: auto;
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

.detail-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.detail-table th {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.detail-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  vertical-align: middle;
  color: #0f172a;
}

.detail-table tbody tr:hover {
  background: #f8fafc;
}

.cell-id,
.cell-port,
.cell-size,
.cell-reason {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.cell-size {
  color: #64748b;
}

.cell-reason {
  color: #475569;
}

.cell-id {
  color: #0ea5e9;
}

.detail-table .cell-port {
  color: #0f172a;
}

.detail-table .cell-size {
  color: #64748b;
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

.empty-cell {
  text-align: center;
  padding: 32px !important;
  color: #64748b;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}
</style>
