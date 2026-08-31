#!/usr/bin/env node
/**
 * diag-selection.mjs — 真机取证:beacon 表格选中文本为何无高亮。
 * 采集:当前主题、td/user-select 计算值、::selection 伪元素计算值、
 * 样式表里的 ::selection 规则清单;并用 Range 选中主机名后整页截图。
 */
import { writeFileSync } from 'node:fs'
import WebSocket from 'ws'

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222'
const SHOT = process.env.SHOT_PATH || 'selection-evidence.png'

async function findPageTarget() {
  const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) throw new Error('no page target')
  return page
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let seq = 0
    const pending = new Map()
    ws.on('open', () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const id = ++seq
        pending.set(id, { res, rej })
        ws.send(JSON.stringify({ id, method, params }))
      }),
      close: () => ws.close(),
    }))
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      }
    })
    ws.on('error', reject)
  })
}

const page = await findPageTarget()
const client = await connectCdp(page.webSocketDebuggerUrl)

async function evaluate(expression) {
  const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails).slice(0, 300))
  return r.result.value
}

const report = await evaluate(`(() => {
  const out = {}
  out.theme = document.documentElement.getAttribute('data-ui-theme') || '(none)'
  const cell = document.querySelector('.data-table tbody td .cell-hostname')
    || document.querySelector('.data-table tbody td')
  if (!cell) { out.error = '未找到 beacon 表格单元格(是否在 dashboard?)'; return out }
  const td = cell.closest('td')
  const cs = getComputedStyle(cell)
  const tdcs = getComputedStyle(td)
  out.cell = { text: cell.textContent.trim().slice(0, 20), userSelect: cs.userSelect, webkitUserSelect: cs.webkitUserSelect }
  out.td = { userSelect: tdcs.userSelect }
  const selCs = getComputedStyle(cell, '::selection')
  out.selectionPseudo = { backgroundColor: selCs.backgroundColor, color: selCs.color }
  const rules = []
  for (const sheet of document.styleSheets) {
    let list
    try { list = sheet.cssRules } catch { continue }
    const walk = (rs) => { for (const r of rs) {
      if (r.cssRules) walk(r.cssRules)
      else if (r.selectorText && r.selectorText.includes('::selection')) rules.push(r.selectorText + ' { ' + r.style.cssText + ' }')
    } }
    walk(list)
  }
  out.selectionRules = rules
  // 真实选中主机名文本
  const sel = window.getSelection()
  sel.removeAllRanges()
  const range = document.createRange()
  range.selectNodeContents(cell)
  sel.addRange(range)
  out.selected = sel.toString()
  out.rangeCount = sel.rangeCount
  return out
})()`)
console.log(JSON.stringify(report, null, 1))

const shot = await client.send('Page.captureScreenshot', { format: 'png' })
writeFileSync(SHOT, Buffer.from(shot.data, 'base64'))
console.log('[diag] screenshot saved:', SHOT)
client.close()
