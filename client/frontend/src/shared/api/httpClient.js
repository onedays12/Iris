/**
 * HTTP 客户端
 * 封装 Wails ProxyService 的请求/上传/下载能力，
 * 统一处理认证头、响应解析、错误通知。
 * 所有 feature API 模块共用此客户端。
 */

import { ProxyService } from '../../../bindings/irisclient/service'
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

// ─── 结构化错误分类 ───

/**
 * 根据 HTTP status code 构建用户友好的错误消息
 * @param {number} status - HTTP status code (0 = network error)
 * @param {string} errorText - error message from ProxyResult or exception
 * @returns {{ message: string, kind: string }}
 */
function classifyHttpError(status, errorText) {
  const lowerMsg = String(errorText || '').toLowerCase()

  if (status === 0) {
    // Network-level failure
    if (lowerMsg.includes('connection refused') || lowerMsg.includes('econnrefused') || lowerMsg.includes('actively refuse')) {
      return { kind: 'network', message: '【连接失败】无法触达 TeamServer，请确认服务器已启动且端口号正确。' }
    }
    if (lowerMsg.includes('timeout') || lowerMsg.includes('deadline')) {
      return { kind: 'timeout', message: '【请求超时】后端响应太慢，请检查服务器负载或网络。' }
    }
    return { kind: 'network', message: '【网络异常】' + (errorText || '无法连接到服务器') }
  }

  if (status === 401) {
    return { kind: 'auth', message: '【认证过期】登录已失效，请重新登录。' }
  }

  if (status === 403) {
    return { kind: 'forbidden', message: '【权限不足】当前用户无权执行此操作。' }
  }

  if (status >= 500) {
    return { kind: 'server', message: `【服务器错误 ${status}】后端返回异常，请检查 TeamServer 日志。` }
  }

  if (status >= 400) {
    return { kind: 'client', message: `【请求错误 ${status}】${errorText || '请求参数有误'}` }
  }

  return { kind: 'unknown', message: errorText || '未知错误' }
}

/**
 * 处理 401 — 触发登出逻辑
 */
function handleAuthExpired() {
  const authStore = useAuthStore()
  if (authStore.token) {
    authStore.token = ''
    authStore.isAuthenticated = false
  }
}

// ─── 核心请求 ───

/**
 * 发送 HTTP 请求（通过 Wails ProxyService 代理）
 *
 * 使用 DoRequestWithStatus 获取结构化响应（含 HTTP status code），
 * 按 status 分类处理：401 触发登出，5xx 提示服务器错误，0 提示网络异常。
 *
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

    // Use structured request to get HTTP status code
    const rawResponse = await ProxyService.DoRequestWithStatus(method, url, payload, headers)

    // Parse ProxyResult JSON
    let proxyResult
    try {
      proxyResult = JSON.parse(rawResponse)
    } catch {
      // Fallback: treat as legacy plain body
      return parseApiResponse(rawResponse)
    }

    // Network error (status=0)
    if (proxyResult.status === 0 && proxyResult.error) {
      const classified = classifyHttpError(0, proxyResult.error)
      const notificationStore = useNotificationStore()
      notificationStore.error(classified.message)
      console.error(`[Proxy-API] ${method} ${path} network error:`, proxyResult.error)
      throw new Error(classified.message)
    }

    // HTTP-level errors
    if (proxyResult.status === 401) {
      handleAuthExpired()
      const classified = classifyHttpError(401, '')
      const notificationStore = useNotificationStore()
      notificationStore.error(classified.message)
      throw new Error(classified.message)
    }

    if (proxyResult.status >= 400) {
      // Try to extract error message from response body
      let serverError = proxyResult.body
      try {
        const parsed = JSON.parse(proxyResult.body)
        serverError = parsed.error || parsed.message || proxyResult.body
      } catch {
        // body is not JSON, use as-is
      }
      const classified = classifyHttpError(proxyResult.status, serverError)
      const notificationStore = useNotificationStore()
      notificationStore.error(classified.message)
      console.error(`[Proxy-API] ${method} ${path} HTTP ${proxyResult.status}:`, serverError)
      throw new Error(classified.message)
    }

    // Success (2xx)
    return parseApiResponse(proxyResult.body)
  } catch (err) {
    // Re-throw if already classified (our own errors)
    if (err.message && err.message.startsWith('【')) {
      throw err
    }

    // Fallback for unexpected errors
    const notificationStore = useNotificationStore()
    const lowerMsg = String(err.message || '').toLowerCase()
    let userMessage = err.message || '网络连接异常'

    if (lowerMsg.includes('connection refused') || lowerMsg.includes('econnrefused') || lowerMsg.includes('actively refuse')) {
      userMessage = '【连接失败】无法触达 TeamServer，请确认服务器已启动且端口号正确。'
    } else if (lowerMsg.includes('timeout') || lowerMsg.includes('deadline')) {
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
