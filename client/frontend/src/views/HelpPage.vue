<script setup lang="ts">
/**
 * HelpPage - 帮助与命令参考页面
 *
 * 展示可用命令的帮助信息，支持命令搜索和按类别过滤，为用户提供操作指引。
 */

import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Browser } from '@wailsio/runtime'
import { useAuthStore } from '../stores/auth'
import { useWSStore } from '../stores/ws'
import { useAgentStore } from '../stores/agent'
import { usePluginStore } from '../stores/plugin'
import { useThemeStore } from '../stores/theme'
import { useNotificationStore } from '../stores/notification'
import { COMMAND_HELP } from '../constants/commands'
import PageTitleIcon from '../components/common/PageTitleIcon.vue'

const { t } = useI18n()
const authStore = useAuthStore()
const wsStore = useWSStore()
const agentStore = useAgentStore()
const pluginStore = usePluginStore()
const themeStore = useThemeStore()
const notificationStore = useNotificationStore()

const expandedCommands = ref(new Set())

const commandList = computed(() =>
  Object.entries(COMMAND_HELP)
    .filter(([name]) => name !== 'HELP')
    .map(([name, info]) => ({
      name: name.toLowerCase(),
      usage: info.usage,
      desc: info.desc,
      notes: info.notes,
    }))
)

const platformLabel = computed(() => {
  const ua = navigator.userAgent || ''
  if (ua.includes('Mac')) return 'macOS'
  if (ua.includes('Linux')) return 'Linux'
  return 'Windows'
})

const wsStatusLabel = computed(() => {
  switch (wsStore.status) {
    case 'open': return { label: t('help.connected'), cls: 'tag-success' }
    case 'connecting': return { label: t('help.connecting'), cls: 'tag-warning' }
    case 'error': return { label: t('help.connectionFailed'), cls: 'tag-danger' }
    default: return { label: t('help.notConnected'), cls: 'tag-danger' }
  }
})

function toggleCommand(name: string) {
  if (expandedCommands.value.has(name)) expandedCommands.value.delete(name)
  else expandedCommands.value.add(name)
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notificationStore.success(t('help.copySuccess'))
  } catch {
    notificationStore.error(t('help.copyFailed'))
  }
}
</script>

<template>
  <div class="help-page">
    <div class="page-header">
      <div class="page-title">
        <PageTitleIcon name="help" />
        <span>{{ t('help.title') }}</span>
      </div>
    </div>

    <div class="help-body">

      <!-- 快速开始 -->
      <h2 class="help-section-title">{{ t('help.quickStart') }}</h2>
      <ol class="quick-list">
        <li><strong>{{ t('help.login') }}</strong> — {{ t('help.startClientInstruction', { address: 'https://192.168.1.100:8080' }) }}</li>
        <li><strong>{{ t('help.createListener') }}</strong> — {{ t('help.createListenerInstruction') }}</li>
        <li><strong>{{ t('help.generatePayload') }}</strong> — {{ t('help.generatePayloadInstruction') }}</li>
        <li><strong>{{ t('help.waitOnline') }}</strong> — {{ t('help.waitOnlineInstruction') }}</li>
        <li><strong>{{ t('help.interaction') }}</strong> — {{ t('help.interactionInstruction') }}</li>
        <li><strong>{{ t('help.executeCommand') }}</strong> — {{ t('help.executeCommandInstruction', { command: 'help' }) }}</li>
      </ol>

      <!-- 功能说明 -->
      <h2 class="help-section-title">{{ t('help.featureOverview') }}</h2>
      <table class="feature-table">
        <tbody>
          <tr>
            <td class="ft-name">{{ t('help.dashboard') }}</td>
            <td>{{ t('help.dashboardDescription') }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.topology') }}</td>
            <td>{{ t('help.topologyDescription') }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.generateListener') }}</td>
            <td>{{ t('help.generateListenerDescription') }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.proxyPivot') }}</td>
            <td>{{ t('help.proxyPivotDescription') }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.screenshots') }}</td>
            <td>{{ t('help.screenshotsDescription') }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.downloadFiles') }}</td>
            <td>{{ t('help.downloadFilesDescription', { command: 'download' }) }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.plugins') }}</td>
            <td>{{ t('help.pluginsDescription', { filename: 'plugin.json' }) }}</td>
          </tr>
          <tr>
            <td class="ft-name">{{ t('help.help') }}</td>
            <td>{{ t('help.helpDescription') }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 右键菜单 -->
      <h2 class="help-section-title">{{ t('help.agentContextMenu') }}</h2>
      <table class="feature-table">
        <tbody>
          <tr><td class="ft-name">{{ t('help.openConsole') }}</td><td>{{ t('help.openConsoleDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.fileBrowser') }}</td><td>{{ t('help.fileBrowserDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.processBrowser') }}</td><td>{{ t('help.processBrowserDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.networkBrowser') }}</td><td>{{ t('help.networkBrowserDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.modifySleep') }}</td><td>{{ t('help.modifySleepDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.screenshot') }}</td><td>{{ t('help.screenshotDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.executeBof') }}</td><td>{{ t('help.executeBofDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.cascadeConnection') }}</td><td>{{ t('help.cascadeConnectionDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.pluginAction') }}</td><td>{{ t('help.pluginActionDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.exitSession') }}</td><td>{{ t('help.exitSessionDescription') }}</td></tr>
          <tr><td class="ft-name">{{ t('help.deleteSession') }}</td><td>{{ t('help.deleteSessionDescription') }}</td></tr>
        </tbody>
      </table>

      <!-- 快捷键 -->
      <h2 class="help-section-title">{{ t('help.consoleShortcuts') }}</h2>
      <table class="feature-table">
        <tbody>
          <tr><td class="ft-name">↑ / ↓</td><td>{{ t('help.historyCommands') }}</td></tr>
          <tr><td class="ft-name">Tab</td><td>{{ t('help.autocomplete') }}</td></tr>
          <tr><td class="ft-name">Enter</td><td>{{ t('help.sendCommand') }}</td></tr>
          <tr><td class="ft-name">help</td><td>{{ t('help.showAllHelp') }}</td></tr>
          <tr><td class="ft-name">help &lt;cmd&gt;</td><td>{{ t('help.showCommandHelp') }}</td></tr>
          <tr><td class="ft-name">exec-bof</td><td>{{ t('help.localBofDialog') }}</td></tr>
        </tbody>
      </table>

      <!-- 命令参考 -->
      <h2 class="help-section-title">{{ t('help.commandReference') }}</h2>
      <table class="data-table cmd-table">
        <thead>
          <tr>
            <th>{{ t('help.command') }}</th>
            <th>{{ t('help.usage') }}</th>
            <th>{{ t('help.description') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="cmd in commandList" :key="cmd.name">
            <tr>
              <td class="cmd-name">{{ cmd.name }}</td>
              <td><code class="cmd-usage">{{ cmd.usage }}</code></td>
              <td>{{ cmd.desc }}</td>
              <td class="cmd-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="copyText(cmd.usage)">{{ t('help.copy') }}</button>
                <button
                  v-if="cmd.notes"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click="toggleCommand(cmd.name)"
                >
                  {{ expandedCommands.has(cmd.name) ? t('help.collapse') : t('help.details') }}
                </button>
              </td>
            </tr>
            <tr v-if="expandedCommands.has(cmd.name) && cmd.notes">
              <td colspan="4" class="cmd-notes-cell">
                <pre class="cmd-notes">{{ cmd.notes }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- 系统诊断 -->
      <h2 class="help-section-title">{{ t('help.systemDiagnostics') }}</h2>
      <div v-if="wsStore.status !== 'open'" class="diag-warning">
        {{ t('help.websocketDisconnectedWarning') }}
      </div>
      <div class="diag-grid">
        <div class="diag-item">
          <span class="diag-label">{{ t('help.version') }}</span>
          <span class="diag-value">v0.3.0</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.platform') }}</span>
          <span class="diag-value">{{ platformLabel }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.theme') }}</span>
          <span class="diag-value">{{ themeStore.label }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.teamServer') }}</span>
          <span class="diag-value">{{ authStore.apiBase || t('help.notConfigured') }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.loginStatus') }}</span>
          <span class="diag-value">{{ authStore.isLoggedIn ? t('help.loggedIn') : t('help.loggedOut') }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.websocket') }}</span>
          <span class="diag-value">
            <span class="status-dot" :class="wsStore.status === 'open' ? 'online' : 'offline'"></span>
            {{ wsStatusLabel.label }}
          </span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.agent') }}</span>
          <span class="diag-value">{{ t('help.agentStats', { online: agentStore.onlineCount, cascade: agentStore.cascadeCount, total: agentStore.agents.length }) }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">{{ t('help.pluginsCount') }}</span>
          <span class="diag-value">{{ pluginStore.plugins.length }}</span>
        </div>
      </div>

      <!-- 关于 -->
      <div class="about-line">Iris Client v0.3.0 · Wails 3 + Vue 3 · Windows / macOS / Linux</div>
      <div class="about-line">{{ t('help.aboutAuthor') }}<button type="button" class="about-link" @click="Browser.OpenURL('https://github.com/onedays12')">oneday</button></div>

    </div>
  </div>
</template>

<style scoped>
.help-page {
  height: 100vh;
  overflow-y: auto;
}

.help-body {
  padding: 0 32px 40px;
  max-width: 800px;
}

.help-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 28px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.help-section-title:first-child {
  margin-top: 0;
}

/* 快速开始 */
.quick-list {
  margin: 0;
  padding: 0 0 0 18px;
  list-style: disc;
}

.quick-list li {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

/* 功能说明 */
.feature-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.feature-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: top;
}

.ft-name {
  width: 100px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.feature-table td:last-child {
  color: var(--text-secondary);
}

/* 命令参考 */
.cmd-table {
  font-size: 12px;
}

.cmd-name {
  font-weight: 600;
  color: var(--color-primary);
  white-space: nowrap;
}

.cmd-usage {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 2px 8px;
  background: var(--bg-input);
  border-radius: 4px;
  white-space: nowrap;
}

.cmd-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  white-space: nowrap;
}

.cmd-notes-cell {
  padding: 0 12px 10px !important;
}

.cmd-notes {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 10px 14px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  margin: 0;
  white-space: pre-wrap;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 诊断 */
.diag-warning {
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #92400e;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: var(--radius-sm);
}

.diag-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.diag-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}

.diag-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
}

.diag-value {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.online { background: #10b981; }
.status-dot.offline { background: #ef4444; }

/* 关于 */
.about-line {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.about-line:first-of-type {
  margin-top: 28px;
}

.about-link {
  color: var(--color-primary);
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}

.about-link:hover {
  text-decoration: underline;
}
</style>
