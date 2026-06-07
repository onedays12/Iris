/**
 * Beacon API 模块 - Beacon 会话的后端通信接口
 *
 * 提供 Beacon 列表查询、命令下发和会话删除等核心 API 调用。
 */

// ─── 导入 ───

import { request } from '../../../shared/api/httpClient.js'
import { buildBeaconCommandArgs } from './commandArgs.js'

// ─── Beacon 会话管理 ───

/**
 * 获取所有已注册的 Beacon 会话列表
 * @returns {Promise<Array>} Beacon 会话数组
 */
export async function listBeacons() {
  return await request('GET', '/api/v1/beacon/list')
}

/**
 * 向指定 Beacon 下发命令
 * @param {string} beaconid - 目标 Beacon ID
 * @param {number} commandId - 命令 ID
 * @param {Array} args - 命令参数列表
 * @returns {Promise<Object>} 服务端响应
 */
export async function sendCommand(beaconid, commandId, args = []) {
  const normalizedArgs = buildBeaconCommandArgs(commandId, args)
  const payload = {
    beacon_id: String(beaconid),
    command: Number(commandId),
    args: normalizedArgs,
  }
  return await request('POST', '/api/v1/beacon/command', payload)
}

/**
 * 移除指定 Beacon 会话
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<Object>} 服务端响应
 */
export async function removeBeacon(beaconid) {
  return await request('POST', '/api/v1/beacon/remove', { beacon_id: String(beaconid) })
}
