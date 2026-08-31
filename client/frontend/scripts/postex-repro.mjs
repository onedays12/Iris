#!/usr/bin/env node
/**
 * postex-repro.mjs — CDP 真机复现：执行 postex 插件动作后，右键菜单里 postex 组是否消失
 *
 * 流程：
 *   1. 连接 WebView2 CDP（需应用带 --remote-debugging-port=9222 运行）
 *   2. 登录（如未登录）
 *   3. 读取应用内部状态（agentStore/pluginStore）：beacon os/arch、插件 actions/postex 配置
 *   4. 右键第一个 beacon → 抓菜单文本（记录 postex 组是否存在）
 *   5. 关闭菜单；若菜单含 postex 动作，点击执行（无输入直接执行；有输入走 modal 填默认值提交）
 *   6. 等待 3 秒，再次右键 → 抓菜单文本 + 应用内部状态
 *   7. 对比执行前后：菜单 postex 组、beacon os/arch、插件 actions
 *   8. 输出 JSON 结果 + console 日志（intlify 警告等）
 *
 * 用法：node scripts/postex-repro.mjs
 */
import WebSocket from 'ws'

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222'
const SERVER = process.env.TEAMSERVER || 'https://127.0.0.1:8080'
const USERNAME = process.env.TEAMSERVER_USER || 'admin'
const PASSWORD = process.env.TEAMSERVER_PASS || '123456'

function log(...args) { console.log('[postex-repro]', ...args) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json()
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl && !t.url.startsWith('devtools://'))
  if (!pages.length) throw new Error('no page target')
  return pages[0]
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const client = {
      ws, id: 0, pending: new Map(), events: [],
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const callId = ++this.id
          this.pending.set(callId, { resolve: res, reject: rej })
          this.ws.send(JSON.stringify({ id: callId, method, params }))
        })
      },
      close() { this.ws.close() },
    }
    ws.on('open', () => resolve(client))
    ws.on('error', (err) => reject(err))
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.id && client.pending.has(msg.id)) {
        const entry = client.pending.get(msg.id)
        client.pending.delete(msg.id)
        if (msg.error) entry.reject(new Error(msg.error.message))
        else entry.resolve(msg.result)
      } else if (msg.method) {
        client.events.push(msg)
        if (client.events.length > 2000) client.events.shift()
      }
    })
  })
}

async function evaluate(client, expression, { awaitPromise = true } = {}) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (result.exceptionDetails) {
    return { __error: result.exceptionDetails.text || JSON.stringify(result.exceptionDetails.exception) }
  }
  return result.result.value
}

async function poll(client, expression, timeoutMs = 20000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await evaluate(client, expression)
    if (last) return last
    await sleep(intervalMs)
  }
  throw new Error(`timeout: ${expression} last=${JSON.stringify(last)}`)
}

// 读取应用内部状态（Pinia store）
const DUMP_STATE = `(() => {
  const app = document.querySelector('#app')?.__vue_app__
  if (!app) return { error: 'no vue app' }
  const pinia = app.config.globalProperties.$pinia
  if (!pinia) return { error: 'no pinia' }
  const get = (name) => { try { return pinia._s.get(name)?.$state ?? null } catch { return null } }
  const agent = get('agent')
  const plugin = get('plugin')
  const agents = (agent?.agents ?? []).map(a => ({
    beaconid: a.beaconid, os: a.os, arch: a.arch, hostname: a.hostname, processName: a.processName,
  }))
  const plugins = (plugin?.plugins ?? []).map(p => ({
    id: p.id, name: p.name, status: p.status, actions: (p.actions ?? []).map(act => ({
      id: act.id, kind: act.kind, requiresInput: act.requiresInput,
      postex: act.postex ? { mode: act.postex.mode, dll: act.postex.dll, dllByArch: act.postex.dllByArch } : null,
      artifact: act.artifact,
    })),
  }))
  return { agents, plugins }
})()`

// 抓右键菜单文本
const DUMP_MENU = `(() => {
  const menu = document.querySelector('.context-menu')
  if (!menu) return null
  const groups = [...menu.querySelectorAll('.menu-group')].map(g => {
    const label = g.querySelector('.menu-parent .menu-label')?.textContent?.trim() || ''
    const children = [...g.querySelectorAll('.submenu-item')].map(c => ({
      label: c.querySelector('.submenu-label')?.textContent?.trim() || '',
      disabled: c.classList.contains('disabled'),
    }))
    return { label, children }
  })
  const top = [...menu.querySelectorAll('.menu-item:not(.menu-parent):not(.submenu-item)')].map(i => ({
    label: i.querySelector('.menu-label')?.textContent?.trim() || i.textContent?.trim() || '',
    disabled: i.classList.contains('disabled'),
  }))
  return { top, groups }
})()`

// 在 Dashboard 表格上触发右键（第一行）
const TRIGGER_RIGHT_CLICK_FIRST_ROW = `(() => {
  const row = document.querySelector('.agent-table-wrapper .data-table tbody tr, .dashboard-page tbody tr, .agent-table tbody tr')
  if (!row) return { ok: false, reason: 'no row' }
  const rect = row.getBoundingClientRect()
  const opts = { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, button: 2 }
  const ev = new MouseEvent('contextmenu', opts)
  row.dispatchEvent(ev)
  return { ok: true, x: opts.clientX, y: opts.clientY }
})()`

// 点击菜单项（按 label 精确匹配）
const CLICK_MENU_ITEM = (label) => `(() => {
  const menu = document.querySelector('.context-menu')
  if (!menu) return { ok: false, reason: 'no menu' }
  const items = [...menu.querySelectorAll('.menu-item:not(.menu-parent)')]
  const target = items.find(i => (i.querySelector('.menu-label')?.textContent || i.querySelector('.submenu-label')?.textContent || '').trim() === ${JSON.stringify(label)})
  if (!target) return { ok: false, reason: 'not found: ' + ${JSON.stringify(label)} }
  target.click()
  return { ok: true }
})()`

const CLOSE_MENU = `(() => {
  document.body.click()
  return true
})()`

async function ensureLogin(client) {
  const hash = await evaluate(client, 'location.hash')
  log(`路由: ${hash || '(login)'}`)
  if (hash && hash.startsWith('#/') && hash !== '#/login') return
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
  await poll(client, `location.hash.startsWith('#/') && location.hash !== '#/login'`, 30000)
  log('登录完成')
}

async function main() {
  const page = await findPageTarget()
  log(`连接: ${page.url}`)
  const client = await connectCdp(page.webSocketDebuggerUrl)
  // 监听 console 与 log 事件
  await client.send('Runtime.enable')
  await client.send('Log.enable')

  try {
    await poll(client, `document.readyState === 'complete'`)
    await ensureLogin(client)

    // 等 dashboard 表格行
    await evaluate(client, `location.hash = '#/dashboard'`)
    await poll(client, `Boolean(document.querySelector('.agent-table-wrapper .data-table tbody tr, .dashboard-page tbody tr, .agent-table tbody tr'))`, 30000)

    const result = {
      phase1: {}, phase2: {}, consoleMessages: [], storeBefore: null, storeAfter: null,
    }

    // ── Phase 1: 执行前 ──
    result.storeBefore = await evaluate(client, DUMP_STATE)
    await evaluate(client, TRIGGER_RIGHT_CLICK_FIRST_ROW)
    await sleep(600)
    result.phase1.menu = await evaluate(client, DUMP_MENU)
    log(`Phase1 菜单: ${JSON.stringify(result.phase1.menu)}`)

    // 找 postex 动作（组内 kind=postex 的动作没有直接标记，用组名+动作文本判断）
    const postexCandidates = (result.phase1.menu?.groups ?? []).flatMap(g =>
      g.children.filter(c => !c.disabled).map(c => ({ group: g.label, action: c.label }))
    )
    log(`Phase1 可选动作: ${JSON.stringify(postexCandidates)}`)

    await evaluate(client, CLOSE_MENU)
    await sleep(300)

    // ── 执行一个 postex 动作：优先 postex 插件组的动作 ──
    // postex-template 组名 "PostEx 模板"/"PostEx Template"，动作 "模板 Spawn DLL" 等
    const execTarget = postexCandidates.find(c => /postex|spawn|inject/i.test(c.group)) || postexCandidates[0]
    if (!execTarget) {
      log('⚠ 没有可执行的动作（菜单里没有 postex 组？）——跳过执行，直接对比 store')
    } else {
      log(`执行动作: [${execTarget.group}] ${execTarget.action}`)
      await evaluate(client, TRIGGER_RIGHT_CLICK_FIRST_ROW)
      await sleep(600)
      const clicked = await evaluate(client, CLICK_MENU_ITEM(execTarget.action))
      log(`点击结果: ${JSON.stringify(clicked)}`)
      await sleep(800)
      // 若有输入 modal，填默认值并提交
      const modalState = await evaluate(client, `Boolean(document.querySelector('.modal-overlay, .confirm-overlay'))`)
      if (modalState) {
        log('检测到 modal，尝试提交（默认值）…')
        const filled = await evaluate(client, `(() => {
          const modal = document.querySelector('.modal-overlay, .confirm-overlay')
          if (!modal) return false
          // 填所有 input/select 的默认值（值为空时填占位符或数字默认）
          const inputs = [...modal.querySelectorAll('input, select')]
          inputs.forEach(el => {
            if (el.value === '') {
              const ph = el.getAttribute('placeholder') || ''
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
              if (setter && el.tagName === 'INPUT') {
                setter.call(el, ph || '1')
                el.dispatchEvent(new Event('input', { bubbles: true }))
              }
            }
          })
          const submit = modal.querySelector('.btn-primary') || [...modal.querySelectorAll('button')].find(b => /执行|确认|submit|run|ok/i.test(b.textContent))
          if (submit) submit.click()
          return Boolean(submit)
        })()`)
        log(`modal 提交: ${filled}`)
        // 若 confirm 弹窗，点确认
        await sleep(600)
        await evaluate(client, `(() => {
          const ov = document.querySelector('.confirm-overlay')
          if (ov) { const ok = [...ov.querySelectorAll('button')].find(b => /确认|确定|ok/i.test(b.textContent)); if (ok) ok.click(); return Boolean(ok) }
          return false
        })()`)
      }
      log('等待命令执行…')
      await sleep(4000)
    }

    // ── Phase 2: 执行后 ──
    await evaluate(client, CLOSE_MENU)
    await sleep(300)
    result.storeAfter = await evaluate(client, DUMP_STATE)
    await evaluate(client, TRIGGER_RIGHT_CLICK_FIRST_ROW)
    await sleep(600)
    result.phase2.menu = await evaluate(client, DUMP_MENU)
    log(`Phase2 菜单: ${JSON.stringify(result.phase2.menu)}`)

    // console 日志
    result.consoleMessages = client.events
      .filter(e => e.method === 'Runtime.consoleAPICalled' || e.method === 'Log.entryAdded')
      .slice(-50)
      .map(e => {
        if (e.method === 'Log.entryAdded') return { type: 'log', text: e.params.entry?.text }
        const args = (e.params.args || []).map(a => a.value ?? a.description ?? '')
        return { type: e.params.type, text: args.join(' ') }
      })

    // ── 对比输出 ──
    console.log('\n===== RESULT =====')
    console.log(JSON.stringify(result, null, 2))
    console.log('===== END =====')

    // 简单结论
    const p1Groups = (result.phase1.menu?.groups ?? []).map(g => g.label)
    const p2Groups = (result.phase2.menu?.groups ?? []).map(g => g.label)
    log(`执行前插件组: ${JSON.stringify(p1Groups)}`)
    log(`执行后插件组: ${JSON.stringify(p2Groups)}`)
    const missing = p1Groups.filter(g => !p2Groups.includes(g))
    log(missing.length ? `❌ 消失的组: ${JSON.stringify(missing)}` : '✓ 所有组保留')
    const a1 = result.storeBefore?.agents ?? []
    const a2 = result.storeAfter?.agents ?? []
    a2.forEach((a, i) => {
      const before = a1[i]
      if (before && (before.os !== a.os || before.arch !== a.arch)) {
        log(`⚠ beacon ${a.beaconid} os/arch 变化: ${before.os}/${before.arch} → ${a.os}/${a.arch}`)
      }
    })
  } finally {
    client.close()
  }
}

main().catch((err) => { console.error('[postex-repro] FAIL:', err.message); process.exit(1) })
