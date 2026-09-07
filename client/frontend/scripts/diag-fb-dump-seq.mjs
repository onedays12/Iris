#!/usr/bin/env node
const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const seqs = (process.argv.slice(2).map(Number).filter(Boolean))
if (!seqs.length) {
  console.error('usage: node diag-fb-dump-seq.mjs 135 138 141 144')
  process.exit(1)
}
let sid = ''
let id = 1
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
  return resp.text()
}
function extractJSON(t) {
  t = String(t).trim()
  if (t.startsWith('event:') || t.includes('\ndata:')) {
    t = t.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('')
  }
  return JSON.parse(t)
}
await post({ jsonrpc: '2.0', id: ++id, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dump', version: '0' } } })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
const min = Math.min(...seqs) - 1
const body = await post({
  jsonrpc: '2.0', id: ++id, method: 'tools/call',
  params: { name: 'list_recent_events', arguments: { since_seq: min } },
})
const rpc = extractJSON(body)
const text = rpc.result?.content?.[0]?.text ?? '{}'
let parsed
try { parsed = JSON.parse(text) } catch { parsed = {} }
const items = Array.isArray(parsed) ? parsed : (parsed.events ?? parsed.items ?? [])
for (const want of seqs) {
  const it = items.find((e) => Number(e.seq) === want)
  if (!it) { console.log(`#${want} missing`); continue }
  const d = it.payload?.data ?? it.payload ?? {}
  const inner = d.data ?? {}
  const files = Array.isArray(inner.files) ? inner.files : []
  const sampleMtime = files[0]?.mod_time ?? files[1]?.mod_time
  console.log(
    `#${want} type=${it.type} status=${d.status} phase=${d.phase}` +
    ` path=${JSON.stringify(inner.path)} err=${JSON.stringify(inner.error_message ?? d.error ?? '')}` +
    ` count=${inner.files?.length ?? inner.count ?? 0}` +
    ` first=${JSON.stringify(files[0]?.name)} mtime0=${sampleMtime}`
  )
}
