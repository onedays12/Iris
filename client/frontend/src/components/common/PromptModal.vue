<script setup lang="ts">
/**
 * PromptModal - 通用输入提示弹窗
 *
 * 全局可复用的单行输入弹窗，支持自定义标题、提示文本和默认值，通过 modalStore 控制显隐。
 */

import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalStore } from '../../stores/modal'

const { t } = useI18n()
const modalStore = useModalStore()
const inputRef = ref<HTMLInputElement | null>(null)
const inputValue = ref('')

// 当弹窗可见时，重置输入值并自动聚焦
watch(() => modalStore.prompt.visible, async (visible) => {
  if (visible) {
    inputValue.value = modalStore.prompt.value || ''
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
})

function handleConfirm() {
  if (modalStore.prompt.onConfirm) {
    modalStore.prompt.onConfirm(inputValue.value)
  }
}

function handleCancel() {
  if (modalStore.prompt.onCancel) {
    modalStore.prompt.onCancel()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleConfirm()
  } else if (e.key === 'Escape') {
    handleCancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="prompt-fade">
<div v-if="modalStore.prompt.visible" class="prompt-overlay">
        <div class="prompt-card glass-card">
          <!-- 装饰性光效 -->
          <div class="card-glow"></div>
          
          <div class="prompt-header">
            <span class="type-icon">📝</span>
            <h3>{{ modalStore.prompt.title }}</h3>
          </div>

          <div class="prompt-body">
            <p v-if="modalStore.prompt.message">{{ modalStore.prompt.message }}</p>
            <div class="input-wrapper">
              <input 
                ref="inputRef"
                v-model="inputValue"
                type="text"
                :placeholder="modalStore.prompt.placeholder"
                class="prompt-input"
                spellcheck="false"
                @keydown="handleKeydown"
              />
            </div>
          </div>

          <div class="prompt-footer">
            <button class="btn btn-ghost" @click="handleCancel">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="handleConfirm">{{ t('common.confirm') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.prompt-card {
  width: 100%;
  max-width: 420px;
  padding: 30px;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes slideIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.card-glow {
  display: none;
}

.prompt-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.type-icon { font-size: 24px; }

.prompt-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.prompt-body {
  margin-bottom: 30px;
}

.prompt-body p {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.input-wrapper {
  position: relative;
}

.prompt-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.prompt-input:focus {
  border-color: var(--color-primary);
  background: var(--bg-input-focus);
  outline: 3px solid var(--color-primary-dim);
}

.prompt-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 按钮基础样式适配 */
.btn {
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--color-primary);
  border: none;
  color: white;
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

/* 过渡动画 */
.prompt-fade-enter-active,
.prompt-fade-leave-active {
  transition: opacity 0.3s;
}

.prompt-fade-enter-from,
.prompt-fade-leave-to {
  opacity: 0;
}
</style>
