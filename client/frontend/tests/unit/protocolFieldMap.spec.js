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
} from '../../src/shared/protocol/adapter.js'
import {
  BEACON_FIELDS,
  TUNNEL_FIELDS,
  CHANNEL_FIELDS,
  LISTENER_FIELDS,
  TRANSFER_FIELDS,
  COMMAND_EVENT_FIELDS,
  FILE_FIELDS,
  SCREENSHOT_FIELDS,
} from '../../src/shared/protocol/fieldMap.js'

describe('protocol adapter.pickBeaconId', () => {
  it('prefers snake_case beacon_id', () => {
    expect(pickBeaconId({ beacon_id: 'abc-123' })).toBe('abc-123')
  })

  it('falls back through camelCase / PascalCase aliases', () => {
    expect(pickBeaconId({ beaconId: 'b1' })).toBe('b1')
    expect(pickBeaconId({ BeaconID: 'b2' })).toBe('b2')
    expect(pickBeaconId({ BeaconId: 'b3' })).toBe('b3')
  })

  it('falls back to generic id/uuid aliases', () => {
    expect(pickBeaconId({ id: 'gen-1' })).toBe('gen-1')
    expect(pickBeaconId({ uuid: 'u-1' })).toBe('u-1')
    expect(pickBeaconId({ UUID: 'U-2' })).toBe('U-2')
  })

  it('prefers the first non-empty alias when multiple are present', () => {
    // beacon_id is listed before id; even though id is also present, beacon_id wins.
    expect(pickBeaconId({ beacon_id: 'first', id: 'second' })).toBe('first')
  })

  it('returns empty string when no alias matches', () => {
    expect(pickBeaconId({})).toBe('')
    expect(pickBeaconId(null)).toBe('')
    expect(pickBeaconId(undefined)).toBe('')
  })

  it('returns empty string when the matched value is itself empty', () => {
    // pick() treats '' as missing; next alias should be tried.
    expect(pickBeaconId({ beacon_id: '', id: 'fallback' })).toBe('fallback')
    expect(pickBeaconId({ beacon_id: '', id: '' })).toBe('')
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
    // Verify a few fields to ensure shape is consistent
    expect(Object.keys(out).length).toBeGreaterThan(20)
  })

  it('preserves boolean / numeric values that come through pick()', () => {
    // pick() returns the raw value; coercion to string is the caller's job.
    const out = pickBeacon({ is_admin: false, pid: 999, sleep: 5000 })
    expect(out.isAdmin).toBe(false)
    expect(out.pid).toBe(999)
    expect(out.sleep).toBe(5000)
  })
})

describe('protocol adapter entity shapes', () => {
  it('pickTunnel maps id alias to tunnelId', () => {
    const out = pickTunnel({ id: 't1', bind_host: '127.0.0.1', bind_port: 1080 })
    expect(out.tunnelId).toBe('t1')
    expect(out.bindHost).toBe('127.0.0.1')
    expect(out.bindPort).toBe(1080)
  })

  it('pickChannel maps src_addr to localHost alias chain', () => {
    const out = pickChannel({ src_addr: '1.1.1.1', src_port: 12345, dst_addr: '2.2.2.2' })
    expect(out.localHost).toBe('1.1.1.1')
    expect(out.localPort).toBe(12345)
    expect(out.remoteHost).toBe('2.2.2.2')
  })

  it('pickListener exposes config as-is (string or object)', () => {
    expect(pickListener({ config: '{"x":1}' }).config).toBe('{"x":1}')
    const configObj = { x: 1 }
    expect(pickListener({ config: configObj }).config).toBe(configObj)
  })

  it('pickTransfer maps acked_chunks alias chain to receivedChunks', () => {
    const out = pickTransfer({ acked_chunks: 5, acked_bytes: 1024 })
    expect(out.receivedChunks).toBe(5)
    expect(out.receivedBytes).toBe(1024)
  })

  it('pickCommandEvent maps command_id alias to taskId', () => {
    // COMMAND_EVENT_FIELDS.taskId includes command_id / commandId aliases
    const out = pickCommandEvent({ command_id: 'cmd-1', beacon_id: 'b1' })
    expect(out.taskId).toBe('cmd-1')
    expect(out.beaconId).toBe('b1')
  })

  it('pickFile maps sha256 case-insensitive aliases', () => {
    expect(pickFile({ SHA256: 'abc' }).sha256).toBe('abc')
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
  const ALL_FIELD_MAPS = [
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
        // First alias should be the canonical snake_case name matching TeamServer contract.
        // Allowed chars: lowercase letters, digits, underscores.
        expect(first, `${canonical} first alias`).toMatch(/^[a-z][a-z0-9_]*$/)
      }
    },
  )
})

describe('fieldMap constants — key alias presence', () => {
  it('BEACON_FIELDS.beaconId contains the canonical snake_case + camelCase + PascalCase aliases', () => {
    expect(BEACON_FIELDS.beaconId).toContain('beacon_id')
    expect(BEACON_FIELDS.beaconId).toContain('beaconId')
    expect(BEACON_FIELDS.beaconId).toContain('id')
  })

  it('TUNNEL_FIELDS.tunnelId contains tunnel_id + camelCase + generic id aliases', () => {
    expect(TUNNEL_FIELDS.tunnelId).toContain('tunnel_id')
    expect(TUNNEL_FIELDS.tunnelId).toContain('tunnelId')
    expect(TUNNEL_FIELDS.tunnelId).toContain('id')
  })

  it('CHANNEL_FIELDS.channelId contains channel_id + generic id aliases', () => {
    expect(CHANNEL_FIELDS.channelId).toContain('channel_id')
    expect(CHANNEL_FIELDS.channelId).toContain('id')
  })

  it('TRANSFER_FIELDS.taskId contains task_id + command_id aliases (COMMAND_EVENT reuses for cmdId)', () => {
    // Note: TRANSFER_FIELDS.taskId and COMMAND_EVENT_FIELDS.taskId have different
    // alias chains — only the latter includes command_id. Verify both.
    expect(TRANSFER_FIELDS.taskId).toContain('task_id')
    expect(TRANSFER_FIELDS.taskId).not.toContain('command_id')
    expect(COMMAND_EVENT_FIELDS.taskId).toContain('command_id')
    expect(COMMAND_EVENT_FIELDS.taskId).toContain('task_id')
  })

  it('TUNNEL_FIELDS.mode includes type alias (mode and type are interchangeable)', () => {
    expect(TUNNEL_FIELDS.mode).toContain('mode')
    expect(TUNNEL_FIELDS.mode).toContain('type')
  })

  it('CHANNEL_FIELDS.localHost includes src_addr + client_addr aliases (SOCKS proxy source)', () => {
    expect(CHANNEL_FIELDS.localHost).toContain('local_host')
    expect(CHANNEL_FIELDS.localHost).toContain('src_addr')
    expect(CHANNEL_FIELDS.localHost).toContain('client_addr')
  })

  it('CHANNEL_FIELDS.remoteHost includes dst_addr + target_host aliases', () => {
    expect(CHANNEL_FIELDS.remoteHost).toContain('remote_host')
    expect(CHANNEL_FIELDS.remoteHost).toContain('dst_addr')
    expect(CHANNEL_FIELDS.remoteHost).toContain('target_host')
  })

  it('TRANSFER_FIELDS.receivedChunks includes acked_chunks alias chain', () => {
    expect(TRANSFER_FIELDS.receivedChunks).toContain('received_chunks')
    expect(TRANSFER_FIELDS.receivedChunks).toContain('acked_chunks')
  })

  it('FILE_FIELDS.sha256 supports mixed-case aliases (sha256 / Sha256 / SHA256)', () => {
    expect(FILE_FIELDS.sha256).toContain('sha256')
    expect(FILE_FIELDS.sha256).toContain('SHA256')
  })

  it('SCREENSHOT_FIELDS includes both preview_url and download_url aliases', () => {
    expect(SCREENSHOT_FIELDS.previewUrl).toContain('preview_url')
    expect(SCREENSHOT_FIELDS.downloadUrl).toContain('download_url')
  })

  it('LISTENER_FIELDS covers id / name / protocol / bind_addr / bind_port / status', () => {
    for (const key of ['id', 'name', 'protocol', 'bindAddr', 'bindPort', 'status', 'listenerType', 'config']) {
      expect(LISTENER_FIELDS[key], `LISTENER_FIELDS.${key}`).toBeDefined()
    }
  })
})
