#!/usr/bin/env node
/**
 * diag-preview-frame.mjs — 抓取 preview_remote_file 全链路的真实 WS 帧形状。
 * 调用(短超时快速失败)→ 把 since_seq 之后全部事件原样落盘供人工比对谓词。
 */
import { writeFileSync } from 'node:fs'

const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const OUT = process.env.OP_OUT || 'preview-frames-dump.json'

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
function extractJSON(t) {
  t = t.trim()
  if (t.startsWith('event:') || t.includes('\ndata:')) {
    t = t.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
  }
  return JSON.parse(t)
}
async function callTool(name, args = {}) {
  const { status, body } = await post({
    jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args },
  })
  if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`)
  return extractJSON(body)
}
function findKeyDeep(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  for (const v of Object.values(obj)) {
    const hit = findKeyDeep(v, keys)
    if (hit !== undefined) return hit
  }
  return undefined
}

await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'diag', version: '0' } } })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })

const blist = JSON.parse((await callTool('list_beacons')).result.content[0].text)
const now = Date.now()
const beacon = blist.find((b) => {
  const t = Date.parse(b.last_seen ?? '')
  return Number.isFinite(t) && now - t < 20000
})
if (!beacon) throw new Error('无在线 beacon')
console.log('target', beacon.beacon_id)

let cursor = Number(JSON.parse((await callTool('list_recent_events')).result.content[0].text).last_seq ?? 0)
console.log('baseline last_seq=', cursor)

const callResp = await callTool('preview_remote_file', {
  beacon_id: String(beacon.beacon_id), remote_path: 'C:\\Windows\\win.ini', timeout_ms: 8000,
})
console.log('preview result:', JSON.stringify(callResp).slice(0, 600))

// 再额外等几秒,把可能"迟到"的帧也一并抓回来
await new Promise((r) => setTimeout(r, 4000))
const evs = JSON.parse((await callTool('list_recent_events', { since_seq: cursor })).result.content[0].text)
const items = Array.isArray(evs) ? evs : (evs.events ?? evs.items ?? [])
writeFileSync(OUT, JSON.stringify(items, null, 1))
console.log(`dumped ${items.length} events → ${OUT}`)
