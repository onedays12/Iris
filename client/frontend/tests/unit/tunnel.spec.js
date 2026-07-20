import { describe, it, expect } from 'vitest'
import { formatTunnelReason } from '../../src/utils/tunnel.js'

describe('tunnel.formatTunnelReason — null / empty / whitespace', () => {
  it('returns empty string for null / undefined', () => {
    expect(formatTunnelReason(null)).toBe('')
    expect(formatTunnelReason(undefined)).toBe('')
  })

  it('returns empty string for empty / whitespace-only input', () => {
    expect(formatTunnelReason('')).toBe('')
    expect(formatTunnelReason('   ')).toBe('')
    expect(formatTunnelReason('\t\n')).toBe('')
  })

  it('trims surrounding whitespace before lookup', () => {
    expect(formatTunnelReason('  error_3  ')).toBe('Beacon 侧网络不可达')
  })
})

describe('tunnel.formatTunnelReason — error_<N> codes', () => {
  it.each([
    ['error_1', '未知错误'],
    ['error_3', 'Beacon 侧网络不可达'],
    ['error_4', 'Beacon 连接目标超时'],
    ['error_5', 'Beacon 侧目标端口拒绝连接'],
    ['error_6', 'Beacon 侧 DNS 解析失败'],
    ['error_15', 'Beacon 侧连接被中止'],
  ])('maps %s to Chinese label', (code, label) => {
    expect(formatTunnelReason(code)).toBe(label)
  })

  it('normalizes bare numeric reason to error_<N>', () => {
    expect(formatTunnelReason(3)).toBe('Beacon 侧网络不可达')
    expect(formatTunnelReason('5')).toBe('Beacon 侧目标端口拒绝连接')
  })

  it('falls back to raw text for unknown error_<N> codes', () => {
    expect(formatTunnelReason('error_99')).toBe('error_99')
    expect(formatTunnelReason(99)).toBe('99')
  })
})

describe('tunnel.formatTunnelReason — text reasons', () => {
  it.each([
    ['connection refused', 'Beacon 侧目标端口拒绝连接'],
    ['network unreachable', 'Beacon 侧网络不可达'],
    ['dns failed', 'Beacon 侧 DNS 解析失败'],
    ['connection reset', 'Beacon 侧连接被重置'],
    ['write failed', 'Beacon 侧写入失败'],
    ['connection aborted', 'Beacon 侧连接被中止'],
    ['duplicate channel', 'Beacon 侧通道重复'],
    ['unsupported protocol', 'Beacon 不支持的协议'],
    ['unsupported proto', 'Beacon 不支持的协议'],
    ['tunnel paused', 'Tunnel 已暂停'],
    ['tunnel cleared', 'Tunnel 已清除'],
    ['local connection closed', '本地连接已关闭'],
    ['remote connection closed', '远端连接已关闭'],
  ])('maps %s to %s', (raw, expected) => {
    expect(formatTunnelReason(raw)).toBe(expected)
  })

  it('is case-insensitive', () => {
    expect(formatTunnelReason('CONNECTION REFUSED')).toBe('Beacon 侧目标端口拒绝连接')
    expect(formatTunnelReason('Connection Refused')).toBe('Beacon 侧目标端口拒绝连接')
  })

  it('collapses internal whitespace before lookup', () => {
    // 'connection  refused' (double space) → normalized to 'connection refused'
    expect(formatTunnelReason('connection  refused')).toBe('Beacon 侧目标端口拒绝连接')
    expect(formatTunnelReason('connection\trefused')).toBe('Beacon 侧目标端口拒绝连接')
  })

  it('falls back to the trimmed raw text for unknown text reasons', () => {
    expect(formatTunnelReason('some weird reason')).toBe('some weird reason')
    // Unknown text is NOT lowercased in the return value — trimmed original returned.
    expect(formatTunnelReason('  WeirdReason  ')).toBe('WeirdReason')
  })
})

describe('tunnel.formatTunnelReason — edge cases', () => {
  it('stringifies non-string reason input before lookup', () => {
    // A number is stringified and matched against error_<N> path.
    expect(formatTunnelReason(3)).toBe('Beacon 侧网络不可达')
  })

  it('handles numeric-looking non-integer strings as text', () => {
    // '3.5' is not a pure integer — falls through to raw text return.
    expect(formatTunnelReason('3.5')).toBe('3.5')
  })
})
