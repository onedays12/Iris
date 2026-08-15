import { describe, it, expect } from 'vitest'
import { resolveBeaconStatus } from '../../src/stores/agent'
import { normalizeBeacon } from '../../src/features/beacon/model'
import type { Beacon } from '../../src/features/beacon/model'

/**
 * 直接测试生产实现 resolveBeaconStatus(此前为复制品影子实现,
 * 缺失 visited 集合与 maxResolveDepth 护栏, 见 commit 前的评审结论)。
 */

function mk(raw: Record<string, unknown>): Beacon {
  const beacon = normalizeBeacon(raw)
  if (!beacon) throw new Error('normalizeBeacon returned null')
  return beacon
}

function kindOf(agent: Beacon, agents: Beacon[], now: number): string {
  return resolveBeaconStatus(agent, agents, now).kind
}

describe('resolveBeaconStatus (生产实现)', () => {
  const now = Date.now()
  const ext1 = mk({
    beacon_id: 'ext1',
    listener_type: 'external',
    last_seen: new Date(now - 5000).toISOString(),
  })

  it('marks an external beacon with a fresh heartbeat online', () => {
    expect(kindOf(ext1, [ext1], now)).toBe('online')
    expect(resolveBeaconStatus(ext1, [ext1], now).labelKey).toBe('agent.status.online')
  })

  it('marks an external beacon with a stale heartbeat offline', () => {
    const stale = mk({
      beacon_id: 'ext2',
      listener_type: 'external',
      last_seen: new Date(now - 120000).toISOString(),
    })
    expect(kindOf(stale, [stale], now)).toBe('offline')
  })

  it('marks an internal beacon with an online link as cascade', () => {
    const internal = mk({
      beacon_id: 'int1',
      listener_type: 'internal',
      parent_id: 'ext1',
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    })
    expect(kindOf(internal, [ext1, internal], now)).toBe('cascade')
    expect(resolveBeaconStatus(internal, [ext1, internal], now).labelKey).toBe('agent.status.cascade')
  })

  it('marks an internal beacon with a closed link offline', () => {
    const internal = mk({
      beacon_id: 'int2',
      listener_type: 'internal',
      parent_id: 'ext1',
      link_state: 'closed',
      last_seen: new Date(now - 1000).toISOString(),
    })
    expect(kindOf(internal, [ext1, internal], now)).toBe('offline')
  })

  it('marks an internal beacon without parent_id offline', () => {
    const internal = mk({
      beacon_id: 'int3',
      listener_type: 'internal',
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    })
    expect(kindOf(internal, [internal], now)).toBe('offline')
  })

  it('treats depth > 0 as cascade when the link is online', () => {
    const internal = mk({
      beacon_id: 'int4',
      depth: 2,
      parent_id: 'ext1',
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    })
    expect(kindOf(internal, [ext1, internal], now)).toBe('cascade')
  })

  it('marks a beacon whose parent is absent offline', () => {
    const internal = mk({
      beacon_id: 'int5',
      listener_type: 'internal',
      parent_id: 'missing',
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    })
    expect(kindOf(internal, [internal], now)).toBe('offline')
  })

  it('breaks parent cycles via the visited set instead of recursing forever', () => {
    const a = mk({
      beacon_id: 'cyc-a',
      listener_type: 'internal',
      parent_id: 'cyc-b',
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    })
    const b = mk({
      beacon_id: 'cyc-b',
      listener_type: 'internal',
      parent_id: 'cyc-a',
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    })
    expect(kindOf(a, [a, b], now)).toBe('offline')
  })

  it('enforces maxResolveDepth: a short chain resolves, a >16 chain degrades to offline', () => {
    // id 选择约束: findAgentById 支持前缀匹配, 因此链上 id 必须互不为前缀,
    // 且不能是 'ext1' 的前缀或超集。数字后缀 id (d1/d19) 与字母 'e' ('ext1'.startsWith('e'))
    // 都会触发前缀误匹配, 故使用互不前缀的 20 个单字母 id (e 换成 w)。
    const ids = 'abcdwfghijklmnopqrst'.split('')
    const chain: Beacon[] = ids.map((id, i) => mk({
      beacon_id: id,
      listener_type: 'internal',
      parent_id: i === 0 ? 'ext1' : ids[i - 1],
      link_state: 'online',
      last_seen: new Date(now - 1000).toISOString(),
    }))
    const agents = [ext1, ...chain]

    // 深度 3 的链 (c → b → a → ext1): 完整递归可达在线父节点 → cascade
    expect(kindOf(chain[2], agents, now)).toBe('cascade')

    // 深度 20 的链 (t → ... → a → ext1): 超过 maxResolveDepth=16, 护栏直接判 offline
    expect(kindOf(chain[19], agents, now)).toBe('offline')
  })
})
