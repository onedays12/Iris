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
  | 'server'
  | 'client'
  | 'unknown'

export interface HttpErrorInfo {
  kind: HttpErrorKind
  message: string
}

export type HttpHeaders = Record<string, string>
