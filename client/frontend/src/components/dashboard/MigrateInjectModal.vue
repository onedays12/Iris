<script setup>
import { computed, ref, watch } from 'vue'
import { useAgentStore } from '../../stores/agent.js'
import { useConsoleStore } from '../../stores/console.js'
import { useListenerStore } from '../../stores/listener.js'
import { useNotificationStore } from '../../stores/notification.js'
import { useProcessBrowserStore } from '../../stores/processBrowser.js'
import { sendMigrateInjectCommand } from '../../features/beacon/actions/beaconCommandActions.js'
import {
  getEligibleMigrateListeners,
  getMigrateBehavior,
  getMigrateListenerLabel,
  isWindowsBeacon,
  isX86ToX64Blocked,
  normalizeMigrateArch,
} from '../../features/beacon/migrate/migrateOptions.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, default: '' },
  process: { type: Object, default: null },
})

const emit = defineEmits(['close'])

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
const behaviorHint = computed(() => getMigrateBehavior(selectedListener.value))
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
  if (!props.beaconid || !activeBeacon.value) return '未找到当前 Beacon，会话上下文不完整。'
  if (!props.process) return '未选择目标进程。'
  if (!isWindowsBeacon(activeBeacon.value)) return '仅 Windows Beacon 支持 Migrate Inject。'
  if (targetPid.value <= 0) return '目标进程 PID 无效。'
  if (!['x86', 'x64'].includes(targetArch.value)) return '目标进程架构不是 x86/x64，当前不能安全生成 migrate_inject。'
  if (!eligibleListeners.value.length) return '没有可用的 started Windows DLL stage listener。'
  if (!selectedListener.value) return '请选择一个可用的 listener。'
  if (isX86ToX64Blocked(parentArch.value, targetArch.value)) return '当前 Beacon 不支持 x64 stage 注入。'
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

function formatTime(value) {
  if (!value) return '尚未同步'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function close(force = false) {
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
    console.debug('[MigrateInject] all listeners:', listenerStore.listeners)
    console.debug('[MigrateInject] eligible listeners:', eligibleListeners.value)
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
    notificationStore.warn(disabledReason.value || '当前无法下发 Migrate Inject')
    return
  }

  isSubmitting.value = true
  try {
    consoleStore.openConsole(props.beaconid)
    consoleStore.appendToConsole(props.beaconid, 'input', commandPreview.value)
    consoleStore.appendToConsole(props.beaconid, 'output', '正在下发 Migrate Inject 指令...')

    await sendMigrateInjectCommand(
      props.beaconid,
      selectedListener.value.name,
      targetArch.value,
      targetPid.value
    )

    consoleStore.appendToConsole(props.beaconid, 'output', 'Migrate Inject 指令已下发。')
    notificationStore.success(`已下发: ${commandPreview.value}`)
    close(true)
  } catch (err) {
    const message = err?.message || '下发 Migrate Inject 指令失败'
    consoleStore.appendToConsole(props.beaconid, 'error', `Migrate Inject 失败: ${message}`)
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
                <p>注入新 Beacon 到此进程</p>
              </div>
            </div>
            <button class="close-btn" @click="close">×</button>
          </header>

          <section class="info-card">
            <div class="section-title">Target</div>
            <div class="target-grid">
              <div class="meta-row">
                <span class="meta-label">进程</span>
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
              <option value="" disabled>请选择可用 listener</option>
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
            <div class="section-title">额外提醒</div>
            <p>当前 Beacon：{{ targetLabel }} · {{ parentArch }}</p>
            <p>进程列表同步时间：{{ formatTime(lastUpdated) }}，PID 可能已复用。</p>
            <p>目标进程权限更高时，`OpenProcess` 可能失败。</p>
            <p v-if="isCriticalProcess">目标是系统关键进程，失败风险更高。</p>
            <p v-if="selectedListener?.listenerType === 'internal'">internal child 会挂在当前 Beacon 下，不是顶层 Beacon。</p>
            <p v-if="disabledReason" class="danger-text">{{ disabledReason }}</p>
          </section>

          <footer class="modal-footer">
            <button class="btn btn-ghost" :disabled="isSubmitting" @click="close">取消</button>
            <button class="btn btn-primary" :disabled="!canSubmit" @click="handleSubmit">
              {{ isSubmitting ? '下发中...' : '下发 Migrate Inject' }}
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
