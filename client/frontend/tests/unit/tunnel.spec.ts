import { beforeAll, describe, it, expect } from 'vitest'
import zhCN from '../../src/locales/zh-CN.json'
import { i18n } from '../../src/i18n/index'
import { formatTunnelReasonKey } from '../../src/utils/tunnel'

beforeAll(() => {
  i18n.global.setLocaleMessage('zh-CN', zhCN)
  i18n.global.locale.value = 'zh-CN'
})

const zh = (key: string): string => i18n.global.t(key)

describe('tunnel.formatTunnelReasonKey — null / empty / whitespace', () => {
  it('returns null for null / undefined', () => {
    expect(formatTunnelReasonKey(null)).toBeNull()
    expect(formatTunnelReasonKey(undefined)).toBeNull()
  })

  it('returns null for empty / whitespace-only input', () => {
    expect(formatTunnelReasonKey('')).toBeNull()
    expect(formatTunnelReasonKey('   ')).toBeNull()
    expect(formatTunnelReasonKey('\t\n')).toBeNull()
  })

  it('trims surrounding whitespace before lookup', () => {
    expect(formatTunnelReasonKey('  error_3  ')).toBe('tunnelReason.error3')
  })
})

describe('tunnel.formatTunnelReasonKey — error_<N> codes', () => {
  it.each([
    ['error_1', 'tunnelReason.error1', '未知错误'],
    ['error_3', 'tunnelReason.error3', 'Beacon 侧网络不可达'],
    ['error_4', 'tunnelReason.error4', 'Beacon 连接目标超时'],
    ['error_5', 'tunnelReason.error5', 'Beacon 侧目标端口拒绝连接'],
    ['error_6', 'tunnelReason.error6', 'Beacon 侧 DNS 解析失败'],
    ['error_15', 'tunnelReason.error15', 'Beacon 侧连接被中止'],
  ])('maps %s to key %s (zh: %s)', (code, key, label) => {
    expect(formatTunnelReasonKey(code)).toBe(key)
    expect(zh(key)).toBe(label)
  })

  it('normalizes bare numeric reason to error_<N>', () => {
    expect(formatTunnelReasonKey(3)).toBe('tunnelReason.error3')
    expect(formatTunnelReasonKey('5')).toBe('tunnelReason.error5')
  })

  it('returns null for unknown error_<N> codes', () => {
    expect(formatTunnelReasonKey('error_99')).toBeNull()
    expect(formatTunnelReasonKey(99)).toBeNull()
  })
})

describe('tunnel.formatTunnelReasonKey — text reasons', () => {
  it.each([
    ['connection refused', 'tunnelReason.connectionRefused', 'Beacon 侧目标端口拒绝连接'],
    ['network unreachable', 'tunnelReason.networkUnreachable', 'Beacon 侧网络不可达'],
    ['dns failed', 'tunnelReason.dnsFailed', 'Beacon 侧 DNS 解析失败'],
    ['connection reset', 'tunnelReason.connectionReset', 'Beacon 侧连接被重置'],
    ['write failed', 'tunnelReason.writeFailed', 'Beacon 侧写入失败'],
    ['connection aborted', 'tunnelReason.connectionAborted', 'Beacon 侧连接被中止'],
    ['duplicate channel', 'tunnelReason.duplicateChannel', 'Beacon 侧通道重复'],
    ['unsupported protocol', 'tunnelReason.unsupportedProtocol', 'Beacon 不支持的协议'],
    ['unsupported proto', 'tunnelReason.unsupportedProtocol', 'Beacon 不支持的协议'],
    ['tunnel paused', 'tunnelReason.tunnelPaused', 'Tunnel 已暂停'],
    ['tunnel cleared', 'tunnelReason.tunnelCleared', 'Tunnel 已清除'],
    ['local connection closed', 'tunnelReason.localConnectionClosed', '本地连接已关闭'],
    ['remote connection closed', 'tunnelReason.remoteConnectionClosed', '远端连接已关闭'],
  ])('maps %s to key %s (zh: %s)', (raw, key, label) => {
    expect(formatTunnelReasonKey(raw)).toBe(key)
    expect(zh(key)).toBe(label)
  })

  it('is case-insensitive', () => {
    expect(formatTunnelReasonKey('CONNECTION REFUSED')).toBe('tunnelReason.connectionRefused')
    expect(formatTunnelReasonKey('Connection Refused')).toBe('tunnelReason.connectionRefused')
  })

  it('collapses internal whitespace before lookup', () => {
    // 'connection  refused' (double space) → normalized to 'connection refused'
    expect(formatTunnelReasonKey('connection  refused')).toBe('tunnelReason.connectionRefused')
    expect(formatTunnelReasonKey('connection\trefused')).toBe('tunnelReason.connectionRefused')
  })

  it('returns null for unknown text reasons', () => {
    expect(formatTunnelReasonKey('some weird reason')).toBeNull()
    expect(formatTunnelReasonKey('  WeirdReason  ')).toBeNull()
  })
})

describe('tunnel.formatTunnelReasonKey — edge cases', () => {
  it('stringifies non-string reason input before lookup', () => {
    // A number is stringified and matched against error_<N> path.
    expect(formatTunnelReasonKey(3)).toBe('tunnelReason.error3')
  })

  it('returns null for numeric-looking non-integer strings', () => {
    // '3.5' is not a pure integer — no key mapping.
    expect(formatTunnelReasonKey('3.5')).toBeNull()
  })
})
