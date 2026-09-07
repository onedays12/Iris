import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import zhCN from '../../src/locales/zh-CN.json'
import { i18n } from '../../src/i18n/index'
import {
  PREVIEW_MAX_BYTES,
  decodePreviewBytes,
  detectPreviewEncoding,
  getPreviewKind,
  isPreviewTooLarge,
} from '../../src/features/preview/model'
import { usePreviewStore } from '../../src/stores/preview'

const mocks = vi.hoisted(() => ({
  createPreview: vi.fn(),
  fetchPreviewBytes: vi.fn(),
  fetchPreviewImageBase64: vi.fn(),
  releasePreview: vi.fn(),
}))

vi.mock('../../src/features/preview/api', () => mocks)

beforeAll(() => {
  i18n.global.setLocaleMessage('zh-CN', zhCN)
  i18n.global.locale.value = 'zh-CN'
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.releasePreview.mockResolvedValue(undefined)
})

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('preview type classification', () => {
  it('classifies known text and source files as text', () => {
    expect(getPreviewKind('flag.txt')).toBe('text')
    expect(getPreviewKind('config.json')).toBe('text')
    expect(getPreviewKind('run.ps1')).toBe('text')
    expect(getPreviewKind('main.c')).toBe('text')
    expect(getPreviewKind('App.vue')).toBe('text')
  })

  it('classifies image extensions case-insensitively', () => {
    expect(getPreviewKind('shot.PNG')).toBe('image')
    expect(getPreviewKind('photo.jpg')).toBe('image')
    expect(getPreviewKind('anim.webp')).toBe('image')
    expect(getPreviewKind('icon.ico')).toBe('image')
  })

  it('opens unknown and extensionless files as text', () => {
    expect(getPreviewKind('payload.exe')).toBe('text')
    expect(getPreviewKind('archive.zip')).toBe('text')
    expect(getPreviewKind('lib.dll')).toBe('text')
    expect(getPreviewKind('report.docx')).toBe('text')
    expect(getPreviewKind('notes.pdf')).toBe('text')
    expect(getPreviewKind('noext')).toBe('text')
    expect(getPreviewKind('.hidden')).toBe('text')
    expect(getPreviewKind('')).toBe('text')
  })

  it('enforces the 2MB size limit', () => {
    expect(isPreviewTooLarge(PREVIEW_MAX_BYTES)).toBe(false)
    expect(isPreviewTooLarge(PREVIEW_MAX_BYTES + 1)).toBe(true)
    expect(isPreviewTooLarge(0)).toBe(false)
    expect(isPreviewTooLarge(NaN)).toBe(false)
  })
})

describe('preview encoding', () => {
  it('decodes UTF-8 with and without BOM', () => {
    const raw = utf8Bytes('hello 世界')
    expect(decodePreviewBytes(raw, 'utf-8')).toBe('hello 世界')
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF, ...raw])
    expect(decodePreviewBytes(bom, 'utf-8')).toBe('hello 世界')
    expect(detectPreviewEncoding(bom)).toBe('utf-8')
  })

  it('decodes Unicode (UTF-16LE) including BOM', () => {
    const leBom = new Uint8Array([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00])
    expect(detectPreviewEncoding(leBom)).toBe('utf-16le')
    expect(decodePreviewBytes(leBom, 'utf-16le')).toBe('hi')
  })

  it('decodes GBK bytes as 中文', () => {
    const gbk = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4])
    expect(decodePreviewBytes(gbk, 'gbk')).toBe('中文')
  })

  it('maps non-ASCII bytes to ? in ASCII mode', () => {
    const mixed = new Uint8Array([0x41, 0xD6, 0x42])
    expect(decodePreviewBytes(mixed, 'ascii')).toBe('A?B')
  })
})

describe('preview store', () => {
  it('opens unknown types as text and calls the API', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text' })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\payload.exe', 'payload.exe', 1024)
    expect(mocks.createPreview).toHaveBeenCalledWith('b1', 'C:\\x\\payload.exe')
    expect(store.visible).toBe(true)
    expect(store.kind).toBe('text')
  })

  it('rejects files over 2MB without calling the API', async () => {
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\big.log', 'big.log', PREVIEW_MAX_BYTES + 1)
    expect(mocks.createPreview).not.toHaveBeenCalled()
    expect(store.visible).toBe(false)
  })

  it('creates a preview task and enters receiving state', async () => {
    mocks.createPreview.mockResolvedValue({
      previewId: 'pv-1',
      beaconId: 'b1',
      remotePath: 'C:\\x\\flag.txt',
      fileName: 'flag.txt',
      kind: 'text',
      mime: 'application/octet-stream',
      status: 'receiving',
    })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\flag.txt', 'flag.txt', 1024)
    expect(mocks.createPreview).toHaveBeenCalledWith('b1', 'C:\\x\\flag.txt')
    expect(store.visible).toBe(true)
    expect(store.previewId).toBe('pv-1')
    expect(store.status).toBe('receiving')
    expect(store.kind).toBe('text')
  })

  it('marks failed when creation errors', async () => {
    mocks.createPreview.mockRejectedValue(new Error('409 conflict'))
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\flag.txt', 'flag.txt', 1024)
    expect(store.status).toBe('failed')
    expect(store.hasError).toBe(true)
  })

  it('ignores events for a non-active preview', async () => {
    const store = usePreviewStore()
    await store.handlePreviewEvent({ preview_id: 'pv-other', status: 'ready' })
    expect(mocks.fetchPreviewBytes).not.toHaveBeenCalled()
    expect(mocks.fetchPreviewImageBase64).not.toHaveBeenCalled()
  })

  it('fetches raw bytes and renders text on ready', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text', mime: 'application/octet-stream' })
    mocks.fetchPreviewBytes.mockResolvedValue(utf8Bytes('hello world'))
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\flag.txt', 'flag.txt', 100)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'ready' })
    expect(mocks.fetchPreviewBytes).toHaveBeenCalledWith('pv-1')
    expect(store.status).toBe('ready')
    expect(store.content).toBe('hello world')
    expect(store.encoding).toBe('utf-8')
  })

  it('redecodes locally when encoding changes', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text' })
    mocks.fetchPreviewBytes.mockResolvedValue(new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]))
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\gbk.txt', 'gbk.txt', 4)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'ready' })
    store.setEncoding('gbk')
    expect(store.content).toBe('中文')
    store.setEncoding('ascii')
    expect(store.content).toBe('????')
  })

  it('renders image content as a data URL on ready', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'image', mime: 'image/png' })
    mocks.fetchPreviewImageBase64.mockResolvedValue('aGVsbG8=')
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\shot.png', 'shot.png', 100)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'ready', mime: 'image/png' })
    expect(mocks.fetchPreviewImageBase64).toHaveBeenCalledWith('pv-1')
    expect(store.status).toBe('ready')
    expect(store.content).toBe('data:image/png;base64,aGVsbG8=')
  })

  it('maps too_large failure to a friendly message', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text' })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\big.log', 'big.log', 100)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'failed', reason: 'too_large' })
    expect(store.status).toBe('failed')
    expect(store.errorMessage).toContain('2MB')
  })

  it('maps read_error failure', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text' })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\flag.txt', 'flag.txt', 100)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'failed', reason: 'read_error' })
    expect(store.status).toBe('failed')
    expect(store.errorMessage).toContain('读取失败')
  })

  it('releases the previous preview when opening a new one (singleton)', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text' })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\a.txt', 'a.txt', 10)
    expect(store.previewId).toBe('pv-1')

    mocks.createPreview.mockResolvedValue({ previewId: 'pv-2', kind: 'text' })
    await store.openPreview('b2', 'C:\\y\\b.txt', 'b.txt', 10)
    expect(mocks.releasePreview).toHaveBeenCalledWith('pv-1')
    expect(store.previewId).toBe('pv-2')
  })

  it('releases server memory on close and resets state', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text' })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\a.txt', 'a.txt', 10)
    store.close()
    expect(mocks.releasePreview).toHaveBeenCalledWith('pv-1')
    expect(store.visible).toBe(false)
    expect(store.status).toBe('idle')
    expect(store.previewId).toBe('')
  })
})
