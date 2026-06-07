<script setup>
/**
 * CascadeConnectModal - 级联连接配置弹窗
 *
 * 用于配置 Beacon 之间的级联连接关系，支持选择目标 Beacon 和连接协议。
 */

import { ref, watch, computed } from 'vue'
import { sendCascadeConnectCommand } from '../../features/beacon/actions/beaconCommandActions.js'
import { useConsoleStore } from '../../stores/console.js'
import { useModalStore } from '../../stores/modal.js'
import { useNotificationStore } from '../../stores/notification.js'

const modalStore = useModalStore()
const consoleStore = useConsoleStore()
const notificationStore = useNotificationStore()

const visible = computed(() => modalStore.cascadeConnectModalVisible)
const beaconid = computed(() => modalStore.cascadeConnectBeaconId)
const mode = computed(() => modalStore.cascadeConnectMode)

const childId = ref('')
const host = ref('')
const port = ref(4444)
const pipeName = ref('')

const isSubmitting = ref(false)

const title = computed(() => mode.value === 'tcp' ? 'Connect TCP Child' : 'Link SMB Child')

watch(visible, (newVal) => {
  if (newVal) {
    childId.value = ''
    host.value = ''
    port.value = 4444
    pipeName.value = ''
    isSubmitting.value = false
  }
})

async function handleSubmit() {
  if (mode.value === 'tcp') {
    if (!host.value.trim()) {
      notificationStore.warn('请输入目标主机地址')
      return
    }
    if (!port.value || port.value < 1 || port.value > 65535) {
      notificationStore.warn('端口范围必须在 1-65535 之间')
      return
    }
  } else {
    if (!pipeName.value.trim()) {
      notificationStore.warn('请输入 Pipe 名称')
      return
    }
  }

  isSubmitting.value = true
  try {
    consoleStore.openConsole(beaconid.value)

    const args = mode.value === 'tcp'
      ? [childId.value.trim(), host.value.trim(), Number(port.value)]
      : [childId.value.trim(), pipeName.value.trim()]

    const displayCommand = mode.value === 'tcp'
      ? `connect ${childId.value} ${host.value} ${port.value}`
      : `link ${childId.value} ${pipeName.value}`

    consoleStore.appendToConsole(beaconid.value, 'input', displayCommand)
    consoleStore.appendToConsole(beaconid.value, 'output', '正在下发级联连接指令...')

    await sendCascadeConnectCommand(beaconid.value, mode.value, args)

    consoleStore.appendToConsole(beaconid.value, 'output', '级联连接指令已下发。')
    notificationStore.success(`指令已下发: ${displayCommand}`)
    modalStore.closeCascadeConnectModal()
  } catch (err) {
    const message = err?.message || '下发级联连接指令失败'
    consoleStore.appendToConsole(beaconid.value, 'error', `级联连接失败: ${message}`)
    notificationStore.error(message)
    console.error('[CascadeConnectModal] Failed:', err)
  } finally {
    isSubmitting.value = false
  }
}

function close() {
  modalStore.closeCascadeConnectModal()
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="visible" class="modal-overlay">
      <div class="modal-content glass-card">
        <header class="modal-header">
          <div class="title-area">
            <span class="icon">🔗</span>
            <h3>{{ title }}</h3>
          </div>
          <button class="close-btn" @click="close">&times;</button>
        </header>

        <form @submit.prevent="handleSubmit" class="modal-body">
          <p class="description">
            {{ mode === 'tcp'
              ? '通过 TCP 连接到子 Beacon，建立级联拓扑。'
              : '通过 SMB 管道连接到子 Beacon，建立级联拓扑。'
            }}
          </p>

          <div class="input-group">
            <label>Child ID <span class="optional">(可选)</span></label>
            <input
              type="text"
              v-model="childId"
              placeholder="留空则由服务端自动分配"
              class="form-input"
            />
          </div>

          <template v-if="mode === 'tcp'">
            <div class="input-group">
              <label>目标主机 (Host)</label>
              <input
                type="text"
                v-model="host"
                placeholder="例如: 192.168.1.100"
                class="form-input"
              />
            </div>
            <div class="input-group">
              <label>端口 (Port)</label>
              <input
                type="number"
                v-model.number="port"
                placeholder="例如: 4444"
                min="1"
                max="65535"
                class="form-input"
              />
            </div>
          </template>

          <template v-else>
            <div class="input-group">
              <label>Pipe 名称</label>
              <input
                type="text"
                v-model="pipeName"
                placeholder="例如: \\.\pipe\beacon_internal"
                class="form-input"
              />
            </div>
          </template>

          <footer class="modal-actions">
            <button type="button" class="btn-cancel" @click="close">取消</button>
            <button type="submit" class="btn-confirm" :disabled="isSubmitting">
              <span v-if="!isSubmitting">下发指令</span>
              <div v-else class="loader sm"></div>
            </button>
          </footer>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  width: 440px;
  padding: 24px;
  animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-area h3 {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(to right, var(--text-primary), var(--color-primary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.description {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.optional {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
}

.btn-confirm {
  padding: 10px 24px;
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}
</style>
