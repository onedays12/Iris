/**
 * 把 Client 各发布面的版本号改成同一个。
 *
 * 源头是 build/config.yml 的 info.version。
 * 用法:
 *   node scripts/bump-version.mjs 0.4.0
 *   wails3 task version:bump VERSION=0.4.0
 *
 * 不改插件 version、不改 docs 里「从某版开始有」这种历史句子。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SEMVER = /^\d+\.\d+\.\d+$/

function pathFromRoot(...parts) {
  return join(root, ...parts)
}

function read(rel) {
  return readFileSync(pathFromRoot(...rel.split('/')), 'utf8')
}

function write(rel, content) {
  writeFileSync(pathFromRoot(...rel.split('/')), content)
}

function mustReplace(rel, content, pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`${rel}: 找不到 ${label}`)
  }
  pattern.lastIndex = 0
  return content.replace(pattern, replacement)
}

function replacePlistString(content, key, value, rel) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]+(</string>)`)
  return mustReplace(rel, content, pattern, `$1${value}$2`, key)
}

function fourPart(version) {
  return `${version}.0`
}

function androidVersionCode(version) {
  const [major, minor, patch] = version.split('.').map(Number)
  return major * 10000 + minor * 100 + patch
}

function bumpConfigYml(version) {
  const rel = 'build/config.yml'
  let text = read(rel)
  text = mustReplace(
    rel,
    text,
    /^(\s+version:\s*")[^"]+("\s*# The application version\s*)$/m,
    `$1${version}$2`,
    'info.version',
  )
  write(rel, text)
}

function bumpPackageJson(version) {
  const rel = 'frontend/package.json'
  let text = read(rel)
  text = mustReplace(rel, text, /^(\s*"version": ")[^"]+(")/m, `$1${version}$2`, 'package.json version')
  write(rel, text)
}

function bumpPackageLock(version) {
  const rel = 'frontend/package-lock.json'
  let text = read(rel)
  text = mustReplace(
    rel,
    text,
    /^(\s*"name": "frontend",\r?\n\s*"version": ")[^"]+(")/m,
    `$1${version}$2`,
    'lock root version',
  )
  text = mustReplace(
    rel,
    text,
    /(\s*"": \{\r?\n\s*"name": "frontend",\r?\n\s*"version": ")[^"]+(")/,
    `$1${version}$2`,
    'lock packages version',
  )
  write(rel, text)
}

function bumpGo(version) {
  const rel = 'service/mcp/server.go'
  let text = read(rel)
  text = mustReplace(
    rel,
    text,
    /var ServerVersion = "[^"]+"/,
    `var ServerVersion = "${version}"`,
    'ServerVersion',
  )
  write(rel, text)
}

function writeAppVersionTs(version) {
  const rel = 'frontend/src/constants/appVersion.ts'
  write(rel, `/** 由 scripts/bump-version.mjs 生成，别手改。源头是 build/config.yml 的 info.version。 */\nexport const APP_VERSION = '${version}'\n`)
}

function bumpWindowsInfo(version) {
  const rel = 'build/windows/info.json'
  let text = read(rel)
  text = mustReplace(rel, text, /("file_version":\s*")[^"]+(")/, `$1${version}$2`, 'file_version')
  text = mustReplace(rel, text, /("ProductVersion":\s*")[^"]+(")/, `$1${version}$2`, 'ProductVersion')
  write(rel, text)
}

function bumpNfpm(version) {
  const rel = 'build/linux/nfpm/nfpm.yaml'
  let text = read(rel)
  text = mustReplace(rel, text, /^version:\s*"[^"]+"/m, `version: "${version}"`, 'nfpm version')
  write(rel, text)
}

function bumpWinManifest(version) {
  const rel = 'build/windows/wails.exe.manifest'
  let text = read(rel)
  text = mustReplace(
    rel,
    text,
    /(<assemblyIdentity type="win32" name="com\.example\.client" version=")[^"]+(")/,
    `$1${fourPart(version)}$2`,
    'assemblyIdentity version',
  )
  write(rel, text)
}

function bumpAndroid(version) {
  const rel = 'build/android/app/build.gradle'
  let text = read(rel)
  text = mustReplace(rel, text, /(versionName\s+")[^"]+(")/, `$1${version}$2`, 'versionName')
  text = mustReplace(rel, text, /(versionCode\s+)\d+/, `$1${androidVersionCode(version)}`, 'versionCode')
  write(rel, text)
}

function bumpDarwinPlist(rel, version) {
  let text = read(rel)
  text = replacePlistString(text, 'CFBundleVersion', version, rel)
  text = replacePlistString(text, 'CFBundleShortVersionString', version, rel)
  write(rel, text)
}

function bumpIosDevPlist(version) {
  const rel = 'build/ios/Info.dev.plist'
  let text = read(rel)
  text = replacePlistString(text, 'CFBundleVersion', version, rel)
  text = replacePlistString(text, 'CFBundleShortVersionString', `${version}-dev`, rel)
  write(rel, text)
}

function lockRootVersions(text) {
  const root = text.match(/^[\s\S]*?"name": "frontend",\s*"version": "([^"]+)"/m)
  const pkg = text.match(/"": \{\s*"name": "frontend",\s*"version": "([^"]+)"/)
  return [root?.[1], pkg?.[1]]
}

function assertNoLeftover(oldVersion, newVersion) {
  const managed = [
    'build/config.yml',
    'frontend/package.json',
    'frontend/src/constants/appVersion.ts',
    'service/mcp/server.go',
    'build/windows/info.json',
    'build/linux/nfpm/nfpm.yaml',
    'build/windows/wails.exe.manifest',
    'build/android/app/build.gradle',
    'build/darwin/Info.plist',
    'build/darwin/Info.dev.plist',
    'build/ios/Info.plist',
    'build/ios/Info.dev.plist',
    'frontend/src/components/layout/Sidebar.vue',
    'frontend/src/views/HelpPage.vue',
  ]
  const leftover = []
  for (const rel of managed) {
    const text = read(rel)
    if (rel.endsWith('.vue')) {
      if (text.includes(oldVersion) && oldVersion !== newVersion) leftover.push(rel)
      continue
    }
    if (text.includes(oldVersion) && oldVersion !== newVersion) leftover.push(rel)
    if (!text.includes(newVersion)) leftover.push(`${rel} (missing ${newVersion})`)
  }
  const [lockRoot, lockPkg] = lockRootVersions(read('frontend/package-lock.json'))
  if (lockRoot !== newVersion || lockPkg !== newVersion) {
    leftover.push(`frontend/package-lock.json (root=${lockRoot} packages=${lockPkg})`)
  }
  if (leftover.length) {
    throw new Error(`这些文件还留着旧版本号:\n${leftover.map((x) => `  ${x}`).join('\n')}`)
  }
}

const version = String(process.argv[2] || '').trim()
if (!SEMVER.test(version)) {
  console.error('用法: node scripts/bump-version.mjs 0.4.0')
  process.exit(1)
}

const oldVersion = JSON.parse(read('frontend/package.json')).version
if (oldVersion === version) {
  console.log(`已经是 ${version}，只把生成文件和打包面再对齐一遍。`)
}

bumpConfigYml(version)
bumpPackageJson(version)
bumpPackageLock(version)
bumpGo(version)
writeAppVersionTs(version)
bumpWindowsInfo(version)
bumpNfpm(version)
bumpWinManifest(version)
bumpAndroid(version)
bumpDarwinPlist('build/darwin/Info.plist', version)
bumpDarwinPlist('build/darwin/Info.dev.plist', version)
bumpDarwinPlist('build/ios/Info.plist', version)
bumpIosDevPlist(version)
assertNoLeftover(oldVersion, version)

console.log(`version ${oldVersion} -> ${version}`)
console.log('改完了。UI 读 frontend/src/constants/appVersion.ts，MCP 读 ServerVersion。')
