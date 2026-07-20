import { describe, it, expect, vi } from 'vitest'
import {
  parseListenerConfig,
  splitHostPort,
  hostHasPort,
  validateHostOnly,
  parsePort,
  inferProfile,
  generateEncryptKey,
} from '../../src/utils/listenerForm.js'

describe('listenerForm.parseListenerConfig', () => {
  it('returns empty object for null/undefined/non-object/string-non-JSON/array', () => {
    expect(parseListenerConfig(null)).toEqual({})
    expect(parseListenerConfig(undefined)).toEqual({})
    expect(parseListenerConfig('not json')).toEqual({})
    expect(parseListenerConfig([1, 2, 3])).toEqual({})
    expect(parseListenerConfig('')).toEqual({})
  })

  it('parses JSON string', () => {
    expect(parseListenerConfig('{"a":1}')).toEqual({ a: 1 })
  })

  it('returns object as-is', () => {
    const obj = { bind_host: '0.0.0.0', bind_port: 4444 }
    expect(parseListenerConfig(obj)).toBe(obj)
  })
})

describe('listenerForm.splitHostPort', () => {
  it('returns empty host + fallback port for falsy', () => {
    expect(splitHostPort('', 4444)).toEqual({ host: '', port: 4444 })
    expect(splitHostPort(null, 4444)).toEqual({ host: '', port: 4444 })
  })

  it('parses plain host:port', () => {
    expect(splitHostPort('1.2.3.4:80', 4444)).toEqual({ host: '1.2.3.4', port: 80 })
  })

  it('parses IPv6 bracket form', () => {
    expect(splitHostPort('[::1]:8080', 4444)).toEqual({ host: '::1', port: 8080 })
  })

  it('returns full string as host when no port suffix', () => {
    expect(splitHostPort('example.com', 4444)).toEqual({ host: 'example.com', port: 4444 })
  })

  it('does NOT misparse IPv6 without brackets', () => {
    // ::1 has multiple colons — lastColon !== firstColon, so falls back to host-only
    expect(splitHostPort('::1', 4444)).toEqual({ host: '::1', port: 4444 })
  })

  it('does NOT misparse host containing colon (e.g. ipv6 + port not in brackets)', () => {
    // fe80::1 is an ipv6 address without port — should be treated as host-only
    expect(splitHostPort('fe80::1', 4444)).toEqual({ host: 'fe80::1', port: 4444 })
  })
})

describe('listenerForm.hostHasPort', () => {
  it('detects plain host:port', () => {
    expect(hostHasPort('1.2.3.4:80')).toBe(true)
  })

  it('detects bracket IPv6 form', () => {
    expect(hostHasPort('[::1]:8080')).toBe(true)
  })

  it('returns false for host without port', () => {
    expect(hostHasPort('example.com')).toBe(false)
    expect(hostHasPort('::1')).toBe(false)
    expect(hostHasPort('')).toBe(false)
  })
})

describe('listenerForm.validateHostOnly', () => {
  it('returns host when valid', () => {
    const onError = vi.fn()
    expect(validateHostOnly('1.2.3.4', 'Bind', onError)).toBe('1.2.3.4')
    expect(onError).not.toHaveBeenCalled()
  })

  it('trims whitespace', () => {
    const onError = vi.fn()
    expect(validateHostOnly('  1.2.3.4  ', 'Bind', onError)).toBe('1.2.3.4')
  })

  it('errors on empty', () => {
    const onError = vi.fn()
    expect(validateHostOnly('', 'Bind', onError)).toBe('')
    expect(onError).toHaveBeenCalledWith('Bind不能为空')
  })

  it('errors on host with protocol', () => {
    const onError = vi.fn()
    expect(validateHostOnly('http://1.2.3.4', 'Bind', onError)).toBe('')
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('不能包含协议'))
  })

  it('errors on host with port suffix', () => {
    const onError = vi.fn()
    expect(validateHostOnly('1.2.3.4:80', 'Bind', onError)).toBe('')
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('不能包含协议'))
  })

  it('errors on 0.0.0.0 when allowUnspecified=false', () => {
    const onError = vi.fn()
    expect(validateHostOnly('0.0.0.0', 'Callback', onError, { allowUnspecified: false })).toBe('')
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('0.0.0.0'))
  })

  it('allows 0.0.0.0 by default (allowUnspecified=true)', () => {
    const onError = vi.fn()
    expect(validateHostOnly('0.0.0.0', 'Bind', onError)).toBe('0.0.0.0')
    expect(onError).not.toHaveBeenCalled()
  })

  it('errors on :: when allowUnspecified=false', () => {
    const onError = vi.fn()
    expect(validateHostOnly('::', 'Callback', onError, { allowUnspecified: false })).toBe('')
  })
})

describe('listenerForm.parsePort', () => {
  it('returns numeric port when valid', () => {
    const onError = vi.fn()
    expect(parsePort('4444', 'Port', onError)).toBe(4444)
    expect(parsePort(8080, 'Port', onError)).toBe(8080)
    expect(onError).not.toHaveBeenCalled()
  })

  it('errors on NaN', () => {
    const onError = vi.fn()
    expect(parsePort('abc', 'Port', onError)).toBeNull()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('1-65535'))
  })

  it('errors on 0', () => {
    expect(parsePort('0', 'Port', vi.fn())).toBeNull()
  })

  it('errors on 65536', () => {
    expect(parsePort('65536', 'Port', vi.fn())).toBeNull()
  })

  it('accepts 1 and 65535 boundaries', () => {
    expect(parsePort('1', 'Port', vi.fn())).toBe(1)
    expect(parsePort('65535', 'Port', vi.fn())).toBe(65535)
  })
})

describe('listenerForm.inferProfile', () => {
  it('returns explicit profile if present', () => {
    expect(inferProfile({ profile: 'http-stager' })).toBe('http-stager')
    expect(inferProfile({ profile: '  http-stager  ' })).toBe('http-stager')
  })

  it('returns http-stager when stager object is populated', () => {
    expect(inferProfile({ stager: { bind_host: '0.0.0.0' } })).toBe('http-stager')
  })

  it('returns http-default when no profile and empty stager', () => {
    expect(inferProfile({})).toBe('http-default')
    expect(inferProfile({ stager: {} })).toBe('http-default')
  })
})

describe('listenerForm.generateEncryptKey', () => {
  it('returns a 32-char hex string (16 bytes)', () => {
    const key = generateEncryptKey()
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('returns different keys across calls (statistical)', () => {
    const a = generateEncryptKey()
    const b = generateEncryptKey()
    expect(a).not.toBe(b)
  })
})
