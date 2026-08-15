<script setup lang="ts">
/**
 * ListenerPage - 监听器管理页面
 *
 * 管理 C2 监听器的创建、编辑和删除，支持生成 Beacon 连接载荷。
 */

import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useListenerStore } from '../stores/listener'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'
import type { Listener } from '../features/listener/model'
import ListenerList from '../components/listener/ListenerList.vue'
import ListenerDialog from '../components/listener/ListenerDialog.vue'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'

const { t } = useI18n()
const listenerStore = useListenerStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const showDialog = ref(false)
const editingListener = ref<Listener | undefined>(undefined)

function handleCreate() {
  closeDialog()
}

function handleEdit(listener: Listener) {
  editingListener.value = listener
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingListener.value = undefined
}

async function handleDelete(name: string) {
  // 删除为不可逆操作，必须先经操作员确认
  const confirmed = await modalStore.showConfirm({
    title: t('listenerPage.deleteConfirmTitle'),
    message: t('listenerPage.deleteConfirmMessage', { name }),
    type: 'danger',
    confirmText: t('listenerPage.deleteConfirmButton'),
  })

  if (!confirmed) return

  try {
    await listenerStore.deleteListener(name)
    notificationStore.success(t('listenerPage.deleteSuccess', { name }))
  } catch (err) {
    notificationStore.error((err instanceof Error ? err.message : String(err)) || t('listenerPage.deleteError'))
    console.error('[ListenerPage] 删除监听器失败:', err)
  }
}
</script>

<template>
  <div class="listener-page">
    <div class="page-header">
      <div class="page-title">
        <PageTitleIcon name="listener" />
        <span>{{ t('listenerPage.title') }}</span>
      </div>
      <div class="header-actions">
        <button 
          class="btn btn-ghost" 
          @click="listenerStore.fetchListeners()" 
          :title="t('listenerPage.refreshList')"
          :disabled="listenerStore.loading"
        >
          <svg :class="{ 'spin': listenerStore.loading }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </button>
        <button class="btn btn-primary" @click="showDialog = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ t('listenerPage.create') }}
        </button>
      </div>
    </div>

    <div class="list-section glass-card">
      <ListenerList 
        :listeners="listenerStore.listeners" 
        @delete="handleDelete" 
        @edit="handleEdit"
      />
    </div>

    <!-- 对话框 -->
    <ListenerDialog
      v-if="showDialog"
      :edit-data="editingListener"
      @confirm="handleCreate"
      @cancel="closeDialog"
    />
  </div>
</template>

<style scoped>
.listener-page {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-section {
  flex: 1 1 auto;
  min-height: 240px;
  margin: 0 24px 24px;
  overflow-y: auto;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
