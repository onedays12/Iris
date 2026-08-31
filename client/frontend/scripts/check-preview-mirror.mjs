#!/usr/bin/env node
/**
 * check-preview-mirror.mjs — 校验前端预览白名单与 TeamServer codec.go 严格镜像。
 *
 * 从两侧源码中提取扩展名集合并对比,任何单侧增删未同步都会以非零码退出。
 * 可接入 CI 或 npm run check:all。
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = dirname(fileURLToPath(import.meta.url))
const TS_PATH = resolve(FRONTEND, '..', 'src', 'features', 'preview', 'model.ts')
const GO_PATH = process.env.TEAMSERVER_CODEC || 'D:/code/go/TeamServer/server/transfer/codec.go'

// client 单仓 CI 检出时没有 TeamServer 源码,优雅跳过;本地双仓在场时强制校验。
if (!existsSync(GO_PATH)) {
  console.log(`SKIP: 未找到 TeamServer codec.go(${GO_PATH}),跳过白名单镜像校验`)
  process.exit(0)
}

const ts = readFileSync(TS_PATH, 'utf8')
const go = readFileSync(GO_PATH, 'utf8')

const tsMatch = ts.match(/TEXT_EXTENSIONS\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)/)
if (!tsMatch) {
  console.error('无法在前端 model.ts 中定位 TEXT_EXTENSIONS')
  process.exit(1)
}
const feExts = [...tsMatch[1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1])

const goStart = go.indexOf('var previewTextExts')
const goEnd = go.indexOf('}', goStart)
if (goStart < 0 || goEnd < 0) {
  console.error('无法在 codec.go 中定位 previewTextExts')
  process.exit(1)
}
const goBlock = go.slice(goStart, goEnd)
const goExts = [...goBlock.matchAll(/"([a-z0-9]+)": true/g)].map((m) => m[1])

const feSet = new Set(feExts)
const goSet = new Set(goExts)

console.log(`前端条目: ${feExts.length} (去重 ${feSet.size})`)
console.log(`服务端条目: ${goExts.length} (去重 ${goSet.size})`)

const dupFe = feExts.length - feSet.size
const dupGo = goExts.length - goSet.size
const onlyFe = [...feSet].filter((x) => !goSet.has(x))
const onlyGo = [...goSet].filter((x) => !feSet.has(x))

if (onlyFe.length) console.error(`仅在前端存在: ${JSON.stringify(onlyFe)}`)
if (onlyGo.length) console.error(`仅在服务端存在: ${JSON.stringify(onlyGo)}`)
if (dupFe) console.error(`前端有重复条目 x${dupFe}`)
if (dupGo) console.error(`服务端有重复条目 x${dupGo}`)

if (!onlyFe.length && !onlyGo.length && !dupFe && !dupGo) {
  console.log('MIRROR OK — 两端白名单完全一致')
} else {
  process.exit(1)
}
