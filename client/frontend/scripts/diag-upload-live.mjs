#!/usr/bin/env node
/**
 * 只读诊断:从运行中的 Iris Client MCP 拉取最近 COMMAND_EVENT,
 * 打印 upload 相关帧的 status/acked_chunks/task_id,定位进度条跳动来源。
 */
const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'

let sid = ''
let seq = 1
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
  if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 300)}`)
  const rpc = extractJSON(body)
  if (rpc.error) throw new Error('协议错误: ' + rpc.error.message)
  const res = rpc.result ?? {}
  if (res.isError) throw new Error('工具错误: ' + (res.content?.[0]?.text ?? ''))
  const text = res.content?.[0]?.text ?? '{}'
  try { return JSON.parse(text) } catch { return text }
}

await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'diag-upload-live', version: '0' } } })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })

const status = await callTool('get_client_status')
console.log('[diag] client_status', JSON.stringify(status).slice(0, 400))

const beacons = await callTool('list_beacons')
const items = Array.isArray(beacons) ? beacons : (beacons.beacons || beacons.items || [])
console.log('[diag] beacons', items.length)
for (const b of items.slice(0, 8)) {
  console.log('  ', b.beacon_id || b.id, 'online=', b.online, 'sleep=', b.sleep, 'last=', b.last_seen || b.lastSeen)
}

const ev = await callTool('list_recent_events', { type_prefix: 'COMMAND' })
const events = Array.isArray(ev) ? ev : (ev.events || [])
console.log('[diag] last_seq', ev.last_seq, 'command_events', events.length)

const uploads = []
for (const it of events) {
  const d = it.payload || {}
  const inner = (d && typeof d.data === 'object' && d.data) || {}
  const cid = String(d.command_id ?? d.commandId ?? '')
  const rtype = String(d.result_type ?? d.resultType ?? inner.direction ?? '').toLowerCase()
  if (cid !== '29' && rtype !== 'upload' && inner.direction !== 'upload') continue
  uploads.push({ it, d, inner })
}
console.log('[diag] upload-related', uploads.length)
for (const { it, d, inner } of uploads.slice(-40)) {
  console.log(
    `  seq=${it.seq} phase=${d.phase} status=${d.status} rtype=${d.result_type}` +
    ` outer_task=${d.task_id} inner_task=${inner.task_id}` +
    ` acked=${inner.acked_chunks}/${inner.total_chunks}` +
    ` queued=${inner.queued_chunks} idx=${inner.chunk_index}` +
    ` bytes=${inner.acked_bytes ?? inner.received_bytes ?? '-'}` +
    ` file=${inner.file_name || ''} remote=${inner.remote_path || ''}`
  )
}
