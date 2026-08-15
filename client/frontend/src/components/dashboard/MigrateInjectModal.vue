<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '../../stores/agent'
import { useConsoleStore } from '../../stores/console'
import { useListenerStore } from '../../stores/listener'
import { useNotificationStore } from '../../stores/notification'
import { useProcessBrowserStore } from '../../stores/processBrowser'
import { sendMigrateInjectCommand } from '../../features/beacon/actions/beaconCommandActions'
import {
  getEligibleMigrateListeners,
  getMigrateBehavior,
  getMigrateListenerLabel,
  isWindowsBeacon,
  isX86ToX64Blocked,
  normalizeMigrateArch,
} from '../../features/beacon/migrate/migrateOptions'

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, default: '' },
  process: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const { t, locale } = useI18n()
const agentStore = useAgentStore()
const consoleStore = useConsoleStore()
const listenerStore = useListenerStore()
const notificationStore = useNotificationStore()
const processStore = useProcessBrowserStore()

const selectedListenerName = ref('')
const isSubmitting = ref(false)

const activeBeacon = computed(() => agentStore.getAgentById(props.beaconid))
const parentArch = computed(() => normalizeMigrateArch(activeBeacon.value?.arch))
const targetArch = computed(() => normalizeMigrateArch(props.process?.arch))
const targetPid = computed(() => parseInt(props.process?.pid, 10) || 0)
const eligibleListeners = computed(() => getEligibleMigrateListeners(listenerStore.listeners))
const selectedListener = computed(() => {
  return eligibleListeners.value.find(listener => listener.name === selectedListenerName.value) || null
})
const behaviorHint = computed(() => getMigrateBehavior(selectedListener.value, t))
const lastUpdated = computed(() => processStore.getLastUpdated(props.beaconid))
const isCriticalProcess = computed(() => {
  const name = String(props.process?.name || '').trim().toLowerCase()
  return [
    'lsass.exe',
    'winlogon.exe',
    'csrss.exe',
    'services.exe',
    'smss.exe',
    'explorer.exe',
  ].includes(name)
})

const disabledReason = computed(() => {
  if (!props.beaconid || !activeBeacon.value) return t('migrateInject.errNoBeacon')
  if (!props.process) return t('migrateInject.errNoProcess')
  if (!isWindowsBeacon(activeBeacon.value)) return t('migrateInject.errNotWindows')
  if (targetPid.value <= 0) return t('migrateInject.errInvalidPid')
  if (!['x86', 'x64'].includes(targetArch.value)) return t('migrateInject.errUnsupportedArch')
  if (!eligibleListeners.value.length) return t('migrateInject.errNoListener')
  if (!selectedListener.value) return t('migrateInject.errSelectListener')
  if (isX86ToX64Blocked(parentArch.value, targetArch.value)) return t('migrateInject.errX64Blocked')
  return ''
})

const canSubmit = computed(() => !disabledReason.value && !isSubmitting.value)
const commandPreview = computed(() => {
  const listenerName = selectedListener.value?.name || '<listener>'
  const arch = ['x86', 'x64'].includes(targetArch.value) ? targetArch.value : '<arch>'
  const pid = targetPid.value > 0 ? String(targetPid.value) : '<pid>'
  return `migrate_inject ${listenerName} ${arch} ${pid}`
})

const targetLabel = computed(() => {
  const beaconShort = String(props.beaconid || '').slice(0, 8) || '-'
  const host = activeBeacon.value?.hostname || '-'
  return `${beaconShort}@${host}`
})

function formatTime(value: string | null) {
  if (!value) return t('migrateInject.notSynced')
  return new Date(value).toLocaleString(locale.value, { hour12: false })
}

function close(force: boolean | Event = false) {
  if (isSubmitting.value && !force) return
  emit('close')
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      selectedListenerName.value = ''
      isSubmitting.value = false
      return
    }

    await listenerStore.fetchListeners()
    selectedListenerName.value = eligibleListeners.value[0]?.name || ''
  }
)

watch(
  eligibleListeners,
  (list) => {
    if (!list.length) {
      selectedListenerName.value = ''
      return
    }
    if (!list.some(item => item.name === selectedListenerName.value)) {
      selectedListenerName.value = list[0].name
    }
  },
  { deep: true }
)

async function handleSubmit() {
  if (!canSubmit.value) {
    notificationStore.warn(disabledReason.value || t('migrateInject.cannotSubmit'))
    return
  }

  isSubmitting.value = true
  try {
    consoleStore.openConsole(props.beaconid)
    consoleStore.appendToConsole(props.beaconid, 'input', commandPreview.value)
    consoleStore.appendToConsole(props.beaconid, 'output', t('migrateInject.sending'))

    await sendMigrateInjectCommand(
      props.beaconid,
      selectedListener.value!.name,
      targetArch.value,
      targetPid.value
    )

    consoleStore.appendToConsole(props.beaconid, 'output', t('migrateInject.sent'))
    notificationStore.success(t('migrateInject.sentPreview', { preview: commandPreview.value }))
    close(true)
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)) || t('migrateInject.sendFailedGeneric')
    consoleStore.appendToConsole(props.beaconid, 'error', t('migrateInject.sendFailedPreview', { message }))
    notificationStore.error(message)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="modal-card glass-card">
          <header class="modal-header">
            <div class="title-group">
              <span class="title-icon">⇄</span>
              <div>
                <h3>Migrate Inject</h3>
                <p>{{ t('migrateInject.subtitle') }}</p>
              </div>
            </div>
            <button class="close-btn" @click="close">×</button>
          </header>

          <section class="info-card">
            <div class="section-title">Target</div>
            <div class="target-grid">
              <div class="meta-row">
                <span class="meta-label">{{ t('migrateInject.process') }}</span>
                <strong>{{ process?.name || '-' }}</strong>
              </div>
              <div class="meta-row">
                <span class="meta-label">PID</span>
                <strong class="mono">{{ process?.pid || '-' }}</strong>
              </div>
              <div class="meta-row">
                <span class="meta-label">Arch</span>
                <strong class="mono">{{ targetArch }}</strong>
              </div>
              <div class="meta-row">
                <span class="meta-label">User</span>
                <strong>{{ process?.user || '-' }}</strong>
              </div>
            </div>
          </section>

          <section class="info-card">
            <div class="section-title">Listener</div>
            <select v-model="selectedListenerName" class="listener-select" :disabled="!eligibleListeners.length || isSubmitting">
              <option value="" disabled>{{ t('migrateInject.selectListenerPlaceholder') }}</option>
              <option v-for="listener in eligibleListeners" :key="listener.name" :value="listener.name">
                {{ getMigrateListenerLabel(listener) }}
              </option>
            </select>
            <div v-if="selectedListener" class="listener-meta">
              <span class="listener-chip">{{ selectedListener.listenerType }}/{{ selectedListener.protocol }}</span>
              <span v-if="selectedListener.endpoint" class="listener-endpoint mono">{{ selectedListener.endpoint }}</span>
            </div>
            <p class="behavior-text">{{ behaviorHint }}</p>
          </section>

          <section class="info-card">
            <div class="section-title">Command Preview</div>
            <div class="command-preview mono">{{ commandPreview }}</div>
          </section>

          <section class="warning-card">
            <div class="section-title">{{ t('migrateInject.extraWarning') }}</div>
            <p>{{ t('migrateInject.currentBeacon', { target: targetLabel, arch: parentArch }) }}</p>
            <p>{{ t('migrateInject.syncTime', { time: formatTime(lastUpdated) }) }}</p>
            <p>{{ t('migrateInject.openProcessRisk') }}</p>
            <p v-if="isCriticalProcess">{{ t('migrateInject.criticalProcess') }}</p>
            <p v-if="selectedListener?.listenerType === 'internal'">{{ t('migrateInject.internalChildHint') }}</p>
            <p v-if="disabledReason" class="danger-text">{{ disabledReason }}</p>
          </section>

          <footer class="modal-footer">
            <button class="btn btn-ghost" :disabled="isSubmitting" @click="close">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" :disabled="!canSubmit" @click="handleSubmit">
              {{ isSubmitting ? t('migrateInject.submitting') : t('migrateInject.submit') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(8px);
}

.modal-card {
  width: min(720px, 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--border-light);
}

.title-group {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(var(--color-primary-rgb), 0.10);
  color: var(--color-primary);
  font-size: 18px;
  font-weight: 700;
}

.title-group h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
}

.title-group p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 22px;
  line-height: 1;
}

.info-card,
.warning-card {
  margin: 18px 24px 0;
  padding: 16px 18px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
}

.section-title {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.target-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
}

.meta-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: var(--text-muted);
}

.meta-row strong {
  font-size: 14px;
  color: var(--text-primary);
}

.listener-select {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.listener-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.listener-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(var(--color-primary-rgb), 0.10);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
}

.listener-endpoint {
  font-size: 12px;
  color: var(--text-secondary);
}

.behavior-text,
.warning-card p {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.command-preview {
  padding: 12px 14px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-primary);
  font-size: 13px;
  word-break: break-all;
}

.mono {
  font-family: 'JetBrains Mono', monospace;
}

.danger-text {
  color: var(--color-danger);
  font-weight: 600;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px 24px;
}

.btn {
  min-width: 128px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .modal-card {
    width: 100%;
  }

  .target-grid {
    grid-template-columns: 1fr;
  }

  .listener-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .btn {
    width: 100%;
  }
}
</style>
