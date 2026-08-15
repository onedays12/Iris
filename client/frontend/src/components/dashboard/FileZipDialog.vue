<script setup lang="ts">
/**
 * FileZipDialog - ZIP 压缩配置对话框
 * 配置源路径、输出路径、覆盖选项、是否包含根目录名，
 * 提交压缩任务到 Beacon 执行。
 */

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// ─── Props / Emits ───

const props = defineProps({
  visible: { type: Boolean, default: false },
  target: { type: Object, default: null },
})

const emit = defineEmits(['close', 'submit'])

const { t } = useI18n()
const submitting = ref(false)
const form = ref(createEmptyForm())

function buildZipOutputPath(file: Record<string, any> | null) {
  const sourcePath = String(file?.path || '').trim()
  if (!sourcePath) return ''
  if (sourcePath.toLowerCase().endsWith('.zip')) {
    return `${sourcePath}_copy.zip`
  }
  return `${sourcePath}.zip`
}

function createEmptyForm(target: Record<string, any> | null = null) {
  const file = target?.file || null
  return {
    sourcePath: String(file?.path || target?.path || ''),
    sourceName: String(file?.name || ''),
    zipPath: buildZipOutputPath(file),
    overwrite: false,
    includeRoot: true,
    isDir: Boolean(file?.is_dir),
  }
}

function resetForm(target: Record<string, any> | null = null) {
  form.value = createEmptyForm(target)
}

function close() {
  submitting.value = false
  emit('close')
}

async function submit() {
  if (submitting.value) return

  const sourcePath = String(form.value.sourcePath || '').trim()
  const zipPath = String(form.value.zipPath || '').trim()

  if (!sourcePath || !zipPath) return

  try {
    submitting.value = true
    const overwrite = form.value.overwrite ? 1 : 0
    const includeRoot = form.value.isDir ? (form.value.includeRoot ? 1 : 0) : 1

    emit('submit', { sourcePath, zipPath, overwrite, includeRoot })
    close()
  } catch {
    submitting.value = false
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) {
    submitting.value = false
    return
  }
  resetForm(props.target)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div v-if="visible" class="zip-overlay" @click.self="close">
        <div class="zip-dialog" @click.stop>
          <div class="zip-header">
            <div>
              <div class="zip-title">{{ t('zipDialog.title') }}</div>
              <div class="zip-subtitle" :title="form.sourcePath">
                {{ target?.file?.name || form.sourceName || t('zipDialog.targetObject') }}
              </div>
            </div>
            <button class="zip-close" @click="close">×</button>
          </div>

          <div class="zip-body">
            <div class="zip-field">
              <label class="zip-label">{{ t('zipDialog.sourcePath') }}</label>
              <input class="zip-input readonly" :value="form.sourcePath" readonly />
            </div>

            <div class="zip-field">
              <label class="zip-label">{{ t('zipDialog.outputPath') }}</label>
              <input
                class="zip-input"
                v-model="form.zipPath"
                :placeholder="t('zipDialog.outputPlaceholder')"
              />
            </div>

            <div class="zip-field split">
              <div class="zip-section">
                <label class="zip-toggle">
                  <input type="checkbox" v-model="form.overwrite" />
                  <span>{{ t('zipDialog.overwrite') }}</span>
                </label>
                <div class="zip-hint">{{ t('zipDialog.overwriteHint') }}</div>
              </div>

              <div class="zip-section">
                <label class="zip-toggle">
                  <input type="checkbox" v-model="form.includeRoot" :disabled="!form.isDir" />
                  <span>{{ t('zipDialog.includeRoot') }}</span>
                </label>
                <div class="zip-hint">
                  {{ form.isDir ? t('zipDialog.dirHint') : t('zipDialog.fileHint') }}
                </div>
              </div>
            </div>
          </div>

          <div class="zip-footer">
            <button class="zip-btn secondary" @click="close">{{ t('common.cancel') }}</button>
            <button
              class="zip-btn primary"
              :disabled="submitting || !form.zipPath.trim()"
              @click="submit"
            >
              {{ submitting ? t('zipDialog.submitting') : t('zipDialog.submit') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.zip-overlay {
  position: fixed;
  inset: 0;
  z-index: 10010;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.zip-dialog {
  width: min(560px, 100%);
  max-height: min(82vh, 640px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.zip-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.zip-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.zip-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zip-close {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.75);
  color: #64748b;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.zip-close:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.zip-body {
  padding: 18px 20px 20px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.zip-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.7);
}

.zip-field.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.zip-label,
.zip-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.zip-toggle input {
  margin: 0;
}

.zip-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.zip-hint {
  font-size: 12px;
  color: #64748b;
}

.zip-input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font-size: 13px;
}

.zip-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.65);
  outline: 3px solid rgba(99, 102, 241, 0.12);
}

.zip-input.readonly {
  background: rgba(241, 245, 249, 0.95);
  color: #475569;
}

.zip-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(248, 250, 252, 0.75);
}

.zip-btn {
  min-width: 92px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.zip-btn.secondary {
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(15, 23, 42, 0.1);
  color: #334155;
}

.zip-btn.secondary:hover {
  background: rgba(255, 255, 255, 1);
}

.zip-btn.primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
}

.zip-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.zip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-10px);
}

:global(html[data-ui-theme="dark"] .zip-dialog) {
  background: rgba(15, 23, 42, 0.96);
  border-color: rgba(148, 163, 184, 0.22);
}

:global(html[data-ui-theme="dark"] .zip-header) {
  border-bottom-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .zip-title) {
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .zip-subtitle) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .zip-close) {
  background: rgba(30, 41, 59, 0.82);
  border-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .zip-close:hover) {
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .zip-body) {
  background: rgba(15, 23, 42, 0.34);
}

:global(html[data-ui-theme="dark"] .zip-field) {
  background: rgba(30, 41, 59, 0.78);
  border-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .zip-label),
:global(html[data-ui-theme="dark"] .zip-toggle) {
  color: #e5e7eb;
}

:global(html[data-ui-theme="dark"] .zip-hint) {
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .zip-input) {
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .zip-input:focus) {
  border-color: rgba(129, 140, 248, 0.62);
  outline-color: rgba(129, 140, 248, 0.18);
}

:global(html[data-ui-theme="dark"] .zip-input.readonly) {
  background: rgba(30, 41, 59, 0.92);
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .zip-footer) {
  background: rgba(15, 23, 42, 0.82);
  border-top-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .zip-btn.secondary) {
  background: rgba(30, 41, 59, 0.82);
  border-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .zip-btn.secondary:hover) {
  background: rgba(51, 65, 85, 0.92);
}
</style>
