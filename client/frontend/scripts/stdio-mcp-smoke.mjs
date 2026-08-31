#!/usr/bin/env node
/** stdio-mcp-smoke.mjs — 模拟 Codex 式接入:以子进程拉起 iris-mcp-stdio 验证双模式管线。 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const EXE = process.env.IRIS_MCP_STDIO || resolve(process.cwd(), '..', 'bin', 'iris-mcp-stdio.exe')
if (!existsSync(EXE)) {
  console.error('[stdio-smoke] 找不到包装器:', EXE)
  process.exit(1)
}

const child = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'pipe'] })
let buf = ''
const results = []
child.stdout.on('data', (d) => {
  buf += d.toString()
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    try { results.push(JSON.parse(line)) } catch { results.push({ raw: line }) }
  }
})
child.stderr.on('data', (d) => process.stderr.write('[wrapper-stderr] ' + d))
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n')

setTimeout(() => send({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'codex-sim', version: '0' },
  },
}), 100)
setTimeout(() => send({ jsonrpc: '2.0', method: 'notifications/initialized' }), 400)
setTimeout(() => send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), 600)
setTimeout(() => send({
  jsonrpc: '2.0', id: 3, method: 'tools/call',
  params: { name: 'get_client_status', arguments: {} },
}), 900)
setTimeout(() => {
  const init = results.find((r) => r.id === 1)
  const list = results.find((r) => r.id === 2)
  const call = results.find((r) => r.id === 3)
  console.log('stdio initialize ✓ server =', init?.result?.serverInfo?.name, init?.result?.serverInfo?.version)
  console.log('stdio tools/list   ✓ count =', list?.result?.tools?.length)
  const isErr = call?.result?.isError
  const msg = String(call?.result?.content?.[0]?.text || '').slice(0, 60)
  console.log(`stdio tools/call   ✓ isError=${isErr} | msg = ${msg}`)
  child.kill()
  if (init && list && (list.result.tools?.length ?? 0) >= 19 && call) {
    console.log('STDIO SMOKE PASSED')
    process.exit(0)
  }
  console.error('STDIO SMOKE FAILED')
  process.exit(1)
}, 1600)
