/**
 * 文件预览 - 领域模型与类型判定
 *
 * 白名单与 TeamServer 后端 (server/transfer/codec.go classifyPreviewPath)
 * 保持一致，避免前端可预览而后端拒绝的偏差。
 */

/** 预览内容字节上限（与后端 MaxPreviewBytes 一致）。 */
export const PREVIEW_MAX_BYTES = 2 * 1024 * 1024

export type PreviewKind = 'text' | 'image'

/** 文本/脚本类扩展名（小写，不含点；镜像后端 previewTextExts）。
 *  分组与 TeamServer server/transfer/codec.go 保持一致,增删必须两端同步。 */
const TEXT_EXTENSIONS = new Set<string>([
  // 配置/日志/标记/数据
  'txt', 'log', 'ini', 'conf', 'cfg',
  'config', 'xml', 'json', 'yml', 'yaml',
  'toml', 'md', 'markdown', 'rst', 'adoc',
  'org', 'tex', 'csv', 'tsv', 'properties',
  'env', 'lst', 'reg', 'sql',
  'lock', 'jsonl', 'ndjson', 'diff', 'patch',
  'inf', 'plist', 'service', 'timer',
  'tf', 'tfvars', 'proto',
  // 脚本（Windows）
  'ps1', 'psm1', 'psd1', 'bat', 'cmd', 'vbs',
  // 脚本（Unix/Web）
  'sh', 'bash', 'zsh', 'lua', 'pl', 'pm',
  'php', 'rb', 'py', 'pyw',
  // Web 模板/服务端页面
  'asp', 'aspx', 'ascx', 'asmx', 'cshtml',
  'master', 'shtml', 'jsp', 'jspx', 'cgi',
  'erb', 'ejs', 'pug', 'haml', 'twig',
  // 前端
  'js', 'html', 'htm', 'css', 'scss', 'less',
  'vue', 'jsx', 'tsx',
  // C/C++ 及其他语言源码
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh',
  'go', 'java', 'cs', 'rs', 'swift',
  'vb', 'fs', 'kt', 'kts', 'scala', 'dart',
  'ex', 'exs', 'erl', 'hrl', 'hs',
  'clj', 'cljs', 'edn', 'nim', 'zig',
  'jl', 'r',
  // 汇编 / 构建 / IDE 工程
  'asm', 'inc', 's', 'ld', 'idc',
  'rc', 'def', 'manifest',
  'sln', 'csproj', 'vcxproj', 'vbproj', 'fsproj',
  'props', 'targets',
  'gradle', 'groovy', 'cmake', 'mk',
  'bzl', 'dockerfile',
])

/** 图片类扩展名到 MIME 的映射（镜像后端 previewImageMimes）。 */
const IMAGE_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  ico: 'image/x-icon',
}

/**
 * 按扩展名判定预览类型。
 * @returns 'text' | 'image'，不支持预览时返回 null。
 */
export function getPreviewKind(fileName: string): PreviewKind | null {
  const name = String(fileName || '')
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  const ext = name.slice(dot + 1).toLowerCase()
  if (IMAGE_MIME_MAP[ext]) return 'image'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return null
}

/** 扩展名对应的图片 MIME（非图片返回空串）。 */
export function getPreviewImageMime(fileName: string): string {
  const name = String(fileName || '')
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return IMAGE_MIME_MAP[name.slice(dot + 1).toLowerCase()] || ''
}

/** 是否超出预览大小上限。 */
export function isPreviewTooLarge(size: number): boolean {
  return Number(size) > PREVIEW_MAX_BYTES
}
