/**
 * 插件管理 Store
 * 负责插件列表的加载、CRUD 操作、插件动作执行，
 * 以及插件命令结果的处理。
 */

import { defineStore } from 'pinia'
import * as pluginApi from '../features/plugin/api/pluginApi.js'
import { useAuthStore } from './auth.js'
import { useConsoleStore } from './console.js'
import { pickString } from '../utils/object.js'

function normalizePluginActionField(field) {
  if (!field || typeof field !== 'object') return null

  return {
    name: pickString(field.name || field.Name),
    label: pickString(field.label || field.Label || field.name || field.Name),
    type: pickString(field.type || field.Type || 'string').toLowerCase(),
    placeholder: pickString(field.placeholder || field.Placeholder || ''),
    defaultValue: field.default ?? field.default_value ?? field.defaultValue ?? field.Default ?? '',
    defaultByArch: normalizeDefaultByArch(field.default_by_arch || field.defaultByArch || field.DefaultByArch),
    required: Boolean(field.required || field.Required),
    help: pickString(field.help || field.Help || ''),
    options: Array.isArray(field.options || field.Options)
      ? (field.options || field.Options).map(item => pickString(item)).filter(Boolean)
      : [],
    role: pickString(field.role || field.Role || '').toLowerCase(),
    postexArg: pickString(field.postex_arg || field.postexArg || field.PostExArg || ''),
  }
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => pickString(item).trim().toLowerCase()).filter(Boolean)
}

function normalizeStringMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [pickString(key).trim().toLowerCase(), pickString(item).trim()])
      .filter(([key, item]) => key && item)
  )
}

function normalizeArchKey(key) {
  const text = pickString(key).trim().toLowerCase()
  if (['amd64', 'x64', 'x86_64'].includes(text)) return 'amd64'
  if (['x86', 'i386', '386'].includes(text)) return 'x86'
  return text
}

function normalizeDefaultByArch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizeArchKey(key), item])
      .filter(([key, item]) => key && item !== undefined && item !== null)
  )
}

function normalizePostExConfig(postex) {
  if (!postex || typeof postex !== 'object') return null
  return {
    mode: pickString(postex.mode || postex.Mode || '').toLowerCase().replace(/_/g, '-'),
    dll: pickString(postex.dll || postex.DLL || ''),
    dllByArch: normalizeStringMap(postex.dll_by_arch || postex.dllByArch || postex.DLLByArch),
    waitMs: Number(postex.wait_ms || postex.waitMs || postex.WaitMS || 0) || 0,
    maxRuntimeMs: Number(postex.max_runtime_ms || postex.maxRuntimeMs || postex.MaxRuntimeMS || 0) || 0,
    idleTimeoutMs: Number(postex.idle_timeout_ms || postex.idleTimeoutMs || postex.IdleTimeoutMS || 0) || 0,
    description: pickString(postex.description || postex.Description || ''),
    moduleArgs: pickString(postex.module_args || postex.moduleArgs || postex.ModuleArgs || ''),
    spawnPath: pickString(postex.spawn_path || postex.spawnPath || postex.SpawnPath || ''),
    spawnPathByArch: normalizeStringMap(postex.spawn_path_by_arch || postex.spawnPathByArch || postex.SpawnPathByArch),
    spawnArgs: pickString(postex.spawn_args || postex.spawnArgs || postex.SpawnArgs || ''),
    backend: pickString(postex.backend || postex.Backend || ''),
  }
}

// normalizePluginAction 将原始动作对象转换为前端统一的动作模型
function normalizePluginAction(action) {
  if (!action || typeof action !== 'object') return null

  const fields = Array.isArray(action.fields || action.Fields)
    ? (action.fields || action.Fields).map(normalizePluginActionField).filter(Boolean)
    : []
  const postex = normalizePostExConfig(action.postex || action.PostEx)
  const kind = pickString(action.kind || action.Kind || (postex ? 'postex' : 'bof')).toLowerCase() || 'bof'

  return {
    id: pickString(action.id || action.ID || action.name),
    kind,
    label: pickString(action.label || action.Label || action.display_name || action.displayName || action.name || action.id || action.ID),
    description: pickString(action.description || action.Description || ''),
    os: normalizeStringList(action.os || action.OS),
    arch: normalizeStringList(action.arch || action.Arch),
    artifact: pickString(action.artifact || action.Artifact || action.binary || action.Binary || ''),
    artifactByArch: normalizeStringMap(action.artifact_by_arch || action.artifactByArch || action.ArtifactByArch),
    artifactData: pickString(action.artifact_data || action.artifactData || action.ArtifactData || ''),
    commandId: Number(action.command_id || action.commandId || action.CommandID || 0) || 0,
    requiresInput: Boolean(action.requires_input || action.requiresInput || action.RequiresInput || fields.length),
    fields,
    postex,
    raw: action,
  }
}

// normalizePlugin 将原始插件对象转换为前端统一的插件模型
function normalizePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') return null

  const actions = Array.isArray(plugin.actions || plugin.Actions)
    ? (plugin.actions || plugin.Actions).map(normalizePluginAction).filter(Boolean)
    : []

  return {
    id: pickString(plugin.id || plugin.name || plugin.ID),
    name: pickString(plugin.name || plugin.id || plugin.ID),
    displayName: pickString(plugin.display_name || plugin.displayName || plugin.name || plugin.id || plugin.ID || 'Plugin'),
    version: pickString(plugin.version || plugin.Version || ''),
    description: pickString(plugin.description || plugin.Description || ''),
    path: pickString(plugin.path || plugin.Path || plugin.root || plugin.Root || ''),
    permissions: Array.isArray(plugin.permissions || plugin.Permissions)
      ? (plugin.permissions || plugin.Permissions).map(item => pickString(item))
      : [],
    actions,
    status: pickString(plugin.status || plugin.Status || 'unknown'),
    lastError: pickString(plugin.last_error || plugin.lastError || plugin.LastError || ''),
    loadedAt: plugin.loaded_at || plugin.loadedAt || plugin.LoadedAt || null,
    updatedAt: plugin.updated_at || plugin.updatedAt || plugin.UpdatedAt || null,
    raw: plugin,
  }
}

export const usePluginStore = defineStore('plugin', {
  // 核心状态：插件列表、当前选中 ID 及操作状态
  state: () => ({
    plugins: [],
    selectedPluginId: '',
    loading: false,
    error: '',
    invoking: false,
  }),

  getters: {
    selectedPlugin: (state) => state.plugins.find(item => item.id === state.selectedPluginId) || null,
    hasPlugins: (state) => state.plugins.length > 0,
  },

  actions: {
    mergePlugin(plugin) {
      const normalized = normalizePlugin(plugin)
      if (!normalized || !normalized.id) return

      const index = this.plugins.findIndex(item => item.id === normalized.id)
      if (index >= 0) {
        this.plugins[index] = { ...this.plugins[index], ...normalized }
      } else {
        this.plugins.push(normalized)
      }
    },

    applyPluginList(list, preferredPluginId = '') {
      const normalizedList = Array.isArray(list) ? list.map(normalizePlugin).filter(Boolean) : []
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

    async fetchPlugins() {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.listPlugins()
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = err.message || '加载插件失败'
        throw err
      } finally {
        this.loading = false
      }
    },

    async reloadPlugins() {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.reloadPlugins()
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = err.message || '重新加载插件失败'
        throw err
      } finally {
        this.loading = false
      }
    },

    async addPlugin(pluginPath) {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.addPlugin(pluginPath)
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = err.message || '添加插件失败'
        throw err
      } finally {
        this.loading = false
      }
    },

    async deletePlugin(pluginId) {
      this.loading = true
      this.error = ''
      try {
        const data = await pluginApi.deletePlugin(pluginId)
        this.applyPluginList(data)
        return this.plugins
      } catch (err) {
        this.error = err.message || '删除插件失败'
        throw err
      } finally {
        this.loading = false
      }
    },

    selectPlugin(pluginId) {
      this.selectedPluginId = pickString(pluginId)
    },

    async invokePluginAction(pluginId, actionId, payload = {}) {
      const normalizedPluginId = pickString(pluginId)
      const normalizedActionId = pickString(actionId)
      if (!normalizedPluginId) {
        throw new Error('请先选择插件')
      }
      if (!normalizedActionId) {
        throw new Error('缺少插件动作标识')
      }

      this.invoking = true
      this.error = ''
      try {
        const authStore = useAuthStore()
        const consoleStore = useConsoleStore()
        const beaconId = pickString(payload.beacon_id || payload.beaconId || payload.selected_beacon_id || payload.selectedBeaconId)
        const artifact = pickString(payload.artifact || payload.artifact_path || payload.artifactPath || '')
        const kind = pickString(payload.kind || payload.action_kind || payload.actionKind || 'bof').toLowerCase()
        if (beaconId) {
          consoleStore.openConsole(beaconId)
          if (kind === 'postex') {
            const mode = pickString(payload.postex?.mode || payload.postex_mode || payload.postexMode || 'postex')
            consoleStore.appendToConsole(beaconId, 'input', `${mode} "${artifact}"`.trim())
            consoleStore.appendToConsole(beaconId, 'output', '正在推送 PostEx DLL 并创建任务...')
          } else {
            if (artifact) {
              consoleStore.appendToConsole(beaconId, 'input', `bof "${artifact}"`.trim())
            } else {
              consoleStore.appendToConsole(beaconId, 'input', 'bof')
            }
            consoleStore.appendToConsole(beaconId, 'output', '正在推送 Payload 并准备执行 bof...')
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
          consoleStore.appendToConsole(beaconId, 'output', '注入成功 / 执行完成。')
          consoleStore.appendToConsole(beaconId, 'output', '截获返回信息:')
        }
        const normalized = normalizePlugin(response)
        if (normalized) {
          this.mergePlugin(normalized)
        }
        return normalized
      } catch (err) {
        const consoleStore = useConsoleStore()
        const beaconId = pickString(payload.beacon_id || payload.beaconId || payload.selected_beacon_id || payload.selectedBeaconId)
        if (beaconId) {
          const kind = pickString(payload.kind || payload.action_kind || payload.actionKind || 'bof').toLowerCase()
          const label = kind === 'postex' ? 'PostEx' : 'BOF'
          consoleStore.appendToConsole(beaconId, 'error', `插件 ${label} 执行失败: ${err.message || '未知错误'}`)
        }
        this.error = err.message || '插件动作执行失败'
        throw err
      } finally {
        this.invoking = false
      }
    },
  },
})
