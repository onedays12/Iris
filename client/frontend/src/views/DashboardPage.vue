<script setup lang="ts">
/**
 * DashboardPage - 主控制面板页面
 *
 * 展示已连接的 Beacon 列表，支持搜索过滤和手动刷新，是应用的首页。
 */

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '../stores/agent'
import AgentTable from '../components/dashboard/AgentTable.vue'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'

const { t } = useI18n()
const agentStore = useAgentStore()
const searchQuery = ref('')
const isRefreshing = ref(false)

async function refreshDashboard() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await agentStore.fetchAgents()
  } finally {
    isRefreshing.value = false
  }
}
</script>

<template>
  <div class="dashboard-page">
    <!-- 页头 -->
    <div class="page-header">
      <div class="page-title">
        <PageTitleIcon name="dashboard" />
        <span>{{ t('dashboard.title') }}</span>
      </div>
      
      <!-- 全局搜索框 -->
      <div class="header-search">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            v-model="searchQuery" 
            type="text" 
            :placeholder="t('dashboard.searchPlaceholder')" 
            spellcheck="false"
            class="global-search-input"
          />
          <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">×</button>
        </div>
      </div>

      <div class="header-summary">
        <div class="header-stats">
          <div class="stat-item">
            <span class="stat-value">{{ agentStore.agents.length }}</span>
            <span class="stat-label">{{ t('dashboard.allAgents') }}</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value online">{{ agentStore.onlineCount }}</span>
            <span class="stat-label">{{ t('dashboard.online') }}</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value cascade">{{ agentStore.cascadeCount }}</span>
            <span class="stat-label">{{ t('dashboard.cascade') }}</span>
          </div>
        </div>

        <div class="header-actions">
          <button
            class="btn btn-ghost"
            :disabled="isRefreshing"
            @click="refreshDashboard"
            :title="t('dashboard.refreshList')"
          >
            <svg :class="{ spin: isRefreshing }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Agent 表格区域 -->
    <div class="table-section glass-card">
      <AgentTable :searchQuery="searchQuery" @clearSearch="searchQuery = ''" />
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.header-summary {
  display: flex;
  align-items: center;
  gap: 12px;
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

.header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(150%);
  box-shadow: var(--shadow-sm);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-value.online {
  color: var(--color-success);
}

.stat-value.cascade {
  color: var(--color-accent);
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-divider {
  width: 1px;
  height: 30px;
  background: var(--border);
}

.table-section {
  flex: 1 1 auto;
  min-height: 240px;
  margin: 0 24px 24px;
  overflow-y: auto;
  padding: 0;
}
</style>
