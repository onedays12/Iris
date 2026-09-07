/**
 * 文件预览 - 领域模型与类型判定
 *
 * 图片按扩展名走原图预览；其余一律按文本打开（无扩展名、exe、zip 等也允许查看）。
 * 文本保留原始字节，由前端按用户选择的编码解码。
 */

/** 预览内容字节上限（与后端 MaxPreviewBytes 一致）。 */
export const PREVIEW_MAX_BYTES = 2 * 1024 * 1024

export type PreviewKind = 'text' | 'image'

/** 用户可选的文本预览编码。Unicode 表示 UTF-16LE（Windows 记事本里的 Unicode）。 */
export type PreviewEncoding = 'utf-8' | 'utf-16le' | 'gbk' | 'ascii'

export const PREVIEW_ENCODINGS: { value: PreviewEncoding; label: string }[] = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'utf-16le', label: 'Unicode' },
  { value: 'gbk', label: 'GBK' },
  { value: 'ascii', label: 'ASCII' },
]

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

function fileExtension(fileName: string): string {
  const name = String(fileName || '')
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const base = slash >= 0 ? name.slice(slash + 1) : name
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * 按扩展名判定预览类型。
 * 图片走原图；其余（含无扩展名）一律按文本打开。
 */
export function getPreviewKind(fileName: string): PreviewKind {
  const ext = fileExtension(fileName)
  if (ext && IMAGE_MIME_MAP[ext]) return 'image'
  return 'text'
}

/** 扩展名对应的图片 MIME（非图片返回空串）。 */
export function getPreviewImageMime(fileName: string): string {
  const ext = fileExtension(fileName)
  return ext ? (IMAGE_MIME_MAP[ext] || '') : ''
}

/** 是否超出预览大小上限。 */
export function isPreviewTooLarge(size: number): boolean {
  return Number(size) > PREVIEW_MAX_BYTES
}

function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE
}

function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF
}

/** 按 BOM 给出默认编码；无 BOM 时默认 UTF-8（用户可再手动切换）。 */
export function detectPreviewEncoding(bytes: Uint8Array): PreviewEncoding {
  if (hasUtf16LeBom(bytes) || hasUtf16BeBom(bytes)) return 'utf-16le'
  if (hasUtf8Bom(bytes)) return 'utf-8'
  return 'utf-8'
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  let offset = 0
  if (littleEndian && hasUtf16LeBom(bytes)) offset = 2
  else if (!littleEndian && hasUtf16BeBom(bytes)) offset = 2
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset)
  const units = Math.floor(view.byteLength / 2)
  const codes = new Uint16Array(units)
  for (let i = 0; i < units; i += 1) {
    codes[i] = view.getUint16(i * 2, littleEndian)
  }
  const chunk = 0x8000
  let out = ''
  for (let i = 0; i < codes.length; i += chunk) {
    out += String.fromCharCode(...codes.subarray(i, i + chunk))
  }
  return out
}

function decodeGbk(bytes: Uint8Array): string {
  for (const label of ['gbk', 'gb18030', 'gb2312'] as const) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes)
    } catch {
      // jsdom / 部分引擎没有 GBK 标签，继续尝试
    }
  }
  return decodeUtf8(bytes)
}

function decodeAscii(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]
    out += b <= 0x7F ? String.fromCharCode(b) : '?'
  }
  return out
}

function decodeUtf8(bytes: Uint8Array): string {
  const start = hasUtf8Bom(bytes) ? 3 : 0
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start))
}

/** 按选定编码把原始字节解码成可显示文本。 */
export function decodePreviewBytes(bytes: Uint8Array, encoding: PreviewEncoding): string {
  if (!bytes || bytes.length === 0) return ''
  switch (encoding) {
    case 'utf-16le':
      if (hasUtf16BeBom(bytes)) return decodeUtf16(bytes, false)
      return decodeUtf16(bytes, true)
    case 'gbk':
      return decodeGbk(bytes)
    case 'ascii':
      return decodeAscii(bytes)
    case 'utf-8':
    default:
      return decodeUtf8(bytes)
  }
}
