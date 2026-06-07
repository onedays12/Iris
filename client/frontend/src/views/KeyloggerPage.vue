<script setup>
/**
 * KeyloggerPage - 键盘记录页面
 *
 * 展示各 Beacon 捕获的键盘记录数据，支持按 Agent 过滤和时间排序查看。
 */

import { ref } from 'vue'
import { useAgentStore } from '../stores/agent.js'

const agentStore = useAgentStore()

// Mock data for keylogger
const keylogs = ref([
  { id: '1', agentId: 'a1b2c3d4e5f6a7b8', time: new Date(Date.now() - 1000 * 60 * 5).toISOString(), content: '[CTRL]c cmd[ENTER]ping 8.8.8.8[ENTER]' },
  { id: '2', agentId: 'b2c3d4e5f6a7b8c9', time: new Date(Date.now() - 1000 * 60 * 15).toISOString(), content: 'admin1234![TAB]password[ENTER]' },
  { id: '3', agentId: 'c3d4e5f6a7b8c9d0', time: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), content: 'https://github.com[ENTER]' }
])

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

function getAgentInfo(agentId) {
  const agent = agentStore.agents.find(a => a.id === agentId)
  if (agent) return { hostname: agent.hostname, ip: agent.ip }
  return { hostname: '未知', ip: '-' }
}
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">键盘记录 (Keylogger)</h1>
        <p class="page-subtitle">监控和查看目标主机的键盘输入记录</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary">
          <span class="icon">➕</span>
          新建记录任务
        </button>
      </div>
    </header>

    <div class="content-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>记录时间</th>
            <th>Agent ID</th>
            <th>主机名</th>
            <th>IP 地址</th>
            <th>记录内容 (片段)</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in keylogs" :key="log.id">
            <td class="cell-time">{{ formatTime(log.time) }}</td>
            <td class="cell-id">{{ log.agentId.substring(0, 8) }}</td>
            <td class="cell-hostname">{{ getAgentInfo(log.agentId).hostname }}</td>
            <td class="cell-ip">{{ getAgentInfo(log.agentId).ip }}</td>
            <td class="cell-content"><code>{{ log.content }}</code></td>
            <td class="actions-col">
              <button class="action-btn" title="查看详情">📄</button>
              <button class="action-btn danger" title="删除">🗑️</button>
            </td>
          </tr>
          <tr v-if="keylogs.length === 0">
            <td colspan="6" class="empty-cell">暂无键盘记录数据</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-muted);
}

.content-panel {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(150%);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table th {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
  background: rgba(255, 255, 255, 0.72);
}

.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover {
  background: rgba(15, 23, 42, 0.035);
}

.cell-time { color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.cell-id { color: var(--color-accent); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.cell-hostname { font-weight: 500; color: var(--text-primary); }
.cell-ip { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.cell-content code {
  background: rgba(15, 23, 42, 0.045);
  border: 1px solid var(--border-light);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.actions-col { text-align: right; }
.action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.6;
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.action-btn:hover { opacity: 1; background: rgba(15, 23, 42, 0.06); }
.action-btn.danger:hover { background: var(--color-danger-dim); }

.empty-cell {
  text-align: center;
  padding: 32px !important;
  color: var(--text-muted);
}
</style>
