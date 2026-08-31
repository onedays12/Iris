#!/usr/bin/env node
/**
 * tunnel-dialog-check.mjs — 验证「代理与穿透 → 连接」对话框渲染修复
 *
 * 背景: TunnelDetailDialog 通过 Teleport 挂到 body,父页面 ProxyPivotPage 的
 * scoped 样式无法命中,导致对话框只有裸文字。修复方式:把对话框所需样式
 * 移入 TunnelDetailDialog.vue 自带的 <style scoped>。本脚本在真机上验证
 * 对话框渲染出带样式的卡片(overlay 定位 + 卡片背景/圆角/内边距)。
 *
 * ── 用法 ──────────────────────────────────────────────────────────────
 *   node scripts/tunnel-dialog-check.mjs run        # 注入调试端口+构建+启动+验证
 *   node scripts/tunnel-dialog-check.mjs smoke      # 仅验证(应用已带调试端口运行)
 *   node scripts/tunnel-dialog-check.mjs cleanup    # 还原 main.go + 重建干净生产版
 *
 * 前置: TeamServer 在 https://127.0.0.1:8080(凭据默认 admin/123456)。
 * 若隧道列表为空(无 tunnel 记录),则无法触发「连接」按钮,脚本输出 SKIP
 * 并以退出码 2 结束(此时以构建产物 CSS 检查为兜底验证)。
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  console.log('[tunnel-dialog-check]', ...args)
}

function fail(message) {
  console.error('[tunnel-dialog-check] FAIL:', message)
  process.exit(1)
}

const sleep = (ms) => new Promise((resolveIt) => setTimeout(resolveIt, ms))

function ps(command, options = {}) {
  return spawnSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: options.cwd || ROOT,
    shell: false,
    encoding: 'utf8',
  })
}

// ─── CDP 客户端 ───────────────────────────────────────────────────────

async function findPageTarget() {
  let targets
  try {
    const resp = await fetch(`${CDP_HTTP}/json/list`)
    targets = await resp.json()
  } catch (err) {
    fail(`无法访问 CDP ${CDP_HTTP}: ${err.message}`)
  }
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  const page = pages.find((t) => !t.url.startsWith('devtools://')) || pages[0]
  if (!page) fail(`CDP 未发现页面 target`)
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

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
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

// ─── 验证流程 ─────────────────────────────────────────────────────────

async function ensureLogin(client) {
  const hash = await evaluate(client, 'location.hash')
  if (hash && hash.startsWith('#/') && hash !== '#/login') return
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
  log(`登录完成,路由: ${await evaluate(client, 'location.hash')}`)
}

/** 核心断言:打开「连接」对话框并检查卡片样式是否真实渲染。 */
async function checkTunnelDialog(client) {
  await poll(client, `document.readyState === 'complete'`)
  await ensureLogin(client)

  await evaluate(client, `location.hash = '#/proxy'`)
  await poll(client, `location.hash === '#/proxy' && Boolean(document.querySelector('.proxy-pivot-page'))`, 15000)
  // 等隧道列表加载完成(初次 fetchTunnels 或空态)
  await sleep(2500)

  const rows = await evaluate(client, `document.querySelectorAll('.proxy-pivot-page .data-table tbody tr').length`)
  log(`隧道列表行数: ${rows}`)
  if (!rows) {
    log('SKIP: 隧道列表为空,无法触发「连接」对话框(需要至少一条 tunnel 记录)')
    return 'SKIP'
  }

  // 点第一行第一个 action-btn(即「连接」)
  const clicked = await evaluate(client, `(() => {
    const row = document.querySelector('.proxy-pivot-page .data-table tbody tr')
    const btn = row && row.querySelector('button.action-btn')
    if (btn) { btn.click(); return true }
    return false
  })()`)
  if (!clicked) fail('未找到「连接」按钮')

  // 对话框卡片出现(Teleport 到 body)
  await poll(client, `Boolean(document.querySelector('.modal-overlay.proxy-pivot-modal .detail-card'))`, 10000)
  log('✓ 「连接」对话框已渲染到 DOM')

  // 断言关键样式真实生效(修复前:卡片无背景/无圆角/无内边距,只剩文字)
  const style = await evaluate(client, `(() => {
    const overlay = document.querySelector('.modal-overlay.proxy-pivot-modal')
    const card = overlay && overlay.querySelector('.detail-card')
    if (!card) return null
    const os = getComputedStyle(overlay)
    const cs = getComputedStyle(card)
    const header = card.querySelector('.modal-header')
    const body = card.querySelector('.detail-body')
    const chs = header ? getComputedStyle(header) : null
    const bds = body ? getComputedStyle(body) : null
    return {
      overlayPosition: os.position,
      overlayZIndex: os.zIndex,
      cardBackground: cs.backgroundColor,
      cardRadius: cs.borderRadius,
      cardBorder: cs.borderTopWidth + ' ' + cs.borderTopStyle,
      cardWidth: cs.width,
      headerBackground: chs ? chs.backgroundColor : null,
      headerPadding: chs ? chs.padding : null,
      bodyPadding: bds ? bds.padding : null,
      footerExists: Boolean(card.querySelector('.modal-footer')),
      title: (card.querySelector('.modal-title h3') || {}).textContent || '',
      metricCards: card.querySelectorAll('.metric-card').length,
      channelSections: card.querySelectorAll('.channel-section').length,
    }
  })()`)
  if (!style) fail('无法读取对话框样式快照')

  const ok =
    style.overlayPosition === 'fixed' &&
    style.cardBackground !== 'rgba(0, 0, 0, 0)' &&
    style.cardRadius !== '0px' &&
    style.cardBorder.includes('solid') &&
    style.headerPadding && style.headerPadding !== '0px' &&
    style.bodyPadding && style.bodyPadding !== '0px' &&
    style.footerExists

  log('对话框样式快照:', JSON.stringify(style, null, 2))
  if (!ok) fail('对话框关键样式未生效(overlay/卡片布局丢失),修复未生效')

  // 关闭对话框
  await evaluate(client, `(() => {
    const btn = document.querySelector('.detail-card .close-btn')
    if (btn) btn.click()
    return Boolean(btn)
  })()`)
  await poll(client, `!document.querySelector('.modal-overlay.proxy-pivot-modal .detail-card')`, 10000)
  log('✓ 对话框可正常关闭')

  return 'PASS'
}

// ─── run / cleanup 阶段 ───────────────────────────────────────────────

function mainGoHasDebugFlag() {
  const mainGo = resolve(ROOT, 'main.go')
  return readFileSync(mainGo, 'utf8').includes(DEBUG_FLAG)
}

function injectDebugFlag() {
  if (mainGoHasDebugFlag()) return
  const mainGo = resolve(ROOT, 'main.go')
  const content = readFileSync(mainGo, 'utf8')
  const anchor = '"--ignore-certificate-errors"'
  if (!content.includes(anchor)) fail(`main.go 未找到注入锚点 ${anchor}`)
  const updated = content.replace(anchor, `${anchor},\n\t\t${JSON.stringify(DEBUG_FLAG)}`)
  writeFileSync(mainGo, updated)
  log(`已注入 ${DEBUG_FLAG} 到 main.go`)
}

function killApp() {
  ps(`Stop-Process -Name client -Force -ErrorAction SilentlyContinue; exit 0`)
}

function killOrphanWebView() {
  log('清理孤儿 WebView2 进程…')
  const result = ps(`Stop-Process -Name msedgewebview2 -Force -ErrorAction SilentlyContinue; exit 0`)
  if (result.status !== 0) fail('清理 WebView2 进程失败')
}

function wailsBuild() {
  log('wails3 build …(可能需要几分钟)')
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
  fail('等待 CDP 超时')
}

async function phaseRun() {
  injectDebugFlag()
  killApp()
  killOrphanWebView()
  wailsBuild()
  launchApp()
  await waitForCdp()
  const page = await findPageTarget()
  log(`连接页面: ${page.url}`)
  const client = await connectCdp(page.webSocketDebuggerUrl)
  try {
    const result = await checkTunnelDialog(client)
    log(`RESULT: ${result}`)
    if (result === 'SKIP') process.exit(2)
  } finally {
    client.close()
  }
  log('提示: 验证完成后请执行 node scripts/tunnel-dialog-check.mjs cleanup 还原 main.go')
}

function phaseCleanup() {
  killApp()
  killOrphanWebView()
  const result = ps(`git checkout -- main.go; git status --short`)
  if (result.status !== 0) fail('git checkout -- main.go 失败')
  wailsBuild()
  const status = ps(`git status --short`)
  console.log(status.stdout || '(工作树干净)')
  log('cleanup 完成:main.go 已还原,bin/client.exe 已重建为干净生产版')
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
      const result = await checkTunnelDialog(client)
      log(`RESULT: ${result}`)
      if (result === 'SKIP') process.exit(2)
    } finally {
      client.close()
    }
    return
  }
  fail(`未知阶段: ${phase}(可选: run | smoke | cleanup)`)
}

main().catch((err) => fail(err.stack || err.message))
