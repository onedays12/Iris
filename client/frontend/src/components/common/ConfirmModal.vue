<script setup>
/**
 * ConfirmModal - 通用确认弹窗
 *
 * 全局可复用的确认/取消弹窗，支持自定义标题和内容，通过 modalStore 控制显隐。
 */

import { useModalStore } from '../../stores/modal.js'

const modalStore = useModalStore()

function handleConfirm() {
  if (modalStore.confirm.onConfirm) {
    modalStore.confirm.onConfirm()
  }
}

function handleCancel() {
  if (modalStore.confirm.onCancel) {
    modalStore.confirm.onCancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
<div v-if="modalStore.confirm.visible" class="confirm-overlay">
        <div class="confirm-card glass-card" :class="modalStore.confirm.type">
          <!-- 装饰性光效 -->
          <div class="card-glow"></div>
          
          <div class="confirm-header">
            <span class="type-icon">
              <template v-if="modalStore.confirm.type === 'danger'">⚠️</template>
              <template v-else-if="modalStore.confirm.type === 'warning'">⚡</template>
              <template v-else>💡</template>
            </span>
            <h3>{{ modalStore.confirm.title }}</h3>
          </div>

          <div class="confirm-body">
            <p>{{ modalStore.confirm.message }}</p>
          </div>

          <div class="confirm-footer">
            <button class="btn btn-ghost" @click="handleCancel">{{ modalStore.confirm.cancelText || '取消' }}</button>
            <button 
              class="btn" 
              :class="modalStore.confirm.type === 'danger' ? 'btn-danger' : 'btn-primary'" 
              @click="handleConfirm"
            >
              {{ modalStore.confirm.confirmText || '继续操作' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.confirm-card {
  width: 100%;
  max-width: 400px;
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

.danger .card-glow {
  background: radial-gradient(circle, var(--color-danger-dim) 0%, transparent 70%);
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.type-icon {
  font-size: 24px;
}

.confirm-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.confirm-body {
  margin-bottom: 30px;
}

.confirm-body p {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
  white-space: pre-wrap;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 按钮基础样式适配 */
.btn {
  padding: 10px 20px;
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

.btn-danger {
  background: var(--color-danger);
  border: none;
  color: white;
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

/* 过渡动画 */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.3s;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
