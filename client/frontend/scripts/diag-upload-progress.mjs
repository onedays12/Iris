#!/usr/bin/env node
/**
 * diag-upload-progress.mjs — 复现"上传进度条冻结"问题。
 *
 * 对齐 GUI 真实路径:upload_local_file → UPLOAD(file_id, remote_path, 524288)。
 * 捕获全程 COMMAND_EVENT(command_id=29) 帧,输出 acked_chunks 序列与终止状态,
 * 并核对远端文件落盘大小 —— 以区分 服务端未发完 / beacon ACK 缺失 / 客户端应用问题。
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const LISTENER_NAME = process.env.E2E_LISTENER_NAME || 'e2e-mcp'
const BIND_PORT = Number(process.env.E2E_BIND_PORT || 19443)
const QUIET_MS = Number(process.env.OP_QUIET_MS || 12000)
const HARD_TIMEOUT_MS = Number(process.env.OP_HARD_TIMEOUT_MS || 120000)
const FILE_BYTES = Math.round(9.71 * 1024 * 1024) // 与 aigc.exe 同量级 → 20 chunks @512KB

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
function toolText(rpc) {
  if (rpc.error) throw new Error('协议错误: ' + rpc.error.message)
  const res = rpc.result ?? {}
  if (res.isError) throw new Error('工具错误: ' + (res.content?.[0]?.text ?? ''))
  return res.content?.[0]?.text ?? '{}'
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

await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'diag-upload', version: '0' } } })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })

// ── 目标 beacon(存活复用,否则部署) ──────────────────────────────
const blist = JSON.parse(toolText(await callTool('list_beacons')))
const now = Date.now()
let beacon = blist.find((b) => {
  const t = Date.parse(b.last_seen ?? '')
  return Number.isFinite(t) && now - t < 20000
})
if (!beacon) {
  console.log('[diag] 无存活 beacon,部署分支…')
  const ls = JSON.parse(toolText(await callTool('list_listeners')))
  let l = ls.find((x) => x.name === LISTENER_NAME && ['started', 'starting'].includes(x.status))
  if (!l) {
    const created = await callTool('create_listener', {
      name: LISTENER_NAME, protocol: 'http', listener_type: 'external',
      host: '127.0.0.1', port: BIND_PORT, callback_host: '127.0.0.1', callback_port: BIND_PORT,
    })
    l = { id: findKeyDeep(created, ['id']) }
  }
  const gen = JSON.parse(toolText(await callTool('generate_beacon', {
    listener_id: l.id ?? l.listener_id, os: 'windows', arch: 'amd64', format: 'exe',
    stage_mode: 'stagerless', beacon_type: 'c',
  })))
  const base = Number(JSON.parse(toolText(await callTool('list_recent_events'))).last_seq ?? 0)
  spawn(gen.path, [], { detached: true, stdio: 'ignore' }).unref()
  const reg = JSON.parse(toolText(await callTool('wait_for_event', { type_prefix: 'BEACON_REG', since_seq: base, timeout_ms: 90000 })))
  beacon = { beacon_id: findKeyDeep(reg, ['beacon_id', 'beaconId', 'id']) }
  console.log('[diag] 部署上线', beacon.beacon_id, gen.path)
}
const bid = String(beacon.beacon_id)
console.log('[diag] 目标 beacon =', bid)

// ── 造 9.71MB 测试文件 → file_id ────────────────────────────────
const localPath = join(tmpdir(), `diag-upload-${randomUUID().slice(0, 8)}.bin`)
const buf = Buffer.alloc(FILE_BYTES)
// 伪随机填充,避免传输层压缩/去重优化干扰
for (let i = 0; i < buf.length; i += 4096) buf[i] = (i / 4096) & 0xff
writeFileSync(localPath, buf)
const up = JSON.parse(toolText(await callTool('upload_local_file', { file_path: localPath })))
const fileId = findKeyDeep(up, ['file_id'])
console.log('[diag] file_id =', fileId, 'size =', findKeyDeep(up, ['size']))

const remotePath = `C:\\Users\\Public\\diag-upload-${randomUUID().slice(0, 6)}.bin`
const baseline = Number(JSON.parse(toolText(await callTool('list_recent_events'))).last_seq ?? 0)
console.log('[diag] baseline last_seq =', baseline, 'remote =', remotePath)

// ── 下发 UPLOAD(与 GUI 一致:file_id, remote_path, 524288) ─────
const ack = JSON.parse(toolText(await callTool('send_beacon_command', {
  beacon_id: bid, command: 'UPLOAD', args: [fileId, remotePath, 524288],
})))
console.log('[diag] UPLOAD ack =', JSON.stringify(ack).slice(0, 200))

// ── 收集事件直到静止 ────────────────────────────────────────────
const frames = []
let cursor = baseline
const start = Date.now()
let lastNew = Date.now()
while (Date.now() - start < HARD_TIMEOUT_MS && Date.now() - lastNew < QUIET_MS) {
  await new Promise((r) => setTimeout(r, 2000))
  const evs = JSON.parse(toolText(await callTool('list_recent_events', { since_seq: cursor })))
  const items = Array.isArray(evs) ? evs : (evs.events ?? evs.items ?? [])
  if (items.length > 0) lastNew = Date.now()
  for (const it of items) {
    cursor = Math.max(cursor, Number(it.seq ?? 0))
    if (it.type !== 'COMMAND_EVENT') continue
    const d = it.payload?.data ?? {}
    if (Number(d.command_id) !== 29 && String(d.result_type ?? '') !== 'upload') continue
    frames.push({ seq: it.seq, phase: d.phase, status: d.status, inner: d.data ?? {} })
  }
}

console.log(`\n[diag] 捕获 UPLOAD 相关帧 ${frames.length} 条:`)
for (const f of frames) {
  const i = f.inner
  console.log(`  #${f.seq} phase=${f.phase} status=${f.status} acked=${i.acked_chunks}/${i.total_chunks}` +
    ` acked_bytes=${i.acked_bytes ?? '-'} written=${i.written_bytes ?? '-'} chunk_idx=${i.chunk_index ?? '-'}` +
    (i.error_message ? ` err=${i.error_message}` : ''))
}

// ── 远端落盘核对 ────────────────────────────────────────────────
try {
  const pre = Number(JSON.parse(toolText(await callTool('list_recent_events'))).last_seq ?? 0)
  await callTool('send_beacon_command', { beacon_id: bid, command: 'SHELL', args: [`cmd /c dir "${remotePath}"`] })
  const ev = JSON.parse(toolText(await callTool('wait_for_event', {
    type_prefix: 'COMMAND', beacon_id: bid, since_seq: pre, timeout_ms: 30000,
  })))
  console.log('\n[diag] 远端文件核对:', String(findKeyDeep(ev, ['text']) ?? '').trim().split('\n').filter(l => l.includes('diag-upload')).join(' | ') || '(未找到!)')
} catch (e) { console.log('[diag] 远端核对失败:', String(e).slice(0, 120)) }

try { rmSync(localPath, { force: true }) } catch {}
console.log('\n[diag] DONE')
