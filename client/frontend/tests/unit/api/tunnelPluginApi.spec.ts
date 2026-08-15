import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  ListPlugins: vi.fn(),
  ReloadPlugins: vi.fn(),
  AddPlugin: vi.fn(),
  DeletePlugin: vi.fn(),
  InvokePluginAction: vi.fn(),
}))

vi.mock('../../../src/shared/api/httpClient.js', () => ({ request: mocks.request }))
vi.mock('../../../src/features/plugin/api/pluginBindings.js', () => ({
  listPluginSnapshots: mocks.ListPlugins,
  reloadPluginSnapshots: mocks.ReloadPlugins,
  addPluginFromPath: mocks.AddPlugin,
  deletePluginById: mocks.DeletePlugin,
  invokePlugin: mocks.InvokePluginAction,
}))

import zhCN from '../../../src/locales/zh-CN.json'
import { i18n } from '../../../src/i18n/index'
import * as pluginApi from '../../../src/features/plugin/api/pluginApi'
import * as tunnelApi from '../../../src/features/tunnel/api/tunnelApi'

const tunnel = { tunnel_id: 't1', mode: 'socks5' }
const page = { page: 1, page_size: 20, total: 1, has_more: false, items: [tunnel] }

describe('tunnel and plugin API contracts', () => {
  beforeAll(() => {
    // 守卫错误消息经 i18n 渲染, 测试环境预载 zh-CN 断言中文文案
    i18n.global.setLocaleMessage('zh-CN', zhCN)
    i18n.global.locale.value = 'zh-CN'
  })

  beforeEach(() => { vi.clearAllMocks() })

  it('covers tunnel query, mutation, and control routes', async () => {
    mocks.request
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, items: [{ channel_id: 'c1' }] })
      .mockResolvedValueOnce(tunnel)
      .mockResolvedValueOnce(tunnel)
      .mockResolvedValue({ ok: true })

    await tunnelApi.listTunnels(2, 50)
    await tunnelApi.listTunnelChannels('t 1', 3, 10)
    const createPayload = {
      beacon_id: 'b1', mode: 'socks5' as const, bind_port: 1080,
      socks_auth_mode: 'no_auth' as const, socks_udp_associate: false,
    }
    await tunnelApi.createTunnel(createPayload)
    await tunnelApi.updateTunnel('t1', { bind_port: 1081, socks_udp_associate: true })
    await tunnelApi.pauseTunnel('t1')
    await tunnelApi.resumeTunnel('t1')
    await tunnelApi.stopTunnel('t1')
    await tunnelApi.clearTunnel('t1')

    expect(mocks.request.mock.calls).toEqual([
      ['GET', '/api/v1/tunnels?page=2&page_size=50'],
      ['GET', '/api/v1/tunnels/t%201/channels?page=3&page_size=10'],
      ['POST', '/api/v1/tunnels', createPayload],
      ['PATCH', '/api/v1/tunnels/t1', { bind_port: 1081, socks_udp_associate: true }],
      ['POST', '/api/v1/tunnels/t1/pause'],
      ['POST', '/api/v1/tunnels/t1/resume'],
      ['POST', '/api/v1/tunnels/t1/stop'],
      ['DELETE', '/api/v1/tunnels/t1'],
    ])
  })

  it('recycles channels without sending the obsolete count body', async () => {
    mocks.request.mockResolvedValue({ recycled_count: 4 })
    await expect(tunnelApi.recycleTunnelChannels('t1', 99)).resolves.toEqual({ recycled_count: 4 })
    expect(mocks.request).toHaveBeenCalledWith('POST', '/api/v1/tunnels/t1/channels/recycle')
  })

  it('rejects reserved tunnel modes at the create boundary', async () => {
    await expect(tunnelApi.createTunnel({
      beacon_id: 'b1',
      mode: 'http_proxy',
      bind_port: 8080,
    } as never)).rejects.toThrow('尚未定义创建契约')
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('validates tunnel pagination fields', async () => {
    mocks.request.mockResolvedValue({ page: 1, items: [] })
    await expect(tunnelApi.listTunnels()).rejects.toThrow('page_size')
  })

  it('types and validates direct Wails plugin calls', async () => {
    const plugin = { id: 'p1', name: 'demo' }
    mocks.ListPlugins.mockResolvedValue([plugin])
    mocks.ReloadPlugins.mockResolvedValue([plugin])
    mocks.AddPlugin.mockResolvedValue([plugin])
    mocks.DeletePlugin.mockResolvedValue([plugin])
    mocks.InvokePluginAction.mockResolvedValue(plugin)

    await expect(pluginApi.listPlugins()).resolves.toEqual([plugin])
    await pluginApi.reloadPlugins()
    await pluginApi.addPlugin('C:\\plugins\\demo')
    await pluginApi.deletePlugin('p1')
    await expect(pluginApi.invokePluginAction('p1', 'run', '{}')).resolves.toEqual(plugin)
    expect(mocks.AddPlugin).toHaveBeenCalledWith('C:\\plugins\\demo')
    expect(mocks.InvokePluginAction).toHaveBeenCalledWith('p1', 'run', '{}')
  })
})
