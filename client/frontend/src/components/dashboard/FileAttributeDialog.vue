<script setup>
/**
 * FileAttributeDialog - 文件属性编辑对话框
 * 支持 Windows 属性位修改、Linux 权限位编辑、
 * 时间戳（创建/修改/访问时间）修改。
 */

import { ref, computed, watch } from 'vue'

// ─── Props / Emits ───

const props = defineProps({
  visible: { type: Boolean, default: false },
  target: { type: Object, default: null },
  isWindowsTarget: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'submit'])

// ─── 状态 ───

const submitting = ref(false)
const form = ref(createEmptyAttributeForm())

// ─── 常量 ───

const WINDOWS_ATTRIBUTE_OPTIONS = [
  { key: 'readonly', label: 'Read-Only', hint: 'FILE_ATTRIBUTE_READONLY' },
  { key: 'hidden', label: 'Hidden', hint: 'FILE_ATTRIBUTE_HIDDEN' },
  { key: 'system', label: 'System', hint: 'FILE_ATTRIBUTE_SYSTEM' },
  { key: 'archive', label: 'Archive', hint: 'FILE_ATTRIBUTE_ARCHIVE' },
]

const LINUX_PERMISSION_ROWS = [
  { label: 'Owner', read: 'ownerRead', write: 'ownerWrite', execute: 'ownerExecute' },
  { label: 'Group', read: 'groupRead', write: 'groupWrite', execute: 'groupExecute' },
  { label: 'Other', read: 'otherRead', write: 'otherWrite', execute: 'otherExecute' },
]

function createTimeParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }
}

function toDateFromMaybeTimestamp(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date()
  return numeric < 1e12 ? new Date(numeric * 1000) : new Date(numeric)
}

function createEmptyAttributeForm(target = null) {
  const file = target?.file || null
  const now = new Date()
  return {
    targetPath: String(file?.path || target?.path || ''),
    sourceName: String(file?.name || ''),
    newNameEnabled: false,
    newName: '',
    mtimeEnabled: false,
    mtime: createTimeParts(toDateFromMaybeTimestamp(file?.mod_time)),
    atimeEnabled: false,
    atime: createTimeParts(now),
    ctimeEnabled: false,
    ctime: createTimeParts(now),
    winAttrEnabled: false,
    winAttr: { readonly: false, hidden: Boolean(file?.is_hidden), system: false, archive: false },
    linuxModeEnabled: false,
    linuxMode: parseLinuxModeSelection(String(file?.permission || '')),
  }
}

function parseLinuxModeSelection(permission) {
  const text = String(permission || '')
  const selected = {
    ownerRead: false, ownerWrite: false, ownerExecute: false,
    groupRead: false, groupWrite: false, groupExecute: false,
    otherRead: false, otherWrite: false, otherExecute: false,
  }
  if (text.length < 10) return selected
  const chars = text.slice(1, 10).split('')
  const keys = [
    'ownerRead', 'ownerWrite', 'ownerExecute',
    'groupRead', 'groupWrite', 'groupExecute',
    'otherRead', 'otherWrite', 'otherExecute',
  ]
  chars.forEach((ch, index) => {
    if (ch !== '-' && keys[index]) selected[keys[index]] = true
  })
  return selected
}

function isValidTimeParts(parts) {
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  const second = Number(parts.second)
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) return false
  const date = new Date(year, month - 1, day, hour, minute, second)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day && date.getHours() === hour &&
    date.getMinutes() === minute && date.getSeconds() === second
  )
}

function toUnixTimestampString(parts) {
  if (!isValidTimeParts(parts)) return null
  const date = new Date(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return String(Math.floor(date.getTime() / 1000))
}

function buildWindowsAttributeValue(selection) {
  let value = 0
  if (selection.readonly) value |= 0x1
  if (selection.hidden) value |= 0x2
  if (selection.system) value |= 0x4
  if (selection.archive) value |= 0x20
  return String(value)
}

function buildLinuxModeValue(selection) {
  const digits = [
    (selection.ownerRead ? 4 : 0) + (selection.ownerWrite ? 2 : 0) + (selection.ownerExecute ? 1 : 0),
    (selection.groupRead ? 4 : 0) + (selection.groupWrite ? 2 : 0) + (selection.groupExecute ? 1 : 0),
    (selection.otherRead ? 4 : 0) + (selection.otherWrite ? 2 : 0) + (selection.otherExecute ? 1 : 0),
  ]
  if (digits.every(d => d === 0)) return ''
  return digits.join('')
}

function formatWindowsAttributes(selection) {
  const labels = []
  if (selection.readonly) labels.push('Read-Only')
  if (selection.hidden) labels.push('Hidden')
  if (selection.system) labels.push('System')
  if (selection.archive) labels.push('Archive')
  return labels.length > 0 ? labels.join(' / ') : '未选择'
}

function formatLinuxMode(selection) {
  const parts = [
    `${selection.ownerRead ? 'r' : '-'}${selection.ownerWrite ? 'w' : '-'}${selection.ownerExecute ? 'x' : '-'}`,
    `${selection.groupRead ? 'r' : '-'}${selection.groupWrite ? 'w' : '-'}${selection.groupExecute ? 'x' : '-'}`,
    `${selection.otherRead ? 'r' : '-'}${selection.otherWrite ? 'w' : '-'}${selection.otherExecute ? 'x' : '-'}`,
  ]
  return parts.join(' ')
}

function buildSetAttrArgs(data) {
  const args = [String(data.targetPath || '')]
  let modifyFlag = 0
  if (data.newNameEnabled) {
    const value = String(data.newName || '').trim()
    if (!value) throw new Error('已启用的新文件名不能为空')
    modifyFlag |= 1
    args.push(value)
  }
  if (data.mtimeEnabled) {
    const timestamp = toUnixTimestampString(data.mtime)
    if (!timestamp) throw new Error('修改时间填写无效，请检查年月日时分秒')
    modifyFlag |= 2
    args.push(timestamp)
  }
  if (data.atimeEnabled) {
    const timestamp = toUnixTimestampString(data.atime)
    if (!timestamp) throw new Error('访问时间填写无效，请检查年月日时分秒')
    modifyFlag |= 4
    args.push(timestamp)
  }
  if (data.ctimeEnabled) {
    const timestamp = toUnixTimestampString(data.ctime)
    if (!timestamp) throw new Error('创建时间填写无效，请检查年月日时分秒')
    modifyFlag |= 8
    args.push(timestamp)
  }
  if (data.winAttrEnabled) {
    const winAttrValue = buildWindowsAttributeValue(data.winAttr)
    if (winAttrValue === '0') throw new Error('Windows 属性已启用时，请至少勾选一个属性')
    modifyFlag |= 16
    args.push(winAttrValue)
  }
  if (data.linuxModeEnabled) {
    const linuxModeValue = buildLinuxModeValue(data.linuxMode)
    if (!linuxModeValue) throw new Error('Linux 权限已启用时，请至少勾选一个权限位')
    modifyFlag |= 32
    args.push(linuxModeValue)
  }
  if (modifyFlag === 0) throw new Error('请至少选择一个要修改的属性')
  args.splice(1, 0, String(modifyFlag))
  return args
}

const hasChanges = computed(() => {
  const f = form.value
  return Boolean(
    f.newNameEnabled || f.mtimeEnabled || f.atimeEnabled ||
    (props.isWindowsTarget && f.ctimeEnabled) ||
    (props.isWindowsTarget && f.winAttrEnabled) ||
    (!props.isWindowsTarget && f.linuxModeEnabled)
  )
})

watch(() => props.visible, (val) => {
  if (val && props.target) {
    form.value = createEmptyAttributeForm(props.target)
    submitting.value = false
  }
})

function close() {
  submitting.value = false
  emit('close')
}

async function handleSubmit() {
  if (submitting.value) return
  try {
    submitting.value = true
    const payload = { ...form.value, winAttr: { ...form.value.winAttr }, linuxMode: { ...form.value.linuxMode } }
    if (props.isWindowsTarget) {
      payload.linuxModeEnabled = false
    } else {
      payload.ctimeEnabled = false
      payload.winAttrEnabled = false
    }
    const args = buildSetAttrArgs(payload)
    emit('submit', args)
  } catch (err) {
    throw err
  } finally {
    submitting.value = false
  }
}

defineExpose({ form, submitting })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div v-if="visible" class="attribute-dialog-overlay" @click="close">
        <div class="attribute-dialog" @click.stop>
          <div class="attribute-dialog-header">
            <div>
              <div class="attribute-dialog-title">修改属性</div>
              <div class="attribute-dialog-subtitle" :title="form.targetPath">
                {{ target?.file?.name || form.sourceName || '目标对象' }}
              </div>
            </div>
            <button class="attribute-dialog-close" @click="close">&times;</button>
          </div>

          <div class="attribute-dialog-body">
            <div class="attribute-field">
              <label class="attribute-label">目标路径</label>
              <input class="attribute-input readonly" :value="form.targetPath" readonly />
            </div>

            <div class="attribute-field">
              <label class="attribute-toggle">
                <input type="checkbox" v-model="form.newNameEnabled" />
                <span>修改文件名 / 文件夹名</span>
              </label>
              <input class="attribute-input" v-model="form.newName" :disabled="!form.newNameEnabled" placeholder="请输入新名称" />
            </div>

            <div class="attribute-field">
              <label class="attribute-toggle">
                <input type="checkbox" v-model="form.mtimeEnabled" />
                <span>修改修改时间 (MTime)</span>
              </label>
              <div class="attribute-time-grid">
                <label v-for="field in ['year','month','day','hour','minute','second']" :key="'mtime-'+field">
                  <span>{{ {year:'年',month:'月',day:'日',hour:'时',minute:'分',second:'秒'}[field] }}</span>
                  <input type="number" v-model.number="form.mtime[field]" :disabled="!form.mtimeEnabled" />
                </label>
              </div>
              <div class="attribute-time-preview">
                Unix: {{ form.mtimeEnabled ? (toUnixTimestampString(form.mtime) || '无效时间') : '未启用' }}
              </div>
            </div>

            <div class="attribute-field">
              <label class="attribute-toggle">
                <input type="checkbox" v-model="form.atimeEnabled" />
                <span>修改访问时间 (ATime)</span>
              </label>
              <div class="attribute-time-grid">
                <label v-for="field in ['year','month','day','hour','minute','second']" :key="'atime-'+field">
                  <span>{{ {year:'年',month:'月',day:'日',hour:'时',minute:'分',second:'秒'}[field] }}</span>
                  <input type="number" v-model.number="form.atime[field]" :disabled="!form.atimeEnabled" />
                </label>
              </div>
              <div class="attribute-time-preview">
                Unix: {{ form.atimeEnabled ? (toUnixTimestampString(form.atime) || '无效时间') : '未启用' }}
              </div>
            </div>

            <div v-if="isWindowsTarget" class="attribute-field">
              <label class="attribute-toggle">
                <input type="checkbox" v-model="form.ctimeEnabled" />
                <span>修改创建时间 (CTime)</span>
              </label>
              <div class="attribute-time-grid">
                <label v-for="field in ['year','month','day','hour','minute','second']" :key="'ctime-'+field">
                  <span>{{ {year:'年',month:'月',day:'日',hour:'时',minute:'分',second:'秒'}[field] }}</span>
                  <input type="number" v-model.number="form.ctime[field]" :disabled="!form.ctimeEnabled" />
                </label>
              </div>
              <div class="attribute-time-preview">
                Unix: {{ form.ctimeEnabled ? (toUnixTimestampString(form.ctime) || '无效时间') : '未启用' }}
              </div>
            </div>

            <div v-else class="attribute-field">
              <label class="attribute-label">创建时间 (CTime)</label>
              <div class="attribute-unsupported-note">Linux 当前不支持修改创建时间</div>
            </div>

            <div class="attribute-field split">
              <div v-if="isWindowsTarget" class="attribute-section">
                <label class="attribute-toggle">
                  <input type="checkbox" v-model="form.winAttrEnabled" />
                  <span>修改 Windows 属性</span>
                </label>
                <div class="checkbox-grid">
                  <label v-for="option in WINDOWS_ATTRIBUTE_OPTIONS" :key="option.key" class="check-option">
                    <input type="checkbox" v-model="form.winAttr[option.key]" :disabled="!form.winAttrEnabled" />
                    <span><strong>{{ option.label }}</strong><small>{{ option.hint }}</small></span>
                  </label>
                </div>
                <div class="attribute-time-preview">
                  已选择: {{ formatWindowsAttributes(form.winAttr) }}
                </div>
              </div>
              <div v-else class="attribute-section">
                <label class="attribute-toggle">
                  <input type="checkbox" v-model="form.linuxModeEnabled" />
                  <span>修改 Linux 权限</span>
                </label>
                <div class="linux-perm-grid">
                  <div class="linux-perm-head"></div>
                  <div class="linux-perm-head">R</div>
                  <div class="linux-perm-head">W</div>
                  <div class="linux-perm-head">X</div>
                  <template v-for="row in LINUX_PERMISSION_ROWS" :key="row.label">
                    <div class="linux-perm-row-label">{{ row.label }}</div>
                    <label class="linux-perm-check"><input type="checkbox" v-model="form.linuxMode[row.read]" :disabled="!form.linuxModeEnabled" /></label>
                    <label class="linux-perm-check"><input type="checkbox" v-model="form.linuxMode[row.write]" :disabled="!form.linuxModeEnabled" /></label>
                    <label class="linux-perm-check"><input type="checkbox" v-model="form.linuxMode[row.execute]" :disabled="!form.linuxModeEnabled" /></label>
                  </template>
                </div>
                <div class="attribute-time-preview">
                  结果: {{ buildLinuxModeValue(form.linuxMode) || '未选择' }}
                  <span class="attribute-preview-hint">({{ formatLinuxMode(form.linuxMode) }})</span>
                </div>
              </div>
            </div>
          </div>

          <div class="attribute-dialog-footer">
            <button class="attribute-btn secondary" @click="close">取消</button>
            <button class="attribute-btn primary" :disabled="submitting || !hasChanges" @click="handleSubmit">
              {{ submitting ? '提交中...' : '提交任务' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.attribute-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  z-index: 4000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.attribute-dialog {
  width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
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
  overflow: hidden;
}

.attribute-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-light);
}

.attribute-dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.attribute-dialog-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 4px;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attribute-dialog-close {
  background: transparent;
  border: none;
  font-size: 22px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.attribute-dialog-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}

.attribute-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.attribute-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attribute-field.split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.attribute-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.attribute-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.attribute-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}

.attribute-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.attribute-input:focus {
  border-color: var(--color-primary);
}

.attribute-input.readonly {
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-muted);
  cursor: default;
}

.attribute-time-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.attribute-time-grid label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.attribute-time-grid label span {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.attribute-time-grid input[type="number"] {
  width: 100%;
  padding: 6px 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-primary);
  font-size: 13px;
  text-align: center;
  outline: none;
  box-sizing: border-box;
}

.attribute-time-grid input[type="number"]:focus {
  border-color: var(--color-primary);
}

.attribute-time-preview {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 6px;
}

.attribute-preview-hint {
  color: var(--text-secondary);
  margin-left: 4px;
}

.attribute-unsupported-note {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  padding: 8px 0;
}

.attribute-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checkbox-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.check-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.check-option:hover {
  background: rgba(0, 0, 0, 0.03);
}

.check-option input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
  margin-top: 2px;
  flex-shrink: 0;
}

.check-option span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.check-option strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.check-option small {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.linux-perm-grid {
  display: grid;
  grid-template-columns: 60px repeat(3, 1fr);
  gap: 4px;
  align-items: center;
}

.linux-perm-head {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  padding: 4px 0;
}

.linux-perm-row-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding-right: 8px;
}

.linux-perm-check {
  display: flex;
  justify-content: center;
  padding: 6px 0;
  cursor: pointer;
}

.linux-perm-check input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}

.attribute-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid var(--border-light);
  background: rgba(0, 0, 0, 0.02);
}

.attribute-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.attribute-btn.secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
}

.attribute-btn.secondary:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
}

.attribute-btn.primary {
  background: var(--color-primary);
  color: #fff;
}

.attribute-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.attribute-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:global(html[data-ui-theme="dark"] .attribute-dialog) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.04) 42%, rgba(2, 6, 23, 0.02)),
    radial-gradient(rgba(255, 255, 255, 0.06) 0.5px, transparent 0.5px),
    rgba(15, 23, 42, 0.94);
  background-size: auto, 3px 3px, auto;
  border-color: rgba(148, 163, 184, 0.22);
}

:global(html[data-ui-theme="dark"] .attribute-dialog-header) {
  background: rgba(15, 23, 42, 0.72);
  border-bottom-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .attribute-dialog-title) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .attribute-dialog-close) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .attribute-dialog-close:hover) {
  background: rgba(51, 65, 85, 0.78);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .attribute-input) {
  background: rgba(15, 23, 42, 0.72);
  border-color: rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .attribute-input.readonly) {
  background: rgba(15, 23, 42, 0.52);
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .attribute-time-grid input[type="number"]) {
  background: rgba(15, 23, 42, 0.72);
  border-color: rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .attribute-time-preview) {
  background: rgba(15, 23, 42, 0.52);
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .check-option) {
  border-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .check-option:hover) {
  background: rgba(30, 41, 59, 0.72);
}

:global(html[data-ui-theme="dark"] .check-option strong) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .attribute-dialog-footer) {
  background: rgba(15, 23, 42, 0.52);
  border-top-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .attribute-btn.secondary) {
  background: rgba(30, 41, 59, 0.78);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .attribute-btn.secondary:hover) {
  background: rgba(51, 65, 85, 0.92);
  color: #f8fafc;
}
</style>
