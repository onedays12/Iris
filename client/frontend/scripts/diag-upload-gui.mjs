#!/usr/bin/env node
/**
 * diag-upload-gui.mjs — CDP 驱动的"上传进度可见性"真机验收。
 *
 * 前置: client.exe 已带 --remote-debugging-port=9222 运行(用 e2e-smoke 的 run 模式准备),
 *       TeamServer 已运行,beacon 可自动部署(diag-upload-progress.mjs 内置部署分支)。
 *
 * 流程: 登录(如未登录) → 拉起 MCP 上传复现(子进程) → 轮询页面文本:
 *   - 事件面板出现 "N / 20 chunks"(N≥1,修复前恒为 0);
 *   - 出现 "上传完成";
 *   - 全程不得出现 "0 / 20 chunks"。
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const FRONTEND = dirname(fileURLToPath(import.meta.url))
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222'
const USERNAME = process.env.TEAMSERVER_USER || 'admin'
const PASSWORD = process.env.TEAMSERVER_PASS || '123456'
const SERVER = process.env.TEAMSERVER || 'https://127.0.0.1:8080'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function log(...a) { console.log('[gui-verify]', ...a) }
function fail(m) { console.error('[gui-verify] FAIL:', m); process.exit(1) }

async function findPageTarget() {
  const resp = await fetch(`${CDP_HTTP}/json/list`)
  const targets = await resp.json()
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  const page = pages.find((t) => !t.url.startsWith('devtools://')) || pages[0]
  if (!page) fail('CDP 未发现页面 target')
  return page
}
function connectCdp(wsUrl) {
  return new Promise((resolveIt, reject) => {
    const ws = new WebSocket(wsUrl)
    const client = {
      ws,
      id: 0, pending: new Map(),
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const callId = ++this.id
          this.pending.set(callId, { resolve: res, reject: rej })
          this.ws.send(JSON.stringify({ id: callId, method, params }))
        })
      },
      close() { this.ws.close() },
    }
    ws.on('open', () => resolveIt(client))
    ws.on('error', reject)
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.id && client.pending.has(msg.id)) {
        const e = client.pending.get(msg.id)
        client.pending.delete(msg.id)
        msg.error ? e.reject(new Error(msg.error.message)) : e.resolve(msg.result)
      }
    })
  })
}
async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(`页面求值异常: ${result.exceptionDetails.text}`)
  return result.result.value
}
async function poll(client, expression, timeoutMs = 20000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await evaluate(client, expression)
    if (last) return last
    await sleep(intervalMs)
  }
  return null
}

const page = await findPageTarget()
log('页面:', page.url)
const client = await connectCdp(page.webSocketDebuggerUrl)

// ── 登录(如需要) ────────────────────────────────────────────────
const hash = await evaluate(client, 'location.hash')
if (!hash || hash === '#/login' || hash === '') {
  log('登录中…')
  await poll(client, `Boolean(document.querySelector('form.login-form'))`)
  await evaluate(client, `(() => {
    const inputs = document.querySelectorAll('form.login-form input')
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (inputs[0]) set(inputs[0], ${JSON.stringify(SERVER)})
    if (inputs[1]) set(inputs[1], ${JSON.stringify(USERNAME)})
    if (inputs[2]) set(inputs[2], ${JSON.stringify(PASSWORD)})
    document.querySelector('form.login-form').requestSubmit()
    return true
  })()`)
  const ok = await poll(client, `location.hash.startsWith('#/') && location.hash !== '#/login'`, 20000)
  if (!ok) fail('登录未完成')
  log('登录完成:', await evaluate(client, 'location.hash'))
} else {
  log('已登录:', hash)
}
await evaluate(client, `location.hash = '#/dashboard'`)
await sleep(1000)

// ── 拉起 MCP 上传复现(子进程,stdout 尾部随结果打印) ────────────
log('启动 MCP 上传复现子进程…')
const child = spawn('node', [resolve(FRONTEND, 'diag-upload-progress.mjs')], { cwd: FRONTEND })
let childTail = ''
child.stdout.on('data', (d) => { childTail += String(d) })
child.stderr.on('data', (d) => { childTail += String(d) })
const childDone = new Promise((r) => child.on('close', (code) => r(code)))

// ── 轮询页面文本:进度行 / 完成行 / 违规 0/20 ────────────────────
const found = { progressLines: new Set(), completed: false, zeroProgress: false }
const deadline = Date.now() + 120000
while (Date.now() < deadline) {
  const text = await evaluate(client, 'document.body.innerText')
  const lines = String(text).split('\n').map((s) => s.trim())
  for (const ln of lines) {
    const m = ln.match(/(\d+) \/ 20 chunks/)
    if (m) {
      found.progressLines.add(ln)
      if (Number(m[1]) === 0) found.zeroProgress = true
    }
    if (ln.includes('上传完成')) found.completed = true
  }
  if (found.completed && found.progressLines.size > 0) break
  await sleep(500)
}
const childCode = await childDone

console.log('\n[gui-verify] 事件面板捕获的进度行样例:')
for (const ln of [...found.progressLines].slice(0, 5)) console.log('   ', ln)
console.log('[gui-verify] completed =', found.completed, '| zeroProgress =', found.zeroProgress,
  '| 独立进度行数 =', found.progressLines.size)
console.log('[gui-verify] 上传复现子进程 exit =', childCode, '尾部:')
console.log(childTail.split('\n').slice(-6).join('\n'))

let pass = true
if (found.zeroProgress) { console.error('[gui-verify] ✗ 仍出现 0 / 20 chunks'); pass = false }
if (!found.completed) { console.error('[gui-verify] ✗ 未捕获 上传完成'); pass = false }
if (found.progressLines.size === 0) { console.error('[gui-verify] ✗ 未捕获任何 chunks 进度行'); pass = false }
console.log(pass ? '\n[gui-verify] GUI UPLOAD VISIBILITY PASSED' : '\n[gui-verify] GUI UPLOAD VISIBILITY FAILED')
client.close()
process.exit(pass ? 0 : 1)
