import { describe, it, expect } from 'vitest'

describe('vitest infrastructure smoke test', () => {
  it('asserts basic equality', () => {
    expect(1 + 1).toBe(2)
  })

  it('has jsdom globals available', () => {
    expect(window).toBeDefined()
    expect(document).toBeDefined()
  })

  it('has matchMedia polyfilled', () => {
    expect(typeof window.matchMedia).toBe('function')
    const mql = window.matchMedia('(min-width: 1px)')
    expect(mql).toBeDefined()
  })

  it('has crypto.getRandomValues available', () => {
    const bytes = new Uint8Array(4)
    globalThis.crypto.getRandomValues(bytes)
    expect(bytes.every((b) => b >= 0 && b < 256)).toBe(true)
  })
})
