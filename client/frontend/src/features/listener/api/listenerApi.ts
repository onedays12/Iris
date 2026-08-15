import { expectArray, expectRecord, expectStringField } from '../../../shared/api/guards'
import { request } from '../../../shared/api/httpClient'
import type { ApiOperationResult } from '../../../shared/api/types'
import type {
  ListenerCreateRequest,
  ListenerEditRequest,
  ListenerNameRequest,
  ListenerViewDto,
} from './types'

function parseListenerList(value: unknown): ListenerViewDto[] {
  const list = expectArray(value, 'Listener list')
  for (const item of list) {
    expectStringField(expectRecord(item, 'Listener'), 'name', 'Listener')
  }
  return list as ListenerViewDto[]
}

export async function listListeners(): Promise<ListenerViewDto[]> {
  return parseListenerList(await request<unknown>('GET', '/api/v1/listener/list'))
}

export async function createListener(config: ListenerCreateRequest): Promise<ApiOperationResult> {
  return request<ApiOperationResult, ListenerCreateRequest>('POST', '/api/v1/listener/create', config)
}

export async function pauseListener(name: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult, ListenerNameRequest>('POST', '/api/v1/listener/pause', { name })
}

export async function resumeListener(name: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult, ListenerNameRequest>('POST', '/api/v1/listener/resume', { name })
}

export async function removeListener(name: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult, ListenerNameRequest>('POST', '/api/v1/listener/remove', { name })
}

export async function editListener(payload: ListenerEditRequest): Promise<ApiOperationResult> {
  return request<ApiOperationResult, ListenerEditRequest>('POST', '/api/v1/listener/edit', payload)
}
