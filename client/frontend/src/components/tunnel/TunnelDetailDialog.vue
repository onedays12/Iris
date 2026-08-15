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
