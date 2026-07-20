/**
 * Agent 级联判定逻辑单测 — 验证 pickBeacon 字段适配 + 级联判定规则
 * 运行: node tests/check-agent-status.mjs
 *
 * 注意: agent.js 内部函数未 export，且 store 依赖 Wails bindings 无法直接在 Node 中加载。
 * 这里通过 adapter 验证字段提取正确性，以及模拟级联判定逻辑的规则。
 */
import assert from 'node:assert/strict'
import { pickBeacon, pickBeaconId } from '../src/shared/protocol/adapter.js'

// ─── pickBeacon field adaptation ───

const snakeCaseBeacon = {
  beacon_id: 'abc123',
  hostname: 'test-host',
  username: 'DOMAIN\\admin',
  os: 'windows',
  arch: 'amd64',
  internal_ip: '10.0.0.5',
  external_ip: '1.2.3.4',
  listener_type: 'external',
  last_seen: '2024-01-01T00:00:00Z',
  status: 'online',
  pid: 1234,
  is_admin: true,
  sleep: 5000,
  jitter: 20,
  depth: 0,
  parent_id: '',
  gateway_id: 'abc123',
  link_protocol: '',
  link_state: '',
  link_addr: '',
}

const c = pickBeacon(snakeCaseBeacon)
assert.equal(c.beaconId, 'abc123', 'beacon_id -> beaconId')
assert.equal(c.hostname, 'test-host', 'hostname mapped')
assert.equal(c.internalIp, '10.0.0.5', 'internal_ip -> internalIp')
assert.equal(c.externalIp, '1.2.3.4', 'external_ip -> externalIp')
assert.equal(c.listenerType, 'external', 'listener_type -> listenerType')
assert.equal(c.pid, 1234, 'pid mapped')
assert.equal(c.isAdmin, true, 'is_admin -> isAdmin')
assert.equal(c.depth, 0, 'depth mapped')
assert.equal(c.parentId, '', 'parent_id -> parentId (empty)')

// camelCase variant
const camelCaseBeacon = {
  beaconId: 'camel456',
  hostname: 'camel-host',
  internalIp: '192.168.1.1',
  listenerType: 'internal',
  parentId: 'parent-001',
  depth: 1,
  linkState: 'online',
  lastSeen: '2024-01-01T00:00:00Z',
  status: 'online',
}

const cc = pickBeacon(camelCaseBeacon)
assert.equal(cc.beaconId, 'camel456', 'beaconId mapped')
assert.equal(cc.internalIp, '192.168.1.1', 'internalIp mapped')
assert.equal(cc.listenerType, 'internal', 'listenerType mapped')
assert.equal(cc.parentId, 'parent-001', 'parentId mapped')
assert.equal(cc.depth, 1, 'depth mapped')
assert.equal(cc.linkState, 'online', 'linkState mapped')

// pickBeaconId standalone
assert.equal(pickBeaconId({ beacon_id: 'x' }), 'x', 'pickBeaconId snake_case')
assert.equal(pickBeaconId({ BeaconID: 'y' }), 'y', 'pickBeaconId PascalCase')
assert.equal(pickBeaconId({ id: 'z' }), 'z', 'pickBeaconId fallback to id')
assert.equal(pickBeaconId({}), '', 'pickBeaconId empty')

// ─── Cascade判定逻辑模拟 ───
// 复制 agent.js 中的判定规则

function isCascadeAgent(agent) {
  if (!agent) return false
  const c = pickBeacon(agent)
  const listenerType = String(c.listenerType || '').toLowerCase()
  const depth = Number(c.depth || 0)
  return listenerType === 'internal' || depth > 0 || Boolean(c.parentId)
}

function isLinkClosed(agent) {
  const c = pickBeacon(agent)
  const state = String(c.linkState || '').toLowerCase()
  return ['lost', 'closed', 'disconnected', 'failed', 'error'].includes(state)
}

function isHeartbeatAlive(agent, now) {
  const c = pickBeacon(agent)
  if (!c.lastSeen) return false
  const lastSeenTime = new Date(c.lastSeen).getTime()
  if (!Number.isFinite(lastSeenTime)) return false
  const diffSeconds = (now - lastSeenTime) / 1000
  return diffSeconds < 60
}

function resolveStatus(agent, now) {
  if (!agent) return 'offline'
  if (!isCascadeAgent(agent)) {
    return isHeartbeatAlive(agent, now) ? 'online' : 'offline'
  }
  if (isLinkClosed(agent)) return 'offline'
  const c = pickBeacon(agent)
  if (!c.parentId) return 'offline'
  // In real code, parent is looked up; here we just check link state
  return 'cascade'
}

const now = Date.now()

// External beacon, fresh heartbeat -> online
assert.equal(
  resolveStatus({ beacon_id: 'ext1', listener_type: 'external', last_seen: new Date(now - 5000).toISOString() }, now),
  'online',
  'external beacon with fresh heartbeat is online'
)

// External beacon, stale heartbeat -> offline
assert.equal(
  resolveStatus({ beacon_id: 'ext2', listener_type: 'external', last_seen: new Date(now - 120000).toISOString() }, now),
  'offline',
  'external beacon with stale heartbeat is offline'
)

// Internal cascade beacon, link online -> cascade
assert.equal(
  resolveStatus({ beacon_id: 'int1', listener_type: 'internal', parent_id: 'ext1', link_state: 'online', last_seen: new Date(now - 1000).toISOString() }, now),
  'cascade',
  'internal beacon with online link is cascade'
)

// Internal cascade beacon, link closed -> offline
assert.equal(
  resolveStatus({ beacon_id: 'int2', listener_type: 'internal', parent_id: 'ext1', link_state: 'closed', last_seen: new Date(now - 1000).toISOString() }, now),
  'offline',
  'internal beacon with closed link is offline'
)

// Internal cascade beacon, no parent_id -> offline
assert.equal(
  resolveStatus({ beacon_id: 'int3', listener_type: 'internal', link_state: 'online', last_seen: new Date(now - 1000).toISOString() }, now),
  'offline',
  'internal beacon without parent is offline'
)

// Depth > 0 is also cascade
assert.equal(
  resolveStatus({ beacon_id: 'int4', depth: 2, parent_id: 'ext1', link_state: 'online', last_seen: new Date(now - 1000).toISOString() }, now),
  'cascade',
  'beacon with depth > 0 is cascade'
)

console.log('agent status tests ok')
