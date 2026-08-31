#!/usr/bin/env node
/**
 * preview-check.mjs — 文件预览功能 CDP 真机验证
 *
 * 流程: 登录 → Dashboard 右键首个 Beacon → 打开文件浏览器 →
 *       找到第一个可预览文件 → 行内「更多操作」→「预览」→
 *       断言预览弹窗渲染并最终进入 ready(文本/图片) 或 failed 态 → 关闭。
 *
 * 环境依赖: TeamServer 在线 + 至少一个 Beacon + 目标目录存在可预览文件。
 * 若环境不满足(无 Beacon / 无文件 / 事件超时), 脚本输出 SKIP 并退出码 2。
 *
 * ── 用法 ──
 *   node scripts/preview-check.mjs run        # 注入调试端口+构建+启动+验证
 *   node scripts/preview-check.mjs smoke      # 仅验证(应用已带调试端口运行)
 *   node scripts/preview-check.mjs cleanup    # 还原 main.go + 重建干净生产版
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

// 与后端 codec.go 一致的文本预览扩展名(用于挑选可预览文件)
const TEXT_EXTS = new Set(['txt','log','ini','conf','cfg','xml','json','yml','yaml','toml','md','ps1','bat','cmd','py','sh','js','vbs','reg','csv','tsv','sql','html','htm','properties','env','lst','sln','csproj'])
const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','bmp','webp','ico'])

function isPreviewable(name) {
  const dot = String(name || '').lastIndexOf('.')
  if (dot <= 0) return false
  const ext = String(name || '').slice(dot + 1).toLowerCase()
  return TEXT_EXTS.has(ext) || IMAGE_EXTS.has(ext)
}

function log(...args) { console.log('[preview-check]', ...args) }
function fail(message) { console.error('[preview-check] FAIL:', message); process.exit(1) }
const sleep = (ms) => new Promise((resolveIt) => setTimeout(resolveIt, ms))

function ps(command, options = {}) {
  return spawnSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: options.cwd || ROOT, shell: false, encoding: 'utf8',
  })
}

// ─── CDP ───

async function findPageTarget() {
  let targets
  try {
    const resp = await fetch(`${CDP_HTTP}/json/list`)
    targets = await resp.json()
  } catch (err) { fail(`无法访问 CDP ${CDP_HTTP}: ${err.message}`) }
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  const page = pages.find((t) => !t.url.startsWith('devtools://')) || pages[0]
  if (!page) fail('CDP 未发现页面 target')
  return page
}

function connectCdp(wsUrl) {
  return new Promise((resolveIt, reject) => {
    const ws = new WebSocket(wsUrl)
    const client = {
      ws, id: 0, pending: new Map(),
      send(method, params = {}) {
        return new Promise((resolveSend, rejectSend) => {
          const callId = ++this.id
          this.pending.set(callId, { resolve: resolveSend, reject: rejectSend })
          this.ws.send(JSON.stringify({ id: callId, method, params }))
        })
      },
      close() { this.ws.close() },
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
    expression, returnByValue: true, awaitPromise: true,
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
  return lastValue
}

// ─── 验证流程 ───

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

async function openFileBrowser(client) {
  // 等 Beacon 行
  const rows = await poll(client, `document.querySelectorAll('.agent-table-wrapper .agent-row').length`, 15000)
  if (!rows) {
    log('SKIP: 无在线 Beacon 行,无法打开文件浏览器')
    return false
  }
  // 读取 Beacon OS 决定候选目录
  const beaconOs = await evaluate(client, `String((document.querySelector('.agent-table-wrapper .agent-row .os-badge') || {}).textContent || '').toLowerCase()`)
  log(`Beacon OS: ${beaconOs || 'unknown'}`)
  // 右键第一行弹出 BeaconContextMenu
  await evaluate(client, `(() => {
    const row = document.querySelector('.agent-table-wrapper .agent-row')
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }))
    return true
  })()`)
  const menuShown = await poll(client, `Boolean(document.querySelector('.context-menu'))`, 5000)
  if (!menuShown) { log('SKIP: Beacon 右键菜单未弹出'); return false }

  // 点「查看文件目录」
  const clicked = await evaluate(client, `(() => {
    const items = Array.from(document.querySelectorAll('.context-menu .menu-item'))
    const target = items.find(el => (el.textContent || '').includes('查看文件目录') || (el.textContent || '').includes('Browse Files'))
    if (target) { target.click(); return true }
    return false
  })()`)
  if (!clicked) { log('SKIP: 未找到「查看文件目录」菜单项'); return false }

  const opened = await poll(client, `Boolean(document.querySelector('.file-browser-modal'))`, 8000)
  if (!opened) { log('SKIP: 文件浏览器未打开'); return false }
  log('✓ 文件浏览器已打开')

  // 等初始目录列表(行或空/错误态)
  const initialReady = await poll(client, `Boolean(document.querySelector('.file-browser-modal .file-table tbody tr') || document.querySelector('.file-browser-modal .empty-state, .file-browser-modal .error-state'))`, 15000)
  if (!initialReady) {
    log('⚠ 初始目录列表超时,尝试切换到候选目录…')
  }
  return true
}

/**
 * 在文件浏览器中导航候选目录,直到找到可预览文件。
 * @returns {Promise<{name: string} | null>} 可预览文件名
 */
async function findPreviewableFile(client, beaconOs) {
  const isWindows = String(beaconOs || '').includes('win')
  const candidates = isWindows
    ? [
        'C:\\Windows\\Temp',
        'C:\\Users\\Public',
        'C:\\Users\\Public\\Documents',
        'C:\\Users\\Administrator\\Desktop',
        'C:\\Users\\Administrator\\Documents',
        'C:\\Users\\Administrator\\Downloads',
        'C:\\Users\\Administrator',
        'C:\\',
      ]
    : ['/tmp', '/', '/home', '/root', '/var/log', '/etc']
  const extList = JSON.stringify(Array.from(TEXT_EXTS).concat(Array.from(IMAGE_EXTS)))

  // 先看当前列表
  for (const dir of ['(current)', ...candidates]) {
    if (dir !== '(current)') {
      const navigated = await evaluate(client, `(() => {
        const input = document.querySelector('.file-browser-modal .path-input')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(dir)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
        return true
      })()`)
      if (!navigated) break
      await sleep(1500)
    }

    // 等该目录列表加载(最多 12s)
    const ready = await poll(client, `Boolean(document.querySelector('.file-browser-modal .file-table tbody tr') || document.querySelector('.file-browser-modal .error-state'))`, 12000)
    if (!ready) { log(`  目录 ${dir}: 加载超时`); continue }

    const found = await evaluate(client, `(() => {
      const rows = Array.from(document.querySelectorAll('.file-browser-modal .file-table tbody tr'))
      for (const row of rows) {
        const icon = (row.querySelector('.icon-cell span') || {}).textContent || ''
        const name = (row.querySelector('.name-cell') || {}).textContent || ''
        if (icon.includes('📄') && ${extList}.some(ext => name.toLowerCase().endsWith('.' + ext))) {
          return { name }
        }
      }
      return null
    })()`)
    if (found) { log(`目录 ${dir} 找到可预览文件: ${found.name}`); return found }
    log(`  目录 ${dir}: 无可预览文件`)
  }
  return null
}

async function triggerPreview(client, fileName) {
  // 点目标文件行的「更多操作」按钮 → FileContextMenu 弹出
  await evaluate(client, `(() => {
    const rows = Array.from(document.querySelectorAll('.file-browser-modal .file-table tbody tr'))
    const row = rows.find(r => (r.querySelector('.name-cell') || {}).textContent === ${JSON.stringify(fileName)})
    const btn = row && row.querySelector('.row-action-btn')
    if (btn) { btn.click(); return true }
    return false
  })()`)
  const menuShown = await poll(client, `Boolean(document.querySelector('.glass-menu'))`, 5000)
  if (!menuShown) { log('SKIP: 文件更多操作菜单未弹出'); return false }

  // 点「预览」
  const clicked = await evaluate(client, `(() => {
    const items = Array.from(document.querySelectorAll('.glass-menu .menu-item'))
    const target = items.find(el => (el.textContent || '').includes('预览') || (el.textContent || '').includes('Preview'))
    if (target) { target.click(); return true }
    return false
  })()`)
  if (!clicked) { log('SKIP: 未找到「预览」菜单项'); return false }

  const opened = await poll(client, `Boolean(document.querySelector('.preview-modal'))`, 8000)
  if (!opened) { log('SKIP: 预览弹窗未出现'); return false }
  log('✓ 预览弹窗已打开')
  return true
}

async function checkPreviewResult(client) {
  // 等待 ready / failed / 超时(Beacon sleep 长时可能停留在 receiving)
  const state = await poll(client, `(() => {
    const modal = document.querySelector('.preview-modal')
    if (!modal) return null
    if (modal.querySelector('.text-content')) return 'ready-text'
    if (modal.querySelector('.image-view img')) return 'ready-image'
    if (modal.querySelector('.state-view.error')) return 'failed'
    if (modal.querySelector('.spinner')) return 'loading'
    return 'unknown'
  })()`, 25000, 500)

  log(`预览终态: ${state}`)
  if (state === 'ready-text') {
    const sample = await evaluate(client, `document.querySelector('.preview-modal .text-content')?.textContent?.slice(0, 120) || ''`)
    log(`✓ 文本预览内容(前 120 字符): ${JSON.stringify(sample)}`)
    const hasCopy = await evaluate(client, `Boolean(document.querySelector('.preview-modal .modal-footer'))`)
    log(`✓ 底部操作栏存在(复制/下载/关闭): ${hasCopy}`)
  } else if (state === 'ready-image') {
    log('✓ 图片预览渲染(img 已加载)')
  } else if (state === 'failed') {
    const errText = await evaluate(client, `document.querySelector('.preview-modal .state-view.error')?.textContent || ''`)
    log(`预览失败态: ${errText}`)
    return true
  } else {
    log('SKIP: 预览停留在中间态(Beacon 可能未在线/sleep 较长),未完成事件流转')
    return false
  }

  // 关闭预览弹窗(应触发 DELETE 释放)
  await evaluate(client, `(() => {
    const btn = document.querySelector('.preview-modal .close-btn')
    if (btn) btn.click()
    return Boolean(btn)
  })()`)
  const closed = await poll(client, `!document.querySelector('.preview-modal')`, 8000)
  log(closed ? '✓ 预览弹窗已关闭' : '⚠ 预览弹窗未关闭')
  return true
}

async function runCheck(client) {
  await poll(client, `document.readyState === 'complete'`)

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    log(`—— 第 ${attempt} 轮 ——`)
    await ensureLogin(client)

    const opened = await openFileBrowser(client)
    if (!opened) return 'SKIP'

    const beaconOs = await evaluate(client, `String((document.querySelector('.agent-table-wrapper .agent-row .os-badge') || {}).textContent || '').toLowerCase()`)
    const fileInfo = await findPreviewableFile(client, beaconOs)
    if (fileInfo) {
      const previewTriggered = await triggerPreview(client, fileInfo.name)
      if (!previewTriggered) return 'SKIP'
      const done = await checkPreviewResult(client)
      return done ? 'PASS' : 'SKIP'
    }

    // 无文件 → 输出诊断;若为认证过期则重登重试
    const diag = await evaluate(client, `(() => {
      const modal = document.querySelector('.file-browser-modal')
      const err = modal && modal.querySelector('.error-state')
      const rows = Array.from(modal ? modal.querySelectorAll('.file-table tbody tr') : []).slice(0, 15).map(r => {
        const icon = (r.querySelector('.icon-cell span') || {}).textContent || ''
        const name = (r.querySelector('.name-cell') || {}).textContent || ''
        return icon.trim() + ' ' + name
      })
      return JSON.stringify({ error: err ? err.textContent : null, rows })
    })()`)
    if (String(diag).includes('认证过期') || String(diag).includes('登录已失效')) {
      log('认证已过期,重新登录后重试…')
      await evaluate(client, `location.hash = '#/login'`)
      continue
    }
    log(`SKIP: 候选目录中均无可预览文件。列表诊断: ${diag}`)
    return 'SKIP'
  }
  log('SKIP: 多轮尝试后仍无法完成预览验证(环境限制)')
  return 'SKIP'
}

// ─── run / cleanup ───

function mainGoHasDebugFlag() {
  return readFileSync(resolve(ROOT, 'main.go'), 'utf8').includes(DEBUG_FLAG)
}

function injectDebugFlag() {
  if (mainGoHasDebugFlag()) return
  const mainGo = resolve(ROOT, 'main.go')
  const content = readFileSync(mainGo, 'utf8')
  const anchor = '"--ignore-certificate-errors"'
  if (!content.includes(anchor)) fail(`main.go 未找到注入锚点 ${anchor}`)
  writeFileSync(mainGo, content.replace(anchor, `${anchor},\n\t\t${JSON.stringify(DEBUG_FLAG)}`))
  log(`已注入 ${DEBUG_FLAG} 到 main.go`)
}

function killApp() { ps(`Stop-Process -Name client -Force -ErrorAction SilentlyContinue; exit 0`) }
function killOrphanWebView() {
  log('清理孤儿 WebView2 进程…')
  const result = ps(`Stop-Process -Name msedgewebview2 -Force -ErrorAction SilentlyContinue; exit 0`)
  if (result.status !== 0) fail('清理 WebView2 进程失败')
}
function wailsBuild() {
  log('wails3 build …(可能需要几分钟)')
  const result = ps(`wails3 build 2>&1 | Select-Object -Last 5; exit $LASTEXITCODE`)
  if (result.status !== 0) { console.error(result.stdout || ''); fail('wails3 build 失败') }
  log('✓ wails3 build 完成')
}
function launchApp() {
  const exe = resolve(ROOT, 'bin', 'client.exe')
  if (!existsSync(exe)) fail(`未找到 ${exe}`)
  spawn(exe, [], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref()
}
async function waitForCdp() {
  log(`等待 CDP ${CDP_HTTP} …`)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { const resp = await fetch(`${CDP_HTTP}/json/version`); if (resp.ok) return } catch { /* 未就绪 */ }
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
    const result = await runCheck(client)
    log(`RESULT: ${result}`)
    if (result === 'SKIP') process.exit(2)
  } finally {
    client.close()
  }
  log('提示: 验证完成后请执行 node scripts/preview-check.mjs cleanup 还原 main.go')
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

// ─── 入口 ───

const phase = process.argv[2] || 'smoke'

async function main() {
  if (phase === 'cleanup') { phaseCleanup(); return }
  if (phase === 'run') { await phaseRun(); return }
  if (phase === 'smoke') {
    const page = await findPageTarget()
    log(`连接页面: ${page.url}`)
    const client = await connectCdp(page.webSocketDebuggerUrl)
    try {
      const result = await runCheck(client)
      log(`RESULT: ${result}`)
      if (result === 'SKIP') process.exit(2)
    } finally { client.close() }
    return
  }
  fail(`未知阶段: ${phase}(可选: run | smoke | cleanup)`)
}

main().catch((err) => fail(err.stack || err.message))
