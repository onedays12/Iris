/**
 * 监听器 API 模块 - Listener 的增删改查与状态控制
 *
 * 提供监听器的创建、列表查询、暂停、恢复、编辑和删除等 API 调用。
 */

// ─── 导入 ───

import { request } from '../../../shared/api/httpClient.js'

// ─── 查询接口 ───

/**
 * 获取所有监听器列表
 * @returns {Promise<Array>} 监听器数组
 */
export async function listListeners() {
  return await request('GET', '/api/v1/listener/list')
}

// ─── 创建与编辑 ───

/**
 * 创建新监听器
 * @param {Object} config - 监听器配置
 * @returns {Promise<Object>}
 */
export async function createListener(config) {
  return await request('POST', '/api/v1/listener/create', config)
}

// ─── 状态控制 ───

/**
 * 暂停监听器
 * @param {string} name - 监听器名称
 * @returns {Promise<Object>}
 */
export async function pauseListener(name) {
  return await request('POST', '/api/v1/listener/pause', { name })
}

/**
 * 恢复监听器
 * @param {string} name - 监听器名称
 * @returns {Promise<Object>}
 */
export async function resumeListener(name) {
  return await request('POST', '/api/v1/listener/resume', { name })
}

/**
 * 删除监听器
 * @param {string} name - 监听器名称
 * @returns {Promise<Object>}
 */
export async function removeListener(name) {
  return await request('POST', '/api/v1/listener/remove', { name })
}

/**
 * 编辑监听器配置
 * @param {Object} payload - 更新后的配置
 * @returns {Promise<Object>}
 */
export async function editListener(payload) {
  return await request('POST', '/api/v1/listener/edit', payload)
}
