/**
 * 文件 API 模块 - 文件浏览、上传与下载接口
 *
 * 提供远程文件浏览（explorer）、本地文件上传到 TeamServer、
 * 以及从 TeamServer 下载文件的功能。
 */

// ─── 导入 ───

import { useNotificationStore } from '../../../stores/notification.js'
import { downloadBinaryBase64, request, uploadFileBase64 } from '../../../shared/api/httpClient.js'

// ─── 内部工具 ───

/**
 * 将本地 File 对象读取为 base64 字符串
 * @param {File} file - 本地文件对象
 * @returns {Promise<string>} base64 编码的文件内容
 */
async function readFileAsBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('读取本地文件失败'))
    reader.readAsDataURL(file)
  })
}

// ─── 远程文件浏览 ───

/**
 * 浏览 Beacon 主机上的远程文件目录
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} path - 远程目录路径
 * @param {number} limit - 返回条目上限
 * @param {number} offset - 分页偏移
 * @returns {Promise<Object>} 目录内容
 */
export async function explorerFiles(beaconid, path = '', limit = 1000, offset = 0) {
  const payload = {
    beacon_id: String(beaconid),
    path: String(path),
    limit: Number(limit),
    offset: Number(offset),
  }
  return await request('POST', '/api/v1/explorer/files', payload)
}

// ─── 文件上传 ───

/**
 * 将本地文件上传到 TeamServer
 * @param {File} file - 本地文件对象
 * @returns {Promise<Object>} 上传结果（含文件 ID）
 */
export async function uploadFile(file) {
  const notificationStore = useNotificationStore()

  try {
    const base64Data = await readFileAsBase64(file)
    return await uploadFileBase64('/api/v1/files/uploads', file.name, base64Data)
  } catch (err) {
    const userMessage = err.message || '上传文件到 TeamServer 失败'
    notificationStore.error(userMessage)
    console.error('[Proxy-API] POST /api/v1/files/uploads failed:', err)
    throw err
  }
}

// ─── 文件下载 ───

/**
 * 获取可下载文件列表
 * @returns {Promise<Array>} 下载文件数组
 */
export async function listDownloads() {
  return await request('GET', '/api/v1/files/downloads')
}

/**
 * 以 base64 格式下载文件内容
 * @param {Object} params - 下载参数
 * @param {string} params.fileId - 文件 ID
 * @param {string} params.downloadUrl - 直接下载 URL（可选）
 * @returns {Promise<string>} base64 编码的文件内容
 */
export async function downloadFileBase64({ fileId, downloadUrl }) {
  const path = downloadUrl || `/api/v1/files/downloads/${encodeURIComponent(fileId)}`
  return await downloadBinaryBase64(path)
}
