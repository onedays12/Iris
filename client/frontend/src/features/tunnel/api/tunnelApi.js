/**
 * Tunnel API 模块 - 隧道与通道的增删改查及状态控制
 *
 * 提供隧道的创建、查询、暂停、恢复、停止、清理，
 * 以及通道列表查询和通道回收等 API 调用。
 */

// ─── 导入 ───

import { request } from '../../../shared/api/httpClient.js'

// ─── 隧道管理 ───

/**
 * 分页查询隧道列表
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @returns {Promise<Object>} 分页隧道列表
 */
export async function listTunnels(page = 1, pageSize = 20) {
  return await request('GET', `/api/v1/tunnels?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`)
}

/**
 * 创建新隧道
 * @param {Object} payload - 隧道配置
 * @returns {Promise<Object>}
 */
export async function createTunnel(payload) {
  return await request('POST', '/api/v1/tunnels', payload)
}

/**
 * 更新隧道配置
 * @param {string} tunnelId - 隧道 ID
 * @param {Object} payload - 更新内容
 * @returns {Promise<Object>}
 */
export async function updateTunnel(tunnelId, payload) {
  return await request('PATCH', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}`, payload)
}

// ─── 通道管理 ───

/**
 * 分页查询隧道下的通道列表
 * @param {string} tunnelId - 隧道 ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @returns {Promise<Object>} 分页通道列表
 */
export async function listTunnelChannels(tunnelId, page = 1, pageSize = 20) {
  return await request('GET', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/channels?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`)
}

// ─── 状态控制 ───

/**
 * 暂停隧道
 * @param {string} tunnelId - 隧道 ID
 * @returns {Promise<Object>}
 */
export async function pauseTunnel(tunnelId) {
  return await request('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/pause`)
}

/**
 * 恢复隧道
 * @param {string} tunnelId - 隧道 ID
 * @returns {Promise<Object>}
 */
export async function resumeTunnel(tunnelId) {
  return await request('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/resume`)
}

/**
 * 清除/删除隧道
 * @param {string} tunnelId - 隧道 ID
 * @returns {Promise<Object>}
 */
export async function clearTunnel(tunnelId) {
  return await request('DELETE', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}`)
}

/**
 * 回收隧道通道
 * @param {string} tunnelId - 隧道 ID
 * @param {number} recycledCount - 回收数量
 * @returns {Promise<Object>}
 */
export async function recycleTunnelChannels(tunnelId, recycledCount = 0) {
  return await request('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/channels/recycle`, {
    recycled_count: Number(recycledCount),
  })
}

/**
 * 停止隧道
 * @param {string} tunnelId - 隧道 ID
 * @returns {Promise<Object>}
 */
export async function stopTunnel(tunnelId) {
  return await request('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/stop`)
}
