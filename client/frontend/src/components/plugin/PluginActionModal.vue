<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalStore } from '../../stores/modal'
import { useNotificationStore } from '../../stores/notification'
import { useAgentStore } from '../../stores/agent'
import { usePluginStore } from '../../stores/plugin'
import { normalizeBeaconArch, normalizeBeaconPlatform } from '../../constants/commands'
import { localizedText } from '../../features/plugin/model'

const { locale, t } = useI18n()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const agentStore = useAgentStore()
const pluginStore = usePluginStore()

/** 按当前语言解析 schema v2 本地化文案(string 或 {zh,en})。 */
function displayText(value: unknown, fallback = ''): string {
  return localizedText(value, locale.value) || fallback
}

// 插件动作原始 JSON 无静态类型，此处以 Record 视图做鸭子类型访问
type RawPluginAction = Record<string, any>
type RawPluginField = Record<string, any>

const formValues = reactive<Record<string, unknown>>({})
const submitting = computed(() => pluginStore.invoking)

const visible = computed(() => modalStore.pluginActionVisible)
const activeAction = computed<RawPluginAction | null>(() => (modalStore.activePluginAction?.action ?? null) as RawPluginAction | null)
const activePluginId = computed(() => modalStore.activePluginAction?.pluginId || '')
const activePluginName = computed(() => modalStore.activePluginAction?.pluginName || '')
const activeBeaconId = computed(() => modalStore.activePluginAction?.beaconid || '')
const activeAgent = computed(() => agentStore.getAgentById(activeBeaconId.value) || null)

const TEXT_FIELD_TYPES = new Set(['string', 'int8', 'int16', 'int32', 'int64', 'short', 'bytes', 'text', 'input'])
const BOOL_FIELD_TYPES = new Set(['bool', 'boolean', 'checkbox'])

function getFieldType(field: RawPluginField) {
  return String(field?.type || 'string').trim().toLowerCase()
}

function isTextField(field: RawPluginField) {
  return TEXT_FIELD_TYPES.has(getFieldType(field))
}

function isBooleanField(field: RawPluginField) {
  return BOOL_FIELD_TYPES.has(getFieldType(field))
}

function normalizeBooleanDefault(value: unknown) {
  if (value === true || value === false) return value
  const text = String(value ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  return false
}

function resolveFieldDefaultByArch(field: RawPluginField) {
  const byArch = field?.defaultByArch || {}
  if (!byArch || typeof byArch !== 'object' || Array.isArray(byArch)) return undefined

  const arch = normalizeBeaconArch(activeAgent.value?.arch)
  if (!arch || arch === 'unknown') return undefined
  if (Object.prototype.hasOwnProperty.call(byArch, arch)) return byArch[arch]
  return undefined
}

function normalizeFieldDefault(field: RawPluginField) {
  const archDefault = resolveFieldDefaultByArch(field)
  const defaultValue = archDefault !== undefined ? archDefault : (field.defaultValue ?? '')
  if (isBooleanField(field)) {
    return normalizeBooleanDefault(defaultValue)
  }
  return defaultValue === undefined || defaultValue === null ? '' : defaultValue
}

// normalizedAction 将当前激活的动作原始数据归一化
// （modal 接收的是 normalizePlugin 产出的 camelCase 模型对象，canonical = camelCase）
function normalizedAction() {
  const action = activeAction.value || {}
  const postex = action.postex || null
  const fields = Array.isArray(action.fields) ? action.fields : []
  return {
    id: String(action.id || '').trim(),
    kind: String(action.kind || (postex ? 'postex' : 'bof')).trim().toLowerCase() || 'bof',
    label: displayText(action.label, String(action.id || t('pluginAction.pluginAction')).trim()),
    description: displayText(action.description),
    os: Array.isArray(action.os) ? action.os : [],
    arch: Array.isArray(action.arch) ? action.arch : [],
    artifact: String(action.artifact || ''),
    artifactByArch: action.artifactByArch || {},
    artifactData: String(action.artifactData || ''),
    commandId: Number(action.commandId || 0) || 0,
    // v2 约定: 未显式声明 requiresInput 时, 有字段即需要输入
    requiresInput: Boolean(action.requiresInput || fields.length),
    fields,
    postex,
  }
}

// resetValues 根据动作定义的字段初始化表单默认值
function resetValues() {
  Object.keys(formValues).forEach((key) => {
    delete formValues[key]
  })

  const action = normalizedAction()
  for (const field of action.fields) {
    const fieldName = String(field.name || '').trim()
    if (!fieldName) continue
    formValues[fieldName] = normalizeFieldDefault(field)
  }
}

watch(
  visible,
  (open) => {
    if (open) {
      resetValues()
    }
  },
  { immediate: true }
)

watch(activeAction, () => {
  if (visible.value) {
    resetValues()
  }
})

watch(
  () => activeAgent.value?.arch,
  () => {
    if (visible.value) {
      resetValues()
    }
  }
)

function close() {
  modalStore.closePluginAction()
}

function updateField(fieldId: string, value: unknown) {
  if (!fieldId) return
  formValues[fieldId] = value
}

function validateFields(action: RawPluginAction) {
  for (const field of action.fields) {
    const fieldName = String(field.name || '').trim()
    if (!fieldName) continue
    if (isBooleanField(field)) continue
    if (field.required && String(formValues[fieldName] ?? '').trim() === '') {
      notificationStore.warn(t('pluginAction.fillField', { name: displayText(field.label, fieldName) }))
      return false
    }
  }
  return true
}

function serializeValues(values: Record<string, unknown>) {
  const result: Record<string, string> = {}
  Object.entries(values).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      result[key] = value ? 'true' : 'false'
      return
    }
    if (value === undefined || value === null) {
      result[key] = ''
      return
    }
    result[key] = String(value)
  })
  return result
}

function makeStringArg(value: unknown) {
  return { kind: 'string', value: String(value ?? '') }
}

function buildComFileopArgs(values: Record<string, unknown>) {
  const op = String(values.op || '').trim()
  const src = String(values.src || '').trim()
  const dst = String(values.dst || '').trim()
  const taskName = String(values.task_name || '').trim()

  if (!['cp', 'mv', 'taskcp', 'taskmv'].includes(op)) {
    throw new Error(t('pluginAction.comOpsOnly'))
  }
  if (!src) {
    throw new Error(t('pluginAction.fillSourcePath'))
  }
  if (!dst) {
    throw new Error(t('pluginAction.fillTargetPath'))
  }

  const args = [makeStringArg(op), makeStringArg(src), makeStringArg(dst)]
  if (op.startsWith('task') && taskName) {
    args.push(makeStringArg(taskName))
  }
  return args
}

// submit 提交表单数据并调用后端插件动作
async function submit() {
  const action = normalizedAction()
  if (!activePluginId.value) {
    notificationStore.warn(t('pluginAction.missingPlugin'))
    return
  }
  if (!action.id) {
    notificationStore.warn(t('pluginAction.missingAction'))
    return
  }
  if (!activeBeaconId.value) {
    notificationStore.warn(t('pluginAction.selectBeacon'))
    return
  }
  if (!validateFields(action)) return

  try {
    const values = serializeValues(formValues)
    const explicitArgs = action.id === 'com_fileop' ? buildComFileopArgs(values) : undefined
    await pluginStore.invokePluginAction(activePluginId.value, action.id, {
      beacon_id: activeBeaconId.value,
      plugin_id: activePluginId.value,
      plugin_name: activePluginName.value,
      action_id: action.id,
      kind: action.kind,
      action_label: displayText(action.label, action.id),
      command_id: action.commandId,
      artifact: action.artifact,
      artifact_data: action.artifactData || '',
      postex: action.postex || null,
      beacon_os: normalizeBeaconPlatform(activeAgent.value?.os),
      beacon_arch: normalizeBeaconArch(activeAgent.value?.arch),
      values,
      ...(explicitArgs ? { args: explicitArgs } : {}),
    })
    close()
  } catch (err) {
    notificationStore.error((err instanceof Error ? err.message : String(err)) || t('pluginAction.execFailed'))
    console.error('[PluginActionModal] 执行动作失败:', err)
  }
}
</script>

<template>
  <Teleport to="body">
<div v-if="visible" class="modal-overlay">
      <div class="plugin-action-modal">
        <header class="modal-header">
          <div class="header-info">
            <span class="icon">🧩</span>
            <div class="titles">
              <h3>{{ normalizedAction().label }}</h3>
              <span class="subtitle">
                {{ activePluginName || t('pluginAction.plugin') }} · {{ activeBeaconId || t('pluginAction.noBeacon') }}
              </span>
            </div>
          </div>
          <button class="close-btn" type="button" @click="close">×</button>
        </header>

        <div class="modal-body">
          <div class="summary">
            <div class="summary-line" v-if="normalizedAction().description">{{ normalizedAction().description }}</div>
            <div class="summary-line dim" v-if="normalizedAction().artifact">
              {{ normalizedAction().kind === 'postex' ? 'PostEx DLL' : t('pluginAction.bofFile') }}: {{ normalizedAction().artifact }}
            </div>
            <div class="summary-line dim" v-if="normalizedAction().kind === 'postex' && normalizedAction().postex?.mode">{{ t('pluginAction.modeLabel') }}: {{ normalizedAction().postex.mode }}</div>
            <div class="summary-line dim" v-if="normalizedAction().kind === 'postex' && normalizedAction().postex?.backend">Backend：{{ normalizedAction().postex.backend }}</div>
            <div class="summary-line dim" v-if="normalizedAction().kind !== 'postex' && activeAction?.artifactData">{{ t('pluginAction.bofPreloaded') }}</div>
            <div class="summary-line dim" v-if="normalizedAction().commandId">{{ t('pluginAction.commandIdLabel') }}: {{ normalizedAction().commandId }}</div>
          </div>

          <!-- 动态渲染插件定义的输入字段 -->
          <template v-if="normalizedAction().fields.length">
            <div v-for="field in normalizedAction().fields" :key="field.name" class="form-group">
              <label class="field-label">{{ displayText(field.label, field.name) }}</label>

              <input
                v-if="isTextField(field)"
                class="form-control"
                :value="formValues[field.name] ?? field.defaultValue ?? ''"
                :placeholder="field.placeholder || ''"
                @input="updateField(field.name, ($event.target as HTMLInputElement).value)"
              />

              <textarea
                v-else-if="String(field.type).toLowerCase() === 'textarea'"
                class="form-control textarea"
                :value="formValues[field.name] ?? field.defaultValue ?? ''"
                :placeholder="field.placeholder || ''"
                @input="updateField(field.name, ($event.target as HTMLInputElement).value)"
              />

              <select
                v-else-if="String(field.type).toLowerCase() === 'select'"
                class="form-control"
                :value="formValues[field.name] ?? field.defaultValue ?? ''"
                @change="updateField(field.name, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ t('pluginAction.selectPlaceholder') }}</option>
                <option v-for="option in (field.options || [])" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>

              <label v-else-if="isBooleanField(field)" class="checkbox-row">
                <input
                  type="checkbox"
                  :checked="Boolean(formValues[field.name] ?? field.defaultValue)"
                  @change="updateField(field.name, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ displayText(field.help) || field.placeholder || t('pluginAction.enabled') }}</span>
              </label>

              <p v-if="displayText(field.help)" class="help-text">{{ displayText(field.help) }}</p>
              <p v-else-if="field.required" class="help-text required">{{ t('pluginAction.required') }}</p>
              <p v-if="field.type" class="help-text type">{{ t('pluginAction.typeLabel') }}: {{ String(field.type) }}</p>
            </div>
          </template>

          <div v-else class="empty-hint">
            {{ t('pluginAction.noArgsHint') }}
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" type="button" @click="close">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary" type="button" @click="submit" :disabled="submitting">
            {{ submitting ? t('pluginAction.executing') : t('pluginAction.execute') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
}

.plugin-action-modal {
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
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
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.4);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.icon {
  font-size: 24px;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.titles h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.subtitle {
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-all;
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  overflow: auto;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.08);
}

.summary-line {
  font-size: 13px;
  color: var(--text-primary);
}

.summary-line.dim {
  color: var(--text-muted);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
}

.form-control {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-primary);
  padding: 10px 12px;
  outline: none;
}

.form-control.textarea {
  min-height: 96px;
  resize: vertical;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-size: 13px;
}

.help-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.help-text.required {
  color: var(--color-primary);
}

.empty-hint {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(79, 70, 229, 0.08);
  color: var(--text-secondary);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.02);
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary {
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
