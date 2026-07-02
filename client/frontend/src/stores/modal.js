/**
 * 弹窗状态管理 Store
 * 统一管理所有功能弹窗的打开/关闭状态及其目标 beaconid。
 * 新增弹窗只需在此添加状态 + open/close action，不影响其他任何文件。
 */

import { defineStore } from 'pinia'

// ─── Store 定义 ───

export const useModalStore = defineStore('modal', {

  // ─── 状态 ───

  state: () => ({
    // 通用确认弹窗
    confirm: {
      visible: false,
      title: '确认操作',
      message: '',
      type: 'info', // 'info', 'warning', 'danger'
      confirmText: '继续操作',
      cancelText: '取消',
      onConfirm: null,
      onCancel: null
    },
    // 通用输入弹窗
    prompt: {
      visible: false,
      title: '输入内容',
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
  }),

  // ─── 方法 ───

  actions: {

    // ─── Sleep 配置弹窗 ───
    openSleepModal(beaconid) {
      this.activeSleepBeaconId = beaconid
      this.sleepModalVisible = true
    },
    closeSleepModal() {
      this.sleepModalVisible = false
      this.activeSleepBeaconId = null
    },

    // ─── 文件浏览器 ───
    openFileBrowser(beaconid) {
      this.activeFileBrowserBeaconId = beaconid
      this.fileBrowserVisible = true
    },
    closeFileBrowser() {
      this.fileBrowserVisible = false
      this.activeFileBrowserBeaconId = null
    },

    // ─── 进程浏览器 ───
    openProcessBrowser(beaconid) {
      this.activeProcessBrowserBeaconId = beaconid
      this.processBrowserVisible = true
    },
    closeProcessBrowser() {
      this.processBrowserVisible = false
      this.activeProcessBrowserBeaconId = null
    },

    // ─── Migrate Inject 弹窗 ───
    openMigrateInject(payload = {}) {
      this.activeMigrateInject = {
        beaconid: payload.beaconid || '',
        process: payload.process ? { ...payload.process } : null,
      }
      this.migrateInjectVisible = true
    },
    closeMigrateInject() {
      this.migrateInjectVisible = false
      this.activeMigrateInject = {
        beaconid: '',
        process: null,
      }
    },

    // ─── 网络浏览器 ───
    openNetworkBrowser(beaconid) {
      this.activeNetworkBrowserBeaconId = beaconid
      this.networkBrowserVisible = true
    },
    closeNetworkBrowser() {
      this.networkBrowserVisible = false
      this.activeNetworkBrowserBeaconId = null
    },

    // ─── Payload 执行弹窗 ───
    openExecuteModal(beaconid, executionType) {
      this.activeExecuteModal.beaconid = beaconid
      this.activeExecuteModal.executionType = executionType
      this.executeModalVisible = true
    },
    closeExecuteModal() {
      this.executeModalVisible = false
      this.activeExecuteModal.beaconid = null
      this.activeExecuteModal.executionType = ''
    },

    // ─── Beacon 生成弹窗 ───
    openGenerateBeacon(listenerId) {
      this.activeGenerateBeaconListenerId = listenerId
      this.generateBeaconVisible = true
    },
    closeGenerateBeacon() {
      this.generateBeaconVisible = false
      this.activeGenerateBeaconListenerId = null
    },

    // ─── 插件动作弹窗 ───
    openPluginAction(payload = {}) {
      this.activePluginAction = {
        pluginId: payload.pluginId || '',
        pluginName: payload.pluginName || '',
        beaconid: payload.beaconid || '',
        action: payload.action || null,
      }
      this.pluginActionVisible = true
    },
    closePluginAction() {
      this.pluginActionVisible = false
      this.activePluginAction = {
        pluginId: '',
        pluginName: '',
        beaconid: '',
        action: null
      }
    },

    // ─── Cascade 级联连接弹窗 ───
    openCascadeConnectModal(beaconid, mode) {
      this.cascadeConnectBeaconId = beaconid
      this.cascadeConnectMode = mode
      this.cascadeConnectModalVisible = true
    },
    closeCascadeConnectModal() {
      this.cascadeConnectModalVisible = false
      this.cascadeConnectBeaconId = ''
    },

    /**
     * 打开通用确认弹窗
     * @returns {Promise<boolean>} 返回一个 Promise，用户点击确认返回 true，取消返回 false
     */
    showConfirm(options = {}) {
      return new Promise((resolve) => {
        this.confirm = {
          visible: true,
          title: options.title || '确认操作',
          message: options.message || '确定要执行此操作吗？',
          type: options.type || 'info',
          confirmText: options.confirmText || '继续操作',
          cancelText: options.cancelText || '取消',
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
     * @returns {Promise<string|null>} 返回输入内容，取消则返回 null
     */
    showPrompt(options = {}) {
      return new Promise((resolve) => {
        this.prompt = {
          visible: true,
          title: options.title || '输入内容',
          message: options.message || '',
          value: options.defaultValue || '',
          placeholder: options.placeholder || '请输入...',
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
