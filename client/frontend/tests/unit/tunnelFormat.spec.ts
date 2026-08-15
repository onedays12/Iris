import { describe, it, expect } from 'vitest'
import {
  shortId,
  formatBind,
  formatTarget,
  formatTunnelType,
  statusClass,
  statusLabel,
  isRunningTunnel,
  isPausedTunnel,
  requiresRemoteTarget,
  getModeDefaults,
  formatBytes,
  formatCount,
  displayCount,
  formatLatency,
  formatTime,
} from '../../src/utils/tunnelFormat'

describe('tunnelFormat.shortId', () => {
  it('returns dash for falsy input', () => {
    expect(shortId('')).toBe('-')
    expect(shortId(null)).toBe('-')
    expect(shortId(undefined)).toBe('-')
  })

  it('truncates to 8 chars', () => {
    expect(shortId('abcdefghijk')).toBe('abcdefgh')
  })

  it('returns full value when shorter than 8', () => {
    expect(shortId('abc')).toBe('abc')
  })
})

describe('tunnelFormat.formatBind', () => {
  it('joins host and port', () => {
    expect(formatBind({ bindHost: '127.0.0.1', bindPort: 1080 })).toBe('127.0.0.1:1080')
  })

  it('falls back to 127.0.0.1 when host missing', () => {
    expect(formatBind({ bindPort: 1080 })).toBe('127.0.0.1:1080')
  })

  it('falls back to dash when port missing', () => {
    expect(formatBind({ bindHost: '0.0.0.0' })).toBe('0.0.0.0:-')
  })
})

describe('tunnelFormat.formatTarget', () => {
  it('returns dash when mode does not require remote target', () => {
    expect(formatTarget({ mode: 'socks5', remoteHost: '1.1.1.1', remotePort: 80 })).toBe('-')
  })

  it('formats host:port for port_forward', () => {
    expect(formatTarget({ mode: 'port_forward', remoteHost: '10.0.0.1', remotePort: 3389 })).toBe('10.0.0.1:3389')
  })

  it('returns dash for port_forward when no remote set', () => {
    expect(formatTarget({ mode: 'port_forward' })).toBe('-')
  })
})

describe('tunnelFormat.formatTunnelType', () => {
  it('normalizes known modes to human labels', () => {
    expect(formatTunnelType('socks5')).toBe('SOCKS5')
    expect(formatTunnelType('port_forward')).toBe('PORT FWD')
    expect(formatTunnelType('reverse_port_map')).toBe('REVERSE MAP')
    expect(formatTunnelType('http_proxy')).toBe('HTTP PROXY')
    expect(formatTunnelType('udp_proxy')).toBe('UDP PROXY')
  })

  it('case-insensitive and falls back to input', () => {
    expect(formatTunnelType('SOCKS5')).toBe('SOCKS5')
    expect(formatTunnelType('weird')).toBe('weird')
    expect(formatTunnelType('')).toBe('-')
  })
})

describe('tunnelFormat.statusClass / statusLabel', () => {
  it.each([
    ['running', 'online', '运行中'],
    ['listening', 'online', '运行中'],
    ['active', 'online', '运行中'],
    ['paused', 'warn', '已暂停'],
    ['pending', 'warn', '待处理'],
    ['timeout', 'warn', '已超时'],
    ['closed', 'warn', '已关闭'],
    ['stopped', 'warn', '已停止'],
    ['error', 'danger', '异常'],
    ['failed', 'danger', '异常'],
  ])('maps %s to class=%s label=%s', (status, expectedClass, expectedLabel) => {
    expect(statusClass(status)).toBe(expectedClass)
    expect(statusLabel(status)).toBe(expectedLabel)
  })

  it('falls back to "active" class for unknown status', () => {
    expect(statusClass('weird')).toBe('active')
  })

  it('falls back to value-as-label for unknown status', () => {
    expect(statusLabel('weird')).toBe('weird')
    expect(statusLabel('')).toBe('-')
  })
})

describe('tunnelFormat.isRunningTunnel / isPausedTunnel', () => {
  it('detects running state', () => {
    expect(isRunningTunnel({ status: 'running' })).toBe(true)
    expect(isRunningTunnel({ status: 'RUNNING' })).toBe(true)
    expect(isRunningTunnel({ status: 'stopped' })).toBe(false)
    expect(isRunningTunnel({})).toBe(false)
    expect(isRunningTunnel(null)).toBe(false)
  })

  it('detects paused state', () => {
    expect(isPausedTunnel({ status: 'paused' })).toBe(true)
    expect(isPausedTunnel({ status: 'PAUSE' })).toBe(true)
    expect(isPausedTunnel({ status: 'running' })).toBe(false)
  })
})

describe('tunnelFormat.requiresRemoteTarget / getModeDefaults', () => {
  it('only port_forward and reverse_port_map need remote target', () => {
    expect(requiresRemoteTarget('port_forward')).toBe(true)
    expect(requiresRemoteTarget('reverse_port_map')).toBe(true)
    expect(requiresRemoteTarget('socks5')).toBe(false)
    expect(requiresRemoteTarget('http_proxy')).toBe(false)
    expect(requiresRemoteTarget('')).toBe(false)
  })

  it('returns sensible defaults per mode', () => {
    const pf = getModeDefaults('port_forward')
    expect(pf.bindPort).toBe(8888)
    expect(pf.remotePort).toBe(3389)

    const rev = getModeDefaults('reverse_port_map')
    expect(rev.bindPort).toBe(13389)

    const unknown = getModeDefaults('something')
    expect(unknown.bindHost).toBe('127.0.0.1')
    expect(unknown.bindPort).toBe(1080)
  })
})

describe('tunnelFormat.formatBytes', () => {
  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
  })

  it('formats KB / MB / GB boundaries', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(1048576)).toBe('1.00 MB')
    expect(formatBytes(1073741824)).toBe('1.00 GB')
  })
})

describe('tunnelFormat.formatCount / displayCount / formatLatency', () => {
  it('formatCount returns dash for non-finite, truncates negatives to 0', () => {
    expect(formatCount('abc')).toBe('-')
    expect(formatCount(NaN)).toBe('-')
    expect(formatCount(undefined)).toBe('-') // Number(undefined) = NaN
    expect(formatCount(-5)).toBe('0')
    expect(formatCount(42.7)).toBe('42')
  })

  it('formatCount coerces null to 0 (Number(null) === 0)', () => {
    // Document the JS coercion quirk: Number(null) returns 0, not NaN.
    expect(formatCount(null)).toBe('0')
  })

  it('displayCount returns first finite value', () => {
    expect(displayCount(undefined, 0, 5)).toBe('0')
    // null coerces to 0 — it's "finite" — so it wins over the later 5.
    expect(displayCount(undefined, null, 5)).toBe('0')
    expect(displayCount(undefined, 'abc', 7)).toBe('7')
    expect(displayCount(undefined, undefined, undefined)).toBe('-')
  })

  it('formatLatency returns dash for non-positive or non-finite', () => {
    expect(formatLatency(0)).toBe('-')
    expect(formatLatency(-1)).toBe('-')
    expect(formatLatency('abc')).toBe('-')
    expect(formatLatency(150)).toBe('150 ms')
  })
})

describe('tunnelFormat.formatTime', () => {
  it('returns dash for falsy input', () => {
    expect(formatTime('')).toBe('-')
    expect(formatTime(0)).toBe('-')
    expect(formatTime(null)).toBe('-')
  })

  it('treats numeric <1e12 as seconds and multiplies by 1000', () => {
    // 1700000000 (unix seconds) → 1700000000000 ms
    const out = formatTime(1700000000)
    expect(out).toMatch(/2023/)
  })

  it('treats numeric >=1e12 as milliseconds', () => {
    const out = formatTime(1700000000000)
    expect(out).toMatch(/2023/)
  })
})
