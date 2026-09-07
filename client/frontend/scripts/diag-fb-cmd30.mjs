#!/usr/bin/env node
/**
 * 用数字命令 ID 30 (FILEBROWSER) + 显式 {kind,value} 参数探测活 beacon。
 * 对照: C:\ / Program Files / My Pictures / 不存在带空格路径。
 */
const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
let sid = ''
let seq = 200

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
  t = String(t).trim()
  if (t.startsWith('event:') || t.includes('\ndata:')) {
    t = t.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
  }
  return JSON.parse(t)
}

async function callTool(name, args = {}) {
  const { status, body } = await post({
    jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args },
  })
  if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 300)}`)
  return extractJSON(body)
}

function toolText(rpc) {
  if (rpc.error) throw new Error('协议错误: ' + rpc.error.message)
  const res = rpc.result ?? {}
  if (res.isError) throw new Error('工具错误: ' + (res.content?.[0]?.text ?? JSON.stringify(res)))
  return res.content?.[0]?.text ?? JSON.stringify(res.structuredContent ?? res)
}

await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'diag-fb30', version: '0' } } })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })

const blistRaw = JSON.parse(toolText(await callTool('list_beacons')))
const blist = Array.isArray(blistRaw) ? blistRaw : (blistRaw.beacons ?? [])
const now = Date.now()
const beacon = blist.find((b) => {
  const t = Date.parse(b.last_seen ?? '')
  return Number.isFinite(t) && now - t < 60000
}) || blist.find((b) => b.online) || blist[0]
if (!beacon) { console.error('[diag] 无 beacon'); process.exit(1) }
const bid = String(beacon.beacon_id)
console.log('[diag] beacon =', bid, beacon.hostname, 'age=', beacon.age_seconds, 'online=', beacon.online)

function typed(kind, value) { return { kind, value } }

const PATHS = [
  'C:\\',
  'C:\\Program Files',
  'C:\\Users\\Public\\Documents\\My Pictures',
  'C:\\no such dir with space',
]

for (const p of PATHS) {
  const rpc = await callTool('send_beacon_command', {
    beacon_id: bid,
    command: 30,
    wait_ms: 25000,
    args: [typed('string', p), typed('int32', 1000), typed('int32', 0)],
  })
  const text = toolText(rpc)
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  const dump = typeof parsed === 'object'
    ? JSON.stringify(parsed).slice(0, 800)
    : String(parsed).slice(0, 800)
  console.log(`\n=== ${p} ===`)
  console.log(dump)
}

console.log('\n[diag] DONE')
