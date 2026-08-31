<script setup lang="ts">
/**
 * FileExecuteDialog - 在当前浏览目录执行选中文件。
 * 只填参数；路径和工作目录只读。确认后立即关闭，结果走通知和控制台。
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  filePath: { type: String, default: '' },
  cwd: { type: String, default: '' },
})

const emit = defineEmits(['close', 'submit'])
const { t } = useI18n()
const args = ref('')

watch(() => props.visible, (visible) => {
  if (visible) args.value = ''
})

function close() {
  emit('close')
}

function submit() {
  emit('submit', args.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div v-if="visible" class="exec-overlay" @click.self="close">
        <div class="exec-dialog" @click.stop>
          <div class="exec-header">
            <div>
              <div class="exec-title">{{ t('executeDialog.title') }}</div>
              <div class="exec-subtitle" :title="filePath">{{ fileName || filePath }}</div>
            </div>
            <button class="exec-close" @click="close">×</button>
          </div>

          <div class="exec-body">
            <div class="exec-field">
              <label class="exec-label">{{ t('executeDialog.file') }}</label>
              <input class="exec-input readonly" :value="filePath" readonly />
            </div>
            <div class="exec-field">
              <label class="exec-label">{{ t('executeDialog.cwd') }}</label>
              <input class="exec-input readonly" :value="cwd" readonly />
            </div>
            <div class="exec-field">
              <label class="exec-label">{{ t('executeDialog.args') }}</label>
              <input
                class="exec-input"
                v-model="args"
                :placeholder="t('executeDialog.argsPlaceholder')"
                @keydown.enter.prevent="submit"
              />
            </div>
          </div>

          <div class="exec-footer">
            <button class="exec-btn secondary" @click="close">{{ t('common.cancel') }}</button>
            <button class="exec-btn primary" :disabled="!filePath" @click="submit">
              {{ t('executeDialog.submit') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.exec-overlay {
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
.exec-dialog {
  width: min(560px, 100%);
  max-height: min(82vh, 640px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}
.exec-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}
.exec-title { font-size: 16px; font-weight: 700; color: #0f172a; }
.exec-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exec-close {
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
.exec-close:hover:not(:disabled) { color: #ef4444; background: rgba(239, 68, 68, 0.08); }
.exec-close:disabled { opacity: 0.5; cursor: default; }
.exec-body {
  padding: 18px 20px 20px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.exec-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.7);
}
.exec-label { font-size: 12px; font-weight: 600; color: #475569; }
.exec-input {
  width: 100%;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  padding: 8px 10px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
}
.exec-input.readonly { background: rgba(241, 245, 249, 0.8); color: #475569; }
.exec-status { font-size: 12px; color: #6366f1; }
.exec-status.error { color: #dc2626; }
.exec-status.warn { color: #d97706; }
.exec-output {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 10px 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
}
.exec-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}
.exec-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
}
.exec-btn.secondary { background: #fff; border-color: rgba(15, 23, 42, 0.12); color: #475569; }
.exec-btn.primary { background: #6366f1; color: #fff; }
.exec-btn:disabled { opacity: 0.55; cursor: default; }
</style>
