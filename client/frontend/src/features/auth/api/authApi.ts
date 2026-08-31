import { expectRecord, expectStringField } from '../../../shared/api/guards'
import { request } from '../../../shared/api/httpClient'
import type { ApiOperationResult } from '../../../shared/api/types'
import type { LoginRequest, LoginResult } from './types'

/**
 * 操作员名客户端预校验(CS 统一密码模型,与服务端 normalizeUsername 同规):
 * 去首尾空白后长度 1-32 UTF-8 字节,不含控制字符,区分大小写。
 * @returns 违规提示文案 key;合法返回 null
 */
export function operatorNameErrorKey(rawUsername: string): string | null {
  const name = rawUsername.trim()
  if (!name) return 'login.nameRequired'
  const byteLength = new TextEncoder().encode(name).length
  if (byteLength > 32) return 'login.nameTooLong'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(name)) return 'login.nameControlChars'
  return null
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const data = await request<unknown, LoginRequest>('POST', '/api/v1/login', { username, password })
  const record = expectRecord(data, 'Login')
  return { token: expectStringField(record, 'token', 'Login') }
}

export async function logout(): Promise<ApiOperationResult> {
  return request<ApiOperationResult>('POST', '/api/v1/logout')
}
