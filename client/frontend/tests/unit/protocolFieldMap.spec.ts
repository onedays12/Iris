import { describe, it, expect } from 'vitest'
import {
  pickBeaconId,
  pickBeacon,
  pickTunnel,
  pickChannel,
  pickListener,
  pickTransfer,
  pickCommandEvent,
  pickFile,
  pickScreenshot,
} from '../../src/shared/protocol/adapter'
import {
  BEACON_FIELDS,
  TUNNEL_FIELDS,
  CHANNEL_FIELDS,
  LISTENER_FIELDS,
  TRANSFER_FIELDS,
  COMMAND_EVENT_FIELDS,
  FILE_FIELDS,
  SCREENSHOT_FIELDS,
} from '../../src/shared/protocol/fieldMap'

describe('protocol adapter.pickBeaconId', () => {
  it('reads the canonical snake_case beacon_id', () => {
    expect(pickBeaconId({ beacon_id: 'abc-123' })).toBe('abc-123')
  })

  it('ignores legacy camelCase / PascalCase aliases', () => {
    expect(pickBeaconId({ beaconId: 'b1' })).toBe('')
    expect(pickBeaconId({ BeaconID: 'b2' })).toBe('')
    expect(pickBeaconId({ BeaconId: 'b3' })).toBe('')
  })

  it('ignores generic id/uuid keys', () => {
    expect(pickBeaconId({ id: 'gen-1' })).toBe('')
    expect(pickBeaconId({ uuid: 'u-1' })).toBe('')
    expect(pickBeaconId({ UUID: 'U-2' })).toBe('')
  })

  it('reads beacon_id even when other keys are present', () => {
    expect(pickBeaconId({ beacon_id: 'first', id: 'second' })).toBe('first')
  })

  it('returns empty string when the canonical key is absent', () => {
    expect(pickBeaconId({})).toBe('')
    expect(pickBeaconId(null)).toBe('')
    expect(pickBeaconId(undefined)).toBe('')
  })

  it('returns empty string when the canonical key value is itself empty', () => {
    expect(pickBeaconId({ beacon_id: '' })).toBe('')
  })

  it('stringifies non-string values', () => {
    expect(pickBeaconId({ beacon_id: 12345 })).toBe('12345')
  })
})

describe('protocol adapter.adaptEntity (via pickBeacon)', () => {
  it('maps snake_case fields to canonical names', () => {
    const out = pickBeacon({
      beacon_id: 'b1',
      hostname: 'host1',
      internal_ip: '10.0.0.1',
      listener_type: 'external',
      is_admin: true,
      last_seen: 1700000000,
    })
    expect(out.beaconId).toBe('b1')
    expect(out.hostname).toBe('host1')
    expect(out.internalIp).toBe('10.0.0.1')
    expect(out.listenerType).toBe('external')
    expect(out.isAdmin).toBe(true)
    expect(out.lastSeen).toBe(1700000000)
  })

  it('defaults every field to empty string when source is null', () => {
    const out = pickBeacon(null)
    expect(out.beaconId).toBe('')
    expect(out.hostname).toBe('')
    expect(out.status).toBe('')
    expect(Object.keys(out).length).toBeGreaterThan(20)
  })

  it('preserves boolean / numeric values that come through pick()', () => {
    const out = pickBeacon({ is_admin: false, pid: 999, sleep: 5000 })
    expect(out.isAdmin).toBe(false)
    expect(out.pid).toBe(999)
    expect(out.sleep).toBe(5000)
  })
})

describe('protocol adapter entity shapes', () => {
  it('pickTunnel maps canonical tunnel_id to tunnelId', () => {
    const out = pickTunnel({ tunnel_id: 't1', bind_host: '127.0.0.1', bind_port: 1080 })
    expect(out.tunnelId).toBe('t1')
    expect(out.bindHost).toBe('127.0.0.1')
    expect(out.bindPort).toBe(1080)
  })

  it('pickChannel maps canonical local_host / remote_host', () => {
    const out = pickChannel({ local_host: '1.1.1.1', local_port: 12345, remote_host: '2.2.2.2' })
    expect(out.localHost).toBe('1.1.1.1')
    expect(out.localPort).toBe(12345)
    expect(out.remoteHost).toBe('2.2.2.2')
  })

  it('pickListener exposes config as-is (string or object)', () => {
    expect(pickListener({ config: '{"x":1}' }).config).toBe('{"x":1}')
    const configObj = { x: 1 }
    expect(pickListener({ config: configObj }).config).toBe(configObj)
  })

  it('pickTransfer maps canonical received_chunks to receivedChunks', () => {
    const out = pickTransfer({ received_chunks: 5, received_bytes: 1024 })
    expect(out.receivedChunks).toBe(5)
    expect(out.receivedBytes).toBe(1024)
  })

  it('pickCommandEvent maps canonical task_id to taskId', () => {
    const out = pickCommandEvent({ task_id: 'cmd-1', beacon_id: 'b1' })
    expect(out.taskId).toBe('cmd-1')
    expect(out.beaconId).toBe('b1')
  })

  it('pickFile reads only the canonical sha256 key', () => {
    expect(pickFile({ SHA256: 'abc' }).sha256).toBe('')
    expect(pickFile({ sha256: 'def' }).sha256).toBe('def')
  })

  it('pickScreenshot maps preview_url and download_url', () => {
    const out = pickScreenshot({ preview_url: '/p.png', download_url: '/d.bin' })
    expect(out.previewUrl).toBe('/p.png')
    expect(out.downloadUrl).toBe('/d.bin')
  })
})

describe('protocol adapter — empty-source safety', () => {
  it.each([
    ['pickBeacon', pickBeacon],
    ['pickTunnel', pickTunnel],
    ['pickChannel', pickChannel],
    ['pickListener', pickListener],
    ['pickTransfer', pickTransfer],
    ['pickCommandEvent', pickCommandEvent],
    ['pickFile', pickFile],
    ['pickScreenshot', pickScreenshot],
  ])('%s returns an object (not null) for null source', (name, fn) => {
    const out = fn(null)
    expect(out).toBeTypeOf('object')
    expect(out).not.toBeNull()
  })
})

// ─── fieldMap constant structure (direct assertions, not via adapter) ───────

describe('fieldMap constants — structural invariants', () => {
  const ALL_FIELD_MAPS: [string, Record<string, readonly string[]>][] = [
    ['BEACON_FIELDS', BEACON_FIELDS],
    ['TUNNEL_FIELDS', TUNNEL_FIELDS],
    ['CHANNEL_FIELDS', CHANNEL_FIELDS],
    ['LISTENER_FIELDS', LISTENER_FIELDS],
    ['TRANSFER_FIELDS', TRANSFER_FIELDS],
    ['COMMAND_EVENT_FIELDS', COMMAND_EVENT_FIELDS],
    ['FILE_FIELDS', FILE_FIELDS],
    ['SCREENSHOT_FIELDS', SCREENSHOT_FIELDS],
  ]

  it.each(ALL_FIELD_MAPS)('%s is a non-empty object', (_name, fm) => {
    expect(fm).toBeTypeOf('object')
    expect(Object.keys(fm).length).toBeGreaterThan(0)
  })

  it.each(ALL_FIELD_MAPS)('%s has every field value as a non-empty string array', (_name, fm) => {
    for (const [canonical, aliases] of Object.entries(fm)) {
      expect(Array.isArray(aliases), `${canonical} aliases must be an array`).toBe(true)
      expect(aliases.length, `${canonical} aliases must be non-empty`).toBeGreaterThan(0)
      for (const alias of aliases) {
        expect(typeof alias, `${canonical} alias must be string`).toBe('string')
        expect(alias.length, `${canonical} alias must be non-empty`).toBeGreaterThan(0)
      }
    }
  })

  it.each(ALL_FIELD_MAPS)('%s has unique alias entries per field (no dupes)', (_name, fm) => {
    for (const [canonical, aliases] of Object.entries(fm)) {
      const set = new Set(aliases)
      expect(set.size, `${canonical} aliases must be unique`).toBe(aliases.length)
    }
  })

  it.each(ALL_FIELD_MAPS)(
    '%s first alias of every field is a non-empty snake_case string',
    (_name, fm) => {
      for (const [canonical, aliases] of Object.entries(fm)) {
        const first = aliases[0]
        expect(first, `${canonical} first alias`).toMatch(/^[a-z][a-z0-9_]*$/)
      }
    },
  )
})

describe('fieldMap constants — key alias presence (canonical-only)', () => {
  it('BEACON_FIELDS.beaconId contains only the canonical snake_case key', () => {
    expect(BEACON_FIELDS.beaconId).toEqual(['beacon_id'])
  })

  it('TUNNEL_FIELDS.tunnelId contains only the canonical snake_case key', () => {
    expect(TUNNEL_FIELDS.tunnelId).toEqual(['tunnel_id'])
  })

  it('CHANNEL_FIELDS.channelId contains only the canonical snake_case key', () => {
    expect(CHANNEL_FIELDS.channelId).toEqual(['channel_id'])
  })

  it('TRANSFER_FIELDS.taskId and COMMAND_EVENT_FIELDS.taskId are canonical-only', () => {
    expect(TRANSFER_FIELDS.taskId).toEqual(['task_id'])
    expect(COMMAND_EVENT_FIELDS.taskId).toEqual(['task_id'])
  })

  it('TUNNEL_FIELDS.mode is canonical-only (no type alias)', () => {
    expect(TUNNEL_FIELDS.mode).toEqual(['mode'])
  })

  it('CHANNEL_FIELDS.localHost is canonical-only', () => {
    expect(CHANNEL_FIELDS.localHost).toEqual(['local_host'])
  })

  it('CHANNEL_FIELDS.remoteHost is canonical-only', () => {
    expect(CHANNEL_FIELDS.remoteHost).toEqual(['remote_host'])
  })

  it('TRANSFER_FIELDS.receivedChunks is canonical-only', () => {
    expect(TRANSFER_FIELDS.receivedChunks).toEqual(['received_chunks'])
  })

  it('FILE_FIELDS.sha256 is canonical-only (no mixed-case aliases)', () => {
    expect(FILE_FIELDS.sha256).toEqual(['sha256'])
  })

  it('SCREENSHOT_FIELDS previewUrl/downloadUrl are canonical-only', () => {
    expect(SCREENSHOT_FIELDS.previewUrl).toEqual(['preview_url'])
    expect(SCREENSHOT_FIELDS.downloadUrl).toEqual(['download_url'])
  })

  it('LISTENER_FIELDS covers id / name / protocol / bind_addr / bind_port / status', () => {
    for (const key of ['id', 'name', 'protocol', 'bindAddr', 'bindPort', 'status', 'listenerType', 'config']) {
      expect(LISTENER_FIELDS[key as keyof typeof LISTENER_FIELDS], `LISTENER_FIELDS.${key}`).toBeDefined()
    }
  })
})
