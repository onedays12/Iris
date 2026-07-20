/**
 * 插件管理 Store
 * 负责插件列表的加载、CRUD 操作、插件动作执行，
 * 以及插件命令结果的处理。
 */

import { defineStore } from 'pinia'
import * as pluginApi from '../features/plugin/api/pluginApi.js'
import { useAuthStore } from './auth.js'
import { useConsoleStore } from './console.js'
import { pickString, pick } from '../utils/object.js'

function normalizePluginActionField(field) {
  if (!field || typeof field !== 'object') return null

  return {
    name: pickString(pick(field, ['name', 'Name'])),
    label: pickString(pick(field, ['label', 'Label', 'name', 'Name'])),
    type: pickString(pick(field, ['type', 'Type'], 'string')).toLowerCase(),
    placeholder: pickString(pick(field, ['placeholder', 'Placeholder'], '')),
    defaultValue: pick(field, ['default', 'default_value', 'defaultValue', 'Default'], ''),
    defaultByArch: normalizeDefaultByArch(pick(field, ['default_by_arch', 'defaultByArch', 'DefaultByArch'])),
    required: Boolean(pick(field, ['required', 'Required'], false)),
    help: pickString(pick(field, ['help', 'Help'], '')),
    options: Array.isArray(pick(field, ['options', 'Options']))
      ? pick(field, ['options', 'Options']).map(item => pickString(item)).filter(Boolean)
      : [],
    role: pickString(pick(field, ['role', 'Role'], '')).toLowerCase(),
    postexArg: pickString(pick(field, ['postex_arg', 'postexArg', 'PostExArg'], '')),
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
    mode: pickString(pick(postex, ['mode', 'Mode'], '')).toLowerCase().replace(/_/g, '-'),
    dll: pickString(pick(postex, ['dll', 'DLL'], '')),
    dllByArch: normalizeStringMap(pick(postex, ['dll_by_arch', 'dllByArch', 'DLLByArch'])),
    waitMs: Number(pick(postex, ['wait_ms', 'waitMs', 'WaitMS'], 0)) || 0,
    maxRuntimeMs: Number(pick(postex, ['max_runtime_ms', 'maxRuntimeMs', 'MaxRuntimeMS'], 0)) || 0,
    idleTimeoutMs: Number(pick(postex, ['idle_timeout_ms', 'idleTimeoutMs', 'IdleTimeoutMS'], 0)) || 0,
    description: pickString(pick(postex, ['description', 'Description'], '')),
    moduleArgs: pickString(pick(postex, ['module_args', 'moduleArgs', 'ModuleArgs'], '')),
    spawnPath: pickString(pick(postex, ['spawn_path', 'spawnPath', 'SpawnPath'], '')),
    spawnPathByArch: normalizeStringMap(pick(postex, ['spawn_path_by_arch', 'spawnPathByArch', 'SpawnPathByArch'])),
    spawnArgs: pickString(pick(postex, ['spawn_args', 'spawnArgs', 'SpawnArgs'], '')),
    backend: pickString(pick(postex, ['backend', 'Backend'], '')),
  }
}

// normalizePluginAction 将原始动作对象转换为前端统一的动作模型
function normalizePluginAction(action) {
  if (!action || typeof action !== 'object') return null

  const fields = Array.isArray(pick(action, ['fields', 'Fields']))
    ? pick(action, ['fields', 'Fields']).map(normalizePluginActionField).filter(Boolean)
    : []
  const postex = normalizePostExConfig(pick(action, ['postex', 'PostEx']))
  const kind = pickString(pick(action, ['kind', 'Kind'], postex ? 'postex' : 'bof')).toLowerCase() || 'bof'

  return {
    id: pickString(pick(action, ['id', 'ID', 'name'])),
    kind,
    label: pickString(pick(action, ['label', 'Label', 'display_name', 'displayName', 'name', 'id', 'ID'])),
    description: pickString(pick(action, ['description', 'Description'], '')),
    os: normalizeStringList(pick(action, ['os', 'OS'])),
    arch: normalizeStringList(pick(action, ['arch', 'Arch'])),
    artifact: pickString(pick(action, ['artifact', 'Artifact', 'binary', 'Binary'], '')),
    artifactByArch: normalizeStringMap(pick(action, ['artifact_by_arch', 'artifactByArch', 'ArtifactByArch'])),
    artifactData: pickString(pick(action, ['artifact_data', 'artifactData', 'ArtifactData'], '')),
    commandId: Number(pick(action, ['command_id', 'commandId', 'CommandID'], 0)) || 0,
    requiresInput: Boolean(pick(action, ['requires_input', 'requiresInput', 'RequiresInput'], fields.length)),
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
    id: pickString(pick(plugin, ['id', 'name', 'ID'])),
    name: pickString(pick(plugin, ['name', 'id', 'ID'])),
    displayName: pickString(pick(plugin, ['display_name', 'displayName', 'name', 'id', 'ID'], 'Plugin')),
    version: pickString(pick(plugin, ['version', 'Version'], '')),
    description: pickString(pick(plugin, ['description', 'Description'], '')),
    path: pickString(pick(plugin, ['path', 'Path', 'root', 'Root'], '')),
    permissions: Array.isArray(plugin.permissions || plugin.Permissions)
      ? (plugin.permissions || plugin.Permissions).map(item => pickString(item))
      : [],
    actions,
    status: pickString(pick(plugin, ['status', 'Status'], 'unknown')),
    lastError: pickString(pick(plugin, ['last_error', 'lastError', 'LastError'], '')),
    loadedAt: pick(plugin, ['loaded_at', 'loadedAt', 'LoadedAt'], null),
    updatedAt: pick(plugin, ['updated_at', 'updatedAt', 'UpdatedAt'], null),
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
        const beaconId = pickString(pick(payload, ['beacon_id', 'beaconId', 'selected_beacon_id', 'selectedBeaconId']))
        const artifact = pickString(pick(payload, ['artifact', 'artifact_path', 'artifactPath'], ''))
        const kind = pickString(pick(payload, ['kind', 'action_kind', 'actionKind'], 'bof')).toLowerCase()
        if (beaconId) {
          consoleStore.openConsole(beaconId)
          if (kind === 'postex') {
            const mode = pickString(pick(payload, ['postex_mode', 'postexMode'], pick(payload.postex || {}, ['mode'], 'postex')))
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
        const beaconId = pickString(pick(payload, ['beacon_id', 'beaconId', 'selected_beacon_id', 'selectedBeaconId']))
        if (beaconId) {
          const kind = pickString(pick(payload, ['kind', 'action_kind', 'actionKind'], 'bof')).toLowerCase()
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
