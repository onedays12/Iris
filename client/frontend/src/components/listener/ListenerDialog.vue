<script setup>
/**
 * ListenerDialog - 监听器创建/编辑对话框
 * 支持 HTTP/HTTPS/DNS/External/SMB 等协议的监听器配置，
 * 包含端口、C2 Profile、回调地址等参数表单。
 */

import { ref, computed, watch } from 'vue'
import { useNotificationStore } from '../../stores/notification.js'
import { useListenerStore } from '../../stores/listener.js'

const props = defineProps({
  editData: { type: Object, default: null }
})

const notificationStore = useNotificationStore()
const listenerStore = useListenerStore()
const emit = defineEmits(['confirm', 'cancel'])

const isEdit = computed(() => !!props.editData)

const protocols = ['HTTP', 'HTTPS']
const internalProtocols = ['TCP', 'SMB']
const listenerTypes = [
  { value: 'external', label: '外部 (TeamServer)', desc: 'TeamServer 直接监听' },
  { value: 'internal', label: '内部 (P2P/Beacon)', desc: '由 Beacon 承载' }
]
const profileOptions = [
  { value: 'http-default', label: 'http-default', desc: '普通 HTTP/HTTPS C2，不启用 Stager。', stager: false },
  { value: 'http-stager', label: 'http-stager', desc: '启用 HTTP Stager，需要填写 stage 下载端点。', stager: true },
]

function defaultForm() {
  return {
    name: '',
    protocol: 'http',
    listener_type: 'external',
    profile: 'http-default',
    host: '0.0.0.0',
    port: 4444,
    callback_host: '',
    callback_port: 4444,
    ssl_cert: '',
    ssl_key: '',
    encrypt_key: '',
    pipe_name: '',
    stager: {
      bind_host: '0.0.0.0',
      bind_port: 8081,
      callback_host: '',
      callback_port: 8081,
    },
  }
}

const form = ref(defaultForm())

const selectedProfile = computed(() => profileOptions.find(item => item.value === form.value.profile))
const profileRequiresStager = computed(() => Boolean(selectedProfile.value?.stager))
const profileDescription = computed(() => selectedProfile.value?.desc || '自定义 c2profile；仅提交实例端点。')
const isInternal = computed(() => form.value.listener_type === 'internal')
const availableProtocols = computed(() => isInternal.value ? internalProtocols : protocols)

function parseListenerConfig(config) {
  if (!config) return {}
  if (typeof config === 'string') {
    try {
      return JSON.parse(config)
    } catch {
      return {}
    }
  }
  if (typeof config === 'object' && !Array.isArray(config)) {
    return config
  }
  return {}
}

function splitHostPort(value, fallbackPort) {
  const text = String(value || '').trim()
  if (!text) return { host: '', port: fallbackPort }

  const bracket = text.match(/^\[([^\]]+)\]:(\d+)$/)
  if (bracket) {
    return { host: bracket[1], port: Number(bracket[2]) || fallbackPort }
  }

  const lastColon = text.lastIndexOf(':')
  if (lastColon > 0 && text.indexOf(':') === lastColon) {
    const maybePort = text.slice(lastColon + 1)
    if (/^\d+$/.test(maybePort)) {
      return { host: text.slice(0, lastColon), port: Number(maybePort) || fallbackPort }
    }
  }

  return { host: text, port: fallbackPort }
}

function hostHasPort(value) {
  const text = String(value || '').trim()
  if (/^\[[^\]]+\]:\d+$/.test(text)) return true
  const lastColon = text.lastIndexOf(':')
  if (lastColon <= 0 || text.indexOf(':') !== lastColon) return false
  return /^\d+$/.test(text.slice(lastColon + 1))
}

function validateHostOnly(value, label, { allowUnspecified = true } = {}) {
  const host = String(value || '').trim()
  if (!host) {
    notificationStore.error(`${label}不能为空`)
    return ''
  }
  if (host.includes('://') || hostHasPort(host)) {
    notificationStore.error(`${label}只能填写 host/IP，不能包含协议或端口`)
    return ''
  }
  if (!allowUnspecified && (host === '0.0.0.0' || host === '::')) {
    notificationStore.error(`${label}必须是 Beacon 可访问的地址，不能使用 0.0.0.0 或 ::`)
    return ''
  }
  return host
}

function parsePort(value, label) {
  const port = parseInt(value, 10)
  if (isNaN(port) || port < 1 || port > 65535) {
    notificationStore.error(`${label}必须在 1-65535 之间`)
    return null
  }
  return port
}

function inferProfile(config) {
  if (typeof config.profile === 'string' && config.profile.trim()) return config.profile.trim()
  if (config.stager && typeof config.stager === 'object' && Object.keys(config.stager).length) return 'http-stager'
  return 'http-default'
}

// 监听编辑数据并还原表单
watch(() => props.editData, (newVal) => {
  if (newVal) {
    const config = parseListenerConfig(newVal.config)
    const callback = splitHostPort(config.callback_host || '', Number(config.callback_port ?? config.port ?? newVal.bind_port ?? 4444))
    const stager = config.stager && typeof config.stager === 'object' ? config.stager : {}

    form.value.name = newVal.name
    form.value.protocol = (newVal.protocol || config.protocol || 'http').toLowerCase()
    form.value.listener_type = newVal.listener_type || 'external'
    form.value.profile = inferProfile(config)
    form.value.host = config.bind_host || config.host || newVal.bind_addr || '0.0.0.0'
    form.value.port = Number(config.bind_port ?? config.port ?? newVal.bind_port ?? 4444)
    form.value.callback_host = callback.host
    form.value.callback_port = callback.port
    form.value.ssl_cert = config.ssl_cert || ''
    form.value.ssl_key = config.ssl_key || ''
    form.value.encrypt_key = config.encrypt_key || ''
    form.value.pipe_name = config.pipe_name || ''
    form.value.stager = {
      bind_host: stager.bind_host || stager.host || '0.0.0.0',
      bind_port: Number(stager.bind_port ?? stager.port ?? 8081),
      callback_host: stager.callback_host || callback.host || '',
      callback_port: Number(stager.callback_port ?? 8081),
    }
  } else {
    resetForm()
  }
}, { immediate: true })

// 切换监听器类型时重置协议
watch(() => form.value.listener_type, (newType) => {
  if (newType === 'internal' && ['http', 'https'].includes(form.value.protocol)) {
    form.value.protocol = 'tcp'
  } else if (newType === 'external' && ['tcp', 'smb'].includes(form.value.protocol)) {
    form.value.protocol = 'http'
  }
})

const showAdvanced = ref(false)
const loading = ref(false)

function generateEncryptKey() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  form.value.encrypt_key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function handleConfirm() {
  // 1. 尝试进入锁定状态
  loading.value = true
  try {
    // 2. 必填项强校验 (采用可选链防止 undefined 崩溃)
    const name = form.value.name?.trim() || ''
    const protocol = String(form.value.protocol || '').toLowerCase()
    const profile = String(form.value.profile || '').trim()

    if (!name) {
      notificationStore.error('监听器名称不能为空')
      return
    }

    const encryptKey = String(form.value.encrypt_key || '').trim()
    if (!encryptKey) {
      notificationStore.error('通信加密密钥不能为空')
      return
    }

    // Internal TCP/SMB 模式
    if (isInternal.value) {
      if (!['tcp', 'smb'].includes(protocol)) {
        notificationStore.error('Internal 监听器只支持 TCP / SMB')
        return
      }

      let payload
      if (protocol === 'tcp') {
        const host = validateHostOnly(form.value.host, '绑定地址 (Host)')
        if (!host) return
        const port = parsePort(form.value.port, '监听端口')
        if (port === null) return
        payload = {
          name,
          protocol: 'tcp',
          listener_type: 'internal',
          profile: profile || 'http-default',
          encrypt_key: encryptKey,
          bind_host: host,
          bind_port: port,
          connect_timeout: 5000,
        }
      } else {
        const pipeName = String(form.value.pipe_name || '').trim()
        if (!pipeName) {
          notificationStore.error('SMB Pipe 名称不能为空')
          return
        }
        payload = {
          name,
          protocol: 'smb',
          listener_type: 'internal',
          profile: profile || 'http-default',
          encrypt_key: encryptKey,
          pipe_name: pipeName,
          connect_timeout: 5000,
        }
      }

      if (isEdit.value) {
        await listenerStore.updateListener(payload)
        notificationStore.success(`监听器 ${name} 配置已成功热更新`)
      } else {
        const newListener = await listenerStore.createListener(payload)
        if (newListener && newListener.status === 'error') {
          notificationStore.error(`部署失败：配置错误`)
          return
        }
        notificationStore.success(`监听器 ${name} 部署成功并已启动`)
      }
      emit('confirm')
      resetForm()
      return
    }

    // External HTTP/HTTPS 模式
    if (!['http', 'https'].includes(protocol)) {
      notificationStore.error('当前 c2profile listener 只支持 HTTP / HTTPS')
      return
    }
    if (!profile) {
      notificationStore.error('请选择 C2 Profile')
      return
    }
    const host = validateHostOnly(form.value.host, '绑定地址 (Host)')
    if (!host) return
    const port = parsePort(form.value.port, '监听端口')
    if (port === null) return
    const callbackHost = validateHostOnly(form.value.callback_host, '回连地址 (Callback Host)', { allowUnspecified: false })
    if (!callbackHost) return
    const callbackPort = parsePort(form.value.callback_port, '回连端口')
    if (callbackPort === null) return

    let stagerConfig = undefined
    if (profileRequiresStager.value) {
      const stager = form.value.stager || {}
      const stagerBindHost = validateHostOnly(stager.bind_host, 'Stager 监听地址 (Bind Host)')
      if (!stagerBindHost) return
      const stagerBindPort = parsePort(stager.bind_port, 'Stager 监听端口')
      if (stagerBindPort === null) return
      const stagerCallbackHost = validateHostOnly(stager.callback_host, 'Stager 下载地址 (Callback Host)', { allowUnspecified: false })
      if (!stagerCallbackHost) return
      const stagerCallbackPort = parsePort(stager.callback_port, 'Stager 下载端口')
      if (stagerCallbackPort === null) return

      stagerConfig = {
        bind_host: stagerBindHost,
        bind_port: stagerBindPort,
        callback_host: stagerCallbackHost,
        callback_port: stagerCallbackPort,
      }
    }

    // 基础元数据 (对齐新契约字段)
    const payload = {
      name: name,
      protocol,
      listener_type: form.value.listener_type,
      profile,
      host,
      port,
      callback_host: callbackHost,
      callback_port: callbackPort,
      encrypt_key: encryptKey,
      ...(form.value.ssl_cert ? { ssl_cert: form.value.ssl_cert } : {}),
      ...(form.value.ssl_key ? { ssl_key: form.value.ssl_key } : {}),
      ...(stagerConfig ? { stager: stagerConfig } : {}),
    }

    if (isEdit.value) {
      await listenerStore.updateListener(payload)
      notificationStore.success(`监听器 ${name} 配置已成功热更新`)
    } else {
      const newListener = await listenerStore.createListener(payload)
      
      // 3. 二次质检：检查监听器是否真的“跑起来了”
      if (newListener && newListener.status === 'error') {
        notificationStore.error(`部署失败：端口可能已被占用或配置错误`)
        return 
      }
      notificationStore.success(`监听器 ${name} 部署成功并已启动`)
    }
    emit('confirm') 
    resetForm()
  } catch (err) {
    // 双重保障提示
    const msg = err.message || '操作失败，请检查 TeamServer 状态'
    if (!msg.includes('TeamServer')) { // 避免与请求层错误提示重复弹出
       notificationStore.error(msg)
    }
    console.error('操作执行异常:', err)
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  emit('cancel')
  resetForm()
}

function resetForm() {
  form.value = defaultForm()
  
  // 仅在新建模式下自动生成密钥
  if (!isEdit.value) {
    generateEncryptKey()
  }
}
</script>

<template>
<div class="modal-overlay">
    <div class="listener-modal glass-card">
      <header class="modal-header">
        <div class="modal-header-main">
          <div class="modal-title">
            <span class="title-icon">{{ isEdit ? '📝' : '📡' }}</span>
            <div>
              <div class="header-tag">LISTENER CONFIG</div>
              <h2>{{ isEdit ? '编辑监听器' : '部署新监听器' }}</h2>
            </div>
          </div>
          <p class="modal-desc">{{ isEdit ? '更新实例端点并重新解析 C2 Profile' : '选择 C2 Profile，填写实例端点和通信密钥' }}</p>
        </div>
        <button
          type="button"
          class="modal-close-btn"
          @click="handleCancel"
          aria-label="取消"
          title="取消"
        >
          ×
        </button>
      </header>

      <div class="form-container">
        <!-- 基础配置组 -->
        <section class="form-section">
          <div class="section-heading">
            <h3 class="section-title">基础信息</h3>
            <span class="profile-badge" :class="{ stager: profileRequiresStager }">{{ form.profile }}</span>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>监听器名称 {{ isEdit ? '(不可更改)' : '' }}</label>
              <input 
                v-model="form.name" 
                type="text" 
                placeholder="例如: LST-01" 
                class="glass-input"
                :disabled="isEdit"
              >
            </div>
            <div class="form-group">
              <label>传输协议 {{ isEdit ? '(不可更改)' : '' }}</label>
              <select v-model="form.protocol" class="glass-input" :disabled="isEdit">
                <option v-for="p in availableProtocols" :key="p" :value="p.toLowerCase()">{{ p }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>监听器类型 {{ isEdit ? '(不可更改)' : '' }}</label>
              <select v-model="form.listener_type" class="glass-input ltype-select" :disabled="isEdit">
                <option v-for="lt in listenerTypes" :key="lt.value" :value="lt.value">
                  {{ lt.label }}
                </option>
              </select>
              <p class="field-hint">{{ listenerTypes.find(lt => lt.value === form.listener_type)?.desc }}</p>
            </div>
            <div class="form-group">
              <label>C2 Profile</label>
              <select v-model="form.profile" class="glass-input">
                <option v-for="profile in profileOptions" :key="profile.value" :value="profile.value">
                  {{ profile.label }}
                </option>
              </select>
              <p class="field-hint">{{ profileDescription }}</p>
            </div>

          </div>
          <div v-if="form.listener_type === 'internal'" class="internal-info">
            <span class="info-icon">💡</span>
            <p>Internal 类型监听器由 Beacon 承载，不占用 TeamServer 端口，仅作为 P2P 元数据存在。</p>
          </div>
          <div class="profile-note">
            <span class="note-icon">📄</span>
            <span>URI、User-Agent、响应头、sleep/jitter、Stager Base URI 等由 c2profile YAML 管理。</span>
          </div>
        </section>

        <!-- 网络配置组 -->
        <section class="form-section">
          <div class="section-heading">
            <h3 class="section-title">主 Listener 端点</h3>
          </div>
          <div v-if="isInternal && form.protocol === 'smb'" class="endpoint-grid">
            <div class="endpoint-card">
              <div class="endpoint-head">
                <span>SMB Pipe</span>
                <small>Beacon 承载的命名管道</small>
              </div>
              <div class="form-group">
                <label>Pipe 名称</label>
                <input v-model="form.pipe_name" type="text" class="glass-input mono" placeholder="\\.\pipe\beacon_internal">
              </div>
              <p class="field-hint">SMB 管道路径，由 Beacon 创建并监听。</p>
            </div>
          </div>
          <div v-else class="endpoint-grid">
            <div class="endpoint-card">
              <div class="endpoint-head">
                <span>Bind</span>
                <small>{{ isInternal ? 'Beacon 本地监听' : 'TeamServer 本地监听' }}</small>
              </div>
              <div class="endpoint-row">
                <div class="field host-field">
                  <label>Host</label>
                  <input v-model="form.host" type="text" class="glass-input mono" placeholder="0.0.0.0">
                </div>
                <div class="field port-field">
                  <label>Port</label>
                  <input v-model="form.port" type="number" class="glass-input mono" placeholder="4444">
                </div>
              </div>
              <p class="field-hint">只填 host/IP，不要包含协议或端口。</p>
            </div>
            <div v-if="!isInternal" class="endpoint-card callback">
              <div class="endpoint-head">
                <span>Callback</span>
                <small>Beacon 实际访问</small>
              </div>
              <div class="endpoint-row">
                <div class="field host-field">
                  <label>Host</label>
                  <input v-model="form.callback_host" type="text" class="glass-input mono" placeholder="192.168.1.10" required>
                </div>
                <div class="field port-field">
                  <label>Port</label>
                  <input v-model="form.callback_port" type="number" class="glass-input mono" placeholder="4444">
                </div>
              </div>
              <p class="field-hint">不能使用 0.0.0.0 或 ::。</p>
            </div>
          </div>
        </section>

        <section class="form-section" v-if="!isInternal && profileRequiresStager">
          <div class="section-header">
            <h3 class="section-title">HTTP Stager 端点</h3>
          </div>
          <div class="endpoint-grid compact">
            <div class="endpoint-card">
              <div class="endpoint-head">
                <span>Stage Bind</span>
                <small>下载服务监听</small>
              </div>
              <div class="endpoint-row">
                <div class="field host-field">
                  <label>Host</label>
                  <input v-model="form.stager.bind_host" type="text" class="glass-input mono" placeholder="0.0.0.0">
                </div>
                <div class="field port-field">
                  <label>Port</label>
                  <input v-model="form.stager.bind_port" type="number" class="glass-input mono" min="1" max="65535">
                </div>
              </div>
            </div>
            <div class="endpoint-card callback">
              <div class="endpoint-head">
                <span>Stage Callback</span>
                <small>Beacon 下载 stage</small>
              </div>
              <div class="endpoint-row">
                <div class="field host-field">
                  <label>Host</label>
                  <input v-model="form.stager.callback_host" type="text" class="glass-input mono" placeholder="192.168.1.10">
                </div>
                <div class="field port-field">
                  <label>Port</label>
                  <input v-model="form.stager.callback_port" type="number" class="glass-input mono" min="1" max="65535">
                </div>
              </div>
            </div>
          </div>
          <p class="field-hint inline-hint">base_uri、HTTPS、chunk size 等来自 c2profile。</p>
        </section>

        <!-- 安全配置 -->
        <section v-if="!isInternal" class="form-section">
          <div class="section-heading">
            <h3 class="section-title">安全加密</h3>
          </div>
          <div class="form-grid security-row">
            <div class="form-group span-4">
              <label>通信加密密钥 (AES Key)</label>
              <div class="input-with-action">
                <input v-model="form.encrypt_key" type="text" class="glass-input mono" placeholder="00112233445566778899aabbccddeeff">
                <button type="button" @click="generateEncryptKey" class="btn-small glass-btn" title="重新生成密钥">重新生成</button>
              </div>
              <p class="field-hint">实例级密钥，不来自 c2profile。</p>
            </div>
          </div>
        </section>

        <div v-if="!isInternal" class="advanced-toggle" @click="showAdvanced = !showAdvanced">
          <span>{{ showAdvanced ? '收起' : '展开' }} TLS 证书</span>
        </div>

        <div class="advanced-panel" v-if="showAdvanced">
          <!-- 证书输入 -->
          <section class="form-section">
            <h3 class="section-title">SSL 证书链 (PEM 格式)</h3>
            <p class="field-hint">仅 protocol=https 时使用；留空则由后端按当前能力处理。</p>
            <div class="cert-grid">
              <div class="form-group">
                <label>SSL Certificate</label>
                <textarea v-model="form.ssl_cert" class="glass-input area mono" placeholder="-----BEGIN CERTIFICATE-----"></textarea>
              </div>
              <div class="form-group">
                <label>SSL Private Key</label>
                <textarea v-model="form.ssl_key" class="glass-input area mono" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-ghost" @click="handleCancel" :disabled="loading">取消</button>
        <button class="btn btn-primary" @click="handleConfirm" :disabled="loading">
          <span v-if="loading" class="spin inline-spin"></span>
          {{ loading ? '保存中...' : (isEdit ? '保存更改' : '确认部署') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.spin {
  animation: spin 1s linear infinite;
}

.inline-spin {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  margin-right: 8px;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.flex-row {
  display: flex;
  gap: 24px;
}

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.internal-info {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(var(--color-primary-rgb), 0.1);
  border-left: 3px solid var(--color-primary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.info-icon {
  font-size: 16px;
}

.ltype-select {
  border-color: rgba(var(--color-primary-rgb), 0.3);
  font-weight: 600;
}

.large-modal {
  width: 700px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid var(--border-light);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
}

.modal-header-main {
  min-width: 0;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.title-icon {
  font-size: 24px;
}

.modal-desc {
  color: var(--text-muted);
  font-size: 13px;
}

.modal-close-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-close-btn:hover {
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-primary);
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  opacity: 0.9;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.security-row {
  margin-top: 16px;
  grid-template-columns: repeat(4, 1fr);
}

.span-3 {
  grid-column: span 3;
}

.span-2 {
  grid-column: span 2;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.glass-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  transition: all 0.2s;
}

.input-with-action {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 0 12px;
  background: rgba(var(--color-primary-rgb), 0.1);
  border: 1px solid rgba(var(--color-primary-rgb), 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: 0.2s;
}

.btn-small:hover {
  background: rgba(var(--color-primary-rgb), 0.3);
}

.glass-input:focus {
  outline: none;
  background: var(--bg-input-focus);
  border-color: var(--color-primary);
  outline: 3px solid var(--color-primary-dim);
}

.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.area {
  height: 120px;
  resize: none;
}

/* Checkbox */
.form-check-group {
  margin-top: 8px;
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

/* 高级面板 */
.advanced-toggle {
  padding: 12px;
  background: rgba(var(--color-primary-rgb), 0.1);
  border-radius: 6px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: 0.2s;
}

.advanced-toggle:hover {
  background: rgba(var(--color-primary-rgb), 0.2);
}

.advanced-panel {
  padding: 16px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Header 编辑器 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-item {
  display: flex;
  gap: 8px;
}

.mini {
  width: 150px;
}

.btn-icon {
  background: rgba(15, 23, 42, 0.05);
  border: none;
  color: var(--text-primary);
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-icon:hover {
  background: var(--color-primary);
}

.btn-icon.danger:hover {
  background: var(--color-danger);
}

.cert-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.modal-footer {
  margin-top: 32px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Polished listener dialog layout */
.modal-overlay {
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 24px;
}

.listener-modal {
  width: min(780px, 94vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.10) 38%, rgba(255, 255, 255, 0.04)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-modal-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  border: 1px solid var(--glass-border-strong);
  border-radius: 24px;
  box-shadow: var(--shadow-lg);
}

.listener-modal.glass-card:hover {
  border-color: rgba(var(--color-primary-rgb), 0.16);
  box-shadow: var(--shadow-lg);
}

.modal-header {
  align-items: center;
  padding: 22px 26px 18px;
  margin: 0;
  border-bottom: 1px solid var(--border-light);
  background:
    radial-gradient(circle at top left, rgba(79, 70, 229, 0.16), transparent 32%),
    linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0.38));
}

.modal-title {
  margin: 0;
  align-items: center;
}

.title-icon {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--color-primary-dim);
  border: 1px solid rgba(79, 70, 229, 0.14);
  font-size: 21px;
}

.header-tag {
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 1.4px;
  color: var(--color-primary);
  margin-bottom: 6px;
}

.modal-title h2 {
  margin: 0;
  font-size: 23px;
  line-height: 1.15;
  letter-spacing: -0.4px;
  color: var(--text-primary);
}

.modal-desc {
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-muted);
}

.modal-close-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-muted);
  font-size: 22px;
}

.modal-close-btn:hover {
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-primary);
}

.form-container {
  padding: 18px 24px 20px;
  gap: 14px;
  overflow-y: auto;
}

.form-section {
  padding: 16px;
  gap: 14px;
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid var(--border-light);
  border-radius: 18px;
}

.section-heading,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  color: var(--color-primary);
  letter-spacing: 0.9px;
}

.section-title::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--color-primary);
  outline: 4px solid var(--color-primary-dim);
}

.profile-badge {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
}

.profile-badge.stager {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.22);
  color: #0e7490;
}

.form-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.form-group {
  margin: 0;
}

.span-4 {
  grid-column: span 4;
}

.form-group label,
.field label {
  display: block;
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text-secondary);
}

.glass-input {
  height: 42px;
  padding: 0 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 13px;
}

select.glass-input {
  cursor: pointer;
}

.glass-input:hover {
  background: rgba(0, 0, 0, 0.045);
  border-color: rgba(79, 70, 229, 0.18);
}

.glass-input:focus {
  background: rgba(255, 255, 255, 0.82);
  border-color: var(--border-focus);
  outline: 3px solid rgba(79, 70, 229, 0.10);
}

.glass-input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.mono {
  font-size: 12px;
}

.field-hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-muted);
}

.profile-note,
.internal-info {
  margin: 0;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  background: rgba(79, 70, 229, 0.07);
  border: 1px solid rgba(79, 70, 229, 0.12);
  color: var(--text-secondary);
  font-size: 12px;
}

.profile-note .note-icon,
.internal-info .info-icon {
  font-size: 15px;
  flex: 0 0 auto;
}

.profile-note span:last-child,
.internal-info p {
  margin: 0;
  line-height: 1.45;
}

.endpoint-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.endpoint-card {
  padding: 13px;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.54);
}

.endpoint-card.callback {
  background: linear-gradient(180deg, rgba(79, 70, 229, 0.075), rgba(255, 255, 255, 0.48));
  border-color: rgba(79, 70, 229, 0.14);
}

.endpoint-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.endpoint-head span {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
}

.endpoint-head small {
  font-size: 11px;
  color: var(--text-muted);
}

.endpoint-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.host-field {
  flex: 1 1 auto;
  min-width: 0;
}

.port-field {
  width: 104px;
  flex: 0 0 auto;
}

.inline-hint {
  margin: -4px 0 0;
}

.security-row {
  margin: 0;
}

.input-with-action {
  gap: 10px;
}

.btn-small {
  height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  white-space: nowrap;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
}

.advanced-toggle {
  padding: 10px 14px;
  border: 1px dashed rgba(79, 70, 229, 0.24);
  border-radius: 14px;
  background: rgba(79, 70, 229, 0.06);
  color: var(--color-primary);
  text-align: center;
  font-size: 12px;
  font-weight: 800;
}

.advanced-panel {
  padding: 0;
  background: transparent;
}

.cert-grid {
  gap: 12px;
}

.area {
  height: 108px;
  padding: 12px;
  line-height: 1.5;
  resize: vertical;
}

.modal-footer {
  margin: 0;
  padding: 16px 24px 20px;
  border-top: 1px solid var(--border-light);
  background: rgba(255, 255, 255, 0.52);
}

.modal-footer .btn {
  min-width: 104px;
}

@media (max-width: 760px) {
  .listener-modal {
    width: 96vw;
  }

  .form-grid,
  .endpoint-grid,
  .cert-grid {
    grid-template-columns: 1fr;
  }

  .form-group,
  .span-2,
  .span-3,
  .span-4 {
    grid-column: span 1;
  }

  .endpoint-row {
    align-items: stretch;
    flex-direction: column;
  }

  .port-field {
    width: auto;
  }
}
</style>
