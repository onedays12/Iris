/**
 * HTTP 客户端
 * 封装 Wails ProxyService 的请求/上传/下载能力，
 * 统一处理认证头、响应解析、错误通知。
 * 所有 feature API 模块共用此客户端。
 */

import { ProxyService } from '../../../bindings/changeme/service'
import { useAuthStore } from '../../stores/auth.js'
import { useNotificationStore } from '../../stores/notification.js'

// ─── 响应解析 ───

/**
 * 解析 API 响应 JSON，处理错误和 HTML 误返回
 * @param {string} responseJson - 原始响应字符串
 * @returns {*} 解析后的 data 字段或完整结果
 */
export function parseApiResponse(responseJson) {
  if (responseJson.trim().startsWith('<!DOCTYPE') || responseJson.trim().startsWith('<html')) {
    throw new Error('服务器返回了非预期的 HTML 页面 (可能是路径错误或接口变更)。')
  }

  const result = JSON.parse(responseJson)
  if (result.ok === false || result.error) {
    throw new Error(result.message || result.error || 'API Error')
  }

  return result.data !== undefined ? result.data : result
}

// ─── 请求工具 ───

/**
 * 构建认证请求头
 * @returns {object} 包含 Authorization 的 headers 对象
 */
export function authHeaders() {
  const authStore = useAuthStore()
  const headers = {}
  if (authStore.token) {
    headers['Authorization'] = `Bearer ${authStore.token}`
  }
  return headers
}

/**
 * 将相对路径补全为完整 API URL
 * @param {string} pathOrUrl - 相对路径或完整 URL
 * @returns {string}
 */
export function resolveApiUrl(pathOrUrl) {
  const authStore = useAuthStore()
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const apiBase = authStore.apiBase || 'https://127.0.0.1:8080'
  return `${apiBase}${pathOrUrl}`
}

// ─── 核心请求 ───

/**
 * 发送 HTTP 请求（通过 Wails ProxyService 代理）
 * @param {string} method - HTTP 方法
 * @param {string} path - API 路径
 * @param {*} body - 请求体（可选）
 * @returns {Promise<*>} 解析后的响应数据
 */
export async function request(method, path, body = null) {
  const authStore = useAuthStore()

  try {
    const headers = {
      'Content-Type': 'application/json',
    }

    if (authStore.token) {
      headers['Authorization'] = `Bearer ${authStore.token}`
    }

    const apiBase = authStore.apiBase || 'https://127.0.0.1:8080'
    const url = `${apiBase}${path}`
    const payload = body ? JSON.stringify(body) : ''
    const responseJson = await ProxyService.DoRequest(method, url, payload, headers)

    return parseApiResponse(responseJson)
  } catch (err) {
    const notificationStore = useNotificationStore()
    let userMessage = err.message || '网络连接异常'
    const lowerMsg = userMessage.toLowerCase()

    if (
      lowerMsg.includes('connection refused') ||
      lowerMsg.includes('econnrefused') ||
      lowerMsg.includes('actively refuse')
    ) {
      userMessage = '【连接失败】无法触达 TeamServer，请确认服务器已启动且端口号正确。'
    } else if (lowerMsg.includes('timeout')) {
      userMessage = '【请求超时】后端响应太慢，请检查服务器负载或网络。'
    }

    notificationStore.error(userMessage)
    console.error(`[Proxy-API] ${method} ${path} failed:`, err)
    throw err
  }
}

// ─── 文件传输 ───

/**
 * 上传文件（Base64 编码）
 * @param {string} pathOrUrl - 上传接口路径
 * @param {string} fileName - 文件名
 * @param {string} base64Data - Base64 编码的文件内容
 */
export async function uploadFileBase64(pathOrUrl, fileName, base64Data) {
  const responseJson = await ProxyService.UploadFileBase64(
    resolveApiUrl(pathOrUrl),
    fileName,
    base64Data,
    authHeaders(),
  )
  return parseApiResponse(responseJson)
}

/**
 * 下载文件（返回 Base64 编码）
 * @param {string} pathOrUrl - 下载接口路径
 * @returns {Promise<string>} Base64 编码的文件内容
 */
export async function downloadBinaryBase64(pathOrUrl) {
  return await ProxyService.DownloadFileBase64(resolveApiUrl(pathOrUrl), authHeaders())
}
