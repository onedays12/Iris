import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { bus } from '../../src/shared/bus'

vi.mock('../../src/features/events/wsEventRouter.js', () => ({
  handleWsEventMessage: vi.fn(),
}))

import { useWSStore } from '../../src/stores/ws'

beforeEach(() => {
  setActivePinia(createPinia())
  bus.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WebSocket connection lifecycle', () => {
  it('emits one connected event per connection and marks later opens as reconnects', () => {
    const store = useWSStore()
    const events: boolean[] = []
    bus.on('ws:connected', ({ reconnected }) => events.push(reconnected))

    store.markConnected()
    store.markConnected()
    store.status = 'closed'
    store.markConnected()

    expect(events).toEqual([false, true])
    expect(store.status).toBe('open')
    expect(store.reconnectCount).toBe(0)
  })

  it('keeps only one reconnect timer and clears native resources on disconnect', () => {
    const store = useWSStore()
    const unsubscribe = vi.fn()
    store.nativeWsRegistered = true
    store.nativeWsUnsubscribers = [unsubscribe]
    store.status = 'closed'

    store.handleReconnect()
    const timer = store.reconnectTimer
    store.handleReconnect()

    expect(timer).not.toBeNull()
    expect(store.reconnectTimer).toBe(timer)
    expect(store.reconnectCount).toBe(1)

    store.disconnect()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(store.reconnectTimer).toBeNull()
    expect(store.nativeWsUnsubscribers).toEqual([])
    expect(store.nativeWsRegistered).toBe(false)
    expect(store.manualDisconnect).toBe(true)
    expect(store.status).toBe('closed')
  })

  it('skips backoff and silent-reauths on a 401 handshake', () => {
    const store = useWSStore()
    const spy = vi.spyOn(store, 'attemptSilentReauth').mockResolvedValue()
    store.status = 'error'
    store.recoverAfterConnectFailure('websocket dial failed: bad handshake (status 401)')
    expect(spy).toHaveBeenCalledOnce()
    expect(store.reconnectTimer).toBeNull()
    spy.mockRestore()
  })
})
