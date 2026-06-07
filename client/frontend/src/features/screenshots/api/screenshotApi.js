/**
 * 截图 API 模块 - 截图的请求、列表、下载与删除
 *
 * 提供向 Beacon 请求截图、查询截图列表、
 * 下载截图数据和删除截图记录等 API 调用。
 */

// ─── 导入 ───

import { sendCommand } from '../../beacon/api/beaconApi.js'
import { downloadBinaryBase64, request } from '../../../shared/api/httpClient.js'

// ─── 查询接口 ───

/**
 * 获取所有截图列表
 * @returns {Promise<Array>} 截图记录数组
 */
export async function listScreenshots() {
  return await request('GET', '/api/v1/screenshot/list')
}

/**
 * 向 Beacon 请求截图
 * @param {string} beaconid - 目标 Beacon ID
 * @param {number} monitorId - 显示器 ID
 * @param {number} quality - 图片质量
 * @returns {Promise<Object>}
 */
export async function requestScreenshot(beaconid, monitorId = 0, quality = 80) {
  return await sendCommand(beaconid, 51, [monitorId, quality])
}

// ─── 下载与删除 ───

/**
 * 以 base64 格式下载截图数据
 * @param {Object} params - 下载参数
 * @param {string} params.screenshotId - 截图 ID
 * @param {string} params.downloadUrl - 直接下载 URL（可选）
 * @returns {Promise<string>} base64 编码的图片数据
 */
export async function downloadScreenshotBase64({ screenshotId, downloadUrl }) {
  const path = downloadUrl || `/api/v1/screenshot/download?screenshot_id=${encodeURIComponent(screenshotId)}`
  return await downloadBinaryBase64(path)
}

/**
 * 删除截图记录
 * @param {string} screenshotId - 截图 ID
 * @returns {Promise<Object>}
 */
export async function deleteScreenshot(screenshotId) {
  const path = `/api/v1/screenshot?screenshot_id=${encodeURIComponent(String(screenshotId || ''))}`
  return await request('DELETE', path)
}
