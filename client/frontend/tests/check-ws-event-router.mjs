/**
 * wsEventRouter 单测 — 验证事件路由分发逻辑
 * 运行: node tests/check-ws-event-router.mjs
 */
import assert from 'node:assert/strict'
import { EVENT_TYPE, normalizeWsEvent } from '../src/features/events/eventPayload.js'

// Event types that wsEventRouter has explicit case branches for
const ROUTED_TYPES = new Set([
  EVENT_TYPE.BEACON_REGISTERED,
  EVENT_TYPE.BEACON_TICK,
  EVENT_TYPE.BEACON_REMOVED,
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

// ─── All routed types normalize correctly ───

for (const eventType of ROUTED_TYPES) {
  const wsResult = normalizeWsEvent({ type: eventType, data: {} })
  assert.equal(wsResult.type, eventType, `normalizeWsEvent preserves ${eventType}`)
}

// ─── Unknown event type is not in routed set ───

const unknownEvent = normalizeWsEvent({ type: 'SOME_RANDOM_EVENT', data: {} })
assert.ok(!ROUTED_TYPES.has(unknownEvent.type), 'unknown event type not in routed set')

// ─── QUIET events: BEACON_TICK and some TUNNEL events should not be recorded to event panel ───

const QUIET_TYPES = [
  EVENT_TYPE.BEACON_TICK,
  EVENT_TYPE.TUNNEL_CHANNEL_OPEN,
  EVENT_TYPE.TUNNEL_CHANNEL_CLOSE,
  EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED,
  EVENT_TYPE.TUNNEL_STATS,
]

// Non-quiet events that should be recorded
const RECORDED_TYPES = [
  EVENT_TYPE.BEACON_REGISTERED,
  EVENT_TYPE.BEACON_REMOVED,
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

// Verify quiet and recorded sets are disjoint
for (const qt of QUIET_TYPES) {
  assert.ok(!RECORDED_TYPES.includes(qt), `${qt} should not be in both quiet and recorded sets`)
}

// Verify all routed types are either quiet or recorded
for (const rt of ROUTED_TYPES) {
  const isQuiet = QUIET_TYPES.includes(rt)
  const isRecorded = RECORDED_TYPES.includes(rt)
  assert.ok(isQuiet || isRecorded, `${rt} should be either quiet or recorded`)
}

// ─── Data extraction from WS message ───

const beaconTick = normalizeWsEvent({
  type: 'BEACON_TICK',
  data: { beacon_id: 'bt-001' },
})
assert.equal(beaconTick.data.beacon_id, 'bt-001', 'beacon tick data extracted')

const commandEvent = normalizeWsEvent({
  type: 'COMMAND_EVENT',
  data: { task_id: 42, command_id: 50, phase: 'result', status: 'completed' },
})
assert.equal(commandEvent.data.task_id, 42, 'command event task_id extracted')
assert.equal(commandEvent.data.command_id, 50, 'command event command_id extracted')

// ─── Event with data as JSON string ───

const stringDataEvent = normalizeWsEvent({
  type: 'BEACON_REGISTERED',
  data: '{"beacon_id":"str-001"}',
})
assert.equal(stringDataEvent.data.beacon_id, 'str-001', 'JSON string data parsed')

console.log('ws event router tests ok')
