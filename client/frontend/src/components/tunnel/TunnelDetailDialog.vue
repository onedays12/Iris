<script setup>
/**
 * TunnelDetailDialog - 隧道连接明细弹窗
 *
 * 从 ProxyPivotPage 拆出。展示 tunnel 指标 + channel 列表(活跃/历史分组)。
 * 纯展示组件,数据由主组件通过 props 传入,动作通过 emit 通知主组件。
 */

import { computed } from 'vue'
import { formatTunnelReason } from '../../utils/tunnel.js'
import {
  formatBind,
  formatTunnelType,
  statusClass,
  statusLabel,
  formatCount,
  displayCount,
  formatLatency,
  formatBytes,
} from '../../utils/tunnelFormat.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  tunnel: { type: Object, default: null },
  channels: { type: Array, default: () => [] },
  channelLoading: { type: Boolean, default: false },
  channelError: { type: String, default: '' },
  recyclableCount: { type: Number, default: 0 },
})

const emit = defineEmits(['close', 'recycle'])

const liveChannels = computed(() =>
  props.channels.filter(channel => ['pending', 'active'].includes(String(channel.status || '').toLowerCase()))
)

const historyChannels = computed(() =>
  props.channels.filter(channel => !['pending', 'active'].includes(String(channel.status || '').toLowerCase()))
)

const channelSections = computed(() => [
  {
    key: 'live',
    title: '活跃通道',
    items: liveChannels.value,
    emptyText: '暂无活跃通道',
  },
  {
    key: 'history',
    title: '历史通道',
    items: historyChannels.value,
    emptyText: '暂无历史通道',
  },
])

function channelDisplayValue(channel) {
  const target = channel.targetAddress || [channel.remoteHost, channel.remotePort].filter(Boolean).join(':') || [channel.localHost, channel.localPort].filter(Boolean).join(':') || '-'
  return {
    target,
    reason: formatTunnelReason(channel.reason) || '-',
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
            <h3>Tunnel 连接</h3>
            <span>{{ tunnel ? `${formatTunnelType(tunnel.mode || tunnel.type)} · ${formatBind(tunnel)}` : '连接明细' }}</span>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')">×</button>
      </header>

      <div class="detail-body">
        <div v-if="tunnel" class="metrics-grid">
          <div class="metric-card">
            <span>活跃连接</span>
            <strong>{{ displayCount(tunnel.activeChannels, tunnel.channelCount) }}</strong>
          </div>
          <div class="metric-card">
            <span>队列深度</span>
            <strong>{{ formatCount(tunnel.queueDepth) }}</strong>
          </div>
          <div class="metric-card">
            <span>丢弃次数</span>
            <strong>{{ formatCount(tunnel.dropCount) }}</strong>
          </div>
          <div class="metric-card">
            <span>超时次数</span>
            <strong>{{ formatCount(tunnel.timeoutCount) }}</strong>
          </div>
          <div class="metric-card">
            <span>首次响应</span>
            <strong>{{ formatLatency(tunnel.openLatencyMs) }}</strong>
          </div>
        </div>

        <div v-if="channelLoading" class="state-line">正在读取连接列表...</div>
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
                  <th>连接 ID</th>
                  <th>目标</th>
                  <th>流入</th>
                  <th>流出</th>
                  <th>状态</th>
                  <th>原因</th>
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
                      {{ statusLabel(channel.status) }}
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
          回收终态 ({{ recyclableCount }})
        </button>
        <button class="btn btn-ghost" @click="emit('close')">关闭</button>
      </footer>
    </div>
  </div>
</template>
