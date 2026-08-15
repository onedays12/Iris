import { describe, expect, it } from 'vitest'
import { normalizeBeacon } from '../../src/features/beacon/model'
import { normalizeStoredFile } from '../../src/features/files/model'
import { normalizeListener } from '../../src/features/listener/model'
import { localizedText, normalizePlugin } from '../../src/features/plugin/model'
import { normalizeScreenshot } from '../../src/features/screenshots/model'
import { normalizeTunnel } from '../../src/features/tunnel/model'

describe('typed business model mappers', () => {
  it('maps documented snake_case DTOs to camelCase models', () => {
    expect(normalizeBeacon({ beacon_id: 'b1', hostname: 'host', is_admin: true })?.beaconid).toBe('b1')
    expect(normalizeListener({ id: 'l1', listener_type: 'external', bind_port: 8080 })).toMatchObject({
      id: 'l1', listenerType: 'external', bindPort: 8080,
    })
    expect(normalizeStoredFile({ file_id: 'f1', file_name: 'a.bin' })).toMatchObject({
      fileId: 'f1', fileName: 'a.bin',
    })
    expect(normalizeScreenshot({ screenshot_id: 's1', beacon_id: 'b1', image_size: 12 }).imageSize).toBe(12)
    expect(normalizeTunnel({ tunnel_id: 't1', beacon_id: 'b1', mode: 'socks5', bind_port: 1080 })).toMatchObject({
      tunnelId: 't1', beaconId: 'b1', typeLabel: 'SOCKS5', bindPort: 1080,
    })
    expect(normalizePlugin({ id: 'p1', display_name: 'Demo', actions: [] })).toMatchObject({
      id: 'p1', displayName: 'Demo', actions: [],
    })
  })
})

describe('plugin schema v2 localized text', () => {
  it('localizedText resolves locale, then en/zh/default fallbacks', () => {
    const value = { zh: '执行与注入', en: 'Execution & Injection' }
    expect(localizedText(value, 'zh-CN')).toBe('执行与注入')
    expect(localizedText(value, 'en-US')).toBe('Execution & Injection')
    expect(localizedText(value, 'fr-FR')).toBe('Execution & Injection') // 回退 en
    expect(localizedText('plain', 'zh-CN')).toBe('plain')
    expect(localizedText(undefined, 'zh-CN')).toBe('')
  })

  it('normalizePlugin keeps localized display_name as a map instead of stringifying it', () => {
    const plugin = normalizePlugin({
      id: 'p1',
      display_name: { zh: '执行与注入', en: 'Execution & Injection' },
      description: 'plain',
      capabilities: { command_ids: [70] },
      actions: [
        {
          id: 'whoami',
          artifact: 'bin/whoami.x64.o',
          label: { zh: '身份', en: 'Whoami' },
          fields: [{ name: 'x', label: { zh: '参数', en: 'Arg' }, help: 'hint' }],
        },
      ],
    })
    expect(plugin).not.toBeNull()
    expect(localizedText(plugin?.displayName, 'zh-CN')).toBe('执行与注入')
    expect(localizedText(plugin?.displayName, 'en-US')).toBe('Execution & Injection')
    expect(plugin?.capabilities).toEqual([70])
    expect(localizedText(plugin?.actions[0]?.label, 'zh-CN')).toBe('身份')
    expect(localizedText(plugin?.actions[0]?.fields[0]?.label, 'en-US')).toBe('Arg')
    expect(localizedText(plugin?.actions[0]?.fields[0]?.help, 'zh-CN')).toBe('hint')
  })

  it('normalizePlugin tolerates missing capabilities', () => {
    const plugin = normalizePlugin({ id: 'p2', actions: [] })
    expect(plugin?.capabilities).toEqual([])
  })
})

describe('plugin action requiresInput convention', () => {
  it('derives requiresInput from fields when requires_input is omitted (backend omitempty)', () => {
    const withFields = normalizePlugin({
      id: 'p3',
      actions: [{ id: 'adduserbysamr', fields: [{ name: 'username' }, { name: 'password' }] }],
    })
    expect(withFields?.actions[0]?.requiresInput).toBe(true)

    const withoutFields = normalizePlugin({
      id: 'p4',
      actions: [{ id: 'whoami' }],
    })
    expect(withoutFields?.actions[0]?.requiresInput).toBe(false)
  })

  it('honors explicit requires_input override', () => {
    const explicitTrue = normalizePlugin({ id: 'p5', actions: [{ id: 'a', requires_input: true }] })
    expect(explicitTrue?.actions[0]?.requiresInput).toBe(true)

    const explicitFalse = normalizePlugin({
      id: 'p6',
      actions: [{ id: 'a', requires_input: false, fields: [{ name: 'x' }] }],
    })
    expect(explicitFalse?.actions[0]?.requiresInput).toBe(false)
  })
})
