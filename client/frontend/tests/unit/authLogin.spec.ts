import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../src/stores/auth'
import { operatorNameErrorKey } from '../../src/features/auth/api/authApi'
import {
  RECONNECT_GRACE_MS,
  REAUTH_GRACE_RETRY_PAD_MS,
  graceReauthDelayMs,
  isUnauthorizedHandshake,
} from '../../src/stores/ws'

// 斩断 ws → wsEventRouter → commandEventHandler → downloadSave 的传递链:
// 其子路径动态导入 bindings/fileservice 需要 Wails 运行态,本 spec 不触达其行为。
vi.mock('../../src/features/events/downloadSave', () => ({
  saveCompletedDownload: vi.fn().mockResolvedValue(true),
}))

describe('remember login', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('persists credentials only when rememberLogin is called', () => {
    const store = useAuthStore()
    expect(store.loadRememberedLogin()).toBeNull()
    store.rememberLogin('alice', 'secret')
    expect(store.loadRememberedLogin()).toEqual({ username: 'alice', password: 'secret' })
    store.forgetLogin()
    expect(store.loadRememberedLogin()).toBeNull()
  })
})

describe('operatorNameErrorKey (CS 统一密码模型的操作员名契约)', () => {
  it('空白与空串要求输入', () => {
    expect(operatorNameErrorKey('')).toBe('login.nameRequired')
    expect(operatorNameErrorKey('   ')).toBe('login.nameRequired')
  })

  it('去首尾空白后合法', () => {
    expect(operatorNameErrorKey('  operator  ')).toBeNull()
  })

  it('32 字节为上界(UTF-8 字节而非字符数)', () => {
    expect(operatorNameErrorKey('a'.repeat(32))).toBeNull()
    expect(operatorNameErrorKey('a'.repeat(33))).toBe('login.nameTooLong')
    // 中文每字 3 字节:10 字=30B 合法,11 字=33B 超限
    expect(operatorNameErrorKey('操作员名一二三四五六')).toBeNull()
    expect(operatorNameErrorKey('操作员名一二三四五六七')).toBe('login.nameTooLong')
  })

  it('拒绝控制字符', () => {
    expect(operatorNameErrorKey('op\x01name')).toBe('login.nameControlChars')
    expect(operatorNameErrorKey('op\u007F')).toBe('login.nameControlChars')
  })
})

describe('graceReauthDelayMs (静默重登撞 409 后的宽限等待)', () => {
  it('无断连时间戳立即重试', () => {
    expect(graceReauthDelayMs(0, 1000)).toBe(0)
  })

  it('宽限期内等待剩余时间 + 缓冲', () => {
    const at = 100_000
    const elapsed = 10_000
    expect(graceReauthDelayMs(at, at + elapsed)).toBe(
      RECONNECT_GRACE_MS - elapsed + REAUTH_GRACE_RETRY_PAD_MS,
    )
  })

  it('宽限已过只等缓冲垫', () => {
    const at = 100_000
    expect(graceReauthDelayMs(at, at + RECONNECT_GRACE_MS + 60_000)).toBe(REAUTH_GRACE_RETRY_PAD_MS)
  })
})

describe('isUnauthorizedHandshake', () => {
  it('detects 401 handshake failures', () => {
    expect(isUnauthorizedHandshake('websocket dial failed: bad handshake (status 401)')).toBe(true)
    expect(isUnauthorizedHandshake(new Error('session is no longer active'))).toBe(true)
    expect(isUnauthorizedHandshake('websocket: close 1006')).toBe(false)
  })
})
