/**
 * 控制台 Store
 * 管理控制台 Tab 生命周期、命令历史、命令发送，
 * 以及服务端推送结果的接收与展示。
 */

import { defineStore } from 'pinia'
import { i18n } from '../i18n/index'
import { sendBeaconCommand } from '../features/beacon/actions/beaconCommandActions'
import { COMMAND_ID } from '../constants/commands'
import { bus } from '../shared/bus'

export type ConsoleEntryType = 'input' | 'output' | 'error'

export interface ConsoleEntry {
  type: ConsoleEntryType
  content: string
  timestamp: string
  /** 自定义提示符（appendToConsole 可传） */
  prompt?: string
}

export interface ConsoleTab {
  beaconid: string
  history: ConsoleEntry[]
}

interface ConsoleState {
  /** 已打开的控制台标签 */
  activeConsoles: ConsoleTab[]
  /** 当前活跃的控制台 ID（对应某个 beaconid） */
  activeBeaconId: string | null
  /** 全局控制台 Dock 是否展开 */
  consolePanelVisible: boolean
  /** 全局命令历史记录 (用于输入框上下键翻阅) */
  commandHistory: string[]
  _subscribed: boolean
}

/**
 * useConsoleStore
 * 职责：控制台 Tab 生命周期、命令历史、命令发送
 * 不关心：Agent 元数据（主机名等）、弹窗状态
 */
// ─── Store 定义 ───

export const useConsoleStore = defineStore('console', {

  // ─── 状态 ───

  state: (): ConsoleState => ({
    activeConsoles: [],
    activeBeaconId: null,
    consolePanelVisible: false,
    commandHistory: [],
    _subscribed: false,
  }),

  // ─── 计算属性 ───

  getters: {
    /** 获取当前激活控制台对象 */
    currentConsole: (state): ConsoleTab | null =>
      state.activeConsoles.find(c => c.beaconid === state.activeBeaconId) || null,
  },

  // ─── 方法 ───

  actions: {
    /** 打开或切换到对应 Agent 的控制台 Tab */
    openConsole(beaconid: string): void {
      const exists = this.activeConsoles.find(c => c.beaconid === beaconid)
      if (!exists) {
        this.activeConsoles.push({ beaconid, history: [] })
      }
      this.activeBeaconId = beaconid
      this.consolePanelVisible = true
    },

    /** 关闭指定 Agent 的控制台 Tab */
    closeConsole(beaconid: string): void {
      this.activeConsoles = this.activeConsoles.filter(c => c.beaconid !== beaconid)
      if (this.activeBeaconId === beaconid) {
        this.activeBeaconId = this.activeConsoles.length > 0
          ? this.activeConsoles[this.activeConsoles.length - 1].beaconid
          : null
      }
      if (this.activeConsoles.length === 0) {
        this.consolePanelVisible = false
      }
    },

    /** 切换当前激活 Tab */
    setActiveConsole(beaconid: string): void {
      this.activeBeaconId = beaconid
    },

    /** 发送命令（已支持结构化参数） */
    async sendCommand(beaconid: string, commandId: number, args: unknown[] = [], fullCommandString = ''): Promise<void> {
      const tab = this.activeConsoles.find(c => c.beaconid === beaconid)
      if (!tab) return

      // 在控制台回显用户输入的原始命令字符串
      tab.history.push({
        type: 'input',
        content: fullCommandString,
        timestamp: new Date().toISOString(),
      })

      try {
        await sendBeaconCommand(beaconid, commandId, args)

        // sleep 命令成功后通过事件总线通知 agent 更新(解除 console→agent 循环依赖)
        if (commandId === COMMAND_ID.SLEEP && args.length >= 1) {
          bus.emit('agent:update-sleep', {
            beaconid,
            sleep: (Number(args[0]) || 0) / 1000,
            jitter: Number(args[1]) || 0,
          })
        }

        // 执行成功后将其存入全局历史（如果与上一条不重复）
        if (fullCommandString && this.commandHistory[this.commandHistory.length - 1] !== fullCommandString) {
          this.commandHistory.push(fullCommandString)
          // 限制历史记录条数
          if (this.commandHistory.length > 100) this.commandHistory.shift()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        tab.history.push({
          type: 'error',
          content: `${i18n.global.t('console.sendFailed', { message })}`,
          timestamp: new Date().toISOString(),
        })
      }
    },

    /** 服务端推送结果（WebSocket 回调调用） */
    pushCommandResult(beaconid: string, result: string): void {
      const tab = this.activeConsoles.find(c => c.beaconid === beaconid)
      if (tab) {
        tab.history.push({
          type: 'output',
          content: result,
          timestamp: new Date().toISOString(),
        })
      }
    },

    /** 向指定 Agent 控制台写入一条记录（供其他模块集成用） */
    appendToConsole(beaconid: string, type: ConsoleEntryType, content: string, prompt = ''): void {
      const tab = this.activeConsoles.find(c => c.beaconid === beaconid)
      if (tab) {
        tab.history.push({
          type,
          content,
          prompt, // 新增：保存自定义提示符
          timestamp: new Date().toISOString()
        })
      }
    },

    /**
     * 初始化事件总线订阅(解除 agent→console 硬依赖)。
     * 幂等:用 _subscribed flag 去重。App.vue 启动时调用。
     */
    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true

      // agent 删 beacon 时级联关闭控制台(原 agent.removeBeacon/removeAgent 直接调 closeConsole)
      bus.on('agent:removed', ({ beaconid }) => {
        this.closeConsole(beaconid)
      })
    },
  },
})
