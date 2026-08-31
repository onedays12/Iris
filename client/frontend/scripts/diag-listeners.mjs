#!/usr/bin/env node
// diag-listeners.mjs — 列出运行时监听器,排查 beacon 无法回连问题。
const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
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
  const obj = JSON.parse(text)
  if (obj.error) throw new Error('protocol error: ' + obj.error.message)
  const r = obj.result
  if (!r) throw new Error('no result')
  if (r.isError) throw new Error('tool error: ' + (r.content?.[0]?.text ?? ''))
  return r.content?.[0]?.text ?? '{}'
}
async function callTool(name, args = {}) {
  const { status, body } = await post({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args } })
  if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`)
  return JSON.parse(extractJSON(body))
}
await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: {
  protocolVersion: '2025-06-18', capabilities: {},
  clientInfo: { name: 'diag-listeners', version: '0.0.1' },
} })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })

const ls = await callTool('list_listeners')
const arr = Array.isArray(ls) ? ls : ls.items ?? ls.listeners ?? [ls]
console.log(JSON.stringify(arr, null, 1).slice(0, 2500))
