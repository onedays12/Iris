export interface ApiResponse<T = unknown> {
  ok: boolean
  message?: string
  error?: string
  data?: T
}

export interface ApiOperationResult {
  ok: true
  message?: string
}

export interface ProxyResult {
  status: number
  body: string
  error?: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type HttpErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'forbidden'
  | 'conflict'
  | 'rateLimited'
  | 'server'
  | 'client'
  | 'unknown'

export interface HttpErrorInfo {
  kind: HttpErrorKind
  message: string
}

/** httpClient 抛出的已分类错误:通知已由 httpClient 统一发出,上层按 info.kind 细分文案。 */
export interface ClassifiedErrorInfo extends Error {
  info?: HttpErrorInfo
}

export type HttpHeaders = Record<string, string>
