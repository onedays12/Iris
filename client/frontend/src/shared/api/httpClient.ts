/**
 * Wails ProxyService transport boundary shared by all feature API modules.
 */

import { ProxyService } from '../../../bindings/irisclient/service'
import { useAuthStore } from '../../stores/auth'
import { useNotificationStore } from '../../stores/notification'
import { i18n } from '../../i18n/index'
import type {
  HttpErrorInfo,
  HttpHeaders,
  HttpMethod,
  ProxyResult,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown, fallback = ''): string {
  return error instanceof Error ? error.message : String(error || fallback)
}

/** 已分类错误: 通知已发出, 上层 catch 直接透传, 避免二次通知。 */
interface ClassifiedError extends Error {
  classified?: boolean
}

function classifiedError(message: string): ClassifiedError {
  const err = new Error(message) as ClassifiedError
  err.classified = true
  return err
}

function parseProxyResult(value: string): ProxyResult | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }

  if (!isRecord(parsed) || typeof parsed.status !== 'number' || typeof parsed.body !== 'string') {
    return null
  }
  if (parsed.error !== undefined && typeof parsed.error !== 'string') {
    return null
  }

  return {
    status: parsed.status,
    body: parsed.body,
    ...(parsed.error ? { error: parsed.error } : {}),
  }
}

/** Parse and unwrap an API response while retaining legacy plain JSON bodies. */
export function parseApiResponse<TResponse>(responseJson: string): TResponse {
  const trimmed = responseJson.trim()
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(i18n.global.t('httpError.htmlResponse'))
  }

  const result: unknown = JSON.parse(responseJson)
  if (!isRecord(result)) {
    return result as TResponse
  }

  if ('ok' in result && typeof result.ok !== 'boolean') {
    throw new Error(i18n.global.t('httpError.invalidResponse'))
  }
  if (result.ok === false || result.error) {
    const message = typeof result.message === 'string' ? result.message : ''
    const error = typeof result.error === 'string' ? result.error : ''
    throw new Error(message || error || 'API Error')
  }

  return (result.data !== undefined ? result.data : result) as TResponse
}

export function authHeaders(): HttpHeaders {
  const authStore = useAuthStore()
  const headers: HttpHeaders = {}
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`
  }
  return headers
}

export function resolveApiUrl(pathOrUrl: string): string {
  const authStore = useAuthStore()
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const apiBase = authStore.apiBase || 'https://127.0.0.1:8080'
  return `${apiBase}${pathOrUrl}`
}

function classifyHttpError(status: number, errorText: string): HttpErrorInfo {
  const lowerMsg = String(errorText || '').toLowerCase()

  if (status === 0) {
    if (lowerMsg.includes('connection refused') || lowerMsg.includes('econnrefused') || lowerMsg.includes('actively refuse')) {
      return { kind: 'network', message: i18n.global.t('httpError.unreachable') }
    }
    if (lowerMsg.includes('timeout') || lowerMsg.includes('deadline')) {
      return { kind: 'timeout', message: i18n.global.t('httpError.timeout') }
    }
    return { kind: 'network', message: i18n.global.t('httpError.network', { error: errorText || i18n.global.t('httpError.networkGeneric') }) }
  }
  if (status === 401) return { kind: 'auth', message: i18n.global.t('httpError.authExpired') }
  if (status === 403) return { kind: 'forbidden', message: i18n.global.t('httpError.forbidden') }
  if (status >= 500) return { kind: 'server', message: i18n.global.t('httpError.server', { status }) }
  if (status >= 400) {
    return errorText
      ? { kind: 'client', message: i18n.global.t('httpError.clientWithError', { status, error: errorText }) }
      : { kind: 'client', message: i18n.global.t('httpError.clientPlain', { status }) }
  }
  return { kind: 'unknown', message: errorText || i18n.global.t('httpError.unknown') }
}

function handleAuthExpired(): void {
  const authStore = useAuthStore()
  if (authStore.token) {
    authStore.logout()
  }
}

export async function request<TResponse, TBody = undefined>(
  method: HttpMethod,
  path: string,
  body?: TBody,
): Promise<TResponse> {
  const authStore = useAuthStore()

  try {
    const headers: HttpHeaders = { 'Content-Type': 'application/json' }
    if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`

    const apiBase = authStore.apiBase || 'https://127.0.0.1:8080'
    const payload = body === undefined || body === null ? '' : JSON.stringify(body)
    const rawResponse = await ProxyService.DoRequestWithStatus(method, `${apiBase}${path}`, payload, headers)
    const proxyResult = parseProxyResult(rawResponse)

    // 破坏性收敛: Go 端 DoRequestWithStatus 恒返回结构化 ProxyResult。
    // 历史版本兼容过「裸 body 字符串」响应, 该回退已移除——解析失败即契约破裂。
    if (!proxyResult) {
      console.error(`[Proxy-API] ${method} ${path} 返回了非结构化响应`)
      throw new Error(i18n.global.t('httpError.unstructuredProxy'))
    }

    if (proxyResult.status === 0 && proxyResult.error) {
      const classified = classifyHttpError(0, proxyResult.error)
      useNotificationStore().error(classified.message)
      console.error(`[Proxy-API] ${method} ${path} network error:`, proxyResult.error)
      throw classifiedError(classified.message)
    }

    if (proxyResult.status === 401) {
      handleAuthExpired()
      const classified = classifyHttpError(401, '')
      useNotificationStore().error(classified.message)
      throw classifiedError(classified.message)
    }

    if (proxyResult.status >= 400) {
      let serverError = proxyResult.body
      try {
        const parsed: unknown = JSON.parse(proxyResult.body)
        if (isRecord(parsed)) {
          serverError = typeof parsed.error === 'string'
            ? parsed.error
            : typeof parsed.message === 'string'
              ? parsed.message
              : proxyResult.body
        }
      } catch {
        // Non-JSON error bodies are displayed as-is.
      }
      const classified = classifyHttpError(proxyResult.status, serverError)
      useNotificationStore().error(classified.message)
      console.error(`[Proxy-API] ${method} ${path} HTTP ${proxyResult.status}:`, serverError)
      throw classifiedError(classified.message)
    }

    return parseApiResponse<TResponse>(proxyResult.body)
  } catch (error: unknown) {
    const message = errorMessage(error)
    if ((error as ClassifiedError)?.classified) throw error

    const lowerMsg = message.toLowerCase()
    let userMessage = message || i18n.global.t('httpError.networkFallback')
    if (lowerMsg.includes('connection refused') || lowerMsg.includes('econnrefused') || lowerMsg.includes('actively refuse')) {
      userMessage = i18n.global.t('httpError.unreachable')
    } else if (lowerMsg.includes('timeout') || lowerMsg.includes('deadline')) {
      userMessage = i18n.global.t('httpError.timeout')
    }

    useNotificationStore().error(userMessage)
    console.error(`[Proxy-API] ${method} ${path} failed:`, error)
    throw error
  }
}

export async function uploadFileBase64<TResponse>(
  pathOrUrl: string,
  fileName: string,
  base64Data: string,
): Promise<TResponse> {
  const responseJson = await ProxyService.UploadFileBase64(
    resolveApiUrl(pathOrUrl),
    fileName,
    base64Data,
    authHeaders(),
  )
  return parseApiResponse<TResponse>(responseJson)
}

export async function downloadBinaryBase64(pathOrUrl: string): Promise<string> {
  return ProxyService.DownloadFileBase64(resolveApiUrl(pathOrUrl), authHeaders())
}
