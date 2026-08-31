import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/features/beacon/api/beaconApi.js', () => ({
  listBeacons: vi.fn(),
  removeBeacon: vi.fn(),
  removeBeacons: vi.fn(),
}))

import * as beaconApi from '../../src/features/beacon/api/beaconApi'
import type { BeaconViewDto } from '../../src/features/beacon/api/types'
import { useAgentStore } from '../../src/stores/agent'

const beacon = (beacon_id: string): BeaconViewDto => ({ beacon_id } as BeaconViewDto)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('agent fetch reconciliation', () => {
  it('keeps agents registered via WS while the full reload is in flight', async () => {
    let resolveList!: (v: BeaconViewDto[]) => void
    const deferred = new Promise<BeaconViewDto[]>((res) => { resolveList = res })
    vi.mocked(beaconApi.listBeacons).mockReturnValue(deferred)

    const store = useAgentStore()
    const pending = store.fetchAgents()

    // 模拟全量拉取期间 WS 并发注册的新 Beacon
    store.addAgent({ beacon_id: 'ws-new', hostname: 'h1', os: 'windows' })

    resolveList([beacon('a1'), beacon('a2')])
    await pending

    expect(store.agents.map(a => a.beaconid).sort()).toEqual(['a1', 'a2', 'ws-new'])
  })

  it('removes agents that existed before the reload but are absent from the response', async () => {
    vi.mocked(beaconApi.listBeacons).mockResolvedValue([beacon('a1')])

    const store = useAgentStore()
    store.addAgent({ beacon_id: 'stale', hostname: 'h0', os: 'windows' })

    await store.fetchAgents()

    expect(store.agents.map(a => a.beaconid)).toEqual(['a1'])
  })
})

describe('agent batch remove', () => {
  it('uses the single-remove API for one id and drops the row locally', async () => {
    vi.mocked(beaconApi.removeBeacon).mockResolvedValue({ ok: true, message: 'ok' })
    const store = useAgentStore()
    store.addAgent({ beacon_id: 'a1', hostname: 'h1', os: 'windows' })
    store.addAgent({ beacon_id: 'a2', hostname: 'h2', os: 'windows' })

    await expect(store.removeBeacons(['a1'])).resolves.toBe(true)
    expect(beaconApi.removeBeacon).toHaveBeenCalledWith('a1')
    expect(beaconApi.removeBeacons).not.toHaveBeenCalled()
    expect(store.agents.map(a => a.beaconid)).toEqual(['a2'])
  })

  it('uses the batch-remove API for multiple ids', async () => {
    vi.mocked(beaconApi.removeBeacons).mockResolvedValue({ beacon_ids: ['a1', 'a2'] })
    const store = useAgentStore()
    store.addAgent({ beacon_id: 'a1', hostname: 'h1', os: 'windows' })
    store.addAgent({ beacon_id: 'a2', hostname: 'h2', os: 'windows' })
    store.addAgent({ beacon_id: 'a3', hostname: 'h3', os: 'windows' })

    await expect(store.removeBeacons(['a1', 'a2', 'a1'])).resolves.toBe(true)
    expect(beaconApi.removeBeacons).toHaveBeenCalledWith(['a1', 'a2'])
    expect(store.agents.map(a => a.beaconid)).toEqual(['a3'])
  })
})
