/**
 * 认证 API 模块 - 用户登录与登出接口
 *
 * 提供 TeamServer 的身份认证相关 API 调用。
 */

// ─── 导入 ───

import { request } from '../../../shared/api/httpClient.js'

// ─── 认证接口 ───

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object>} 登录结果（含 token 等）
 */
export async function login(username, password) {
  return await request('POST', '/api/v1/login', { username, password })
}

/**
 * 用户登出
 * @returns {Promise<Object>}
 */
export async function logout() {
  return await request('POST', '/api/v1/logout')
}
