import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const httpMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('../../../src/shared/api/httpClient.js', () => httpMocks)

import zhCN from '../../../src/locales/zh-CN.json'
import { i18n } from '../../../src/i18n/index'
import * as authApi from '../../../src/features/auth/api/authApi'
import * as beaconApi from '../../../src/features/beacon/api/beaconApi'
import * as listenerApi from '../../../src/features/listener/api/listenerApi'

describe('auth, beacon, and listener API contracts', () => {
  beforeAll(() => {
    // 守卫错误消息经 i18n 渲染, 测试环境预载 zh-CN 断言中文文案
    i18n.global.setLocaleMessage('zh-CN', zhCN)
    i18n.global.locale.value = 'zh-CN'
  })

  beforeEach(() => { vi.clearAllMocks() })

  it('uses the documented auth routes', async () => {
    httpMocks.request.mockResolvedValueOnce({ token: 'jwt' }).mockResolvedValueOnce({ ok: true })
    await expect(authApi.login('admin', 'secret')).resolves.toEqual({ token: 'jwt' })
    expect(httpMocks.request).toHaveBeenNthCalledWith(1, 'POST', '/api/v1/login', { username: 'admin', password: 'secret' })
    await authApi.logout()
    expect(httpMocks.request).toHaveBeenNthCalledWith(2, 'POST', '/api/v1/logout')
  })

  it('validates beacon list IDs and builds typed command arguments', async () => {
    httpMocks.request
      .mockResolvedValueOnce([{ beacon_id: 'b1' }])
      .mockResolvedValueOnce({ ok: true, message: 'Task created successfully' })
      .mockResolvedValueOnce({ ok: true })

    await expect(beaconApi.listBeacons()).resolves.toEqual([{ beacon_id: 'b1' }])
    await beaconApi.sendCommand('b1', 51, [0, 80])
    expect(httpMocks.request).toHaveBeenNthCalledWith(2, 'POST', '/api/v1/beacon/command', {
      beacon_id: 'b1',
      command: 51,
      args: [
        { kind: 'int32', value: 0 },
        { kind: 'int32', value: 80 },
      ],
    })
    await beaconApi.removeBeacon('b1')
    expect(httpMocks.request).toHaveBeenNthCalledWith(3, 'POST', '/api/v1/beacon/remove', { beacon_id: 'b1' })
  })

  it('rejects malformed beacon list containers', async () => {
    httpMocks.request.mockResolvedValue([{ hostname: 'missing-id' }])
    await expect(beaconApi.listBeacons()).rejects.toThrow('beacon_id')
  })

  it('covers listener query, mutation, and control routes', async () => {
    const listener = { name: 'http-1' }
    const config = {
      name: 'http-1',
      protocol: 'http' as const,
      listener_type: 'external' as const,
      profile: 'http-default',
      host: '0.0.0.0',
      port: 8080,
      callback_host: '10.0.0.1',
      callback_port: 8080,
      encrypt_key: '0011',
    }
    httpMocks.request.mockResolvedValue({ ok: true })
    httpMocks.request.mockResolvedValueOnce([listener])

    await expect(listenerApi.listListeners()).resolves.toEqual([listener])
    await listenerApi.createListener(config)
    await listenerApi.editListener(config)
    await listenerApi.pauseListener('http-1')
    await listenerApi.resumeListener('http-1')
    await listenerApi.removeListener('http-1')

    expect(httpMocks.request.mock.calls.slice(1)).toEqual([
      ['POST', '/api/v1/listener/create', config],
      ['POST', '/api/v1/listener/edit', config],
      ['POST', '/api/v1/listener/pause', { name: 'http-1' }],
      ['POST', '/api/v1/listener/resume', { name: 'http-1' }],
      ['POST', '/api/v1/listener/remove', { name: 'http-1' }],
    ])
  })
})
