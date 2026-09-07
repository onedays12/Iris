#!/usr/bin/env node
/**
 * check-preview-mirror.mjs — 校验前端图片 MIME 映射与 TeamServer codec.go 严格镜像。
 *
 * 文本预览已放开扩展名白名单（任意文件均可按文本打开），
 * 两端只需保持图片扩展名 → MIME 一致。
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = dirname(fileURLToPath(import.meta.url))
const TS_PATH = resolve(FRONTEND, '..', 'src', 'features', 'preview', 'model.ts')
const GO_PATH = process.env.TEAMSERVER_CODEC || 'D:/code/go/TeamServer/server/transfer/codec.go'

if (!existsSync(GO_PATH)) {
  console.log(`SKIP: 未找到 TeamServer codec.go(${GO_PATH}),跳过预览镜像校验`)
  process.exit(0)
}

const ts = readFileSync(TS_PATH, 'utf8')
const go = readFileSync(GO_PATH, 'utf8')

const tsMatch = ts.match(/IMAGE_MIME_MAP\s*[:=]\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\}/)
if (!tsMatch) {
  console.error('无法在前端 model.ts 中定位 IMAGE_MIME_MAP')
  process.exit(1)
}
const fePairs = [...tsMatch[1].matchAll(/([a-z0-9]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])

const goStart = go.indexOf('var previewImageMimes')
const goEnd = go.indexOf('}', goStart)
if (goStart < 0 || goEnd < 0) {
  console.error('无法在 codec.go 中定位 previewImageMimes')
  process.exit(1)
}
const goBlock = go.slice(goStart, goEnd)
const goPairs = [...goBlock.matchAll(/"([a-z0-9]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])

const feMap = new Map(fePairs)
const goMap = new Map(goPairs)

console.log(`前端图片条目: ${fePairs.length}`)
console.log(`服务端图片条目: ${goPairs.length}`)

const onlyFe = [...feMap.keys()].filter((k) => !goMap.has(k))
const onlyGo = [...goMap.keys()].filter((k) => !feMap.has(k))
const mimeMismatch = [...feMap.keys()].filter((k) => goMap.has(k) && goMap.get(k) !== feMap.get(k))

if (onlyFe.length) console.error(`仅在前端存在: ${JSON.stringify(onlyFe)}`)
if (onlyGo.length) console.error(`仅在服务端存在: ${JSON.stringify(onlyGo)}`)
if (mimeMismatch.length) {
  for (const k of mimeMismatch) {
    console.error(`MIME 不一致 ${k}: fe=${feMap.get(k)} go=${goMap.get(k)}`)
  }
}

if (!onlyFe.length && !onlyGo.length && !mimeMismatch.length) {
  console.log('MIRROR OK — 两端图片 MIME 完全一致')
} else {
  process.exit(1)
}
