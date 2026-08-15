/**
 * 弹窗状态管理 Store
 * 统一管理所有功能弹窗的打开/关闭状态及其目标 beaconid。
 * 新增弹窗只需在此添加状态 + open/close action，不影响其他任何文件。
 */

import { defineStore } from 'pinia'
import { bus } from '../shared/bus'
import { i18n } from '../i18n/index'

export type ConfirmType = 'info' | 'warning' | 'danger'

export interface ConfirmDialogState {
  visible: boolean
  title: string
  message: string
  type: ConfirmType
  confirmText: string
  cancelText: string
  onConfirm: (() => void) | null
  onCancel: (() => void) | null
}

export interface PromptDialogState {
  visible: boolean
  title: string
  message: string
  value: string
  placeholder: string
  onConfirm: ((value: string) => void) | null
  onCancel: (() => void) | null
}

export interface MigrateInjectTarget {
  beaconid: string
  process: unknown
}

export interface ExecuteModalTarget {
  beaconid: string | null
  executionType: string
}

export interface PluginActionTarget {
  pluginId: string
  pluginName: string
  beaconid: string
  action: unknown
}

export interface ConfirmDialogOptions {
  title?: string
  message?: string
  type?: string
  confirmText?: string
  cancelText?: string
}

export interface PromptDialogOptions {
  title?: string
  message?: string
  defaultValue?: string
  placeholder?: string
}

interface ModalState {
  // 通用确认弹窗
  confirm: ConfirmDialogState
  // 通用输入弹窗
  prompt: PromptDialogState

  // 文件浏览器
  fileBrowserVisible: boolean
  activeFileBrowserBeaconId: string | null

  // 进程浏览器
  processBrowserVisible: boolean
  activeProcessBrowserBeaconId: string | null

  // Migrate Inject 弹窗
  migrateInjectVisible: boolean
  activeMigrateInject: MigrateInjectTarget

  // 网络浏览器
  networkBrowserVisible: boolean
  activeNetworkBrowserBeaconId: string | null

  // Payload 执行弹窗
  executeModalVisible: boolean
  activeExecuteModal: ExecuteModalTarget

  // Beacon 生成弹窗
  generateBeaconVisible: boolean
  activeGenerateBeaconListenerId: string | null

  // Sleep 配置弹窗
  sleepModalVisible: boolean
  activeSleepBeaconId: string | null

  // 插件动作弹窗
  pluginActionVisible: boolean
  activePluginAction: PluginActionTarget

  // Cascade 级联连接弹窗
  cascadeConnectModalVisible: boolean
  cascadeConnectBeaconId: string
  cascadeConnectMode: string // 'tcp' | 'smb'

  _subscribed: boolean
}

// ─── Store 定义 ───

export const useModalStore = defineStore('modal', {

  // ─── 状态 ───

  state: (): ModalState => ({
    // 通用确认弹窗
    confirm: {
      visible: false,
      title: '',
      message: '',
      type: 'info', // 'info', 'warning', 'danger'
      confirmText: '',
      cancelText: '',
      onConfirm: null,
      onCancel: null
    },
    // 通用输入弹窗
    prompt: {
      visible: false,
      title: '',
      message: '',
      value: '',
      placeholder: '',
      onConfirm: null,
      onCancel: null
    },

    // 文件浏览器
    fileBrowserVisible: false,
    activeFileBrowserBeaconId: null,

    // 进程浏览器
    processBrowserVisible: false,
    activeProcessBrowserBeaconId: null,

    // Migrate Inject 弹窗
    migrateInjectVisible: false,
    activeMigrateInject: {
      beaconid: '',
      process: null,
    },

    // 网络浏览器
    networkBrowserVisible: false,
    activeNetworkBrowserBeaconId: null,

    // Payload 执行弹窗
    executeModalVisible: false,
    activeExecuteModal: {
      beaconid: null,
      executionType: '',
    },
    // Beacon 生成弹窗
    generateBeaconVisible: false,
    activeGenerateBeaconListenerId: null,

    // Sleep 配置弹窗
    sleepModalVisible: false,
    activeSleepBeaconId: null,

    // 插件动作弹窗
    pluginActionVisible: false,
    activePluginAction: {
      pluginId: '',
      pluginName: '',
      beaconid: '',
      action: null
    },

    // Cascade 级联连接弹窗
    cascadeConnectModalVisible: false,
    cascadeConnectBeaconId: '',
    cascadeConnectMode: 'tcp', // 'tcp' | 'smb'

    _subscribed: false,
  }),

  // ─── 方法 ───

  actions: {

    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true
      bus.on('agent:removed', ({ beaconid }) => {
        const key = String(beaconid || '')
        if (!key) return
        if (String(this.activeFileBrowserBeaconId || '') === key) this.closeFileBrowser()
        if (String(this.activeProcessBrowserBeaconId || '') === key) this.closeProcessBrowser()
        if (String(this.activeNetworkBrowserBeaconId || '') === key) this.closeNetworkBrowser()
        if (String(this.activeMigrateInject.beaconid || '') === key) this.closeMigrateInject()
        if (String(this.activePluginAction.beaconid || '') === key) this.closePluginAction()
        if (String(this.activeExecuteModal.beaconid || '') === key) this.closeExecuteModal()
        if (String(this.activeSleepBeaconId || '') === key) this.closeSleepModal()
        if (String(this.cascadeConnectBeaconId || '') === key) this.closeCascadeConnectModal()
      })
    },

    // ─── Sleep 配置弹窗 ───
    openSleepModal(beaconid: string | null): void {
      this.activeSleepBeaconId = beaconid
      this.sleepModalVisible = true
    },
    closeSleepModal(): void {
      this.sleepModalVisible = false
      this.activeSleepBeaconId = null
    },

    // ─── 文件浏览器 ───
    openFileBrowser(beaconid: string | null): void {
      this.activeFileBrowserBeaconId = beaconid
      this.fileBrowserVisible = true
    },
    closeFileBrowser(): void {
      this.fileBrowserVisible = false
      this.activeFileBrowserBeaconId = null
    },

    // ─── 进程浏览器 ───
    openProcessBrowser(beaconid: string | null): void {
      this.activeProcessBrowserBeaconId = beaconid
      this.processBrowserVisible = true
    },
    closeProcessBrowser(): void {
      this.processBrowserVisible = false
      this.activeProcessBrowserBeaconId = null
    },

    // ─── Migrate Inject 弹窗 ───
    openMigrateInject(payload: Partial<MigrateInjectTarget> = {}): void {
      this.activeMigrateInject = {
        beaconid: payload.beaconid || '',
        process: payload.process ? { ...(payload.process as Record<string, unknown>) } : null,
      }
      this.migrateInjectVisible = true
    },
    closeMigrateInject(): void {
      this.migrateInjectVisible = false
      this.activeMigrateInject = {
        beaconid: '',
        process: null,
      }
    },

    // ─── 网络浏览器 ───
    openNetworkBrowser(beaconid: string | null): void {
      this.activeNetworkBrowserBeaconId = beaconid
      this.networkBrowserVisible = true
    },
    closeNetworkBrowser(): void {
      this.networkBrowserVisible = false
      this.activeNetworkBrowserBeaconId = null
    },

    // ─── Payload 执行弹窗 ───
    openExecuteModal(beaconid: string, executionType: string): void {
      this.activeExecuteModal.beaconid = beaconid
      this.activeExecuteModal.executionType = executionType
      this.executeModalVisible = true
    },
    closeExecuteModal(): void {
      this.executeModalVisible = false
      this.activeExecuteModal.beaconid = null
      this.activeExecuteModal.executionType = ''
    },

    // ─── Beacon 生成弹窗 ───
    openGenerateBeacon(listenerId: string | null): void {
      this.activeGenerateBeaconListenerId = listenerId
      this.generateBeaconVisible = true
    },
    closeGenerateBeacon(): void {
      this.generateBeaconVisible = false
      this.activeGenerateBeaconListenerId = null
    },

    // ─── 插件动作弹窗 ───
    openPluginAction(payload: Partial<PluginActionTarget> = {}): void {
      this.activePluginAction = {
        pluginId: payload.pluginId || '',
        pluginName: payload.pluginName || '',
        beaconid: payload.beaconid || '',
        action: payload.action ?? null,
      }
      this.pluginActionVisible = true
    },
    closePluginAction(): void {
      this.pluginActionVisible = false
      this.activePluginAction = {
        pluginId: '',
        pluginName: '',
        beaconid: '',
        action: null
      }
    },

    // ─── Cascade 级联连接弹窗 ───
    openCascadeConnectModal(beaconid: string, mode: string): void {
      this.cascadeConnectBeaconId = beaconid
      this.cascadeConnectMode = mode
      this.cascadeConnectModalVisible = true
    },
    closeCascadeConnectModal(): void {
      this.cascadeConnectModalVisible = false
      this.cascadeConnectBeaconId = ''
    },

    /**
     * 打开通用确认弹窗
     * @returns 返回一个 Promise，用户点击确认返回 true，取消返回 false
     */
    showConfirm(options: ConfirmDialogOptions = {}): Promise<boolean> {
      return new Promise((resolve) => {
        this.confirm = {
          visible: true,
          title: options.title || i18n.global.t('common.confirmTitle'),
          message: options.message || i18n.global.t('common.confirmMessage'),
          type: (options.type || 'info') as ConfirmType,
          confirmText: options.confirmText || i18n.global.t('common.continue'),
          cancelText: options.cancelText || i18n.global.t('common.cancel'),
          onConfirm: () => {
            this.confirm.visible = false
            resolve(true)
          },
          onCancel: () => {
            this.confirm.visible = false
            resolve(false)
          }
        }
      })
    },

    /**
     * 打开通用输入弹窗
     * @returns 返回输入内容，取消则返回 null
     */
    showPrompt(options: PromptDialogOptions = {}): Promise<string | null> {
      return new Promise((resolve) => {
        this.prompt = {
          visible: true,
          title: options.title || i18n.global.t('common.promptTitle'),
          message: options.message || '',
          value: options.defaultValue || '',
          placeholder: options.placeholder || i18n.global.t('common.promptPlaceholder'),
          onConfirm: (val) => {
            this.prompt.visible = false
            resolve(val)
          },
          onCancel: () => {
            this.prompt.visible = false
            resolve(null)
          }
        }
      })
    }
  },
})
