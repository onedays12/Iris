#!/usr/bin/env node
/**
 * diag-workbench-redesign.mjs — 工作台骨架改造 CDP 验收(M1/M2/M4 + M3 拖拽行为)。
 *
 * 前置: client.exe 带 --remote-debugging-port=9222 运行;TeamServer 运行。
 * 覆盖:
 *   M1 布局: .bottom-dock 存在、右侧旧面板(.event-panel-shell)消失、
 *           主内容区可独立滚动、dock 三 tab 可切换;
 *   M3 拖拽: 合成拖拽分隔条 → 高度按位移变化(rAF 提交);
 *   持久化: 高度/收起态刷新后保持;
 *   M2 联动: 双击 beacon 行 → 控制台 tab 激活、输入框聚焦;
 *   M4 目录: 打开文件浏览器 → Windows 默认 C:\;改路径后关闭重开 → 记忆保持。
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
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function findPageTarget() {
  const resp = await fetch(`${CDP_HTTP}/json/list`)
  const targets = await resp.json()
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  return pages.find((t) => !t.url.startsWith('devtools://')) || pages[0]
}
function connectCdp(wsUrl) {
  return new Promise((resolveIt, reject) => {
    const ws = new WebSocket(wsUrl)
    const client = {
      ws, id: 0, pending: new Map(),
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++this.id
          this.pending.set(id, { resolve: res, reject: rej })
          this.ws.send(JSON.stringify({ id, method, params }))
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
  if (result.exceptionDetails) throw new Error(`页面求值异常: ${result.exceptionDetails.text} ${JSON.stringify(result.exceptionDetails.exception || '')}`)
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

// ── 前置:确保有存活 beacon(复用 operator-sim 部署分支) ──────────
async function ensureBeacon() {
  const MCP = 'http://127.0.0.1:9333'
  try {
    const probe = await fetch(MCP + '/json/version', { method: 'POST' }).catch(() => null)
    if (!probe) throw new Error('mcp down')
  } catch { /* MCP 不可达时跳过 beacon 依赖 */ }
}

const page = await findPageTarget()
console.log('页面:', page.url)
const client = await connectCdp(page.webSocketDebuggerUrl)

// ── 登录 ────────────────────────────────────────────────────────
{
  const hash = await evaluate(client, 'location.hash')
  if (!hash || hash === '#/login' || hash === '') {
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
    check('登录', Boolean(ok))
  } else check('已登录', true, hash)
}

// ── M1 布局断言 ─────────────────────────────────────────────────
await evaluate(client, `location.hash = '#/dashboard'`)
await poll(client, `Boolean(document.querySelector('.dashboard-page'))`)
check('M1 底部 dock 存在', await evaluate(client, `Boolean(document.querySelector('.bottom-dock'))`))
check('M1 右侧旧事件面板已移除', await evaluate(client, `!document.querySelector('.event-panel-shell')`))
check('M1 浮层 GlobalConsoleDock 已移除', await evaluate(client, `!document.querySelector('.global-console-dock')`))

{
  const scroll = await evaluate(client, `(() => {
    const c = document.querySelector('.content')
    if (!c) return { ok: false }
    const probe = document.createElement('div')
    probe.style.height = (c.clientHeight + 800) + 'px'
    c.appendChild(probe)
    c.scrollTop = c.scrollHeight
    const bottom = c.scrollTop > 0 && Math.abs(c.scrollTop + c.clientHeight - c.scrollHeight) < 6
    const top = c.scrollTop
    c.scrollTop = 0
    probe.remove()
    return { ok: bottom, top, sh: c.scrollHeight, ch: c.clientHeight }
  })()`)
  check('M1 主内容区可独立滚动到底', Boolean(scroll && scroll.ok), scroll ? `top=${scroll.top} sh=${scroll.sh} ch=${scroll.ch}` : '')
}

// dock 三 tab 切换
{
  const tabs = await evaluate(client, `document.querySelectorAll('.dock-tab').length`)
  check('M1 dock 三个 tab', tabs === 3, `count=${tabs}`)
  await evaluate(client, `[...document.querySelectorAll('.dock-tab')].find(b => b.textContent.includes('事件流'))?.click()`)
  await sleep(200)
  check('M1 事件流 tab 渲染', await evaluate(client, `Boolean(document.querySelector('.events-feed'))`))
  await evaluate(client, `[...document.querySelectorAll('.dock-tab')].find(b => b.textContent.includes('传输监控'))?.click()`)
  await sleep(200)
  check('M1 传输监控 tab 渲染', await evaluate(client, `Boolean(document.querySelector('.transfer-feed'))`))
  await evaluate(client, `[...document.querySelectorAll('.dock-tab')].find(b => b.textContent.includes('控制台'))?.click()`)
  await sleep(200)
}

// ── M3 拖拽行为(合成 mouse 序列,校验高度变化方向与幅度) ─────────
{
  const cap = await evaluate(client, `Math.max(140, Math.floor(window.innerHeight * 0.6))`)
  let before = await evaluate(client, `document.querySelector('.bottom-dock').getBoundingClientRect().height`)

  const dragBy = async (deltaPx) => {
    await evaluate(client, `(() => {
      const h = document.querySelector('.dock-resize-handle')
      const r = h.getBoundingClientRect()
      h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: r.top, clientX: r.left + 20, button: 0 }))
      return r.top
    })()`)
    const baseY = await evaluate(client, `document.querySelector('.dock-resize-handle').getBoundingClientRect().top`)
    const steps = 5
    for (let i = 1; i <= steps; i++) {
      await evaluate(client, `window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: ${baseY - Math.round((deltaPx * i) / steps)} }))`)
      await sleep(40)
    }
    await evaluate(client, `window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`)
    await sleep(200)
    return evaluate(client, `document.querySelector('.bottom-dock').getBoundingClientRect().height`)
  }

  // 若已贴近上限,先向下拖腾出余量
  if (before > cap - 160) {
    before = await dragBy(150)
  }
  const afterUp = await dragBy(130)
  const delta = Math.round(afterUp - before)
  const expectedUp = Math.min(before + 130, cap)
  check('M3 拖拽增高(含上限钳制)逐帧提交', Math.abs(afterUp - expectedUp) <= 4, `before=${Math.round(before)} after=${Math.round(afterUp)} expected=${Math.round(expectedUp)} cap=${cap}`)

  const afterDown = await dragBy(-100)
  check('M3 反向拖拽降低高度', Math.round(before - afterDown) >= 60, `afterDown=${Math.round(afterDown)}`)
}

// ── 持久化:刷新后高度保持 ───────────────────────────────────────
{
  const hBefore = await evaluate(client, `document.querySelector('.bottom-dock')?.getBoundingClientRect().height || 0`)
  await evaluate(client, `location.reload()`)
  await sleep(2500)
  await poll(client, `Boolean(document.querySelector('.bottom-dock')) || Boolean(document.querySelector('form.login-form'))`, 20000)
  const hAfter = await evaluate(client, `document.querySelector('.bottom-dock')?.getBoundingClientRect().height || 0`)
  check('持久化:刷新后 dock 高度保持', hAfter > 0 && Math.abs(hAfter - hBefore) < 3, `before=${Math.round(hBefore)} after=${Math.round(hAfter)}`)
}

// ── M2 双击联动(需要在线 beacon 行) ─────────────────────────────
await evaluate(client, `location.hash = '#/dashboard'`)
await poll(client, `Boolean(document.querySelector('.dashboard-page'))`)
{
  const hasRow = await poll(client, `document.querySelectorAll('.agent-row').length > 0`, 20000)
  if (hasRow) {
    await evaluate(client, `(() => {
      const row = document.querySelector('.agent-row')
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return true
    })()`)
    await sleep(400)
    const tabActive = await evaluate(client, `[...document.querySelectorAll('.dock-tab.active')].some(b => b.textContent.includes('控制台'))`)
    const panel = await evaluate(client, `Boolean(document.querySelector('.console-panel'))`)
    const focused = await evaluate(client, `document.activeElement && document.activeElement.classList.contains('console-input')`)
    check('M2 双击行 → 控制台 tab 激活', Boolean(tabActive))
    check('M2 控制台面板渲染', Boolean(panel))
    check('M2 输入框自动聚焦', Boolean(focused), focused ? '' : `(activeElement=${await evaluate(client, `document.activeElement?.className || 'none'`)})`)
  } else {
    check('M2 双击联动', false, '无在线 beacon 行(跳过)')
  }
}

// ── M4 目录记忆(经 beacon 右键菜单打开文件浏览器) ────────────────
{
  const BS = String.fromCharCode(92)
  const hasRow = await poll(client, `document.querySelectorAll('.agent-row').length > 0`, 15000)
  const openBrowser = async () => {
    await evaluate(client, `(() => {
      const row = document.querySelector('.agent-row')
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 500, clientY: 300 }))
      return true
    })()`)
    await sleep(300)
    return evaluate(client, `(() => {
      const candidates = [...document.querySelectorAll('button, li, .menu-item, [class*=menu] *')]
      const hit = candidates.find(el => /查看文件目录|文件浏览|浏览文件|File Browser|Browse/.test(el.textContent || '') && el.offsetParent !== null)
      if (hit) { hit.click(); return true }
      return false
    })()`)
  }
  const readPathInput = async () => evaluate(client, `(() => {
    const inputs = [...document.querySelectorAll('.modal-window input')]
    const p = inputs.find(i => (i.value || '').indexOf(':') >= 0 || (i.value || '').charAt(0) === '/')
    return p ? p.value : 'INPUTS=' + JSON.stringify(inputs.map(i => [i.type, (i.placeholder || '').slice(0, 20), (i.value || '').slice(0, 40)]))
  })()`)
  const closeBrowser = async () => {
    await evaluate(client, `(() => {
      const close = document.querySelector('.modal-window [class*=close]')
      if (close) close.click()
      return true
    })()`)
    await sleep(400)
  }
  const setPath = async (segments) => {
    const expr = `(() => {
      const BS = String.fromCharCode(92)
      const target = ${JSON.stringify(segments)}.join(BS)
      const inputs = [...document.querySelectorAll('.modal-window input')]
      const p = inputs.find(i => (i.value || '').indexOf(':') >= 0 || (i.value || '').charAt(0) === '/')
      if (!p) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(p, target)
      p.dispatchEvent(new Event('input', { bubbles: true }))
      p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      // 路径输入绑定的是 @keyup.enter
      p.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
      return true
    })()`
    return evaluate(client, expr)
  }

  if (hasRow) {
    await openBrowser()
    await sleep(600)
    if (await evaluate(client, `Boolean(document.querySelector('.modal-window'))`)) {
      const pathVal = await readPathInput()
      check('M4 首开默认路径(大小写不敏感)', String(pathVal).toLowerCase() === 'c:' + BS, `value="${pathVal}"`)
      await setPath(['C:', 'Windows'])
      await sleep(1200)
      await closeBrowser()
      await openBrowser()
      await sleep(800)
      const pathVal2 = await readPathInput()
      check('M4 重开记忆保持(大小写不敏感)', String(pathVal2).toLowerCase() === 'c:' + BS + 'windows', `value="${pathVal2}"`)
      await closeBrowser()
    } else {
      check('M4 目录记忆', false, '右键菜单未命中文件浏览器入口')
    }
  } else {
    check('M4 目录记忆', false, '无 beacon 行(跳过)')
  }
}

console.log('\n[workbench] SUMMARY:', results.filter(r => r.ok).length, 'passed /', results.length)
const failed = results.filter(r => !r.ok)
if (failed.length) {
  console.log('[workbench] FAILED:', failed.map(f => f.name).join(' | '))
}
console.log(failed.length ? '[workbench] WORKBENCH REDESIGN VERIFY FAILED' : '[workbench] WORKBENCH REDESIGN VERIFY PASSED')
client.close()
process.exit(failed.length ? 1 : 0)
