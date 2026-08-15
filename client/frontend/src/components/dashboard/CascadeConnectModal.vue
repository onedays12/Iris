<script setup lang="ts">
/**
 * CascadeConnectModal - 级联连接配置弹窗
 *
 * 用于配置 Beacon 之间的级联连接关系，支持选择目标 Beacon 和连接协议。
 */

import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sendCascadeConnectCommand } from '../../features/beacon/actions/beaconCommandActions'
import { useConsoleStore } from '../../stores/console'
import { useModalStore } from '../../stores/modal'
import { useNotificationStore } from '../../stores/notification'

const { t } = useI18n()
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

const title = computed(() => mode.value === 'tcp' ? t('cascadeConnect.tcpTitle') : t('cascadeConnect.smbTitle'))

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
      notificationStore.warn(t('cascadeConnect.targetHostRequired'))
      return
    }
    if (!port.value || port.value < 1 || port.value > 65535) {
      notificationStore.warn(t('cascadeConnect.portRange'))
      return
    }
  } else {
    if (!pipeName.value.trim()) {
      notificationStore.warn(t('cascadeConnect.pipeNameRequired'))
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
    consoleStore.appendToConsole(beaconid.value, 'output', t('cascadeConnect.sendingCommand'))

    await sendCascadeConnectCommand(beaconid.value, mode.value, args)

    consoleStore.appendToConsole(beaconid.value, 'output', t('cascadeConnect.commandSentConsole'))
    notificationStore.success(t('cascadeConnect.commandSent', { command: displayCommand }))
    modalStore.closeCascadeConnectModal()
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)) || t('cascadeConnect.commandFailed')
    consoleStore.appendToConsole(beaconid.value, 'error', t('cascadeConnect.connectionFailed', { message }))
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
              ? t('cascadeConnect.tcpDescription')
              : t('cascadeConnect.smbDescription')
            }}
          </p>

          <div class="input-group">
            <label>Child ID <span class="optional">({{ t('cascadeConnect.optional') }})</span></label>
            <input
              type="text"
              v-model="childId"
              :placeholder="t('cascadeConnect.childIdPlaceholder')"
              class="form-input"
            />
          </div>

          <template v-if="mode === 'tcp'">
            <div class="input-group">
              <label>{{ t('cascadeConnect.targetHostLabel') }}</label>
              <input
                type="text"
                v-model="host"
                :placeholder="t('cascadeConnect.hostPlaceholder')"
                class="form-input"
              />
            </div>
            <div class="input-group">
              <label>{{ t('cascadeConnect.portLabel') }}</label>
              <input
                type="number"
                v-model.number="port"
                :placeholder="t('cascadeConnect.portPlaceholder')"
                min="1"
                max="65535"
                class="form-input"
              />
            </div>
          </template>

          <template v-else>
            <div class="input-group">
              <label>{{ t('cascadeConnect.pipeLabel') }}</label>
              <input
                type="text"
                v-model="pipeName"
                :placeholder="t('cascadeConnect.pipePlaceholder')"
                class="form-input"
              />
            </div>
          </template>

          <footer class="modal-actions">
            <button type="button" class="btn-cancel" @click="close">{{ t('cascadeConnect.cancel') }}</button>
            <button type="submit" class="btn-confirm" :disabled="isSubmitting">
              <span v-if="!isSubmitting">{{ t('cascadeConnect.sendCommand') }}</span>
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
