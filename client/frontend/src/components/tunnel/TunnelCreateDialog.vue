<script setup>
/**
 * TunnelCreateDialog - 隧道创建/编辑弹窗
 *
 * 从 ProxyPivotPage 拆出。支持 create/edit 双模式,
 * 表单状态、校验、提交逻辑自包含。直接调用 tunnelStore + notificationStore。
 *
 * Props 传递 agents 列表与初始 beaconId;emit close/submitted 通知主组件。
 */

import { reactive, ref, computed, watch } from 'vue'
import { useNotificationStore } from '../../stores/notification.js'
import { useTunnelStore } from '../../stores/tunnel.js'
import {
  TUNNEL_MODES,
  SOCKS_AUTH_MODES,
  getModeDefaults,
  requiresRemoteTarget,
  shortId,
} from '../../utils/tunnelFormat.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'create' }, // 'create' | 'edit'
  editingTunnelId: { type: String, default: '' },
  beaconId: { type: String, default: '' },
  agents: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'submitted'])

const notificationStore = useNotificationStore()
const tunnelStore = useTunnelStore()

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

const isEditMode = computed(() => props.mode === 'edit')
const usesSocks5Mode = computed(() => String(createForm.mode || '').toLowerCase() === 'socks5')
const usesSocksUsernamePassword = computed(() => String(createForm.socksAuthMode || '').toLowerCase() === 'username_password')
const tunnelDialogTitle = computed(() => isEditMode.value ? '编辑网络隧道' : '新建网络隧道')
const tunnelDialogDescription = computed(() => isEditMode.value ? '修改已暂停 Tunnel 的监听与认证参数，保存后可继续恢复' : '通过 Beacon 创建统一 Tunnel')
const tunnelDialogSubmitText = computed(() => {
  if (createSubmitting.value) return isEditMode.value ? '保存中...' : '创建中...'
  return isEditMode.value ? '保存修改' : '创建隧道'
})

function findAgent(beaconId) {
  const id = String(beaconId || '')
  return props.agents.find(agent => agent.beaconid === id || agent.beaconid.startsWith(id) || id.startsWith(agent.beaconid)) || null
}

function agentLabel(beaconId) {
  const agent = findAgent(beaconId)
  if (!agent) return shortId(beaconId)
  return `${agent.hostname || 'Unknown'} · ${shortId(agent.beaconid)}`
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

// 弹窗打开时初始化表单(由主组件通过 visible + mode + editingTunnel 控制)
watch(() => props.visible, (visible) => {
  if (!visible) return
  if (isEditMode.value && props.editingTunnelId) {
    // edit 模式:主组件应已通过 openEditModal 设置好,这里不重复填充
    return
  }
  if (!createForm.beaconId && props.beaconId) {
    createForm.beaconId = props.beaconId
  }
})

// create 模式下切换 mode 时重置默认值
watch(() => createForm.mode, (mode) => {
  if (isEditMode.value) return
  const normalized = String(mode || '').toLowerCase()
  Object.assign(createForm, getModeDefaults(normalized))
})

// 暴露给主组件填充 edit 表单
defineExpose({ resetTunnelForm, fillTunnelFormFromTunnel })

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

  if (isEditMode.value && !props.editingTunnelId) {
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
      await tunnelStore.updateTunnel(props.editingTunnelId, payload)
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

    emit('submitted')
  } catch (err) {
    console.error(isEditMode.value ? '[TunnelCreateDialog] 更新 Tunnel 失败:' : '[TunnelCreateDialog] 创建 Tunnel 失败:', err)
  } finally {
    createSubmitting.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <div v-if="visible" class="modal-overlay proxy-pivot-modal">
    <div class="modal-card">
      <header class="modal-header">
        <div class="modal-title">
          <span class="icon">🧩</span>
          <div>
            <h3>{{ tunnelDialogTitle }}</h3>
            <span>{{ tunnelDialogDescription }}</span>
          </div>
        </div>
        <button class="close-btn" @click="close">×</button>
      </header>

      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Beacon</label>
            <select v-model="createForm.beaconId" class="form-control" :disabled="isEditMode">
              <option value="" disabled>请选择 Beacon</option>
              <option v-for="agent in agents" :key="agent.beaconid" :value="agent.beaconid">
                {{ agentLabel(agent.beaconid) }}
              </option>
            </select>
          </div>

          <div class="form-group span-2">
            <label>模式</label>
            <select v-model="createForm.mode" class="form-control" :disabled="isEditMode">
              <option v-for="item in TUNNEL_MODES" :key="item.value" :value="item.value">
                {{ item.label }} - {{ item.description }}
              </option>
            </select>
          </div>

          <template v-if="usesSocks5Mode">
            <div class="form-group span-2">
              <label>SOCKS5 认证模式 *</label>
              <select v-model="createForm.socksAuthMode" class="form-control">
                <option v-for="item in SOCKS_AUTH_MODES" :key="item.value" :value="item.value">
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
        <button class="btn btn-ghost" @click="close">取消</button>
        <button class="btn btn-primary" :disabled="createSubmitting" @click="submitCreateTunnel">
          {{ tunnelDialogSubmitText }}
        </button>
      </footer>
    </div>
  </div>
</template>
