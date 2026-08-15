<script setup lang="ts">
/**
 * TunnelCreateDialog - 隧道创建/编辑弹窗
 *
 * 从 ProxyPivotPage 拆出。支持 create/edit 双模式,
 * 表单状态、校验、提交逻辑自包含。直接调用 tunnelStore + notificationStore。
 *
 * Props 传递 agents 列表与初始 beaconId;emit close/submitted 通知主组件。
 */

import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from '../../stores/notification'
import { useTunnelStore } from '../../stores/tunnel'
import type { Beacon } from '../../features/beacon/model'
import type { Tunnel } from '../../features/tunnel/model'
import type { StartTunnelRequest, UpdateTunnelRequest } from '../../features/tunnel/api/types'
import {
  TUNNEL_MODES,
  SOCKS_AUTH_MODES,
  getModeDefaults,
  requiresRemoteTarget,
  shortId,
} from '../../utils/tunnelFormat'

const props = defineProps<{
  visible?: boolean
  mode?: string
  editingTunnelId?: string
  beaconId?: string
  agents?: Beacon[]
}>()

const emit = defineEmits(['close', 'submitted'])

const { t } = useI18n()
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
const tunnelDialogTitle = computed(() => isEditMode.value ? t('tunnelDialog.titleEdit') : t('tunnelDialog.titleCreate'))
const tunnelDialogDescription = computed(() => isEditMode.value ? t('tunnelDialog.descEdit') : t('tunnelDialog.descCreate'))
const tunnelDialogSubmitText = computed(() => {
  if (createSubmitting.value) return isEditMode.value ? t('tunnelDialog.submittingEdit') : t('tunnelDialog.submittingCreate')
  return isEditMode.value ? t('tunnelDialog.submitEdit') : t('tunnelDialog.submitCreate')
})

function findAgent(beaconId: string) {
  const id = String(beaconId || '')
  return props.agents?.find(agent => agent.beaconid === id || agent.beaconid.startsWith(id) || id.startsWith(agent.beaconid)) || null
}

function agentLabel(beaconId: string) {
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

function fillTunnelFormFromTunnel(tunnel: Tunnel) {
  const mode = String(tunnel?.mode || tunnel?.type || 'socks5').toLowerCase()
  Object.assign(createForm, {
    beaconId: String(tunnel?.beaconId || ''),
    mode,
    bindHost: tunnel?.bindHost || (mode === 'socks5' ? '127.0.0.1' : '0.0.0.0'),
    bindPort: Number(tunnel?.bindPort || 0),
    remoteHost: tunnel?.remoteHost || '',
    remotePort: Number(tunnel?.remotePort || 0),
    socksAuthMode: String(tunnel?.socksAuthMode || 'no_auth').toLowerCase(),
    socksUsername: String(tunnel?.socksUsername || (tunnel?.raw as Record<string, unknown> | undefined)?.socks_username || '').trim(),
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
    notificationStore.warn(t('tunnelDialog.errNoBeacon'))
    return
  }

  const bindPort = Number(createForm.bindPort)
  if (!Number.isInteger(bindPort) || bindPort <= 0 || bindPort > 65535) {
    notificationStore.warn(t('tunnelDialog.errBindPort'))
    return
  }

  const normalizedMode = String(createForm.mode || '').toLowerCase()
  const allowedModes = ['socks5', 'port_forward', 'reverse_port_map']
  if (!allowedModes.includes(normalizedMode)) {
    notificationStore.warn(t('tunnelDialog.errMode'))
    return
  }

  if (isEditMode.value && !props.editingTunnelId) {
    notificationStore.warn(t('tunnelDialog.errEditTarget'))
    return
  }

  createSubmitting.value = true
  try {
    const payload: Record<string, unknown> = {
      bind_host: createForm.bindHost || (normalizedMode === 'socks5' ? '127.0.0.1' : '0.0.0.0'),
      bind_port: bindPort,
    }

    if (normalizedMode === 'socks5') {
      const socksAuthMode = String(createForm.socksAuthMode || '').toLowerCase()
      if (!['no_auth', 'username_password'].includes(socksAuthMode)) {
        notificationStore.warn(t('tunnelDialog.errSocksAuth'))
        return
      }

      payload.socks_auth_mode = socksAuthMode
      payload.socks_udp_associate = Boolean(createForm.socksUdpAssociate)

      if (socksAuthMode === 'username_password') {
        const username = String(createForm.socksUsername || '').trim()
        const password = String(createForm.socksPassword || '').trim()
        if (!username) {
          notificationStore.warn(t('tunnelDialog.errUsername'))
          return
        }
        if (!password) {
          notificationStore.warn(t('tunnelDialog.errPassword'))
          return
        }
        payload.socks_username = username
        payload.socks_password = password
      }
    }

    if (requiresRemoteTarget(normalizedMode)) {
      const remotePort = Number(createForm.remotePort)
      if (!createForm.remoteHost) {
        notificationStore.warn(t('tunnelDialog.errRemoteHost'))
        return
      }
      if (!Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65535) {
        notificationStore.warn(t('tunnelDialog.errRemotePort'))
        return
      }

      payload.remote_host = createForm.remoteHost
      payload.remote_port = remotePort
    }

    if (isEditMode.value) {
      await tunnelStore.updateTunnel(props.editingTunnelId ?? '', payload as unknown as UpdateTunnelRequest)
      notificationStore.success(t('tunnelDialog.updated'))
    } else {
      payload.beacon_id = createForm.beaconId
      payload.mode = normalizedMode
      if (typeof tunnelStore.createTunnel !== 'function') {
        throw new Error(t('tunnelDialog.apiUnavailable'))
      }
      await tunnelStore.createTunnel(payload as unknown as StartTunnelRequest)
      notificationStore.success(t('tunnelDialog.created'))
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
            <label>{{ t('tunnelDialog.beaconLabel') }}</label>
            <select v-model="createForm.beaconId" class="form-control" :disabled="isEditMode">
              <option value="" disabled>{{ t('tunnelDialog.selectBeacon') }}</option>
              <option v-for="agent in agents" :key="agent.beaconid" :value="agent.beaconid">
                {{ agentLabel(agent.beaconid) }}
              </option>
            </select>
          </div>

          <div class="form-group span-2">
            <label>{{ t('tunnelDialog.modeLabel') }}</label>
            <select v-model="createForm.mode" class="form-control" :disabled="isEditMode">
              <option v-for="item in TUNNEL_MODES" :key="item.value" :value="item.value">
                {{ item.labelKey ? t(item.labelKey) : item.label }} - {{ t(item.descriptionKey) }}
              </option>
            </select>
          </div>

          <template v-if="usesSocks5Mode">
            <div class="form-group span-2">
              <label>{{ t('tunnelDialog.socksAuthLabel') }}</label>
              <select v-model="createForm.socksAuthMode" class="form-control">
                <option v-for="item in SOCKS_AUTH_MODES" :key="item.value" :value="item.value">
                  {{ t(item.labelKey) }} - {{ t(item.descriptionKey) }}
                </option>
              </select>
            </div>

            <div v-if="usesSocksUsernamePassword" class="form-group">
              <label>{{ t('tunnelDialog.socksUsername') }}</label>
              <input v-model="createForm.socksUsername" type="text" class="form-control" placeholder="operator" />
            </div>

            <div v-if="usesSocksUsernamePassword" class="form-group">
              <label>{{ t('tunnelDialog.socksPassword') }}</label>
              <input v-model="createForm.socksPassword" type="password" class="form-control" placeholder="change-me" />
            </div>

            <div class="form-group span-2">
              <label>{{ t('tunnelDialog.socksUdp') }}</label>
              <label class="checkbox-row">
                <input v-model="createForm.socksUdpAssociate" type="checkbox" />
                <span>{{ t('tunnelDialog.socksUdpEnable') }}</span>
              </label>
            </div>
          </template>

          <div class="form-group">
            <label>{{ t('tunnelDialog.bindHost') }}</label>
            <input v-model="createForm.bindHost" type="text" class="form-control" placeholder="127.0.0.1" />
          </div>

          <div class="form-group">
            <label>{{ t('tunnelDialog.bindPort') }}</label>
            <input v-model.number="createForm.bindPort" type="number" min="1" max="65535" step="1" class="form-control" />
          </div>

          <template v-if="requiresRemoteTarget(createForm.mode)">
            <div class="form-group">
              <label>{{ t('tunnelDialog.remoteHost') }}</label>
              <input v-model="createForm.remoteHost" type="text" class="form-control" placeholder="127.0.0.1" />
            </div>

            <div class="form-group">
              <label>{{ t('tunnelDialog.remotePort') }}</label>
              <input v-model.number="createForm.remotePort" type="number" min="1" max="65535" step="1" class="form-control" />
            </div>
          </template>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-ghost" @click="close">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="createSubmitting" @click="submitCreateTunnel">
          {{ tunnelDialogSubmitText }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.proxy-pivot-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  z-index: 3000;
}

.modal-card {
  width: min(760px, 100%);
  max-height: min(90vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.modal-header {
  flex: 0 0 auto;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-card);
}

.modal-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-title .icon {
  flex: 0 0 auto;
  font-size: 24px;
  line-height: 1;
}

.modal-title h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.modal-title span:not(.icon) {
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.close-btn {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}

.modal-body {
  min-height: 0;
  padding: 20px;
  overflow: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.form-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group.span-2 {
  grid-column: span 2;
}

.form-group > label:first-child {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.3;
}

.form-control {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.form-control:focus {
  border-color: var(--color-primary);
  outline: none;
}

.checkbox-row {
  min-height: 38px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
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
  flex: 0 0 auto;
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}

.btn {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.btn-ghost {
  border-color: var(--border-light);
  background: transparent;
  color: var(--text-muted);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 620px) {
  .proxy-pivot-modal {
    padding: 12px;
  }

  .modal-card {
    max-height: 94vh;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-group.span-2 {
    grid-column: span 1;
  }

  .modal-footer {
    flex-wrap: wrap;
  }
}
</style>
