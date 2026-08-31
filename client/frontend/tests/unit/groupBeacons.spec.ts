import { describe, expect, it } from 'vitest'
import { groupBeacons, matchesBeaconSearch, uniqueGroupNames } from '../../src/features/beacon/groupBeacons'
import type { Beacon } from '../../src/features/beacon/model'

function agent(partial: Partial<Beacon> & { beaconid: string }): Beacon {
  return {
    hostname: 'h',
    username: 'u',
    os: 'windows',
    arch: 'amd64',
    ip: '10.0.0.1',
    externalIp: '-',
    lastSeen: '',
    status: 'online',
    processName: 'p',
    pid: 1,
    acp: 0,
    isAdmin: false,
    sleep: 1,
    jitter: 0,
    protocol: 'http',
    listener: 'l',
    listenerType: 'external',
    parentId: '',
    gatewayId: '',
    depth: 0,
    linkProtocol: '',
    linkState: '',
    linkHint: '',
    linkAddr: '',
    note: '',
    groupName: '',
    ...partial,
  }
}

describe('groupBeacons', () => {
  it('puts ungrouped beacons first, then named groups sorted', () => {
    const groups = groupBeacons([
      agent({ beaconid: 'b', groupName: '生产网' }),
      agent({ beaconid: 'a', groupName: '' }),
      agent({ beaconid: 'c', groupName: '办公网' }),
      agent({ beaconid: 'd' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['', '办公网', '生产网'])
    expect(groups[0].agents.map((a) => a.beaconid)).toEqual(['a', 'd'])
  })
})

describe('uniqueGroupNames / search', () => {
  it('lists distinct group names', () => {
    expect(uniqueGroupNames([
      agent({ beaconid: '1', groupName: 'B' }),
      agent({ beaconid: '2', groupName: 'A' }),
      agent({ beaconid: '3', groupName: 'A' }),
      agent({ beaconid: '4', groupName: '' }),
    ])).toEqual(['A', 'B'])
  })

  it('matches note and group name in search', () => {
    const row = agent({ beaconid: 'x', note: 'jump box', groupName: '生产网' })
    expect(matchesBeaconSearch(row, 'jump')).toBe(true)
    expect(matchesBeaconSearch(row, '生产')).toBe(true)
    expect(matchesBeaconSearch(row, 'nope')).toBe(false)
  })
})
