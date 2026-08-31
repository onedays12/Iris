#!/usr/bin/env node
/**
 * diag-explorer-verify.mjs — explorer 修复真机验收:
 * 1. get_client_status 确认 GUI 会话(TeamServer 重启后是否仍有效);
 * 2. list_beacons 等待 beacon 重连(存活判定: last_seen 距今 < 60s);
 * 3. send_beacon_command LS c:\ 并等待结果帧,如实打印。
 */
import process from 'node:process'

const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const TARGET = process.env.VERIFY_BEACON || 'd9eecb79'
const LS_PATH = process.env.VERIFY_PATH || 'c:\\'

let sid = ''
let seq = 100
async function post(payload) {
  const resp = await fetch(MCP + '/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sid ? { 'Mcp-Session-Id': sid } : {}),
    },
    body: JSON.stringify(payload),
  })
  const h = resp.headers.get('mcp-session-id')
  if (h) sid = h
  return { status: resp.status, body: await resp.text() }
}
function extractJSON(bodyText) {
  let text = bodyText.trim()
  if (text.startsWith('event:') || text.includes('\ndata:')) {
    text = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
  }
  if (!text) throw new Error('empty response')
  const obj = JSON.parse(text)
  if (obj.error) throw new Error('protocol error: ' + obj.error.message)
  const r = obj.result
  if (!r) throw new Error('no result: ' + JSON.stringify(obj).slice(0, 300))
  if (r.isError) {
    throw new Error('tool error: ' + (r.content?.[0]?.text ?? JSON.stringify(r).slice(0, 300)))
  }
  return r.content?.[0]?.text ?? '{}'
}
async function callTool(name, args = {}) {
  const { status, body } = await post({
    jsonrpc: '2.0', id: ++seq, method: 'tools/call',
    params: { name, arguments: args },
  })
  if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`)
  return JSON.parse(extractJSON(body))
}
async function init() {
  const { status, body } = await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'diag-explorer-verify', version: '0.0.1' },
  } })
  if (status !== 200) throw new Error(`init HTTP ${status}: ${body.slice(0, 200)}`)
  extractJSON(body)
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
}
function findKeyDeep(obj, keys) {
  const wanted = new Set(keys)
  const visit = (v) => {
    if (Array.isArray(v)) { for (const x of v) { const r = visit(x); if (r !== undefined) return r } return undefined }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (wanted.has(k) && val !== undefined && val !== null) return val
      }
      for (const val of Object.values(v)) { const r = visit(val); if (r !== undefined) return r }
    }
    return undefined
  }
  return visit(obj)
}
const toArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await init()

const st = await callTool('get_client_status')
console.log('[verify] client status:', JSON.stringify(st).slice(0, 200))

let beacon = null
for (let i = 0; i < 15; ++i) {
  const bs = toArray(await callTool('list_beacons'))
  beacon = bs.find((b) => String(findKeyDeep(b, ['beacon_id', 'id', 'uuid']) ?? '').startsWith(TARGET))
    || bs.find((b) => JSON.stringify(b).includes(TARGET))
  if (beacon) {
    const rawSeen = findKeyDeep(beacon, ['last_seen'])
    const ms = typeof rawSeen === 'number'
      ? (rawSeen < 1e12 ? rawSeen * 1000 : rawSeen)
      : Date.parse(String(rawSeen ?? ''))
    const ageSec = Number.isFinite(ms) ? Math.max(0, (Date.now() - ms) / 1000) : NaN
    console.log(`[verify] beacon found, last_seen=${rawSeen} (age ${Number.isFinite(ageSec) ? Math.round(ageSec) + 's' : 'unknown'})`)
    if (!Number.isFinite(ageSec) || ageSec < 120) break
    if (i === 0) console.log('[verify] last_seen 仍陈旧,等待重连...')
  } else if (i === 0) {
    console.log('[verify] 未找到 beacon,等待重连...')
  }
  await sleep(4000)
}
if (!beacon) {
  console.error('[verify] FAIL: beacon 未在超时内重连')
  process.exit(2)
}

const base = Number((await callTool('list_recent_events')).last_seq ?? 0)
const realId = String(findKeyDeep(beacon, ['beacon_id']) ?? findKeyDeep(beacon, ['uuid']) ?? findKeyDeep(beacon, ['id']) ?? TARGET)
console.log('[verify] using beacon id:', realId)
const ack = await callTool('send_beacon_command', { beacon_id: realId, command: 'LS', args: [LS_PATH] })
console.log('[verify] LS ack:', JSON.stringify(ack).slice(0, 160))

const ev = await callTool('wait_for_event', { type_prefix: 'COMMAND', beacon_id: realId, since_seq: base, timeout_ms: 60000 })
const rec = ev.matched ?? ev
const text = findKeyDeep(rec, ['text', 'error'])
console.log('[verify] LS result frame:')
console.log(typeof text === 'string' ? text.slice(0, 2000) : JSON.stringify(rec).slice(0, 2000))
