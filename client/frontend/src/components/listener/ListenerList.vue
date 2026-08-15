<script setup lang="ts">
/**
 * ListenerList - 监听器列表组件
 * 展示所有监听器的协议、地址、端口信息，
 * 支持编辑、删除、生成 Beacon 等操作。
 */

import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useListenerStore } from '../../stores/listener'
import { useModalStore } from '../../stores/modal'
import { useNotificationStore } from '../../stores/notification'
import type { Listener } from '../../features/listener/model'

const props = defineProps<{
  listeners: Listener[]
}>()

const emit = defineEmits(['delete', 'edit'])
const { t, locale } = useI18n()
const listenerStore = useListenerStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()

// 排序状态
const sortBy = ref('') // 'name' | 'createdAt'
const sortOrder = ref('asc') // 'asc' | 'desc'

const sortedListeners = computed(() => {
  const result = [...props.listeners]
  if (!sortBy.value) return result

  return result.sort((a, b) => {
    const key = sortBy.value as keyof Listener
    const valA = String(a[key] ?? '')
    const valB = String(b[key] ?? '')

    // 处理字符串排序 (Case Insensitive)
    if (sortBy.value === 'name') {
      return sortOrder.value === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA)
    }

    // 处理日期排序
    if (sortBy.value === 'createdAt') {
      const timeA = new Date(valA).getTime()
      const timeB = new Date(valB).getTime()
      return sortOrder.value === 'asc' ? timeA - timeB : timeB - timeA
    }

    return 0
  })
})

function handleSort(key: string) {
  if (sortBy.value === key) {
    if (sortOrder.value === 'asc') {
      sortOrder.value = 'desc'
    } else {
      sortBy.value = ''
      sortOrder.value = 'asc'
    }
  } else {
    sortBy.value = key
    sortOrder.value = 'asc'
  }
}

function getStatusClass(status: string) {
  if (status === 'started') return 'tag-success'
  if (status === 'paused') return 'tag-warning'
  if (status === 'error') return 'tag-danger'
  return 'tag-danger'
}

function getStatusLabel(status: string) {
  const map = {
    'started': t('listenerList.statusStarted'),
    'paused': t('listenerList.statusPaused'),
    'stopped': t('listenerList.statusStopped'),
    'error': t('listenerList.statusError')
  }
  return map[status as keyof typeof map] || status
}

function parseConfigObject(configSource: unknown): Record<string, any> {
  if (typeof configSource === 'string') {
    try {
      return JSON.parse(configSource || '{}')
    } catch (e) {
      return {}
    }
  } else if (configSource && typeof configSource === 'object' && !Array.isArray(configSource)) {
    return configSource as Record<string, any>
  }

  return {}
}

function readConfigValue(configSource: unknown, keys: string[]) {
  const config = parseConfigObject(configSource)
  for (const key of keys) {
    if (config[key] !== undefined && config[key] !== '') {
      return config[key]
    }
  }
  return '-'
}

function getListenerHost(listener: Listener) {
  const keys = listener.listenerType === 'internal'
    ? ['bind_host', 'host']
    : ['host', 'bind_host']
  return readConfigValue(listener.config, keys)
}

function getListenerPort(listener: Listener) {
  const keys = listener.listenerType === 'internal'
    ? ['bind_port', 'port']
    : ['port', 'bind_port']
  return readConfigValue(listener.config, keys)
}

function toggleListener(listener: Listener) {
  if (listener.status === 'started') {
    listenerStore.stopListener(listener.name)
  } else {
    listenerStore.startListener(listener.name)
  }
}

function handleGenerateClient(listener: Listener) {
  if (listener.status !== 'started') {
    notificationStore.warning(t('listenerList.onlyStartedCanGenerate'))
    return
  }
  modalStore.openGenerateBeacon(listener.id)
}

function formatTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString(locale.value) + ' ' + d.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="listener-list">
    <table class="data-table" v-if="listeners.length > 0">
      <thead>
        <tr>
          <th style="width: 40px"></th>
          <th class="sortable" @click="handleSort('name')">
            <div class="header-content">
              <span>{{ t('listenerList.colName') }}</span>
              <span class="sort-icon" v-if="sortBy === 'name'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </div>
          </th>
          <th>{{ t('listenerList.colProtocol') }}</th>
          <th>{{ t('listenerList.colType') }}</th>
          <th>{{ t('listenerList.colAddress') }}</th>
          <th>{{ t('listenerList.colPort') }}</th>
          <th>{{ t('listenerList.colStatus') }}</th>
          <th class="sortable" @click="handleSort('createdAt')">
            <div class="header-content">
              <span>{{ t('listenerList.colCreatedAt') }}</span>
              <span class="sort-icon" v-if="sortBy === 'createdAt'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </div>
          </th>
          <th style="width: 120px">{{ t('listenerList.colActions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="listener in sortedListeners" :key="listener.id">
          <td>
            <span class="status-dot" :class="listener.status === 'started' ? 'online' : 'offline'"></span>
          </td>
          <td>
            <span class="cell-name">{{ listener.name }}</span>
          </td>
          <td>
            <span class="protocol-badge">{{ listener.protocol.toUpperCase() }}</span>
          </td>
          <td>
            <span 
              class="ltype-tag" 
              :class="listener.listenerType === 'external' ? 'tag-external' : 'tag-internal'"
            >
              {{ listener.listenerType === 'external' ? 'External' : 'Internal' }}
            </span>
          </td>
          <td class="cell-mono">{{ getListenerHost(listener) }}</td>
          <td class="cell-mono">
            {{ getListenerPort(listener) }}
            <span v-if="listener.listenerType === 'internal'" class="p2p-badge">P2P</span>
          </td>
          <td>
            <span class="tag" :class="getStatusClass(listener.status)">
              {{ getStatusLabel(listener.status) }}
            </span>
          </td>
          <td class="cell-time">{{ formatTime(listener.createdAt) }}</td>
          <td>
            <div class="action-btns">
              <button
                class="btn btn-sm btn-ghost"
                @click="toggleListener(listener)"
                :title="listener.status === 'started' ? t('listenerList.stop') : t('listenerList.start')"
              >
                <svg v-if="listener.status === 'started'" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              </button>
              <button
                class="btn btn-sm btn-ghost"
                @click="handleGenerateClient(listener)"
                :disabled="listener.status !== 'started'"
                :title="t('listenerList.generateClient')"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 3h20v14a2 2 0 01-2 2H4a2 2 0 01-2-2V3z"/>
                  <path d="M8 21h8"/>
                  <path d="M12 17v4"/>
                  <path d="M7 8l5 5 5-5"/>
                </svg>
              </button>
              <button
                class="btn btn-sm btn-ghost"
                @click="$emit('edit', listener)"
                :title="t('listenerList.edit')"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                class="btn btn-sm btn-ghost danger-hover"
                @click="$emit('delete', listener.name)"
                :title="t('listenerList.delete')"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="icon">📡</div>
      <div class="title">{{ t('listenerList.emptyTitle') }}</div>
      <div class="desc">{{ t('listenerList.emptyDesc') }}</div>
    </div>
  </div>
</template>

<style scoped>
.cell-name {
  font-weight: 500;
  color: var(--text-primary);
}

.protocol-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  background: var(--color-accent-dim);
  color: var(--color-accent);
  border: 1px solid rgba(34, 211, 238, 0.2);
  border-radius: 4px;
}

.ltype-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tag-external {
  background: rgba(168, 85, 247, 0.1);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.tag-internal {
  background: rgba(251, 146, 60, 0.1);
  color: #fb923c;
  border: 1px solid rgba(251, 146, 60, 0.2);
}

.p2p-badge {
  font-size: 10px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-muted);
  padding: 0 4px;
  border-radius: 3px;
  margin-left: 4px;
}

.cell-mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.cell-time {
  font-size: 12px;
  color: var(--text-muted);
}

.action-btns {
  display: flex;
  gap: 4px;
}

/* 排序样式 */
th.sortable {
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

th.sortable:hover {
  background: rgba(255, 255, 255, 0.05);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-icon {
  color: var(--color-primary);
  font-size: 14px;
  font-weight: bold;
}

.danger-hover:hover {
  color: var(--color-danger) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
  background: var(--color-danger-dim) !important;
}
</style>
