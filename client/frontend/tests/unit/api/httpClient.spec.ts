import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const bindingMocks = vi.hoisted(() => ({
  DoRequestWithStatus: vi.fn(),
  DownloadFileBase64: vi.fn(),
  UploadFileBase64: vi.fn(),
}))

vi.mock('../../../bindings/irisclient/service', () => ({
  ProxyService: bindingMocks,
}))

import zhCN from '../../../src/locales/zh-CN.json'
import { i18n } from '../../../src/i18n/index'
import {
  downloadBinaryBase64,
  parseApiResponse,
  request,
  uploadFileBase64,
} from '../../../src/shared/api/httpClient'
import { useAuthStore } from '../../../src/stores/auth'
import { useNotificationStore } from '../../../src/stores/notification'

function proxyResult(status: number, body = '', error = ''): string {
  return JSON.stringify({ status, body, ...(error ? { error } : {}) })
}

describe('httpClient transport boundary', () => {
  beforeAll(() => {
    // 错误消息经 i18n 渲染, 测试环境默认未加载消息文件, 此处预载 zh-CN 断言中文文案
    i18n.global.setLocaleMessage('zh-CN', zhCN)
    i18n.global.locale.value = 'zh-CN'
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const authStore = useAuthStore()
    authStore.apiBase = 'https://teamserver.test'
    authStore.token = 'jwt-token'
  })

  it('unwraps data and preserves operation responses', () => {
    expect(parseApiResponse<{ token: string }>(JSON.stringify({ ok: true, data: { token: 'abc' } }))).toEqual({ token: 'abc' })
    expect(parseApiResponse(JSON.stringify({ ok: true, message: 'done' }))).toEqual({ ok: true, message: 'done' })
  })

  it('rejects API errors, invalid envelopes, and HTML pages', () => {
    expect(() => parseApiResponse(JSON.stringify({ ok: false, error: 'bad request' }))).toThrow('bad request')
    expect(() => parseApiResponse(JSON.stringify({ ok: 'yes' }))).toThrow('无效的 API 响应')
    expect(() => parseApiResponse('<!DOCTYPE html>')).toThrow('HTML 页面')
  })

  it('sends an authenticated structured request and unwraps its body', async () => {
    bindingMocks.DoRequestWithStatus.mockResolvedValue(proxyResult(200, JSON.stringify({ ok: true, data: { id: 7 } })))

    await expect(request<{ id: number }, { name: string }>('POST', '/api/v1/example', { name: 'demo' })).resolves.toEqual({ id: 7 })
    expect(bindingMocks.DoRequestWithStatus).toHaveBeenCalledWith(
      'POST',
      'https://teamserver.test/api/v1/example',
      JSON.stringify({ name: 'demo' }),
      { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-token' },
    )
  })

  it('rejects non-structured proxy responses (legacy plain body path removed)', async () => {
    bindingMocks.DoRequestWithStatus.mockResolvedValue(JSON.stringify({ ok: true, data: ['legacy'] }))
    await expect(request<string[]>('GET', '/api/v1/legacy')).rejects.toThrow('非结构化')
  })

  it('classifies network failures and notifies once', async () => {
    bindingMocks.DoRequestWithStatus.mockResolvedValue(proxyResult(0, '', 'connect: connection refused'))
    await expect(request('GET', '/api/v1/test')).rejects.toThrow('【连接失败】')
    expect(useNotificationStore().notifications).toHaveLength(1)
    expect(useNotificationStore().notifications[0].message).toContain('连接失败')
  })

  it('clears auth state on 401', async () => {
    bindingMocks.DoRequestWithStatus.mockResolvedValue(proxyResult(401, JSON.stringify({ error: 'expired' })))
    await expect(request('GET', '/api/v1/protected')).rejects.toThrow('【认证过期】')
    expect(useAuthStore().token).toBe('')
    expect(useNotificationStore().notifications[0].message).toContain('认证过期')
  })

  it('extracts a server error message for HTTP failures', async () => {
    bindingMocks.DoRequestWithStatus.mockResolvedValue(proxyResult(400, JSON.stringify({ error: 'invalid port' })))
    await expect(request('POST', '/api/v1/tunnels')).rejects.toThrow('【请求错误 400】invalid port')
  })

  it('uses typed upload and binary download helpers', async () => {
    bindingMocks.UploadFileBase64.mockResolvedValue(JSON.stringify({ ok: true, data: { file_id: 'f1' } }))
    bindingMocks.DownloadFileBase64.mockResolvedValue('YmFzZTY0')

    await expect(uploadFileBase64<{ file_id: string }>('/upload', 'a.bin', 'AA==')).resolves.toEqual({ file_id: 'f1' })
    await expect(downloadBinaryBase64('/download')).resolves.toBe('YmFzZTY0')
    expect(bindingMocks.UploadFileBase64).toHaveBeenCalledWith(
      'https://teamserver.test/upload',
      'a.bin',
      'AA==',
      { Authorization: 'Bearer jwt-token' },
    )
  })
})
