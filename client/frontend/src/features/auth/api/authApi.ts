import { expectRecord, expectStringField } from '../../../shared/api/guards'
import { request } from '../../../shared/api/httpClient'
import type { ApiOperationResult } from '../../../shared/api/types'
import type { LoginRequest, LoginResult } from './types'

export async function login(username: string, password: string): Promise<LoginResult> {
  const data = await request<unknown, LoginRequest>('POST', '/api/v1/login', { username, password })
  const record = expectRecord(data, 'Login')
  return { token: expectStringField(record, 'token', 'Login') }
}

export async function logout(): Promise<ApiOperationResult> {
  return request<ApiOperationResult>('POST', '/api/v1/logout')
}
