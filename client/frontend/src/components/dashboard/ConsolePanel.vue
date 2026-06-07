<script setup>
/**
 * ConsolePanel - 全局控制台面板
 * 支持多 Tab 切换、命令历史、Tab 补全、
 * 内置 help/local 命令，以及结构化参数发送。
 */

import { ref, nextTick, watch, computed, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agent.js'
import { useConsoleStore } from '../../stores/console.js'
import { useModalStore } from '../../stores/modal.js'
import {
  getCommandId,
  COMMAND_HELP,
  COMMAND_HELP_ALIASES,
  COMMAND_ID,
  LOCAL_COMMAND_HELP,
  isCommandSupportedForOS,
  getSupportedCommandNamesForOS,
  getSupportedLocalCommandNamesForOS,
  getSupportedCommandHelpEntriesForOS,
  getSupportedLocalCommandHelpEntriesForOS,
  getUnsupportedCommandMessage,
} from '../../constants/commands.js'

// ─── 初始化 ───

const agentStore = useAgentStore()
const consoleStore = useConsoleStore()
const modalStore = useModalStore()

// ─── 状态 ───

const commandInput = ref('')
const outputRef = ref(null)

// ─── 计算属性 ───

const currentConsole = computed(() => consoleStore.currentConsole)
const activeBeacon = computed(() => agentStore.getAgentById(consoleStore.activeBeaconId))
const activeBeaconOs = computed(() => String(activeBeacon.value?.os || ''))

// ─── 命令历史与 Tab 补全 ───
const historyIndex = ref(-1)
const historyTemp = ref('') // 暂存当前输入
const lastTabPrefix = ref('')
const lastTabIndex = ref(-1)

function isCommandAllowed(command) {
  return isCommandSupportedForOS(command, activeBeaconOs.value)
}

// ─── 面板拖拽调整高度 ───
const panelHeight = ref(350)
let isDragging = false
let startY = 0
let startHeight = 0

function startDrag(e) {
  isDragging = true
  startY = e.clientY
  startHeight = panelHeight.value
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.userSelect = 'none' // 防止拖拽时选中文本
}

function onDrag(e) {
  if (!isDragging) return
  // 向上拖拽 clientY 减小，面板高度应该增加
  const delta = startY - e.clientY
  let newHeight = startHeight + delta
  
  // 限制最小和最大高度
  const minHeight = 200
  const maxHeight = window.innerHeight * 0.8
  
  if (newHeight < minHeight) newHeight = minHeight
  if (newHeight > maxHeight) newHeight = maxHeight
  
  panelHeight.value = newHeight
}

function stopDrag() {
  if (isDragging) {
    isDragging = false
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
    document.body.style.userSelect = ''
  }
}

onUnmounted(() => {
  stopDrag()
})

// 自动滚动到底部
watch(
  () => consoleStore.currentConsole?.history?.length,
  async () => {
    await nextTick()
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  }
)

/**
 * 核心解析逻辑：支持引号包裹的路径解析 (Shell-like)
 */
function parseCommandLine(input) {
  // 正则匹配：非空白字符，或者由双引号/单引号包裹的内容
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
  const parts = []
  let match
  
  while ((match = regex.exec(input)) !== null) {
    // 优先取捕获组 1 (双引号内容) 或 2 (单引号内容)，否则取整体匹配
    parts.push(match[1] || match[2] || match[0])
  }
  
  if (parts.length === 0) return null
  
  const cmdName = parts[0]
  const args = parts.slice(1)
  const cmdId = getCommandId(cmdName)
  
  return {
    cmdName,
    cmdId,
    args
  }
}

function getRawCommandAfterName(input, cmdName) {
  return String(input || '')
    .slice(String(cmdName || '').length)
    .replace(/^\s+/, '')
}

/**
 * 键盘快捷键处理
 */
function handleKeyDown(e) {
  const history = consoleStore.commandHistory
  
  // 1. 历史命令导航 (Up/Down)
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (history.length === 0) return
    
    // 如果是第一次按向上，保存当前正在输入的文本
    if (historyIndex.value === -1) {
      historyTemp.value = commandInput.value
    }
    
    if (historyIndex.value < history.length - 1) {
      historyIndex.value++
      commandInput.value = history[history.length - 1 - historyIndex.value]
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (historyIndex.value > -1) {
      historyIndex.value--
      if (historyIndex.value === -1) {
        commandInput.value = historyTemp.value
      } else {
        commandInput.value = history[history.length - 1 - historyIndex.value]
      }
    }
  } 
  
  // 2. Tab 自动补全
  else if (e.key === 'Tab') {
    e.preventDefault()
    
    // 如果是开启新的补全会话
    if (lastTabIndex.value === -1) {
      const input = commandInput.value.trim()
      if (!input || input.includes(' ')) return // 目前仅支持指令名补全
      lastTabPrefix.value = input.toLowerCase()
    }

    const commands = [
      ...getSupportedCommandNamesForOS(activeBeaconOs.value),
      ...getSupportedLocalCommandNamesForOS(activeBeaconOs.value),
    ]
    const prefix = lastTabPrefix.value
    
    // 寻找匹配项并排序（保证循环顺序一致）
    const matches = commands.filter(c => c.startsWith(prefix)).sort()
    
    if (matches.length > 0) {
      lastTabIndex.value = (lastTabIndex.value + 1) % matches.length
      commandInput.value = matches[lastTabIndex.value]
    }
  }

  // 3. 任何非功能按键按下时，重置补全和历史状态（除非是箭头键）
  else if (!['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Shift', 'Control', 'Alt'].includes(e.key)) {
    historyIndex.value = -1
    lastTabIndex.value = -1
  }
}

/**
 * 显示帮助信息
 */
function showHelp(specificCmd = null) {
  const bid = consoleStore.activeBeaconId
  if (!bid) return

  // 辅助函数：计算视觉宽度（中文计2，英文计1）
  const getVisualWidth = (str) => {
    let width = 0
    for (let i = 0; i < str.length; i++) {
      width += str.charCodeAt(i) > 255 ? 2 : 1
    }
    return width
  }

  // 辅助函数：根据视觉宽度进行补齐
  const visualPadEnd = (str, target) => {
    const current = getVisualWidth(str)
    return str + (target > current ? ' '.repeat(target - current) : '')
  }

  let helpContent = '\n--- 核心指令帮助 (Core Commands Help) ---\n'
  
  if (specificCmd) {
    const upperCmd = specificCmd.toUpperCase()
      const resolvedCmd = COMMAND_HELP_ALIASES[upperCmd] || upperCmd
      const help = COMMAND_HELP[resolvedCmd] || LOCAL_COMMAND_HELP[upperCmd]
      if (help) {
        if (!isCommandAllowed(specificCmd)) {
          consoleStore.appendToConsole(bid, 'error', getUnsupportedCommandMessage(specificCmd, activeBeaconOs.value))
          return
        }
        helpContent += `用法: ${help.usage}\n描述: ${help.desc}\n注意: ${help.notes}\n`
    } else {
      consoleStore.appendToConsole(bid, 'error', `未找到指令 "${specificCmd}" 的详细说明。`)
      return
    }
  } else {
    getSupportedCommandHelpEntriesForOS(activeBeaconOs.value).forEach(([key, info]) => {
      // 保持视觉对齐宽度 45
      const usage = visualPadEnd(info.usage, 45)
      helpContent += `  ${usage} - ${info.desc}\n`
    })
    getSupportedLocalCommandHelpEntriesForOS(activeBeaconOs.value).forEach(([key, info]) => {
      const usage = visualPadEnd(info.usage, 45)
      helpContent += `  ${usage} - ${info.desc}\n`
    })
    helpContent += '\n用法指引: 输入 help <command> 查看特定指令。'
  }
  
  helpContent += '\n-----------------------------------------\n'
  consoleStore.appendToConsole(bid, 'output', helpContent)
}

function sendCommand() {
  const rawInput = commandInput.value.trim()
  if (!rawInput || !consoleStore.activeBeaconId) return
  
  const parsed = parseCommandLine(rawInput)
  if (!parsed) return

  // 重置历史指针
  historyIndex.value = -1

  // 1. 拦截帮助指令 (help, 帮助, 查看帮助)
  if (['HELP', '帮助', '查看帮助'].includes(parsed.cmdName.toUpperCase())) {
    // 回显输入
    consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
    showHelp(parsed.args[0])
    commandInput.value = ''
    return
  }

  // 2. 本地控制台入口：exec-bof
  if (parsed.cmdName.toLowerCase() === 'exec-bof') {
    consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
    if (!isCommandAllowed('exec-bof')) {
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'error', getUnsupportedCommandMessage(parsed.cmdName, activeBeaconOs.value))
      commandInput.value = ''
      return
    }
    modalStore.openExecuteModal(consoleStore.activeBeaconId, 'bof')
    consoleStore.appendToConsole(consoleStore.activeBeaconId, 'output', '已打开 BOF 执行窗口。')

    if (rawInput && consoleStore.commandHistory[consoleStore.commandHistory.length - 1] !== rawInput) {
      consoleStore.commandHistory.push(rawInput)
      if (consoleStore.commandHistory.length > 100) consoleStore.commandHistory.shift()
    }

    commandInput.value = ''
    historyIndex.value = -1
    lastTabPrefix.value = ''
    lastTabIndex.value = -1
    return
  }

  // 2. 检查未知命令
  if (parsed.cmdId === null) {
    consoleStore.appendToConsole(
      consoleStore.activeBeaconId, 
      'error', 
      `未知指令: "${parsed.cmdName}"。请检查输入或查看帮助。`
   )
    commandInput.value = ''
    return
  }

  if (!isCommandAllowed(parsed.cmdId)) {
    consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
    consoleStore.appendToConsole(consoleStore.activeBeaconId, 'error', getUnsupportedCommandMessage(parsed.cmdName, activeBeaconOs.value))
    commandInput.value = ''
    return
  }

  // 3. [特化封装] SLEEP 指令任务包封装
  let finalArgs = parsed.args
  if (parsed.cmdId === COMMAND_ID.SLEEP) {
    const timeRaw = parsed.args[0]
    const jitterRaw = parsed.args[1]

    // 强制校验 Time
    if (!timeRaw) {
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'error', '【指令校验失败】sleep 指令至少需要一个时间参数 (ms)。用法: sleep <ms> [jitter]')
      commandInput.value = ''
      return
    }

    const time = parseInt(timeRaw)
    if (isNaN(time) || time <= 0 || time > 60000) {
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'error', `【指令校验失败】非法的时间参数 "${timeRaw}"，必须为 1-60000 之间的整数。`)
      commandInput.value = ''
      return
    }

    // 处理 Jitter (可选)
    let jitter = 0
    if (jitterRaw) {
      jitter = parseInt(jitterRaw)
      if (isNaN(jitter) || jitter < 0 || jitter > 200) {
        consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
        consoleStore.appendToConsole(consoleStore.activeBeaconId, 'error', `【指令校验失败】非法的抖动比例 "${jitterRaw}"，必须在 0-200 之间。`)
        commandInput.value = ''
        return
      }
    }

    // 重新封装为结构化参数（数值）
    finalArgs = [time, jitter]
  } else if ([COMMAND_ID.SHELL, COMMAND_ID.POWERSHELL].includes(parsed.cmdId)) {
    const rawCommand = getRawCommandAfterName(rawInput, parsed.cmdName)
    if (!rawCommand.trim()) {
      const cmdName = parsed.cmdName.toLowerCase()
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
      consoleStore.appendToConsole(
        consoleStore.activeBeaconId,
        'error',
        `【指令校验失败】${cmdName} 指令需要提供一整条原始命令字符串。用法: ${cmdName} <raw_command>`
     )
      commandInput.value = ''
      return
    }
    finalArgs = [rawCommand]
  } else if ([COMMAND_ID.KILLJOB, COMMAND_ID.KILL, COMMAND_ID.STEAL_TOKEN].includes(parsed.cmdId)) {
    const targetRaw = parsed.args[0]
    const targetId = parseInt(targetRaw)
    if (!targetRaw || isNaN(targetId) || targetId <= 0) {
      const cmdName = parsed.cmdName.toLowerCase()
      const label = parsed.cmdId === COMMAND_ID.KILLJOB ? '后台 job ID' : '目标进程 PID'
      const placeholder = parsed.cmdId === COMMAND_ID.KILLJOB ? 'job_id' : 'PID'
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
      consoleStore.appendToConsole(
        consoleStore.activeBeaconId, 
        'error', 
        `【指令校验失败】${cmdName} 指令需要提供有效的${label}。用法: ${cmdName} <${placeholder}>`
     )
      commandInput.value = ''
      return
    }
    finalArgs = [targetId]
  } else if (parsed.cmdId === COMMAND_ID.ZIP) {
    const sourcePath = String(parsed.args[0] || '').trim()
    const zipPath = String(parsed.args[1] || '').trim()
    const overwriteRaw = parsed.args[2]
    const includeRootRaw = parsed.args[3]

    if (!sourcePath || !zipPath) {
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
      consoleStore.appendToConsole(
        consoleStore.activeBeaconId,
        'error',
        '【指令校验失败】zip 指令至少需要 source_path 和 zip_path。用法: zip <source_path> <zip_path> [overwrite] [include_root]'
     )
      commandInput.value = ''
      return
    }

    const parseBinaryFlag = (value, fallback, label) => {
      if (value === undefined || value === null || String(value).trim() === '') {
        return fallback
      }
      const numeric = parseInt(String(value).trim(), 10)
      if (!Number.isInteger(numeric) || ![0, 1].includes(numeric)) {
        throw new Error(`【指令校验失败】${label} 只能是 0 或 1。`)
      }
      return numeric
    }

    try {
      finalArgs = [
        sourcePath,
        zipPath,
        parseBinaryFlag(overwriteRaw, 0, 'overwrite'),
        parseBinaryFlag(includeRootRaw, 1, 'include_root'),
      ]
    } catch (err) {
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'input', rawInput)
      consoleStore.appendToConsole(consoleStore.activeBeaconId, 'error', err.message || String(err))
      commandInput.value = ''
      return
    }
  }

  // 发送结构化指令
  consoleStore.sendCommand(
    consoleStore.activeBeaconId, 
    parsed.cmdId, 
    finalArgs, 
    rawInput
 )
  
  commandInput.value = ''
}

function closeTab(e, beaconid) {
  e.stopPropagation()
  consoleStore.closeConsole(beaconid)
}

function getAgentLabel(beaconid) {
  if (!beaconid) return 'Unknown'
  const agent = agentStore.getAgentById(beaconid)
  if (!agent) return beaconid.substring(0, 8)
  return `${agent.beaconid.substring(0, 8)}@${agent.hostname}`
}

function formatTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="console-panel" v-if="consoleStore.consolePanelVisible" :style="{ height: panelHeight + 'px' }">
    <!-- 拖拽缩放手柄 -->
    <div class="resize-handle" @mousedown="startDrag">
      <div class="resize-indicator"></div>
    </div>

    <!-- 标签栏 -->
    <div class="console-tabs">
      <div class="tabs-left">
        <div
          v-for="tab in consoleStore.activeConsoles"
          :key="tab.beaconid"
          class="tab"
          :class="{ active: consoleStore.activeBeaconId === tab.beaconid }"
          @click="consoleStore.setActiveConsole(tab.beaconid)"
        >
          <span class="status-dot online" style="width:6px;height:6px;"></span>
          <span class="tab-label">{{ getAgentLabel(tab.beaconid) }}</span>
          <button class="tab-close" @click="closeTab($event, tab.beaconid)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <button class="console-collapse" @click="consoleStore.consolePanelVisible = false" title="收起控制台">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 15 12 9 18 15"/>
        </svg>
      </button>
    </div>

    <!-- 控制台内容 -->
    <div class="console-body" v-if="currentConsole">
      <div class="console-output user-select-text" ref="outputRef">
        <div class="console-welcome">
          <span class="console-prompt-text">[ {{ getAgentLabel(consoleStore.activeBeaconId) }} ] 控制台已连接</span>
        </div>
        <div
          v-for="(line, idx) in currentConsole.history"
          :key="idx"
          class="console-line"
          :class="'line-' + line.type"
        >
          <span class="line-time">{{ formatTimestamp(line.timestamp) }}</span>
          <span v-if="line.type === 'input'" class="line-prompt">❯</span>
          <span v-else-if="line.type === 'error'" class="line-prompt error">[!]</span>
          <span v-else class="line-prompt output">[*]</span>
          <span class="line-content">{{ line.content }}</span>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="console-input-bar">
        <span class="input-prompt">❯</span>
        <input
          v-model="commandInput"
          class="console-input"
          type="text"
          placeholder="输入命令 (Tab 补全, ↑↓ 历史, help 查看帮助)..."
          autocomplete="off"
          spellcheck="false"
          @keydown.enter="sendCommand"
          @keydown="handleKeyDown"
        />
        <button class="send-btn" @click="sendCommand" :disabled="!commandInput.trim()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 无活跃控制台 -->
    <div v-else class="console-empty">
      <span>选择一个标签查看控制台</span>
    </div>
  </div>
</template>

<style scoped>
.console-panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-console);
  border-top: 1px solid var(--border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

/* 拖拽手柄 */
.resize-handle {
  height: 8px;
  width: 100%;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  flex-shrink: 0;
  z-index: 10;
}

.resize-indicator {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.15);
  transition: var(--transition);
}

.resize-handle:hover .resize-indicator {
  background: rgba(0, 0, 0, 0.22);
}

/* 标签栏 */
.console-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  height: 38px;
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.tabs-left {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
}

.tabs-left::-webkit-scrollbar {
  height: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  border: 1px solid transparent;
  border-bottom: none;
}

.tab:hover {
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.04);
}

.tab.active {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.08);
  border-color: var(--border);
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  color: var(--text-muted);
  transition: var(--transition);
}

.tab-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: var(--text-primary);
}

.console-collapse {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  transition: var(--transition);
  flex-shrink: 0;
}

.console-collapse:hover {
  background: rgba(0, 0, 0, 0.1);
  color: var(--text-primary);
}

/* 控制台内容 */
.console-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.console-output {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  user-select: text !important;
  -webkit-user-select: text !important;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13.5px;
  line-height: 1.75;
  letter-spacing: 0.15px;
}

.console-welcome {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
}

.console-prompt-text {
  color: var(--color-accent);
  font-size: 11px;
}

.console-line {
  display: flex;
  flex-wrap: nowrap; /* 强制不换行 */
  align-items: flex-start;
  gap: 12px;
  padding: 1px 0;
}

.line-time {
  color: #8b96a5;
  font-size: 10.5px;
  min-width: 72px;
  opacity: 0.85;
  padding-top: 2px;
}

.line-prompt {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  min-width: 28px;
  text-align: center;
}

.line-input .line-prompt {
  color: var(--color-primary);
  font-size: 15px;
}

.line-prompt.error {
  color: var(--color-error, #f43f5e);
}

.line-prompt.output {
  color: var(--color-accent);
}

.line-content {
  color: var(--text-console);
  word-break: break-all;
  white-space: pre-wrap;
  flex: 1;
}

.line-input .line-content {
  color: var(--text-primary);
  font-weight: 600;
  letter-spacing: 0.3px;
}

.line-error .line-content {
  color: #e11d48;
  font-weight: 500;
}

.user-select-text {
  user-select: text;
  -webkit-user-select: text;
}

/* 输入区 */
.console-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-light);
  background: rgba(0, 0, 0, 0.02);
  flex-shrink: 0;
}

.input-prompt {
  color: var(--color-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.console-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 600;
  outline: none;
}

.console-input::placeholder {
  color: var(--text-muted);
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  transition: var(--transition);
}

.send-btn:hover:not(:disabled) {
  background: var(--color-primary-dim);
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* 空控制台 */
.console-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 13px;
}

:global(html[data-ui-theme="dark"] .console-panel){
  background: rgba(3, 7, 18, 0.92);
  border-top-color: rgba(148, 163, 184, 0.18);
}

:global(html[data-ui-theme="dark"] .resize-indicator){
  background: rgba(148, 163, 184, 0.28);
}

:global(html[data-ui-theme="dark"] .resize-handle:hover .resize-indicator){
  background: rgba(148, 163, 184, 0.42);
}

:global(html[data-ui-theme="dark"] .console-tabs){
  background: rgba(15, 23, 42, 0.72);
  border-bottom-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .tab:hover){
  color: var(--text-primary);
  background: rgba(148, 163, 184, 0.1);
}

:global(html[data-ui-theme="dark"] .tab.active){
  background: rgba(30, 41, 59, 0.78);
  border-color: rgba(148, 163, 184, 0.18);
}

:global(html[data-ui-theme="dark"] .console-prompt-text){
  color: #22d3ee;
  font-weight: 700;
}

:global(html[data-ui-theme="dark"] .line-time){
  color: #94a3b8;
  opacity: 1;
}

:global(html[data-ui-theme="dark"] .line-prompt){
  color: #a5b4fc;
}

:global(html[data-ui-theme="dark"] .line-prompt.output){
  color: #2dd4bf;
}

:global(html[data-ui-theme="dark"] .line-prompt.error){
  color: #fb7185;
}

:global(html[data-ui-theme="dark"] .line-content){
  color: #dbeafe;
}

:global(html[data-ui-theme="dark"] .line-output .line-content){
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .line-input .line-content){
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .line-error .line-content){
  color: #fda4af;
}

:global(html[data-ui-theme="dark"] .console-input-bar){
  background: rgba(3, 7, 18, 0.92);
  border-top-color: rgba(148, 163, 184, 0.16);
}

:global(html[data-ui-theme="dark"] .console-input){
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .console-input::placeholder){
  color: #94a3b8;
  opacity: 0.95;
}
</style>
