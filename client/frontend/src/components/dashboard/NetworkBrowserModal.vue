<script setup lang="ts">
/**
 * NetworkBrowserModal - 网络浏览器弹窗
 * 展示远程主机的网络接口信息和活动网络连接，
 * 支持搜索过滤和数据刷新。
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '../../stores/agent'
import { useNetworkBrowserStore } from '../../stores/networkBrowser'
import { useModalDragResize } from '../../composables/useModalDragResize'

const { t, locale } = useI18n()
const agentStore = useAgentStore()
const networkStore = useNetworkBrowserStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, required: true }
})

const emit = defineEmits(['close'])

const activeTab = ref('interfaces')
const searchQuery = ref('')

const {
  winPos, winSize, isDragging, isResizing, resizeType,
  initWindowPosition, startResizeListener, stopResizeListener,
  startDrag, startResize, stopDrag, stopResize,
} = useModalDragResize({
  defaultWidth: 980, defaultHeight: 680,
  minWidth: 720, minHeight: 460,
})

function close() {
  emit('close')
}

function fetchAll() {
  if (!props.beaconid) return
  networkStore.requestAll(props.beaconid)
}

function formatTime(value: string | null) {
  if (!value) return '--:--:--'
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return '--:--:--'
  return time.toLocaleTimeString(locale.value, { hour12: false })
}

function formatFlags(flags: unknown[]) {
  if (!Array.isArray(flags) || !flags.length) return '-'
  return flags.join(', ')
}

function formatAddresses(addrs: unknown[]) {
  if (!Array.isArray(addrs) || !addrs.length) return '-'
  return addrs.join(', ')
}

const loading = computed(() => networkStore.isLoading(props.beaconid))
const error = computed(() => networkStore.getError(props.beaconid))
const interfaces = computed(() => networkStore.getInterfaces(props.beaconid))
const connections = computed(() => networkStore.getConnections(props.beaconid))
const lastUpdated = computed(() => networkStore.getLastUpdated(props.beaconid))
const agent = computed(() => agentStore.getAgentById(props.beaconid))

const filteredInterfaces = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return interfaces.value

  return interfaces.value.filter((iface) => {
    const text = [
      iface.name,
      iface.hardwareAddr,
      formatFlags(iface.flags),
      formatAddresses(iface.addrs),
      String(iface.index),
      String(iface.mtu),
    ].join(' ').toLowerCase()

    return text.includes(q)
  })
})

const filteredConnections = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return connections.value

  return connections.value.filter((conn) => {
    const text = [
      conn.protocol,
      conn.localAddress,
      conn.localPort,
      conn.remoteAddress,
      conn.remotePort,
      conn.state,
      conn.pid,
    ].join(' ').toLowerCase()

    return text.includes(q)
  })
})

watch(() => props.visible, (visible) => {
  if (!visible) {
    searchQuery.value = ''
    activeTab.value = 'interfaces'
    stopResizeListener()
    networkStore.clear(props.beaconid)
    return
  }

  initWindowPosition()
  startResizeListener()
  fetchAll()
})

watch(() => props.beaconid, (next, prev) => {
  if (!props.visible || !next || next === prev) return
  searchQuery.value = ''
  activeTab.value = 'interfaces'
  fetchAll()
})

onMounted(() => {
  if (props.visible) {
    initWindowPosition()
  }
})

onUnmounted(() => {
  stopDrag()
  stopResize()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay">
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
        <div class="resize-handle resizer-n" @mousedown="startResize('n', $event)"></div>
        <div class="resize-handle resizer-s" @mousedown="startResize('s', $event)"></div>
        <div class="resize-handle resizer-e" @mousedown="startResize('e', $event)"></div>
        <div class="resize-handle resizer-w" @mousedown="startResize('w', $event)"></div>
        <div class="resize-handle resizer-nw" @mousedown="startResize('nw', $event)"></div>
        <div class="resize-handle resizer-ne" @mousedown="startResize('ne', $event)"></div>
        <div class="resize-handle resizer-sw" @mousedown="startResize('sw', $event)"></div>
        <div class="resize-handle resizer-se" @mousedown="startResize('se', $event)"></div>

        <div class="browser-modal">
          <header class="modal-header" @mousedown="startDrag">
            <div class="header-info">
              <span class="icon">🌐</span>
              <div class="titles">
                <h3>{{ t('networkBrowser.title') }}</h3>
                <span class="subtitle">
                  Agent: {{ agent?.beaconid?.substring(0, 8) || beaconid.substring(0, 8) }}@{{ agent?.hostname || beaconid.substring(0, 8) }}
                </span>
              </div>
            </div>
            <button class="close-btn" @click="close">×</button>
          </header>

          <div class="toolbar">
            <div class="tab-switcher">
              <button
                class="tab-btn"
                :class="{ active: activeTab === 'interfaces' }"
                @click="activeTab = 'interfaces'"
              >
                {{ t('networkBrowser.interfacesTab') }}
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab === 'connections' }"
                @click="activeTab = 'connections'"
              >
                {{ t('networkBrowser.connectionsTab') }}
              </button>
            </div>

            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="activeTab === 'interfaces' ? t('networkBrowser.interfacesSearchPlaceholder') : t('networkBrowser.connectionsSearchPlaceholder')"
                spellcheck="false"
              />
            </div>

            <button
              class="nav-action-btn refresh"
              :class="{ spinning: loading }"
              @click="fetchAll"
              :disabled="loading"
              :title="t('networkBrowser.refreshTitle')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>

            <span class="sync-time">{{ t('networkBrowser.syncLabel', { time: formatTime(lastUpdated) }) }}</span>
          </div>

          <div class="content-area">
            <div v-if="loading" class="loading-state">
              <div class="spinner"></div>
              <span>{{ t('networkBrowser.loading') }}</span>
            </div>

            <div v-else-if="error" class="error-state">
              <span class="error-icon">⚠️</span>
              <span>{{ error }}</span>
              <button @click="fetchAll" class="retry-btn">{{ t('networkBrowser.retry') }}</button>
            </div>

            <div v-else-if="activeTab === 'interfaces'" class="interfaces-view">
              <article
                v-for="iface in filteredInterfaces"
                :key="`${iface.index}-${iface.name}`"
                class="interface-card"
              >
                <div class="card-header">
                  <div>
                    <h4>{{ iface.name }}</h4>
                    <span class="card-subtitle">{{ t('networkBrowser.interfaceIndex', { index: iface.index }) }}</span>
                  </div>
                  <div class="badges">
                    <span class="state-tag" :class="{ up: iface.isUp === true, down: iface.isUp === false }">
                      {{ iface.isUp === true ? 'UP' : iface.isUp === false ? 'DOWN' : 'UNKNOWN' }}
                    </span>
                    <span v-if="iface.isLoopback" class="state-tag subtle">LOOPBACK</span>
                    <span v-if="iface.isMulticast" class="state-tag subtle">MULTICAST</span>
                  </div>
                </div>

                <div class="interface-grid">
                  <div class="info-item">
                    <label>MAC</label>
                    <span class="mono">{{ iface.hardwareAddr || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <label>MTU</label>
                    <span class="mono">{{ iface.mtu || '-' }}</span>
                  </div>
                  <div class="info-item full">
                    <label>Flags</label>
                    <span>{{ formatFlags(iface.flags) }}</span>
                  </div>
                  <div class="info-item full">
                    <label>{{ t('networkBrowser.address') }}</label>
                    <span class="mono">{{ formatAddresses(iface.addrs) }}</span>
                  </div>
                </div>
              </article>

              <div v-if="filteredInterfaces.length === 0" class="empty-state">
                {{ t('networkBrowser.noMatchingInterfaces') }}
              </div>
            </div>

            <table v-else class="connection-table">
              <thead>
                <tr>
                  <th>{{ t('networkBrowser.protocol') }}</th>
                  <th>{{ t('networkBrowser.localAddress') }}</th>
                  <th>{{ t('networkBrowser.remoteAddress') }}</th>
                  <th>{{ t('networkBrowser.state') }}</th>
                  <th>PID</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="conn in filteredConnections"
                  :key="`${conn.protocol}-${conn.localAddress}:${conn.localPort}-${conn.remoteAddress}:${conn.remotePort}-${conn.pid}`"
                >
                  <td class="copyable-cell"><span class="protocol-tag">{{ conn.protocol }}</span></td>
                  <td class="copyable-cell mono">{{ conn.localAddress }}:{{ conn.localPort || '-' }}</td>
                  <td class="copyable-cell mono">{{ conn.remoteAddress }}:{{ conn.remotePort || '-' }}</td>
                  <td class="copyable-cell">{{ conn.state || '-' }}</td>
                  <td class="copyable-cell mono">{{ conn.pid || '-' }}</td>
                </tr>
                <tr v-if="filteredConnections.length === 0">
                  <td colspan="5" class="empty-row">{{ t('networkBrowser.noMatchingConnections') }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer class="modal-footer">
            <span class="status-text">
              {{ activeTab === 'interfaces'
                ? t('networkBrowser.interfaceCount', { count: filteredInterfaces.length })
                : t('networkBrowser.connectionCount', { count: filteredConnections.length }) }}
              {{ searchQuery ? t('networkBrowser.filteredSuffix') : '' }}
            </span>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import '../../assets/styles/browser-modal-base.css';

.tab-switcher {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.tab-btn {
  height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.8);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  background: #f8fafc;
  color: var(--text-primary);
}

.tab-btn.active {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.22);
  color: #4f46e5;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 4px 12px;
  min-width: 0;
}

.search-icon {
  font-size: 13px;
  color: var(--text-muted);
  margin-right: 8px;
}

.search-box input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--text-primary);
  outline: none;
  font-size: 13px;
}

.sync-time {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
}

.content-area {
  flex: 1;
  overflow: auto;
  position: relative;
}

.interfaces-view {
  padding: 16px 20px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.interface-card {
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  padding: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.card-header h4 {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
}

.card-subtitle {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.state-tag,
.protocol-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

.state-tag.up {
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
}

.state-tag.down {
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.state-tag.subtle,
.protocol-tag {
  color: #4f46e5;
  background: rgba(99, 102, 241, 0.1);
}

.interface-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.info-item.full {
  grid-column: 1 / -1;
}

.info-item label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.info-item span {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.mono {
  font-family: 'JetBrains Mono', monospace;
}

.connection-table {
  width: 100%;
  min-width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.connection-table th {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-light);
  z-index: 10;
}

.connection-table td {
  padding: 10px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
  vertical-align: top;
}

.connection-table tr:hover {
  background: rgba(0, 0, 0, 0.02);
}

.copyable-cell,
.copyable-cell * {
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

/* 网卡卡片内容(MAC/MTU/FLAGS/地址)可选中复制 */
.interface-card {
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.empty-row {
  padding: 40px !important;
  text-align: center;
  color: var(--text-muted);
}

:global(html[data-ui-theme="dark"] .browser-modal) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.04) 42%, rgba(2, 6, 23, 0.02)),
    radial-gradient(rgba(255, 255, 255, 0.06) 0.5px, transparent 0.5px),
    rgba(15, 23, 42, 0.94);
  background-size: auto, 3px 3px, auto;
  border-color: rgba(148, 163, 184, 0.22);
  color: #e5e7eb;
}

:global(html[data-ui-theme="dark"] .browser-modal .modal-header),
:global(html[data-ui-theme="dark"] .browser-modal .toolbar),
:global(html[data-ui-theme="dark"] .browser-modal .modal-footer) {
  background: rgba(15, 23, 42, 0.82);
  border-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .browser-modal .titles h3) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .browser-modal .subtitle),
:global(html[data-ui-theme="dark"] .browser-modal .sync-time),
:global(html[data-ui-theme="dark"] .browser-modal .status-text) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .browser-modal .close-btn),
:global(html[data-ui-theme="dark"] .browser-modal .nav-action-btn),
:global(html[data-ui-theme="dark"] .browser-modal .tab-btn) {
  background: rgba(30, 41, 59, 0.82);
  border-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .browser-modal .close-btn:hover),
:global(html[data-ui-theme="dark"] .browser-modal .nav-action-btn:hover:not(:disabled)),
:global(html[data-ui-theme="dark"] .browser-modal .tab-btn:hover) {
  background: rgba(51, 65, 85, 0.92);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .browser-modal .tab-btn.active) {
  background: rgba(129, 140, 248, 0.18);
  border-color: rgba(129, 140, 248, 0.32);
  color: #e0e7ff;
}

:global(html[data-ui-theme="dark"] .browser-modal .search-box) {
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(148, 163, 184, 0.18);
}

:global(html[data-ui-theme="dark"] .browser-modal .search-box input) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .browser-modal .search-box input::placeholder),
:global(html[data-ui-theme="dark"] .browser-modal .search-icon) {
  color: #94a3b8;
  opacity: 1;
}

:global(html[data-ui-theme="dark"] .browser-modal .content-area) {
  background: rgba(15, 23, 42, 0.34);
}

:global(html[data-ui-theme="dark"] .browser-modal .interface-card) {
  background: rgba(30, 41, 59, 0.78);
  border-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .browser-modal .interface-card:hover) {
  background: rgba(39, 52, 80, 0.86);
  border-color: rgba(129, 140, 248, 0.26);
}

:global(html[data-ui-theme="dark"] .browser-modal .card-header h4) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .browser-modal .card-subtitle),
:global(html[data-ui-theme="dark"] .browser-modal .info-item label) {
  color: #93a4bd;
}

:global(html[data-ui-theme="dark"] .browser-modal .info-item span) {
  color: #dbeafe;
}

:global(html[data-ui-theme="dark"] .browser-modal .state-tag.up) {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.18);
}

:global(html[data-ui-theme="dark"] .browser-modal .state-tag.down) {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.18);
}

:global(html[data-ui-theme="dark"] .browser-modal .state-tag.subtle),
:global(html[data-ui-theme="dark"] .browser-modal .protocol-tag) {
  color: #c7d2fe;
  background: rgba(129, 140, 248, 0.18);
}

:global(html[data-ui-theme="dark"] .browser-modal .connection-table th) {
  background: rgba(15, 23, 42, 0.96);
  border-bottom-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .browser-modal .connection-table td) {
  color: #e5e7eb;
  border-bottom-color: rgba(148, 163, 184, 0.08);
}

:global(html[data-ui-theme="dark"] .browser-modal .connection-table tr:hover) {
  background: rgba(129, 140, 248, 0.12);
}

:global(html[data-ui-theme="dark"] .browser-modal .empty-row),
:global(html[data-ui-theme="dark"] .browser-modal .loading-state),
:global(html[data-ui-theme="dark"] .browser-modal .empty-state) {
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .browser-modal .error-state) {
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .browser-modal .retry-btn) {
  background: rgba(30, 41, 59, 0.82);
  border-color: rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .browser-modal .retry-btn:hover) {
  background: rgba(51, 65, 85, 0.92);
}

:global(html[data-ui-theme="dark"] .browser-modal .content-area::-webkit-scrollbar-thumb) {
  background: rgba(148, 163, 184, 0.26);
}

:global(html[data-ui-theme="dark"] .browser-modal .content-area::-webkit-scrollbar-thumb:hover) {
  background: rgba(148, 163, 184, 0.42);
}

@media (max-width: 900px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .tab-switcher,
  .search-box {
    width: 100%;
  }

  .sync-time {
    width: 100%;
  }

  .interfaces-view {
    grid-template-columns: 1fr;
  }
}
</style>
