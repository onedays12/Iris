/**
 * 插件 API 模块 - 插件管理与动作调用
 *
 * 通过 Wails 绑定直接调用 Go 侧的 PluginService，
 * 提供插件的列表查询、热重载、添加、删除和动作执行。
 */

// ─── 导入 ───

import { PluginService } from '../../../../bindings/changeme/service'

// ─── 插件管理 ───

/**
 * 获取所有已加载插件列表
 * @returns {Promise<Array>} 插件数组
 */
export function listPlugins() {
  return PluginService.ListPlugins()
}

/**
 * 热重载所有插件
 * @returns {Promise<Object>}
 */
export function reloadPlugins() {
  return PluginService.ReloadPlugins()
}

/**
 * 添加新插件
 * @param {string} pluginPath - 插件文件路径
 * @returns {Promise<Object>}
 */
export function addPlugin(pluginPath) {
  return PluginService.AddPlugin(pluginPath)
}

/**
 * 删除插件
 * @param {string} pluginId - 插件 ID
 * @returns {Promise<Object>}
 */
export function deletePlugin(pluginId) {
  return PluginService.DeletePlugin(pluginId)
}

// ─── 动作调用 ───

/**
 * 执行插件动作
 * @param {string} pluginId - 插件 ID
 * @param {string} action - 动作 ID
 * @param {string} payloadJSON - JSON 格式的动作参数
 * @returns {Promise<Object>} 执行结果
 */
export function invokePluginAction(pluginId, action, payloadJSON = '') {
  return PluginService.InvokePluginAction(pluginId, action, payloadJSON)
}
