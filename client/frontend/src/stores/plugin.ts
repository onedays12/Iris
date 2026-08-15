/**
 * 插件管理 Store
 * 负责插件列表的加载、CRUD 操作、插件动作执行，
 * 以及插件命令结果的处理。
 */

import { defineStore } from 'pinia'
import * as pluginApi from '../features/plugin/api/pluginApi'
import { useAuthStore } from './auth'
import { useConsoleStore } from './console'
import { pickString, pick } from '../utils/object'
import { normalizePlugin } from '../features/plugin/model'
import { i18n } from '../i18n/index'
import type { Plugin } from '../features/plugin/model'

interface PluginState {
  plugins: Plugin[]
  selectedPluginId: string
  loading: boolean
  error: string
  invoking: boolean
}

export const usePluginStore = defineStore('plugin', {
  // 核心状态：插件列表、当前选中 ID 及操作状态
  state: (): PluginState => ({
    plugins: [],
    selectedPluginId: '',
    loading: false,
    error: '',
    invoking: false,
  }),

  getters: {
    selectedPlugin: (state): Plugin | null => state.plugins.find(item => item.id === state.selectedPluginId) || null,
    hasPlugins: (state) => state.plugins.length > 0,
  },

  actions: {
    mergePlugin(plugin: unknown): void {
      const normalized = normalizePlugin(plugin)
      if (!normalized || !normalized.id) return

      const index = this.plugins.findIndex(item => item.id === normalized.id)
      if (index >= 0) {
        this.plugins[index] = { ...this.plugins[index], ...normalized }
      } else {
        this.plugins.push(normalized)
      }
    },

    applyPluginList(list: unknown, preferredPluginId = ''): Plugin[] {
      const normalizedList = Array.isArray(list)
        ? list.map(normalizePlugin).filter((item): item is Plugin => Boolean(item))
        : []
      this.plugins = normalizedList

      if (preferredPluginId && this.plugins.some(item => item.id === preferredPluginId)) {
        this.selectedPluginId = preferredPluginId
        return this.plugins
      }

      if (this.selectedPluginId && !this.plugins.some(item => item.id === this.selectedPluginId) && this.plugins.length) {
        this.selectedPluginId = this.plugins[0].id
      } else if (!this.plugins.length) {
        this.selectedPluginId = ''
      } else if (!this.selectedPluginId && this.plugins.length) {
        this.selectedPluginId = this.plugins[0].id
      }

      return this.plugins
    },

    async fetchPlugins(): Promise<Plugin[]> {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.listPlugins()
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = (err instanceof Error ? err.message : String(err)) || i18n.global.t('plugins.loadFailed')
        throw err
      } finally {
        this.loading = false
      }
    },

    async reloadPlugins(): Promise<Plugin[]> {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.reloadPlugins()
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = (err instanceof Error ? err.message : String(err)) || i18n.global.t('plugins.reloadFailed')
        throw err
      } finally {
        this.loading = false
      }
    },

    async addPlugin(pluginPath: string): Promise<Plugin[]> {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.addPlugin(pluginPath)
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = (err instanceof Error ? err.message : String(err)) || i18n.global.t('plugins.addFailed')
        throw err
      } finally {
        this.loading = false
      }
    },

    async deletePlugin(pluginId: string): Promise<Plugin[]> {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.deletePlugin(pluginId)
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = (err instanceof Error ? err.message : String(err)) || i18n.global.t('plugins.deleteFailed')
        throw err
      } finally {
        this.loading = false
      }
    },

    selectPlugin(pluginId: unknown): void {
      this.selectedPluginId = pickString(pluginId)
    },

    async invokePluginAction(pluginId: unknown, actionId: unknown, payload: Record<string, unknown> = {}): Promise<Plugin | null> {
      const normalizedPluginId = pickString(pluginId)
      const normalizedActionId = pickString(actionId)
      if (!normalizedPluginId) {
        throw new Error(i18n.global.t('plugins.selectFirst'))
      }
      if (!normalizedActionId) {
        throw new Error(i18n.global.t('plugins.missingActionId'))
      }

      this.invoking = true
      this.error = ''
      try {
        const authStore = useAuthStore()
        const consoleStore = useConsoleStore()
        // 破坏性收敛: 调用 payload 只读 canonical 单键
        const beaconId = pickString(pick(payload, ['beacon_id'], ''))
        const artifact = pickString(pick(payload, ['artifact'], ''))
        const kind = pickString(pick(payload, ['kind'], 'bof')).toLowerCase()
        if (beaconId) {
          consoleStore.openConsole(beaconId)
          if (kind === 'postex') {
            const mode = pickString(pick(payload.postex || {}, ['mode'], 'postex'))
            consoleStore.appendToConsole(beaconId, 'input', `${mode} "${artifact}"`.trim())
            consoleStore.appendToConsole(beaconId, 'output', i18n.global.t('plugins.pushingPostEx'))
          } else {
            if (artifact) {
              consoleStore.appendToConsole(beaconId, 'input', `bof "${artifact}"`.trim())
            } else {
              consoleStore.appendToConsole(beaconId, 'input', 'bof')
            }
            consoleStore.appendToConsole(beaconId, 'output', i18n.global.t('plugins.pushingPayload'))
          }
        }

        const requestPayload = {
          ...payload,
          api_base: authStore.apiBase || '',
          token: authStore.token || '',
        }
        const response = await pluginApi.invokePluginAction(
          normalizedPluginId,
          normalizedActionId,
          JSON.stringify(requestPayload)
        )
        if (beaconId) {
          consoleStore.appendToConsole(beaconId, 'output', i18n.global.t('plugins.injectDone'))
          consoleStore.appendToConsole(beaconId, 'output', i18n.global.t('plugins.capturedOutput'))
        }
        const normalized = normalizePlugin(response)
        if (normalized) {
          this.mergePlugin(normalized)
        }
        return normalized
      } catch (err) {
        const consoleStore = useConsoleStore()
        const beaconId = pickString(pick(payload, ['beacon_id'], ''))
        if (beaconId) {
          const kind = pickString(pick(payload, ['kind'], 'bof')).toLowerCase()
          const label = kind === 'postex' ? 'PostEx' : 'BOF'
          consoleStore.appendToConsole(beaconId, 'error', i18n.global.t('plugins.execFailed', { label, error: err instanceof Error ? err.message : i18n.global.t('plugins.unknownError') }))
        }
        this.error = (err instanceof Error ? err.message : String(err)) || i18n.global.t('plugins.actionFailed')
        throw err
      } finally {
        this.invoking = false
      }
    },
  },
})
