<script setup>
/**
 * CredentialsPage - 凭据管理页面
 *
 * 展示从各 Beacon 收集到的凭据信息（密码哈希、浏览器密码、WiFi 密钥等），支持按 Agent 过滤。
 */

import { ref } from 'vue'
import { useAgentStore } from '../stores/agent.js'

const agentStore = useAgentStore()

// Mock data for Credentials
const credentials = ref([
  { id: '1', agentId: 'a1b2c3d4e5f6a7b8', time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), type: 'LSA Secrets', source: 'lsass.exe', data: 'Administrator:500:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::' },
  { id: '2', agentId: 'b2c3d4e5f6a7b8c9', time: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), type: 'Browser Password', source: 'Chrome', data: 'URL: https://mail.company.com | User: root | Pass: S3cr3tP@ss' },
  { id: '3', agentId: 'c3d4e5f6a7b8c9d0', time: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), type: 'WIFI Key', source: 'WLANSvc', data: 'SSID: Corp_Net | PSK: corp!2023WIFI' }
])

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

function getAgentInfo(agentId) {
  const agent = agentStore.agents.find(a => a.id === agentId)
  return agent ? { hostname: agent.hostname, ip: agent.ip } : { hostname: '未知', ip: '-' }
}
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">密码凭据 (Credentials)</h1>
        <p class="page-subtitle">查看及管理从各平台和浏览器抓取到的各类身份验证凭据</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost" style="margin-right: 12px;">
          <span class="icon">🔍</span>
          查询凭据
        </button>
        <button class="btn btn-primary">
          <span class="icon">🔑</span>
          执行自动抓取
        </button>
      </div>
    </header>

    <div class="content-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>获取时间</th>
            <th>Agent ID</th>
            <th>主机名</th>
            <th>IP 地址</th>
            <th>凭据类型 / 来源</th>
            <th>身份验证数据</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cred in credentials" :key="cred.id">
            <td class="cell-time">{{ formatTime(cred.time) }}</td>
            <td class="cell-id">{{ cred.agentId.substring(0, 8) }}</td>
            <td class="cell-hostname">{{ getAgentInfo(cred.agentId).hostname }}</td>
            <td class="cell-ip">{{ getAgentInfo(cred.agentId).ip }}</td>
            <td>
              <div class="cred-type-info">
                <span class="tag-type">{{ cred.type }}</span>
                <span class="text-source">{{ cred.source }}</span>
              </div>
            </td>
            <td class="cell-data"><code>{{ cred.data }}</code></td>
            <td class="actions-col">
              <button class="action-btn" title="复制密码">📋</button>
              <button class="action-btn danger" title="删除记录">🗑️</button>
            </td>
          </tr>
          <tr v-if="credentials.length === 0">
            <td colspan="7" class="empty-cell">凭据库目前为空</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-container { padding: 24px; height: 100%; display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; }
.page-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.5px; }
.page-subtitle { font-size: 13px; color: var(--text-muted); }
.content-panel { flex: 1; background: var(--bg-card); border: 1px solid var(--glass-border); border-radius: var(--radius-lg); backdrop-filter: blur(var(--glass-blur-md)) saturate(150%); box-shadow: var(--shadow-sm); overflow: hidden; display: flex; flex-direction: column; }
.data-table { width: 100%; border-collapse: collapse; text-align: left; }
.data-table th { padding: 12px 16px; font-size: 12px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border-light); background: rgba(255, 255, 255, 0.72); }
.data-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.data-table tbody tr:hover { background: rgba(15, 23, 42, 0.035); }

.cell-time { color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.cell-id { color: var(--color-accent); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.cell-hostname { font-weight: 500; color: var(--text-primary); }
.cell-ip { font-family: 'JetBrains Mono', monospace; font-size: 12px; }

.cred-type-info { display: flex; flex-direction: column; gap: 4px; }
.tag-type { display: inline-block; padding: 2px 6px; background: rgba(244, 114, 182, 0.15); color: #f472b6; border: 1px solid rgba(244, 114, 182, 0.3); border-radius: 4px; font-size: 11px; font-weight: 500; align-self: flex-start; }
.text-source { font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

.cell-data code { display: block; max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(15, 23, 42, 0.045); border: 1px solid var(--border-light); padding: 4px 8px; border-radius: 4px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; font-size: 11px; }

.actions-col { text-align: right; }
.action-btn { background: transparent; border: none; cursor: pointer; opacity: 0.6; font-size: 14px; padding: 4px; border-radius: 4px; transition: all 0.2s; }
.action-btn:hover { opacity: 1; background: rgba(15, 23, 42, 0.06); }
.action-btn.danger:hover { background: var(--color-danger-dim); }
.empty-cell { text-align: center; padding: 32px !important; color: var(--text-muted); }
</style>
