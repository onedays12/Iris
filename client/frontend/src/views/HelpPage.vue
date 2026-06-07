<script setup>
/**
 * HelpPage - 帮助与命令参考页面
 *
 * 展示可用命令的帮助信息，支持命令搜索和按类别过滤，为用户提供操作指引。
 */

import { ref, computed } from 'vue'
import { Browser } from '@wailsio/runtime'
import { useAuthStore } from '../stores/auth.js'
import { useWSStore } from '../stores/ws.js'
import { useAgentStore } from '../stores/agent.js'
import { usePluginStore } from '../stores/plugin.js'
import { useThemeStore } from '../stores/theme.js'
import { useNotificationStore } from '../stores/notification.js'
import { COMMAND_HELP } from '../constants/commands.js'

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
    case 'open': return { label: '已连接', cls: 'tag-success' }
    case 'connecting': return { label: '连接中', cls: 'tag-warning' }
    case 'error': return { label: '连接失败', cls: 'tag-danger' }
    default: return { label: '未连接', cls: 'tag-danger' }
  }
})

function toggleCommand(name) {
  if (expandedCommands.value.has(name)) expandedCommands.value.delete(name)
  else expandedCommands.value.add(name)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    notificationStore.success('已复制')
  } catch {
    notificationStore.error('复制失败')
  }
}
</script>

<template>
  <div class="help-page">
    <div class="page-header">
      <div class="page-title">
        <span class="icon">❓</span>
        <span>帮助</span>
      </div>
    </div>

    <div class="help-body">

      <!-- 快速开始 -->
      <h2 class="help-section-title">快速开始</h2>
      <ol class="quick-list">
        <li><strong>登录</strong> — 启动客户端后，在登录页填入 TeamServer 地址（如 <code>https://192.168.1.100:8080</code>）和凭证，点击登录</li>
        <li><strong>创建监听器</strong> — 进入「生成监听器」页面，新建 HTTP 或 HTTPS 监听器（填入监听地址和端口）</li>
        <li><strong>生成 Payload</strong> — 在监听器卡片上点击「生成 Beacon」，选择架构和输出格式（EXE/DLL/Shellcode），下载到目标机执行</li>
        <li><strong>等待上线</strong> — 目标机运行 Payload 后，仪表盘会自动显示新上线的 Agent（绿色圆点 = 在线）</li>
        <li><strong>交互操作</strong> — 右键 Agent 行打开菜单：控制台、文件浏览器、进程管理、网络信息、截图、BOF 执行等</li>
        <li><strong>执行命令</strong> — 在控制台中输入命令回车发送，输入 <code>help</code> 查看所有可用命令</li>
      </ol>

      <!-- 功能说明 -->
      <h2 class="help-section-title">功能说明</h2>
      <table class="feature-table">
        <tbody>
          <tr>
            <td class="ft-name">仪表盘</td>
            <td>Agent 列表与状态总览。支持按主机名/IP/用户名搜索过滤。右键菜单提供：打开控制台、文件浏览、进程管理、网络浏览器、修改 Sleep、截图、执行 BOF、级联连接、退出/删除会话等操作</td>
          </tr>
          <tr>
            <td class="ft-name">拓扑图</td>
            <td>以图形方式展示 Agent 之间的级联关系。节点可拖拽布局，右键节点可执行与仪表盘相同的操作。支持级联链路的 TCP/SMB 连接可视化</td>
          </tr>
          <tr>
            <td class="ft-name">生成监听器</td>
            <td>管理 HTTP/HTTPS/DNS/ExternalC2/SMB 等协议的监听器。创建监听器后，从卡片上生成 Beacon Payload（支持 EXE、DLL、Shellcode 等格式）</td>
          </tr>
          <tr>
            <td class="ft-name">Proxy Pivot</td>
            <td>通过 Beacon 建立 SOCKS5 代理或端口转发隧道。支持创建、暂停、恢复、停止隧道。可查看隧道状态、已传输字节数和断开原因</td>
          </tr>
          <tr>
            <td class="ft-name">Screenshots</td>
            <td>Beacon 截图列表，支持按 Agent 过滤、大图预览、保存到本地、请求新截图、删除</td>
          </tr>
          <tr>
            <td class="ft-name">下载文件</td>
            <td>通过 <code>download</code> 命令回传的文件列表，点击保存可导出到本地磁盘</td>
          </tr>
          <tr>
            <td class="ft-name">插件</td>
            <td>添加含 <code>plugin.json</code> 的目录即可注册插件。插件动作会出现在 Agent 右键菜单中，支持 BOF 执行和自定义参数输入</td>
          </tr>
          <tr>
            <td class="ft-name">帮助</td>
            <td>当前页面。查看命令参考、系统诊断信息、功能说明</td>
          </tr>
        </tbody>
      </table>

      <!-- 右键菜单 -->
      <h2 class="help-section-title">Agent 右键菜单</h2>
      <table class="feature-table">
        <tbody>
          <tr><td class="ft-name">打开控制台</td><td>打开该 Agent 的交互式控制台，可输入命令并查看输出</td></tr>
          <tr><td class="ft-name">文件浏览器</td><td>浏览远程文件系统，支持导航、下载、上传、删除、创建文件夹、压缩 ZIP、修改属性</td></tr>
          <tr><td class="ft-name">进程浏览器</td><td>查看远程进程列表，支持搜索、排序、终止进程</td></tr>
          <tr><td class="ft-name">网络浏览器</td><td>查看网络接口信息和活动网络连接</td></tr>
          <tr><td class="ft-name">修改 Sleep</td><td>调整 Beacon 心跳间隔（毫秒）和抖动比例</td></tr>
          <tr><td class="ft-name">截图</td><td>请求并获取远程屏幕截图</td></tr>
          <tr><td class="ft-name">执行 BOF</td><td>打开 BOF 执行对话框，选择 Beacon Object File 并传入参数执行</td></tr>
          <tr><td class="ft-name">级联连接</td><td>通过 TCP 或 SMB 管道连接子 Beacon，构建多层代理链路</td></tr>
          <tr><td class="ft-name">插件动作</td><td>执行已注册的插件动作（如有参数则弹出输入对话框）</td></tr>
          <tr><td class="ft-name">退出会话</td><td>下发 exit 指令，终止目标机上的 Beacon 进程（不可恢复）</td></tr>
          <tr><td class="ft-name">删除会话</td><td>注销并删除 Agent 记录，同步清理服务端缓存（不可撤销）</td></tr>
        </tbody>
      </table>

      <!-- 快捷键 -->
      <h2 class="help-section-title">控制台快捷操作</h2>
      <table class="feature-table">
        <tbody>
          <tr><td class="ft-name">↑ / ↓</td><td>翻阅历史命令</td></tr>
          <tr><td class="ft-name">Tab</td><td>命令名自动补全（循环匹配）</td></tr>
          <tr><td class="ft-name">Enter</td><td>发送命令</td></tr>
          <tr><td class="ft-name">help</td><td>显示所有可用命令帮助</td></tr>
          <tr><td class="ft-name">help &lt;cmd&gt;</td><td>显示指定命令的详细用法</td></tr>
          <tr><td class="ft-name">exec-bof</td><td>打开 BOF 执行对话框（本地命令，不发送到 Beacon）</td></tr>
        </tbody>
      </table>

      <!-- 命令参考 -->
      <h2 class="help-section-title">命令参考</h2>
      <table class="data-table cmd-table">
        <thead>
          <tr>
            <th>命令</th>
            <th>用法</th>
            <th>说明</th>
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
                <button type="button" class="btn btn-ghost btn-sm" @click="copyText(cmd.usage)">复制</button>
                <button
                  v-if="cmd.notes"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click="toggleCommand(cmd.name)"
                >
                  {{ expandedCommands.has(cmd.name) ? '收起' : '详情' }}
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
      <h2 class="help-section-title">系统诊断</h2>
      <div v-if="wsStore.status !== 'open'" class="diag-warning">
        WebSocket 未连接，部分功能可能不可用
      </div>
      <div class="diag-grid">
        <div class="diag-item">
          <span class="diag-label">版本</span>
          <span class="diag-value">v0.0.1</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">平台</span>
          <span class="diag-value">{{ platformLabel }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">主题</span>
          <span class="diag-value">{{ themeStore.label }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">TeamServer</span>
          <span class="diag-value">{{ authStore.apiBase || '未配置' }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">登录状态</span>
          <span class="diag-value">{{ authStore.isLoggedIn ? '已登录' : '未登录' }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">WebSocket</span>
          <span class="diag-value">
            <span class="status-dot" :class="wsStore.status === 'open' ? 'online' : 'offline'"></span>
            {{ wsStatusLabel.label }}
          </span>
        </div>
        <div class="diag-item">
          <span class="diag-label">Agent</span>
          <span class="diag-value">在线 {{ agentStore.onlineCount }} / 级联 {{ agentStore.cascadeCount }} / 全部 {{ agentStore.agents.length }}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">插件</span>
          <span class="diag-value">{{ pluginStore.plugins.length }}</span>
        </div>
      </div>

      <!-- 关于 -->
      <div class="about-line">Iris Client v0.0.1 · Wails 3 + Vue 3 · Windows / macOS / Linux</div>
      <div class="about-line">作者：<button type="button" class="about-link" @click="Browser.OpenURL('https://github.com/onedays12')">oneday</button></div>

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
