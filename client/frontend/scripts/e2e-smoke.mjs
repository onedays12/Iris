#!/usr/bin/env node
/**
 * e2e-smoke.mjs — Wails C2 客户端 CDP 真机冒烟验收脚本
 *
 * 通过 WebView2 远程调试协议(CDP)驱动真机应用执行验收流程：
 *   1. 登录（如尚未登录）。
 *   2. 逐页可加载断言：dashboard / topology / listener / proxy /
 *      screenshots / downloads / plugins / help，每页断言页面根节点与
 *      关键元素存在（空数据时接受空态）。
 *   3. 危险操作检查：监听器页点第一行「删除」→ 断言 danger 确认框弹出
 *      → 点「取消」→ 断言弹窗关闭且监听器数量不变。
 *
 * 约定：本脚本永远只点「取消」，绝不确认删除，避免破坏用户环境里的真实监听器。
 *
 * ── 用法 ──────────────────────────────────────────────────────────────
 *   node scripts/e2e-smoke.mjs            # 冒烟：应用已带调试端口运行
 *   node scripts/e2e-smoke.mjs run        # 准备 + 启动 + 冒烟
 *   node scripts/e2e-smoke.mjs cleanup    # 还原 main.go + 重建干净生产版
 *
 * ── run 前置（一次性人工步骤，脚本会校验） ──────────────────────────────
 *   1. 在 main.go 的 WindowsWindow.AdditionalLaunchArgs 里临时加入
 *      "--remote-debugging-port=9222"（验证完成后必须还原）。
 *   2. 确保 TeamServer 在 https://127.0.0.1:8080 运行（凭据默认 admin/123456）。
 *
 * ── 环境备注（已踩坑） ─────────────────────────────────────────────────
 *   WebView2 会复用陈旧浏览器进程导致 CDP 参数不生效；run 阶段会先
 *   Stop-Process -Name msedgewebview2 -Force 清掉孤儿进程再构建启动。
 *   cleanup 会 git checkout -- main.go 并 wails3 build 重建干净生产版
 *   bin/client.exe。
 *
 * 依赖：Node 18+（全局 fetch）与 frontend/node_modules/ws。
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const FRONTEND = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(FRONTEND, '..', '..')
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222'
const SERVER = process.env.TEAMSERVER || 'https://127.0.0.1:8080'
const USERNAME = process.env.TEAMSERVER_USER || 'admin'
const PASSWORD = process.env.TEAMSERVER_PASS || '123456'
const DEBUG_FLAG = '--remote-debugging-port=9222'

// ─── 基础工具 ─────────────────────────────────────────────────────────

function log(...args) {
  console.log('[e2e-smoke]', ...args)
}

function fail(message) {
  console.error('[e2e-smoke] FAIL:', message)
  process.exit(1)
}

const sleep = (ms) => new Promise((resolveIt) => setTimeout(resolveIt, ms))

function ps(command, args, options = {}) {
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: options.cwd || ROOT,
    shell: false,
    encoding: 'utf8',
  })
  return result
}

// ─── CDP 客户端 ───────────────────────────────────────────────────────

async function findPageTarget() {
  const listUrl = `${CDP_HTTP}/json/list`
  let targets
  try {
    const resp = await fetch(listUrl)
    targets = await resp.json()
  } catch (err) {
    fail(`无法访问 CDP ${listUrl}（应用是否已带调试端口运行？）: ${err.message}`)
  }
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  const page = pages.find((t) => !t.url.startsWith('devtools://')) || pages[0]
  if (!page) fail(`CDP 未发现页面 target（${pages.length} 个 page）`)
  return page
}

function connectCdp(wsUrl) {
  return new Promise((resolveIt, reject) => {
    const ws = new WebSocket(wsUrl)
    const client = {
      ws,
      id: 0,
      pending: new Map(),
      send(method, params = {}) {
        return new Promise((resolveSend, rejectSend) => {
          const callId = ++this.id
          this.pending.set(callId, { resolve: resolveSend, reject: rejectSend })
          this.ws.send(JSON.stringify({ id: callId, method, params }))
        })
      },
      close() {
        this.ws.close()
      },
    }
    ws.on('open', () => resolveIt(client))
    ws.on('error', (err) => reject(err))
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.id && client.pending.has(msg.id)) {
        const entry = client.pending.get(msg.id)
        client.pending.delete(msg.id)
        if (msg.error) entry.reject(new Error(msg.error.message))
        else entry.resolve(msg.result)
      }
    })
  })
}

// ─── 页面求值 ─────────────────────────────────────────────────────────

async function evaluate(client, expression, { awaitPromise = true } = {}) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  })
  if (result.exceptionDetails) {
    throw new Error(`页面求值异常: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails.exception)}`)
  }
  return result.result.value
}

async function poll(client, expression, timeoutMs = 15000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  let lastValue
  while (Date.now() < deadline) {
    lastValue = await evaluate(client, expression)
    if (lastValue) return lastValue
    await sleep(intervalMs)
  }
  fail(`等待超时: ${expression}（最后值: ${JSON.stringify(lastValue)}）`)
}

// ─── 冒烟流程 ─────────────────────────────────────────────────────────

/** 逐页断言场景：每页导航后等待根节点，再断言关键元素存在（空数据时接受空态）。 */
const PAGE_CHECKS = [
  { route: '#/dashboard', name: 'dashboard', ready: '.dashboard-page', key: `.dashboard-page .agent-table-wrapper, .dashboard-page .empty-state` },
  { route: '#/topology', name: 'topology', ready: '.topology-page', key: `.topology-page .topo-canvas, .topology-page .empty-state` },
  { route: '#/listener', name: 'listener', ready: '.listener-page', key: `.listener-page .listener-list, .listener-page .empty-state` },
  { route: '#/proxy', name: 'proxy', ready: '.proxy-pivot-page', key: `.proxy-pivot-page .data-table, .proxy-pivot-page .state-line` },
  { route: '#/screenshots', name: 'screenshots', ready: '.screenshots-page', key: `.screenshots-page .data-table, .screenshots-page .empty-cell` },
  { route: '#/downloads', name: 'downloads', ready: '.page-container', key: `.page-container .data-table, .page-container .empty-cell` },
  { route: '#/plugins', name: 'plugins', ready: '.plugin-page', key: `.plugin-page .panel-status` },
  { route: '#/help', name: 'help', ready: '.help-page', key: `.help-page .help-body` },
]

async function ensureLogin(client) {
  const hash = await evaluate(client, 'location.hash')
  log(`当前路由: ${hash || '(login)'}`)
  if (hash && hash.startsWith('#/') && hash !== '#/login') {
    log('已处于登录后状态，跳过登录')
    return
  }
  log(`登录 ${USERNAME} @ ${SERVER}`)
  await poll(client, `Boolean(document.querySelector('form.login-form'))`)
  await evaluate(client, `(() => {
    const inputs = document.querySelectorAll('form.login-form input')
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (inputs[0]) setValue(inputs[0], ${JSON.stringify(SERVER)})
    if (inputs[1]) setValue(inputs[1], ${JSON.stringify(USERNAME)})
    if (inputs[2]) setValue(inputs[2], ${JSON.stringify(PASSWORD)})
    document.querySelector('form.login-form').requestSubmit()
    return true
  })()`)
  await poll(client, `location.hash.startsWith('#/') && location.hash !== '#/login'`, 20000)
  log(`登录完成，路由: ${await evaluate(client, 'location.hash')}`)
}

async function checkPages(client) {
  const results = []
  for (const page of PAGE_CHECKS) {
    try {
      await evaluate(client, `location.hash = ${JSON.stringify(page.route)}`)
      await poll(client, `location.hash === ${JSON.stringify(page.route)} && Boolean(document.querySelector(${JSON.stringify(page.ready)}))`, 15000)
      // 关键元素可能晚于根节点渲染（如数据加载完成后才出现表格），同样轮询等待
      await poll(client, `Boolean(document.querySelector(${JSON.stringify(page.key)}))`, 10000)
      log(`✓ 页面 [${page.name}] 加载正常`)
      results.push(page.name)
    } catch (err) {
      log(`✗ 页面 [${page.name}] 失败: ${err.message}`)
      results.push(`FAIL:${page.name}`)
    }
  }
  return results
}

async function checkListenerDeleteDialog(client) {
  // 切到监听器页并等待行渲染
  await evaluate(client, `location.hash = '#/listener'`)
  await poll(client, `location.hash === '#/listener' && Boolean(document.querySelector('.listener-list'))`, 15000)
  await poll(client, `document.querySelectorAll('.listener-list .data-table tbody tr').length > 0`, 15000)

  const countBefore = await evaluate(client, `document.querySelectorAll('.listener-list .data-table tbody tr').length`)
  log(`监听器行数（删除前）: ${countBefore}`)

  // 点第一行删除按钮
  const deleteButtonFound = await evaluate(client, `(() => {
    const row = document.querySelector('.listener-list .data-table tbody tr')
    const btn = row && row.querySelector('button.danger-hover')
    if (btn) { btn.click(); return true }
    return false
  })()`)
  if (!deleteButtonFound) fail('未找到第一行的删除按钮 (.danger-hover)')

  // 断言 danger 确认框弹出
  await poll(client, `Boolean(document.querySelector('.confirm-overlay'))`, 10000)
  const dangerCard = await evaluate(client, `Boolean(document.querySelector('.confirm-card.danger'))`)
  if (!dangerCard) fail('确认框已弹出但不是 danger 类型')
  const dialogTitle = await evaluate(client, `document.querySelector('.confirm-card h3')?.textContent || ''`)
  log(`✓ danger 确认框弹出: 「${dialogTitle}」`)

  // 点「取消」
  await evaluate(client, `(() => {
    const cancel = document.querySelector('.confirm-footer .btn-ghost')
    if (cancel) cancel.click()
    return Boolean(cancel)
  })()`)

  // 断言弹窗关闭且数量不变
  await poll(client, `!document.querySelector('.confirm-overlay')`, 10000)
  const countAfter = await evaluate(client, `document.querySelectorAll('.listener-list .data-table tbody tr').length`)
  log(`监听器行数（取消后）: ${countAfter}`)
  if (countAfter !== countBefore) {
    fail(`监听器数量变化（${countBefore} → ${countAfter}），取消删除后不应变化`)
  }
  log('✓ 取消后弹窗关闭，监听器数量未变')
}

async function runSmoke(client) {
  log('等待页面就绪…')
  await poll(client, `document.readyState === 'complete'`)

  await ensureLogin(client)

  const pageResults = await checkPages(client)
  await checkListenerDeleteDialog(client)

  const failed = pageResults.filter((r) => r.startsWith('FAIL:'))
  if (failed.length) {
    fail(`页面检查未全部通过: ${failed.join(', ')}`)
  }
  log(`SMOKE PASSED（页面 ${pageResults.length}/${PAGE_CHECKS.length} 通过 + 危险操作检查通过）`)
}

// ─── run / cleanup 阶段 ───────────────────────────────────────────────

function mainGoHasDebugFlag() {
  const mainGo = resolve(ROOT, 'main.go')
  return readFileSync(mainGo, 'utf8').includes(DEBUG_FLAG)
}

function killOrphanWebView() {
  log('清理孤儿 WebView2 进程…')
  const result = ps(`Stop-Process -Name msedgewebview2 -Force -ErrorAction SilentlyContinue; exit 0`)
  if (result.status !== 0) fail('清理 WebView2 进程失败')
}

function wailsBuild() {
  log('wails3 build …（可能需要几分钟）')
  const result = ps(`wails3 build 2>&1 | Select-Object -Last 5; exit $LASTEXITCODE`)
  if (result.status !== 0) {
    console.error(result.stdout || '')
    fail('wails3 build 失败')
  }
  log('✓ wails3 build 完成')
}

function launchApp() {
  log('启动 bin/client.exe …')
  const exe = resolve(ROOT, 'bin', 'client.exe')
  if (!existsSync(exe)) fail(`未找到 ${exe}`)
  spawn(exe, [], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref()
}

function killApp() {
  log('关闭应用进程…')
  ps(`Stop-Process -Name client -Force -ErrorAction SilentlyContinue; exit 0`)
}

async function waitForCdp() {
  log(`等待 CDP ${CDP_HTTP} …`)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${CDP_HTTP}/json/version`)
      if (resp.ok) return
    } catch {
      /* 尚未就绪 */
    }
    await sleep(500)
  }
  fail('等待 CDP 超时（WebView2 调试端口未开启）')
}

async function phaseRun() {
  if (!mainGoHasDebugFlag()) {
    fail(`main.go 未包含 ${DEBUG_FLAG}，请先在 WindowsWindow.AdditionalLaunchArgs 临时注入后重试（验证完必须还原）`)
  }
  killOrphanWebView()
  wailsBuild()
  killApp()
  launchApp()
  await waitForCdp()
  const page = await findPageTarget()
  log(`连接页面: ${page.url}`)
  const client = await connectCdp(page.webSocketDebuggerUrl)
  try {
    await runSmoke(client)
  } finally {
    client.close()
  }
  log('提示: 验证完成后请执行 node scripts/e2e-smoke.mjs cleanup 还原 main.go 并重建干净生产版')
}

function phaseCleanup() {
  killApp()
  killOrphanWebView()
  const result = ps(`git checkout -- main.go; git status --short`)
  if (result.status !== 0) fail('git checkout -- main.go 失败')
  wailsBuild()
  ps(`git checkout -- frontend/bindings 2>$null; exit 0`)
  const status = ps(`git status --short`)
  console.log(status.stdout || '(工作树干净)')
  log('cleanup 完成：main.go 已还原，bin/client.exe 已重建为干净生产版')
}

// ─── 入口 ─────────────────────────────────────────────────────────────

const phase = process.argv[2] || 'smoke'

async function main() {
  if (phase === 'cleanup') {
    phaseCleanup()
    return
  }
  if (phase === 'run') {
    await phaseRun()
    return
  }
  if (phase === 'smoke') {
    const page = await findPageTarget()
    log(`连接页面: ${page.url}`)
    const client = await connectCdp(page.webSocketDebuggerUrl)
    try {
      await runSmoke(client)
    } finally {
      client.close()
    }
    return
  }
  fail(`未知阶段: ${phase}（可选: smoke | run | cleanup）`)
}

main().catch((err) => fail(err.stack || err.message))
