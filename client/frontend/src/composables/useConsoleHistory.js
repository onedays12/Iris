/**
 * useConsoleHistory - 控制台命令历史导航与 Tab 补全
 *
 * 从 ConsolePanel 拆出。封装 Up/Down 历史翻阅 + Tab 命令名补全,
 * 纯输入状态机,不直接依赖 store(通过参数注入 commandHistory 与 activeBeaconOs)。
 */

import { ref } from 'vue'
import {
  getSupportedCommandNamesForOS,
  getSupportedLocalCommandNamesForOS,
} from '../constants/commands.js'

/**
 * @param {Object} opts
 * @param {import('vue').Ref<string>} opts.commandInput 命令输入框 ref(双向)
 * @param {() => string} opts.getOs 获取当前 beacon OS 的函数
 * @param {() => Array<string>} opts.getHistory 获取命令历史的函数
 */
export function useConsoleHistory({ commandInput, getOs, getHistory }) {
  const historyIndex = ref(-1)
  const historyTemp = ref('')
  const lastTabPrefix = ref('')
  const lastTabIndex = ref(-1)

  function reset() {
    historyIndex.value = -1
    lastTabPrefix.value = ''
    lastTabIndex.value = -1
  }

  function handleKeyDown(e) {
    const history = getHistory()

    // 1. 历史命令导航 (Up/Down)
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return

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

      if (lastTabIndex.value === -1) {
        const input = commandInput.value.trim()
        if (!input || input.includes(' ')) return
        lastTabPrefix.value = input.toLowerCase()
      }

      const commands = [
        ...getSupportedCommandNamesForOS(getOs()),
        ...getSupportedLocalCommandNamesForOS(getOs()),
      ]
      const prefix = lastTabPrefix.value

      const matches = commands.filter(c => c.startsWith(prefix)).sort()

      if (matches.length > 0) {
        lastTabIndex.value = (lastTabIndex.value + 1) % matches.length
        commandInput.value = matches[lastTabIndex.value]
      }
    }

    // 3. 任何非功能按键按下时，重置补全和历史状态
    else if (!['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Shift', 'Control', 'Alt'].includes(e.key)) {
      historyIndex.value = -1
      lastTabIndex.value = -1
    }
  }

  return {
    historyIndex,
    historyTemp,
    lastTabPrefix,
    lastTabIndex,
    reset,
    handleKeyDown,
  }
}
