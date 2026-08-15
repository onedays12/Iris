<script setup lang="ts">
/**
 * FileContextMenu - 文件浏览器右键菜单
 *
 * 磨砂玻璃弹出菜单，根据目标类型（空白/文件夹/文件）展示不同操作项。
 * 通过 Teleport 挂载到 body，全局定位。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** 菜单目标：{ type: 'blank'|'folder'|'file', file?, path? } */
  target: { type: Object, default: null },
  /** 菜单位置 */
  pos: { type: Object, required: true },
  /** 是否正在上传中（用于禁用上传项） */
  isUploading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'action',   // (action: string, target: object) => void
  'upload',   // (target: object) => void
])

const { t } = useI18n()
const menuRef = ref(null)

function onAction(action: string) {
  emit('action', action, props.target)
}

function onUpload() {
  emit('upload', props.target)
}

// 暴露给父组件用于位置修正
defineExpose({ menuRef })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div
        v-if="target"
        class="glass-menu"
        ref="menuRef"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
        @click.stop
      >
        <div
          v-if="target.type !== 'file'"
          class="menu-item"
          :class="{ disabled: isUploading }"
          @click="!isUploading && onUpload()"
        >
          <span class="m-icon">📤</span> {{ isUploading ? t('fileMenu.uploading') : t('fileMenu.upload') }}
        </div>
        <div
          v-if="target.type === 'blank'"
          class="menu-item"
          @click="onAction('mkdir')"
        >
          <span class="m-icon">📁</span> {{ t('fileMenu.mkdir') }}
        </div>
        <div v-if="target.type === 'file'" class="menu-item" @click="onAction('download')">
          <span class="m-icon">📥</span> {{ t('fileMenu.download') }}
        </div>
        <template v-if="target.type !== 'blank'">
          <div class="menu-item" @click="onAction('zip')"><span class="m-icon">🗜️</span> {{ t('fileMenu.zip') }}</div>
          <div class="menu-item" @click="onAction('move')"><span class="m-icon">✂️</span> {{ t('fileMenu.move') }}</div>
          <div class="menu-item" @click="onAction('copy')"><span class="m-icon">📋</span> {{ t('fileMenu.copy') }}</div>
          <div class="menu-item" @click="onAction('setattr')"><span class="m-icon">🛠️</span> {{ t('fileMenu.setattr') }}</div>
          <div class="menu-divider"></div>
          <div class="menu-item delete" @click="onAction('delete')">
            <span class="m-icon">🗑️</span> {{ t('fileMenu.delete') }}
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.glass-menu {
  position: fixed;
  width: 168px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(15px);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 8px;
  z-index: 10000;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.menu-item:hover {
  background: #f1f5f9;
  color: #6366f1;
}

.menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-item.delete:hover {
  background: #fef2f2;
  color: #ef4444;
}

.menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.05);
  margin: 4px 0;
}

.m-icon {
  font-size: 14px;
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

/* 暗色主题 */
:global(html[data-ui-theme="dark"] .glass-menu) {
  background: rgba(15, 23, 42, 0.94);
  border-color: rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

:global(html[data-ui-theme="dark"] .menu-item) {
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .menu-item:hover) {
  background: rgba(129, 140, 248, 0.14);
  color: #e0e7ff;
}

:global(html[data-ui-theme="dark"] .menu-item.delete:hover) {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .menu-divider) {
  background: rgba(148, 163, 184, 0.14);
}
</style>
