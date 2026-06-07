<script setup>
/**
 * SleepConfigModal - Beacon 休眠间隔配置弹窗
 *
 * 用于设置 Beacon 的休眠时间和抖动比例，向目标 Beacon 发送 sleep 命令。
 */

import { ref, watch } from 'vue'
import { sendSleepCommand } from '../../features/beacon/actions/beaconCommandActions.js'
import { useAgentStore } from '../../stores/agent.js'
import { useConsoleStore } from '../../stores/console.js'
import { useNotificationStore } from '../../stores/notification.js'

const props = defineProps({
  visible: Boolean,
  beaconid: String
})

const emit = defineEmits(['close'])
const agentStore = useAgentStore()
const consoleStore = useConsoleStore()
const notificationStore = useNotificationStore()

const sleeptime = ref(5000)
const jitter = ref(10)
const isSubmitting = ref(false)

// 当弹窗打开时，可以根据后端数据进行初始化（如果后续有同步逻辑的话）
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // 默认恢复一组安全值
    sleeptime.value = 5000
    jitter.value = 10
  }
})

async function handleSubmit() {
  // 严格上限校验 (按照需求强制限制)
  if (sleeptime.value > 60000) {
    notificationStore.warning('SleepTime 已被修正至上限 60,000ms')
    sleeptime.value = 60000
  }
  if (jitter.value > 200) {
    notificationStore.warning('Jitter 已被修正至上限 200%')
    jitter.value = 200
  }

  isSubmitting.value = true
  try {
    consoleStore.openConsole(props.beaconid)
    consoleStore.appendToConsole(props.beaconid, 'input', `sleep ${sleeptime.value} ${jitter.value}`.trim())
    consoleStore.appendToConsole(props.beaconid, 'output', '正在下发 SleepTime 配置...')

    // 下发指令 [time, jitter]
    await sendSleepCommand(props.beaconid, sleeptime.value, jitter.value)
    consoleStore.appendToConsole(props.beaconid, 'output', 'SleepTime 已下发。')
    agentStore.updateAgent(props.beaconid, { sleep: sleeptime.value / 1000, jitter: jitter.value })
    notificationStore.success(`指令已下发: Sleep ${sleeptime.value}ms (Jitter: ${jitter.value}%)`)
    emit('close')
  } catch (err) {
    consoleStore.appendToConsole(props.beaconid, 'error', `下发 SleepTime 失败: ${err.message || err}`)
    console.error('[SleepModal] Failed to send command:', err)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Transition name="modal-fade">
<div v-if="visible" class="modal-overlay">
      <div class="modal-content glass-card">
        <header class="modal-header">
          <div class="title-area">
            <span class="icon">⏰</span>
            <h3>心跳频率配置</h3>
          </div>
          <button class="close-btn" @click="emit('close')">×</button>
        </header>

        <form @submit.prevent="handleSubmit" class="modal-body">
          <p class="description">调整 Beacon 与服务器通信的频率及波差。过于频繁的通信会增加被发现的风险。</p>

          <div class="input-group">
            <div class="label-row">
              <label>睡眠时间 (Sleeptime)</label>
              <span class="unit">{{ sleeptime }} ms</span>
            </div>
            <input 
              type="range" 
              v-model.number="sleeptime" 
              min="100" 
              max="60000" 
              step="100"
              class="range-slider"
            />
            <div class="input-with-limit">
              <input 
                type="number" 
                v-model.number="sleeptime" 
                placeholder="毫秒" 
                max="60000"
              />
              <span class="limit-hint">MAX: 60,000</span>
            </div>
          </div>

          <div class="input-group">
            <div class="label-row">
              <label>波动比例 (Jitter)</label>
              <span class="unit">{{ jitter }} %</span>
            </div>
            <input 
              type="range" 
              v-model.number="jitter" 
              min="0" 
              max="200" 
              step="1"
              class="range-slider jitter"
            />
            <div class="input-with-limit">
              <input 
                type="number" 
                v-model.number="jitter" 
                placeholder="百分比" 
                max="200"
              />
              <span class="limit-hint">MAX: 200%</span>
            </div>
          </div>

          <footer class="modal-actions">
            <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
            <button type="submit" class="btn-confirm" :disabled="isSubmitting">
              <span v-if="!isSubmitting">下发配置</span>
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
  width: 400px;
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
  margin-bottom: 24px;
}

.input-group {
  margin-bottom: 24px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.label-row label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.unit {
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 700;
}

.range-slider {
  width: 100%;
  height: 6px;
  background: var(--border-light);
  border-radius: 3px;
  appearance: none;
  margin-bottom: 12px;
}

.range-slider::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
}

.range-slider.jitter::-webkit-slider-thumb {
  background: var(--color-accent);
}

.input-with-limit {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-limit input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
}

.limit-hint {
  position: absolute;
  right: 12px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
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

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}
</style>
