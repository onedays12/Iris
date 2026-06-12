<script setup>
/**
 * ProxyPivotPage - 代理透视页面
 * 管理端口转发和 SOCKS 隧道的创建、查看、删除，
 * 展示 Tunnel 列表及实时状态。
 */

import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAgentStore } from '../stores/agent.js'
import { useModalStore } from '../stores/modal.js'
import { useNotificationStore } from '../stores/notification.js'
import { useTunnelStore } from '../stores/tunnel.js'
import { formatTunnelReason } from '../utils/tunnel.js'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'

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
const createSubmitting = ref(false)

const createForm = reactive({
  beaconId: '',
  mode: 'socks5',
  bindHost: '127.0.0.1',
  bindPort: 1080,
  remoteHost: '',
  remotePort: 0,
  socksAuthMode: 'no_auth',
  socksUsername: '',
  socksPassword: '',
  socksUdpAssociate: false,
})

const tunnelModes = [
  { value: 'socks5', label: 'SOCKS5', description: '创建本地 SOCKS5 代理' },
  { value: 'port_forward', label: '端口转发', description: '创建本地到目标主机的转发' },
  { value: 'reverse_port_map', label: '反向端口映射', description: '由 Beacon 侧回连并映射到本地端口' },
  { value: 'http_proxy', label: 'HTTP 代理', description: '预留模式，前端仅作展示与兼容' },
  { value: 'udp_proxy', label: 'UDP 代理', description: '预留模式，前端仅作展示与兼容' },
]
const socksAuthModes = [
  { value: 'no_auth', label: '无需认证', description: 'SOCKS5 不启用用户名/密码' },
  { value: 'username_password', label: '用户名 / 密码', description: 'SOCKS5 需要用户名和密码' },
]

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
const usesSocks5Mode = computed(() => String(createForm.mode || '').toLowerCase() === 'socks5')
const usesSocksUsernamePassword = computed(() => String(createForm.socksAuthMode || '').toLowerCase() === 'username_password')
const isEditMode = computed(() => dialogMode.value === 'edit')
const tunnelDialogTitle = computed(() => isEditMode.value ? '编辑网络隧道' : '新建网络隧道')
const tunnelDialogDescription = computed(() => isEditMode.value ? '修改已暂停 Tunnel 的监听与认证参数，保存后可继续恢复' : '通过 Beacon 创建统一 Tunnel')
const tunnelDialogSubmitText = computed(() => {
  if (createSubmitting.value) return isEditMode.value ? '保存中...' : '创建中...'
  return isEditMode.value ? '保存修改' : '创建隧道'
})

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

watch(() => createVisible.value, (visible) => {
  if (visible && !createForm.beaconId && selectedBeaconId.value) {
    createForm.beaconId = selectedBeaconId.value
  }
})

watch(() => createForm.mode, (mode) => {
  if (dialogMode.value !== 'create') return
  const normalized = String(mode || '').toLowerCase()
  Object.assign(createForm, getModeDefaults(normalized))
})

function shortId(value) {
  if (!value) return '-'
  return String(value).substring(0, 8)
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

function formatBind(tunnel) {
  return `${tunnel.bindHost || '127.0.0.1'}:${tunnel.bindPort || '-'}`
}

function formatTarget(tunnel) {
  if (requiresRemoteTarget(tunnel.mode || tunnel.type)) {
    if (!tunnel.remoteHost && !tunnel.remotePort) return '-'
    return `${tunnel.remoteHost || '-'}:${tunnel.remotePort || '-'}`
  }
  return '-'
}

function formatTunnelType(type) {
  const normalized = String(type || '').toLowerCase()
  if (normalized === 'socks5') return 'SOCKS5'
  if (normalized === 'port_forward') return 'PORT FWD'
  if (normalized === 'reverse_port_map') return 'REVERSE MAP'
  if (normalized === 'http_proxy') return 'HTTP PROXY'
  if (normalized === 'udp_proxy') return 'UDP PROXY'
  return normalized || '-'
}

function statusClass(status) {
  const value = String(status || '').toLowerCase()
  if (['running', 'listening', 'active', 'online'].includes(value)) return 'online'
  if (['paused', 'pause', 'pending', 'timeout', 'closed', 'stopped'].includes(value)) return 'warn'
  if (['error', 'failed'].includes(value)) return 'danger'
  return 'active'
}

function statusLabel(status) {
  const value = String(status || '').toLowerCase()
  if (['running', 'listening', 'active', 'online'].includes(value)) return '运行中'
  if (value === 'pending') return '待处理'
  if (value === 'timeout') return '已超时'
  if (['paused', 'pause'].includes(value)) return '已暂停'
  if (value === 'closed') return '已关闭'
  if (value === 'stopped') return '已停止'
  if (value === 'error' || value === 'failed') return '异常'
  return value || '-'
}

function findAgent(beaconId) {
  const id = String(beaconId || '')
  return availableAgents.value.find(agent => agent.beaconid === id || agent.beaconid.startsWith(id) || id.startsWith(agent.beaconid)) || null
}

function agentLabel(beaconId) {
  const agent = findAgent(beaconId)
  if (!agent) return shortId(beaconId)
  return `${agent.hostname || 'Unknown'} · ${shortId(agent.beaconid)}`
}

function isRunningTunnel(tunnel) {
  const value = String(tunnel?.status || '').toLowerCase()
  return ['running', 'listening', 'active', 'online'].includes(value)
}

function isPausedTunnel(tunnel) {
  const value = String(tunnel?.status || '').toLowerCase()
  return ['paused', 'pause'].includes(value)
}

function getModeDefaults(mode) {
  const normalized = String(mode || '').toLowerCase()
  if (normalized === 'port_forward') {
    return { bindHost: '0.0.0.0', bindPort: 8888, remoteHost: '127.0.0.1', remotePort: 3389, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  if (normalized === 'reverse_port_map') {
    return { bindHost: '0.0.0.0', bindPort: 13389, remoteHost: '127.0.0.1', remotePort: 3389, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  if (normalized === 'http_proxy') {
    return { bindHost: '127.0.0.1', bindPort: 8080, remoteHost: '', remotePort: 0, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  if (normalized === 'udp_proxy') {
    return { bindHost: '127.0.0.1', bindPort: 1080, remoteHost: '', remotePort: 0, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  return { bindHost: '127.0.0.1', bindPort: 1080, remoteHost: '', remotePort: 0, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
}

function resetTunnelForm(mode = 'socks5', beaconId = '') {
  const normalizedMode = String(mode || 'socks5').toLowerCase()
  Object.assign(createForm, {
    beaconId,
    mode: normalizedMode,
    ...getModeDefaults(normalizedMode),
  })
}

function fillTunnelFormFromTunnel(tunnel) {
  const mode = String(tunnel?.mode || tunnel?.type || 'socks5').toLowerCase()
  Object.assign(createForm, {
    beaconId: String(tunnel?.beaconId || ''),
    mode,
    bindHost: tunnel?.bindHost || (mode === 'socks5' ? '127.0.0.1' : '0.0.0.0'),
    bindPort: Number(tunnel?.bindPort || 0),
    remoteHost: tunnel?.remoteHost || '',
    remotePort: Number(tunnel?.remotePort || 0),
    socksAuthMode: String(tunnel?.socksAuthMode || 'no_auth').toLowerCase(),
    socksUsername: String(tunnel?.socksUsername || tunnel?.raw?.socks_username || '').trim(),
    socksPassword: '',
    socksUdpAssociate: Boolean(tunnel?.socksUdpAssociate),
  })
}

function requiresRemoteTarget(mode) {
  const normalized = String(mode || '').toLowerCase()
  return ['port_forward', 'reverse_port_map'].includes(normalized)
}

function openCreateModal(mode = 'socks5') {
  dialogMode.value = 'create'
  editingTunnelId.value = ''
  resetTunnelForm(mode, selectedBeaconId.value || '')
  createVisible.value = true
}

function openEditModal(tunnel) {
  if (!tunnel?.tunnelId) return
  if (!isPausedTunnel(tunnel)) {
    notificationStore.warn('仅暂停状态的 Tunnel 可编辑')
    return
  }

  dialogMode.value = 'edit'
  editingTunnelId.value = String(tunnel.tunnelId)
  fillTunnelFormFromTunnel(tunnel)
  createVisible.value = true
}

function closeTunnelDialog() {
  createVisible.value = false
  dialogMode.value = 'create'
  editingTunnelId.value = ''
  resetTunnelForm('socks5', selectedBeaconId.value || '')
}

async function refreshTunnels() {
  try {
    await tunnelStore.fetchTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 获取 Tunnel 列表失败:', err)
  }
}

async function submitCreateTunnel() {
  if (!createForm.beaconId) {
    notificationStore.warn('请先选择 Beacon')
    return
  }

  const bindPort = Number(createForm.bindPort)
  if (!Number.isInteger(bindPort) || bindPort <= 0 || bindPort > 65535) {
    notificationStore.warn('绑定端口必须是 1 到 65535 之间的整数')
    return
  }

  const normalizedMode = String(createForm.mode || '').toLowerCase()
  const allowedModes = ['socks5', 'port_forward', 'reverse_port_map', 'http_proxy', 'udp_proxy']
  if (!allowedModes.includes(normalizedMode)) {
    notificationStore.warn('请选择有效的 Tunnel 模式')
    return
  }

  if (isEditMode.value && !editingTunnelId.value) {
    notificationStore.warn('Tunnel 编辑目标不存在')
    return
  }

  createSubmitting.value = true
  try {
    const payload = {
      bind_host: createForm.bindHost || (normalizedMode === 'socks5' ? '127.0.0.1' : '0.0.0.0'),
      bind_port: bindPort,
    }

    if (normalizedMode === 'socks5') {
      const socksAuthMode = String(createForm.socksAuthMode || '').toLowerCase()
      if (!['no_auth', 'username_password'].includes(socksAuthMode)) {
        notificationStore.warn('请选择有效的 SOCKS5 认证模式')
        return
      }

      payload.socks_auth_mode = socksAuthMode
      payload.socks_udp_associate = Boolean(createForm.socksUdpAssociate)

      if (socksAuthMode === 'username_password') {
        const username = String(createForm.socksUsername || '').trim()
        const password = String(createForm.socksPassword || '').trim()
        if (!username) {
          notificationStore.warn('请填写 SOCKS5 用户名')
          return
        }
        if (!password) {
          notificationStore.warn('请填写 SOCKS5 密码')
          return
        }
        payload.socks_username = username
        payload.socks_password = password
      }
    }

    if (requiresRemoteTarget(normalizedMode)) {
      const remotePort = Number(createForm.remotePort)
      if (!createForm.remoteHost) {
        notificationStore.warn('请填写远程主机')
        return
      }
      if (!Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65535) {
        notificationStore.warn('远程端口必须是 1 到 65535 之间的整数')
        return
      }

      payload.remote_host = createForm.remoteHost
      payload.remote_port = remotePort
    }

    if (isEditMode.value) {
      await tunnelStore.updateTunnel(editingTunnelId.value, payload)
      notificationStore.success('Tunnel 已更新')
    } else {
      payload.beacon_id = createForm.beaconId
      payload.mode = normalizedMode
      if (typeof tunnelStore.createTunnel !== 'function') {
        throw new Error('Tunnel 创建接口不可用，请刷新页面后重试')
      }
      await tunnelStore.createTunnel(payload)
      notificationStore.success('Tunnel 已创建')
    }

    createVisible.value = false
    editingTunnelId.value = ''
    await refreshTunnels()
  } catch (err) {
    console.error(isEditMode.value ? '[ProxyPivotPage] 更新 Tunnel 失败:' : '[ProxyPivotPage] 创建 Tunnel 失败:', err)
  } finally {
    createSubmitting.value = false
  }
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

async function recycleChannels(tunnel) {
  if (!tunnel?.tunnelId) return
  const count = recyclableChannelCount.value
  if (!count) {
    notificationStore.info('当前没有可回收的终态 channel')
    return
  }

  try {
    await tunnelStore.recycleTunnelChannels(tunnel.tunnelId, count)
    notificationStore.success(`已回收 ${count} 个终态 channel`)
    await refreshTunnels()
  } catch (err) {
    console.error('[ProxyPivotPage] 回收 channel 失败:', err)
  }
}

function isLiveChannel(channel) {
  return ['pending', 'active'].includes(String(channel?.status || '').toLowerCase())
}

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

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '-'
  return String(Math.max(0, Math.trunc(numeric)))
}

function displayCount(...values) {
  for (const value of values) {
    const formatted = formatCount(value)
    if (formatted !== '-') return formatted
  }
  return '-'
}

function formatLatency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '-'
  return `${numeric} ms`
}

onMounted(refreshTunnels)
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
<div v-if="createVisible" class="modal-overlay proxy-pivot-modal">
        <div class="modal-card">
          <header class="modal-header">
            <div class="modal-title">
              <span class="icon">🧩</span>
              <div>
                <h3>{{ tunnelDialogTitle }}</h3>
                <span>{{ tunnelDialogDescription }}</span>
              </div>
            </div>
            <button class="close-btn" @click="closeTunnelDialog">×</button>
          </header>

          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Beacon</label>
                <select v-model="createForm.beaconId" class="form-control" :disabled="isEditMode">
                  <option value="" disabled>请选择 Beacon</option>
                  <option v-for="agent in availableAgents" :key="agent.beaconid" :value="agent.beaconid">
                    {{ agentLabel(agent.beaconid) }}
                  </option>
                </select>
              </div>

              <div class="form-group span-2">
                <label>模式</label>
                <select v-model="createForm.mode" class="form-control" :disabled="isEditMode">
                  <option v-for="item in tunnelModes" :key="item.value" :value="item.value">
                    {{ item.label }} - {{ item.description }}
                  </option>
                </select>
              </div>

              <template v-if="usesSocks5Mode">
                <div class="form-group span-2">
                  <label>SOCKS5 认证模式 *</label>
                  <select v-model="createForm.socksAuthMode" class="form-control">
                    <option v-for="item in socksAuthModes" :key="item.value" :value="item.value">
                      {{ item.label }} - {{ item.description }}
                    </option>
                  </select>
                </div>

                <div v-if="usesSocksUsernamePassword" class="form-group">
                  <label>SOCKS5 用户名 *</label>
                  <input v-model="createForm.socksUsername" type="text" class="form-control" placeholder="operator" />
                </div>

                <div v-if="usesSocksUsernamePassword" class="form-group">
                  <label>SOCKS5 密码 *</label>
                  <input v-model="createForm.socksPassword" type="password" class="form-control" placeholder="change-me" />
                </div>

                <div class="form-group span-2">
                  <label>SOCKS5 UDP ASSOCIATE *</label>
                  <label class="checkbox-row">
                    <input v-model="createForm.socksUdpAssociate" type="checkbox" />
                    <span>启用 UDP ASSOCIATE</span>
                  </label>
                </div>
              </template>

              <div class="form-group">
                <label>绑定地址</label>
                <input v-model="createForm.bindHost" type="text" class="form-control" placeholder="127.0.0.1" />
              </div>

              <div class="form-group">
                <label>绑定端口</label>
                <input v-model.number="createForm.bindPort" type="number" min="1" max="65535" step="1" class="form-control" />
              </div>

              <template v-if="requiresRemoteTarget(createForm.mode)">
                <div class="form-group">
                  <label>远程主机</label>
                  <input v-model="createForm.remoteHost" type="text" class="form-control" placeholder="127.0.0.1" />
                </div>

                <div class="form-group">
                  <label>远程端口</label>
                  <input v-model.number="createForm.remotePort" type="number" min="1" max="65535" step="1" class="form-control" />
                </div>
              </template>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn btn-ghost" @click="closeTunnelDialog">取消</button>
            <button class="btn btn-primary" :disabled="createSubmitting" @click="submitCreateTunnel">
              {{ tunnelDialogSubmitText }}
            </button>
          </footer>
        </div>
      </div>

<div v-if="detailVisible" class="modal-overlay proxy-pivot-modal">
        <div class="detail-card">
          <header class="modal-header">
            <div class="modal-title">
              <span class="icon">🔗</span>
              <div>
                <h3>Tunnel 连接</h3>
                <span>{{ activeTunnel ? `${formatTunnelType(activeTunnel.mode || activeTunnel.type)} · ${formatBind(activeTunnel)}` : '连接明细' }}</span>
              </div>
            </div>
            <button class="close-btn" @click="closeChannels">×</button>
          </header>

          <div class="detail-body">
            <div v-if="activeTunnel" class="metrics-grid">
              <div class="metric-card">
                <span>活跃连接</span>
                <strong>{{ displayCount(activeTunnel.activeChannels, activeTunnel.channelCount) }}</strong>
              </div>
              <div class="metric-card">
                <span>队列深度</span>
                <strong>{{ formatCount(activeTunnel.queueDepth) }}</strong>
              </div>
              <div class="metric-card">
                <span>丢弃次数</span>
                <strong>{{ formatCount(activeTunnel.dropCount) }}</strong>
              </div>
              <div class="metric-card">
                <span>超时次数</span>
                <strong>{{ formatCount(activeTunnel.timeoutCount) }}</strong>
              </div>
              <div class="metric-card">
                <span>首次响应</span>
                <strong>{{ formatLatency(activeTunnel.openLatencyMs) }}</strong>
              </div>
            </div>

            <div v-if="activeChannelLoading" class="state-line">正在读取连接列表...</div>
            <div v-else-if="activeChannelError" class="state-line error-state">{{ activeChannelError }}</div>
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
            <button class="btn btn-secondary" :disabled="!recyclableChannelCount" @click="recycleChannels(activeTunnel)">
              回收终态 ({{ recyclableChannelCount }})
            </button>
            <button class="btn btn-ghost" @click="closeChannels">关闭</button>
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
