#!/usr/bin/env node
/**
 * mcp-e2e-chain.mjs — 通过 Iris Client 内嵌 MCP Server 驱动的全链路 E2E 剧本。
 *
 * 前置:
 *   1. Iris Client(bin/client.exe)已启动且 GUI 已登录 TeamServer;
 *   2. MCP HTTP 已监听(默认 127.0.0.1:9333,env IRIS_MCP_LISTEN)。
 *
 * 剧本:
 *   1. get_client_status 确认凭据就绪;
 *   2. create_listener 建 external http 监听器(同名 started 则复用);
 *   3. generate_beacon 生成真实 C-beacon(windows/amd64/exe/stagerless,默认 c);
 *   4. 未设置 BEACON_PATH 时到此为止(工具链验证);设置后:
 *      脚本以 detached 进程拉起该 exe(Agent/脚本自有 shell 权限),
 *      wait_for_event(BEACON_REGISTERED) 确认上线,
 *      send_beacon_command(WHOAMI) 后按 task/beacon 过滤等待结果事件;
 *   5. 打印 PASS 摘要与清理提示(进程/载荷需调用方或人工处理)。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const MCP = process.env.IRIS_MCP_ADDR || 'http://127.0.0.1:9333'
const LISTENER_NAME = process.env.E2E_LISTENER_NAME || 'e2e-mcp'
const BIND_PORT = Number(process.env.E2E_BIND_PORT || 19443)
const BEACON_PATH = process.env.BEACON_PATH || ''
const REG_TIMEOUT = Number(process.env.E2E_REG_TIMEOUT_MS || 90000)
const CMD_TIMEOUT = Number(process.env.E2E_CMD_TIMEOUT_MS || 60000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function log(...a) { console.log('[mcp-e2e]', ...a) }
function fail(msg) { console.error('[mcp-e2e] FAIL:', msg); process.exit(1) }

// ── 最小 MCP 客户端(Streamable HTTP + 会话头) ──────────────────
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
  if (status !== 200) throw new Error(`tools/call ${name} HTTP ${status}: ${body.slice(0, 200)}`)
  const text = extractJSON(body)
  try { return JSON.parse(text) } catch { return { _raw: text } }
}

// ── 握手 ────────────────────────────────────────────────────────
{
  const init = await post({
    jsonrpc: '2.0', id: ++seq, method: 'initialize',
    params: {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'mcp-e2e-chain', version: '0' },
    },
  })
  if (init.status !== 200 || !init.body.includes('iris-client')) {
    fail(`MCP 握手失败: ${init.status} ${init.body.slice(0, 200)}`)
  }
  log('initialize ✓ server=iris-client session=' + sid)
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
}

// ── 步骤 1: 会话状态 ─────────────────────────────────────────────
{
  const st = await callTool('get_client_status')
  if (!st.logged_in) fail(`GUI 未登录(ws_status=${st.ws_status}),先人工登录一次`)
  log(`status ✓ logged_in api_base=${st.api_base} ws=${st.ws_status}`)
}

// ── 步骤 2: 建/复用监听器 ────────────────────────────────────────
let listenerID
{
  const list = await callTool('list_listeners')
  const arr = Array.isArray(list) ? list : []
  const same = arr.find((l) => l.name === LISTENER_NAME && ['started', 'starting'].includes(l.status))
  if (same) {
    listenerID = same.id
    log(`listener 复用 ✓ ${LISTENER_NAME} id=${same.id} status=${same.status}`)
  } else {
    const created = await callTool('create_listener', {
      name: LISTENER_NAME,
      protocol: 'http',
      listener_type: 'external',
      host: '127.0.0.1',
      port: BIND_PORT,
      callback_host: '127.0.0.1',
      callback_port: BIND_PORT,
    })
    listenerID = created?.id ?? created?.data?.id ?? created?.listener_id
    if (!listenerID) {
      // 建立成功但响应未回显 id 时回查列表
      await sleep(800)
      const again = await callTool('list_listeners')
      const arr2 = Array.isArray(again) ? again : []
      listenerID = arr2.find((l) => l.name === LISTENER_NAME)?.id
    }
    if (!listenerID) fail(`create_listener 未获得 id: ${JSON.stringify(created).slice(0, 300)}`)
    log(`listener create ✓ name=${LISTENER_NAME} id=${listenerID}`)
  }
}

// ── 步骤 3: 生成真实 beacon ──────────────────────────────────────
let beaconExe = BEACON_PATH
if (!beaconExe || !existsSync(beaconExe)) {
  const gen = await callTool('generate_beacon', {
    listener_id: listenerID,
    os: 'windows', arch: 'amd64', format: 'exe',
    stage_mode: 'stagerless', beacon_type: process.env.E2E_BEACON_TYPE || 'c',
  })
  if (!gen.path || !existsSync(gen.path)) fail(`载荷未落盘: ${JSON.stringify(gen).slice(0, 300)}`)
  beaconExe = gen.path
  log(`generate ✓ path=${beaconExe} sha256=${String(gen.sha256 || '').slice(0, 16)}… size=${gen.size}`)
}

// ── 步骤 4~5: 真实上线与命令闭环 ─────────────────────────────────
const baseline = await callTool('list_recent_events', {})
const seqBase = Number(baseline.last_seq ?? 0)
log(`events baseline last_seq=${seqBase}`)

log(`spawn beacon(独立进程): ${beaconExe}`)
spawn(beaconExe, [], { detached: true, stdio: 'ignore' }).unref()

function findKeyDeep(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  for (const v of Object.values(obj)) {
    const hit = findKeyDeep(v, keys)
    if (hit !== undefined) return hit
  }
  return undefined
}

const reg = await callTool('wait_for_event', {
  type_prefix: 'BEACON_REG', since_seq: seqBase,
  timeout_ms: REG_TIMEOUT,
}).catch((e) => ({ _err: String(e) }))
if (!reg || reg._err) fail(`未捕获上线事件: ${reg?._err ?? '无返回'}`)
log(`register ✓ payload=${JSON.stringify(reg).slice(0, 220)}`)

// 上线事件里应携带 beacon_id(实测嵌套于 payload.data 下),深搜兜底
let beaconID = findKeyDeep(reg, ['beacon_id', 'beaconId'])
if (!beaconID) {
  const blist = await callTool('list_beacons')
  const barr = Array.isArray(blist) ? blist : []
  beaconID = barr[0]?.beacon_id ?? barr[0]?.id
  log(`beacon 回查 ✓ → ${beaconID}`)
}
if (!beaconID) fail('无法确定新上线 beacon 的 id')

// 先记发送前的游标,便于结果过滤
const preCmd = await callTool('list_recent_events', {})
const cmdSeqBase = Number(preCmd.last_seq ?? seqBase)

// 基线游标必须在发送前取,避免结果事件在两次调用间隙到达后被 since_seq 排除
const cmdBaseline = Number((await callTool('list_recent_events', {})).last_seq ?? 0)
const sent = await callTool('send_beacon_command', { beacon_id: beaconID, command: 'WHOAMI' })
log(`send WHOAMI ✓ ack=${JSON.stringify(sent).slice(0, 160)}`)

// 实测 ack 不回传任务号——结果事件里才有;先按 beacon 过滤等待 COMMAND_EVENT。
const resultEv = await callTool('wait_for_event', {
  type_prefix: 'COMMAND',
  beacon_id: String(beaconID),
  since_seq: cmdBaseline,
  timeout_ms: CMD_TIMEOUT,
})
const outText = findKeyDeep(resultEv, ['text'])
if (!outText || !String(outText).trim()) fail(`结果事件缺输出文本: ${JSON.stringify(resultEv).slice(0, 300)}`)
console.log(`[mcp-e2e] whoami ✓ 输出="${outText}"`)

console.log('\n[mcp-e2e] SMOKE CHAIN PASSED')
console.log(`[mcp-e2e] 清理提示: 结束 beacon 进程(镜像名约 ${(beaconExe.split(/[\\/]/).pop())})并删除 ${beaconExe}`)
