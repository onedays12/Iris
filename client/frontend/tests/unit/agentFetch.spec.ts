import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/features/beacon/api/beaconApi.js', () => ({
  listBeacons: vi.fn(),
  removeBeacon: vi.fn(),
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
