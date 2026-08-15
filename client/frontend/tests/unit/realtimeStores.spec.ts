import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { bus } from '../../src/shared/bus'
import { useListenerStore } from '../../src/stores/listener'
import { useAgentStore } from '../../src/stores/agent'

beforeEach(() => {
  setActivePinia(createPinia())
  bus.clear()
})

describe('typed realtime stores', () => {
  it('updates heartbeat state without replacing static beacon fields', () => {
    const store = useAgentStore()
    store.addAgent({
      beacon_id: 'b1',
      hostname: 'host-1',
      os: 'windows',
      last_seen: '2026-01-01T00:00:00Z',
    })
    store.initSubscriptions()

    const lastSeen = new Date().toISOString()
    bus.emit('ws:beacon-tick', { beaconid: 'b1', lastSeen, status: 'online' })

    expect(store.agents[0]).toMatchObject({
      beaconid: 'b1',
      hostname: 'host-1',
      os: 'windows',
      lastSeen,
      status: 'online',
    })
  })

  it('emits an OS change after applying the beacon patch', () => {
    const store = useAgentStore()
    const changes: Array<{ beaconid: string; os: string }> = []
    store.addAgent({ beacon_id: 'b1', os: 'windows' })
    bus.on('agent:os-changed', payload => changes.push(payload))

    store.updateAgent('b1', { os: 'linux' })
    store.updateAgent('b1', { os: 'linux' })

    expect(changes).toEqual([{ beaconid: 'b1', os: 'linux' }])
  })

  it('merges partial listener events and removes deleted listeners', () => {
    const store = useListenerStore()
    store.listeners = [{
      id: 'l1',
      name: 'http-1',
      protocol: 'http',
      bindAddr: '0.0.0.0',
      bindPort: 8080,
      status: 'started',
      listenerType: 'external',
      config: '{}',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      raw: { id: 'l1', name: 'http-1', protocol: 'http', bind_port: 8080, status: 'started' },
    }]

    store.initSubscriptions()
    store.initSubscriptions()
    bus.emit('ws:listener-changed', { data: { name: 'http-1', status: 'paused' } })

    expect(store.listeners).toHaveLength(1)
    expect(store.listeners[0]).toMatchObject({
      id: 'l1',
      name: 'http-1',
      protocol: 'http',
      bindPort: 8080,
      status: 'paused',
    })

    bus.emit('ws:listener-changed', { data: { id: 'l1', status: 'removed' } })
    expect(store.listeners).toEqual([])
  })
})
