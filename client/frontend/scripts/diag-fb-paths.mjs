#!/usr/bin/env node
/**
 * diag-fb-paths.mjs — 区分“路径空格丢参”与“目录 ACL 拒绝”。
 *
 * 对同一活 beacon，对多条特征路径各发 FILEBROWSER(30)，捕获原始响应：
 *   - C:\                        基线（必成）
 *   - my pictures（无尾分隔符）    截图中的失败路径（junction，本地也无法列出）
 *   - my pictures\               加尾分隔符
 *   - Program Files              存在且带空格（若空格丢参则必失败）
 *   - 不存在的带空格路径           应报错 2/3 而非 5
 * 输出每条的 path/limit/offset/has_more/error/count + 条目名，
 * 多轮重试以暴露偶发丢参。
 */
const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const ROUNDS = Number(process.env.DIAG_ROUNDS || 5)

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

await post({ jsonrpc: '2.0', id: ++seq, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'diag-fb', version: '0' } } })
await post({ jsonrpc: '2.0', method: 'notifications/initialized' })

const blistRaw = JSON.parse(toolText(await callTool('list_beacons')))
const blist = Array.isArray(blistRaw) ? blistRaw : (blistRaw.beacons ?? [])
const now = Date.now()
const beacon = blist.find((b) => {
  const t = Date.parse(b.last_seen ?? '')
  return Number.isFinite(t) && now - t < 20000
})
if (!beacon) { console.error('[diag] 无存活 beacon'); process.exit(1) }
const bid = String(beacon.beacon_id)
console.log('[diag] beacon =', bid, beacon.hostname ?? '')

// 每轮: 对每条路径发 FILEBROWSER, 等 COMMAND_EVENT 回来, 打印 header 字段
const PATHS = [
  'C:\\',
  'c:\\users\\public\\documents\\my pictures',
  'c:\\users\\public\\documents\\my pictures\\',
  'c:\\program files',
  'c:\\no such dir with space',
]

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\n===== round ${round} =====`)
  for (const p of PATHS) {
    const base = Number(JSON.parse(toolText(await callTool('list_recent_events'))).last_seq ?? 0)
    await callTool('send_beacon_command', { beacon_id: bid, command: 'FILEBROWSER', args: [p, 1000, 0] })
    // 轮询事件直到出现本 command 的结果帧或超时
    let frame = null
    const t0 = Date.now()
    while (Date.now() - t0 < 15000) {
      await new Promise((r) => setTimeout(r, 700))
      const evs = JSON.parse(toolText(await callTool('list_recent_events', { since_seq: base })))
      const items = Array.isArray(evs) ? evs : (evs.events ?? evs.items ?? [])
      for (const it of items) {
        if (it.type !== 'COMMAND_EVENT') continue
        const d = it.payload?.data ?? {}
        const inner = d.data ?? {}
        // 文件浏览结果: data 里有 files 或 error_message, 且 task/command 匹配
        if (inner.files !== undefined || inner.error_message !== undefined) {
          frame = { seq: it.seq, d, inner }
          break
        }
      }
      if (frame) break
    }
    if (!frame) { console.log(`  [${p}] (无响应帧)`); continue }
    const i = frame.inner
    const files = Array.isArray(i.files) ? i.files : []
    console.log(
      `  [${p}] seq=${frame.seq} echo_path=${JSON.stringify(i.path)} limit=${i.limit} offset=${i.offset}` +
      ` has_more=${i.has_more} err=${JSON.stringify(i.error_message ?? '')} count=${i.count ?? files.length}` +
      (files.length ? ` first=${JSON.stringify(files[0]?.name)}` : '')
    )
  }
}
console.log('\n[diag] DONE')
