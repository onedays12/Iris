import { describe, it, expect, beforeEach, vi } from 'vitest'
import { bus } from '../../src/shared/bus'

// bus is a module-level singleton; isolate each test by clearing before each.
beforeEach(() => {
  bus.clear()
})

describe('bus.on / emit — basic subscribe and dispatch', () => {
  it('delivers payload to a single subscriber synchronously', () => {
    const received: unknown[] = []
    bus.on('test:event', (p) => received.push(p))
    bus.emit('test:event', { value: 1 })
    expect(received).toEqual([{ value: 1 }])
  })

  it('delivers to multiple subscribers in registration order', () => {
    const order: string[] = []
    bus.on('e', () => order.push('first'))
    bus.on('e', () => order.push('second'))
    bus.on('e', () => order.push('third'))
    bus.emit('e', null)
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('delivers any payload type (string, number, null, undefined, object)', () => {
    let received: unknown
    bus.on('p', (x) => { received = x })
    bus.emit('p', 'hello')
    expect(received).toBe('hello')
    bus.emit('p', 42)
    expect(received).toBe(42)
    bus.emit('p', null)
    expect(received).toBeNull()
    bus.emit('p', undefined)
    expect(received).toBeUndefined()
  })

  it('emit to an event with no subscribers is a silent no-op', () => {
    expect(() => bus.emit('nobody:listening', { x: 1 })).not.toThrow()
  })
})

describe('bus.on — unsubscribe', () => {
  it('returns an unsubscribe function', () => {
    const off = bus.on('e', () => {})
    expect(typeof off).toBe('function')
  })

  it('unsubscribe stops future deliveries to that handler', () => {
    const received: unknown[] = []
    const off = bus.on('e', (p) => received.push(p))
    bus.emit('e', 'first')
    off()
    bus.emit('e', 'second')
    expect(received).toEqual(['first'])
  })

  it('unsubscribe only removes the matching handler, not siblings', () => {
    const received: string[] = []
    const h1 = (p: unknown) => received.push('h1:' + String(p))
    const h2 = (p: unknown) => received.push('h2:' + String(p))
    bus.on('e', h1)
    bus.on('e', h2)
    bus.off('e', h1)
    bus.emit('e', 'x')
    expect(received).toEqual(['h2:x'])
  })

  it('off for an unknown event is a silent no-op', () => {
    expect(() => bus.off('never:subscribed', () => {})).not.toThrow()
  })

  it('off for an unknown handler is a silent no-op', () => {
    bus.on('e', () => {})
    expect(() => bus.off('e', () => {})).not.toThrow()
  })

  it('removing the last handler cleans up the event key', () => {
    const off = bus.on('lone:event', () => {})
    off()
    // After cleanup, emit should be a no-op (not throw) and not deliver stale handlers.
    expect(() => bus.emit('lone:event', null)).not.toThrow()
  })
})

describe('bus.on — invalid handler', () => {
  it('returns a noop unsubscribe for non-function handler', () => {
    const off = bus.on('e', 'not a function' as unknown as (payload: unknown) => void)
    expect(typeof off).toBe('function')
    expect(() => off()).not.toThrow()
    expect(() => bus.emit('e', null)).not.toThrow()
  })

  it('accepts null/undefined handler gracefully', () => {
    const offNull = bus.on('e', null as unknown as (payload: unknown) => void)
    const offUndef = bus.on('e', undefined as unknown as (payload: unknown) => void)
    expect(typeof offNull).toBe('function')
    expect(typeof offUndef).toBe('function')
  })
})

describe('bus.emit — error isolation', () => {
  it('a throwing handler does NOT interrupt subsequent handlers', () => {
    const order: string[] = []
    bus.on('e', () => order.push('before'))
    bus.on('e', () => { throw new Error('boom') })
    bus.on('e', () => order.push('after'))
    bus.emit('e', null)
    expect(order).toEqual(['before', 'after'])
  })

  it('a throwing handler does NOT propagate the error to the caller', () => {
    bus.on('e', () => { throw new Error('boom') })
    expect(() => bus.emit('e', null)).not.toThrow()
  })

  it('logs the error to console.error for diagnostics', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    bus.on('e', () => { throw err })
    bus.emit('e', null)
    expect(errSpy).toHaveBeenCalled()
    // First arg is the prefix string; second is the thrown error.
    expect(errSpy.mock.calls[0][0]).toContain('e')
    expect(errSpy.mock.calls[0][1]).toBe(err)
    errSpy.mockRestore()
  })

  it('multiple throwing handlers each get isolated', () => {
    const order: string[] = []
    bus.on('e', () => { throw new Error('1') })
    bus.on('e', () => { throw new Error('2') })
    bus.on('e', () => order.push('ok'))
    bus.emit('e', null)
    expect(order).toEqual(['ok'])
  })
})

describe('bus.emit — subscription mutation during dispatch', () => {
  it('a handler unsubscribing itself during emit does not break iteration', () => {
    const received: string[] = []
    let off: () => void
    off = bus.on('e', (p: unknown) => {
      received.push(String(p))
      off()
    })
    bus.on('e', (p: unknown) => received.push('other:' + String(p)))
    // Should not throw — emit copies the handler set before iterating.
    expect(() => bus.emit('e', 'x')).not.toThrow()
    expect(received).toEqual(['x', 'other:x'])
    // Self-unsubscribed handler is gone on next emit.
    received.length = 0
    bus.emit('e', 'y')
    expect(received).toEqual(['other:y'])
  })

  it('a handler adding a new handler during emit does not invoke the new one this round', () => {
    const received: string[] = []
    bus.on('e', () => {
      received.push('first')
      bus.on('e', () => received.push('late'))
    })
    bus.emit('e', null)
    // 'late' should NOT be called on this dispatch (snapshot taken before iteration).
    expect(received).toEqual(['first'])
    // But it IS registered for the next dispatch.
    received.length = 0
    bus.emit('e', null)
    expect(received).toEqual(['first', 'late'])
  })
})

describe('bus.clear', () => {
  it('removes all subscribers across all events', () => {
    const received: string[] = []
    bus.on('a', () => received.push('a'))
    bus.on('b', () => received.push('b'))
    bus.clear()
    bus.emit('a', null)
    bus.emit('b', null)
    expect(received).toEqual([])
  })

  it('allows re-subscription after clear', () => {
    bus.on('e', () => {})
    bus.clear()
    const received: string[] = []
    bus.on('e', (p: unknown) => received.push(String(p)))
    bus.emit('e', 'x')
    expect(received).toEqual(['x'])
  })
})
