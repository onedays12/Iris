/**
 * check-i18n-keys - i18n key 一致性检查脚本 (纯 Node, 无依赖)
 *
 * 检查项:
 *  1. zh-CN.json 与 en-US.json 的 key 完全一致 (不重不漏)。
 *  2. 源码中出现的字面量 i18n key (t('...') / t(`...`) / t('a.' + x, 'b.' + y))
 *     在 zh-CN.json 中被引用且已在 zh 与 en 两侧注册。
 *  3. 数据驱动数组里的 *Key 字段 (labelKey / descKey / descriptionKey) 字面量可解析。
 *  4. 报告 "孤儿" key: JSON 中存在但源码中未引用的 key (仅 warning 级别,
 *     因为动态 key (如 'attrDialog.field' + Field) 无法静态解析)。
 *
 * 用法: node scripts/check-i18n-keys.mjs
 * 退出码非 0 表示为失败。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = join(fileURLToPath(import.meta.url), '..')
const root = join(__dirname, '..')
const srcDir = join(root, 'src')

const zh = JSON.parse(readFileSync(join(root, 'src/locales/zh-CN.json'), 'utf-8'))
const en = JSON.parse(readFileSync(join(root, 'src/locales/en-US.json'), 'utf-8'))

/** 展平嵌套对象为 key -> value (value 可为翻译字符串) */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, path, out)
    } else {
      out[path] = v
    }
  }
  return out
}

const zhKeys = flatten(zh)
const enKeys = flatten(en)

let errors = 0
let warnings = 0

function fail(msg) {
  errors++
  console.error(`  [ERROR] ${msg}`)
}

function warn(msg) {
  warnings++
  console.warn(`  [WARN ] ${msg}`)
}

// ─── 1. zh / en 双侧 key 一致性 ───
const zhOnly = Object.keys(zhKeys).filter((k) => !(k in enKeys)).sort()
const enOnly = Object.keys(enKeys).filter((k) => !(k in zhKeys)).sort()

if (zhOnly.length) {
  fail(`zh-CN 存在但 en-US 缺失的 key (${zhOnly.length}): ${zhOnly.slice(0, 20).join(', ')}`)
}
if (enOnly.length) {
  fail(`en-US 存在但 zh-CN 缺失的 key (${enOnly.length}): ${enOnly.slice(0, 20).join(', ')}`)
}

// ─── 收集源码文件列表 ───
const extensions = new Set(['.js', '.ts', '.vue', '.mjs'])
function listFiles(dir) {
  const result = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      result.push(...listFiles(full))
    } else if (extensions.has(entry.slice(entry.lastIndexOf('.')))) {
      result.push(full)
    }
  }
  return result
}

const sourceFiles = listFiles(srcDir)
const sourceText = sourceFiles.map((f) => readFileSync(f, 'utf-8')).join('\n')

// ─── 2. 提取 t('...') / t(`...`) / t("...") 字面量 key ───
const literalKeys = new Set()
const tRegex = /\bt\(\s*(['"`])([^'"`\n]+?)\1/g
let m
while ((m = tRegex.exec(sourceText)) !== null) {
  literalKeys.add(m[2])
}

// ─── 3. 提取数据驱动数组的 *Key 字面量 ───
const keyFieldRegex = /\b(?:labelKey|descKey|descriptionKey)\s*:\s*['"]([^'"\n]+)['"]/g
while ((m = keyFieldRegex.exec(sourceText)) !== null) {
  literalKeys.add(m[1])
}

// 显式返回的 i18n key 常量 (如 statusLabelKey / formatTunnelReasonKey 产出的 key)
const keyReturnRegex = /\bstatusLabelKey\(\s*['"]([^'"\n]+)['"]\s*\)/g
while ((m = keyReturnRegex.exec(sourceText)) !== null) {
  literalKeys.add(m[1])
}

// 条件选择表达式中的 key (如 t(cond ? 'fileBrowser.moveFailed' : 'fileBrowser.copyFailed') / labelKey: online ? 'agent.status.online' : ...)
// 仅当点分字面量已存在于任一 locale 时才视为有效引用 (避免把 CSS/JSDoc 点分字符串误判为 key)。
const anyQuotedKeyRegex = /['"`]([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)['"`]/g
const localeKeys = new Set([...Object.keys(zhKeys), ...Object.keys(enKeys)])
while ((m = anyQuotedKeyRegex.exec(sourceText)) !== null) {
  if (localeKeys.has(m[1])) literalKeys.add(m[1])
}

// ─── 4. 动态 key 前缀 (如 t('attrDialog.field' + Field)) ───
const dynamicPrefixes = new Set()
const dynamicRegex = /\bt\(\s*['"]([A-Za-z][A-Za-z0-9.]*?)'\s*\+[^)]/g
while ((m = dynamicRegex.exec(sourceText)) !== null) {
  dynamicPrefixes.add(m[1])
}

// ─── 5. 校验字面量 key 均在 zh/en 中注册 (动态前缀本身不是完整 key, 跳过) ───
for (const key of [...literalKeys].sort()) {
  if (dynamicPrefixes.has(key)) continue
  const inZh = key in zhKeys
  const inEn = key in enKeys
  if (!inZh) fail(`字面量 i18n key 未在 zh-CN 中注册: "${key}"`)
  if (inZh && !inEn) fail(`i18n key 缺少 en-US 翻译: "${key}"`)
}

// ─── 6. 孤儿 key (JSON 有、源码中未见任何引用) ───
// 注: 动态 key 前缀无法静态解析, 因此命中动态前缀的 key (如 attrDialog.fieldYear) 视为已引用。
const orphanKeys = Object.keys(zhKeys).filter((k) => {
  if (literalKeys.has(k)) return false
  return ![...dynamicPrefixes].some((prefix) => k.startsWith(prefix))
}).sort()

if (orphanKeys.length) {
  warn(`未被源码直接引用的 key (可能是动态 key 或确为孤儿, ${orphanKeys.length}): ${orphanKeys.slice(0, 20).join(', ')}`)
}

// ─── 汇总 ───
console.log(`\ni18n keys: zh=${Object.keys(zhKeys).length} en=${Object.keys(enKeys).length} literals=${literalKeys.size} dynamicPrefixes=${dynamicPrefixes.size} orphans=${orphanKeys.length}`)
console.log(`${errors === 0 ? 'i18n keys ok' : 'i18n keys FAILED'} (${errors} errors, ${warnings} warnings)`)

if (errors > 0) {
  process.exit(1)
}
