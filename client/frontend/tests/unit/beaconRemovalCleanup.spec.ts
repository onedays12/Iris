import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNetworkBrowserStore } from '../../src/stores/networkBrowser'
import type { NetworkInterfaceInfo, NetworkConnectionInfo } from '../../src/stores/networkBrowser'
import { useProcessBrowserStore } from '../../src/stores/processBrowser'
import type { ProcessInfo } from '../../src/stores/processBrowser'
import { useTunnelStore } from '../../src/stores/tunnel'
import type { Tunnel, TunnelChannel } from '../../src/features/tunnel/model'
import { bus } from '../../src/shared/bus'

type TunnelAckFixture = { tunnelId: string; channelId: string; action: string; receivedAt: number; raw: unknown }

beforeEach(() => {
  setActivePinia(createPinia())
  bus.clear()
})

describe('Beacon removal local cleanup', () => {
  it('clears tunnel, process, and network state for the removed beacon', () => {
    const tunnelStore = useTunnelStore()
    const processStore = useProcessBrowserStore()
    const networkStore = useNetworkBrowserStore()

    tunnelStore.tunnels = [
      { tunnelId: 'tunnel-a', beaconId: 'beacon-a' },
      { tunnelId: 'tunnel-b', beaconId: 'beacon-b' },
    ] as Tunnel[]
    tunnelStore.channelsByTunnelId = {
      'tunnel-a': [{ channelId: 'channel-a', tunnelId: 'tunnel-a' }],
      'tunnel-b': [{ channelId: 'channel-b', tunnelId: 'tunnel-b' }],
    } as unknown as Record<string, TunnelChannel[]>
    tunnelStore.channelsLoading = { 'tunnel-a': true, 'tunnel-b': false }
    tunnelStore.channelsError = { 'tunnel-a': 'stale', 'tunnel-b': '' }
    tunnelStore.tunnelAcks = [
      { tunnelId: 'tunnel-a' },
      { tunnelId: 'tunnel-b' },
    ] as TunnelAckFixture[]
    tunnelStore.activeTunnelId = 'tunnel-a'

    processStore.processes['beacon-a'] = [{ pid: '1' }] as ProcessInfo[]
    processStore.loading['beacon-a'] = true
    processStore.errorMessages['beacon-a'] = 'stale'
    processStore.lastUpdated['beacon-a'] = 'now'

    networkStore.interfaces['beacon-a'] = [{ name: 'eth0' }] as NetworkInterfaceInfo[]
    networkStore.connections['beacon-a'] = [{ pid: '1' }] as NetworkConnectionInfo[]
    networkStore.loading['beacon-a'] = true
    networkStore.errorMessages['beacon-a'] = 'stale'
    networkStore.lastUpdated['beacon-a'] = 'now'
    networkStore.pending['beacon-a'] = { netinfo: true, netstat: true }

    tunnelStore.initSubscriptions()
    processStore.initSubscriptions()
    networkStore.initSubscriptions()
    bus.emit('agent:removed', { beaconid: 'beacon-a' })

    expect(tunnelStore.tunnels).toEqual([{ tunnelId: 'tunnel-b', beaconId: 'beacon-b' }])
    expect(tunnelStore.channelsByTunnelId).toEqual({ 'tunnel-b': [{ channelId: 'channel-b', tunnelId: 'tunnel-b' }] })
    expect(tunnelStore.channelsLoading).toEqual({ 'tunnel-b': false })
    expect(tunnelStore.channelsError).toEqual({ 'tunnel-b': '' })
    expect(tunnelStore.tunnelAcks).toEqual([{ tunnelId: 'tunnel-b' }])
    expect(tunnelStore.activeTunnelId).toBe('')

    expect(processStore.processes['beacon-a']).toBeUndefined()
    expect(processStore.loading['beacon-a']).toBeUndefined()
    expect(processStore.errorMessages['beacon-a']).toBeUndefined()
    expect(processStore.lastUpdated['beacon-a']).toBeUndefined()

    expect(networkStore.interfaces['beacon-a']).toBeUndefined()
    expect(networkStore.connections['beacon-a']).toBeUndefined()
    expect(networkStore.loading['beacon-a']).toBeUndefined()
    expect(networkStore.errorMessages['beacon-a']).toBeUndefined()
    expect(networkStore.lastUpdated['beacon-a']).toBeUndefined()
    expect(networkStore.pending['beacon-a']).toBeUndefined()

    expect(tunnelStore.tunnels[0].beaconId).toBe('beacon-b')
  })
})
