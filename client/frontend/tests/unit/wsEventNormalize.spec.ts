import { describe, expect, it } from 'vitest'
import { EVENT_TYPE, normalizeWsEvent } from '../../src/features/events/eventPayload'

const ROUTED_TYPES = new Set([
  EVENT_TYPE.BEACON_REGISTERED,
  EVENT_TYPE.BEACON_TICK,
  EVENT_TYPE.BEACON_REMOVED,
  EVENT_TYPE.BEACON_META,
  EVENT_TYPE.COMMAND_EVENT,
  EVENT_TYPE.LISTENER_STATE_CHANGED,
  EVENT_TYPE.TUNNEL_STARTED,
  EVENT_TYPE.TUNNEL_PAUSED,
  EVENT_TYPE.TUNNEL_RESUMED,
  EVENT_TYPE.TUNNEL_CLEARED,
  EVENT_TYPE.TUNNEL_STOPPED,
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  EVENT_TYPE.TUNNEL_STATS,
  EVENT_TYPE.TUNNEL_UPDATED,
  EVENT_TYPE.TUNNEL_ACK,
])

const QUIET_TYPES = [
  EVENT_TYPE.BEACON_TICK,
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  EVENT_TYPE.TUNNEL_STATS,
]

const RECORDED_TYPES = [
  EVENT_TYPE.BEACON_REGISTERED,
  EVENT_TYPE.BEACON_REMOVED,
  EVENT_TYPE.BEACON_META,
  EVENT_TYPE.COMMAND_EVENT,
  EVENT_TYPE.LISTENER_STATE_CHANGED,
  EVENT_TYPE.TUNNEL_STARTED,
  EVENT_TYPE.TUNNEL_PAUSED,
  EVENT_TYPE.TUNNEL_RESUMED,
  EVENT_TYPE.TUNNEL_CLEARED,
  EVENT_TYPE.TUNNEL_STOPPED,
  EVENT_TYPE.TUNNEL_UPDATED,
  EVENT_TYPE.TUNNEL_ACK,
]

describe('ws event normalization', () => {
  it('preserves every routed event type', () => {
    for (const eventType of ROUTED_TYPES) {
      expect(normalizeWsEvent({ type: eventType, data: {} }).type).toBe(eventType)
    }
  })

  it('does not treat unknown types as routed', () => {
    const unknownEvent = normalizeWsEvent({ type: 'SOME_RANDOM_EVENT', data: {} })
    expect(ROUTED_TYPES.has(unknownEvent.type as never)).toBe(false)
  })

  it('keeps quiet and recorded sets disjoint and complete', () => {
    for (const qt of QUIET_TYPES) {
      expect((RECORDED_TYPES as string[]).includes(qt)).toBe(false)
    }
    for (const rt of ROUTED_TYPES) {
      expect((QUIET_TYPES as string[]).includes(rt) || (RECORDED_TYPES as string[]).includes(rt)).toBe(true)
    }
  })

  it('extracts payload fields and parses JSON string data', () => {
    const beaconTick = normalizeWsEvent({ type: 'BEACON_TICK', data: { beacon_id: 'bt-001' } })
    expect((beaconTick.data as { beacon_id: string }).beacon_id).toBe('bt-001')

    const commandEvent = normalizeWsEvent({
      type: 'COMMAND_EVENT',
      data: { task_id: 42, command_id: 50, phase: 'result', status: 'completed' },
    })
    expect((commandEvent.data as { task_id: number }).task_id).toBe(42)
    expect((commandEvent.data as { command_id: number }).command_id).toBe(50)

    const stringDataEvent = normalizeWsEvent({
      type: 'BEACON_REGISTERED',
      data: '{"beacon_id":"str-001"}',
    })
    expect((stringDataEvent.data as { beacon_id: string }).beacon_id).toBe('str-001')
  })
})
