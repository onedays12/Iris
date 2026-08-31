import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import zhCN from '../../src/locales/zh-CN.json'
import { i18n } from '../../src/i18n/index'
import {
  PREVIEW_MAX_BYTES,
  getPreviewKind,
  isPreviewTooLarge,
} from '../../src/features/preview/model'
import { usePreviewStore } from '../../src/stores/preview'

const mocks = vi.hoisted(() => ({
  createPreview: vi.fn(),
  fetchPreviewText: vi.fn(),
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

describe('preview type whitelist (mirrors TeamServer codec.go)', () => {
  it('classifies text extensions', () => {
    expect(getPreviewKind('flag.txt')).toBe('text')
    expect(getPreviewKind('config.json')).toBe('text')
    expect(getPreviewKind('run.ps1')).toBe('text')
    expect(getPreviewKind('a.yaml')).toBe('text')
    expect(getPreviewKind('notes.md')).toBe('text')
    expect(getPreviewKind('data.csv')).toBe('text')
  })

  it('classifies script and source-code extensions', () => {
    // C/C++ 及其他语言源码
    expect(getPreviewKind('main.c')).toBe('text')
    expect(getPreviewKind('util.cpp')).toBe('text')
    expect(getPreviewKind('header.HPP')).toBe('text')
    expect(getPreviewKind('server.go')).toBe('text')
    expect(getPreviewKind('App.java')).toBe('text')
    expect(getPreviewKind('service.cs')).toBe('text')
    expect(getPreviewKind('lib.rs')).toBe('text')

    // 脚本类
    expect(getPreviewKind('deploy.bash')).toBe('text')
    expect(getPreviewKind('login.zsh')).toBe('text')
    expect(getPreviewKind('mod.psm1')).toBe('text')
    expect(getPreviewKind('profile.psd1')).toBe('text')
    expect(getPreviewKind('init.lua')).toBe('text')
    expect(getPreviewKind('build.pl')).toBe('text')
    expect(getPreviewKind('index.php')).toBe('text')
    expect(getPreviewKind('app.rb')).toBe('text')
    expect(getPreviewKind('launch.pyw')).toBe('text')

    // 前端类
    expect(getPreviewKind('style.css')).toBe('text')
    expect(getPreviewKind('theme.scss')).toBe('text')
    expect(getPreviewKind('vars.less')).toBe('text')
    expect(getPreviewKind('App.vue')).toBe('text')
    expect(getPreviewKind('comp.jsx')).toBe('text')
    expect(getPreviewKind('comp.tsx')).toBe('text')

    // 汇编
    expect(getPreviewKind('stager.asm')).toBe('text')
    expect(getPreviewKind('include.inc')).toBe('text')
  })

  it('classifies config, markup, web-template and build extensions', () => {
    // 配置/数据/文档
    expect(getPreviewKind('web.config')).toBe('text')
    expect(getPreviewKind('README.markdown')).toBe('text')
    expect(getPreviewKind('doc.rst')).toBe('text')
    expect(getPreviewKind('guide.adoc')).toBe('text')
    expect(getPreviewKind('thesis.tex')).toBe('text')
    expect(getPreviewKind('Cargo.lock')).toBe('text')
    expect(getPreviewKind('events.jsonl')).toBe('text')
    expect(getPreviewKind('trace.ndjson')).toBe('text')
    expect(getPreviewKind('fix.diff')).toBe('text')
    expect(getPreviewKind('change.patch')).toBe('text')
    expect(getPreviewKind('driver.inf')).toBe('text')
    expect(getPreviewKind('host.plist')).toBe('text')
    expect(getPreviewKind('sshd.service')).toBe('text')
    expect(getPreviewKind('backup.timer')).toBe('text')
    expect(getPreviewKind('main.tf')).toBe('text')
    expect(getPreviewKind('env.tfvars')).toBe('text')
    expect(getPreviewKind('api.proto')).toBe('text')

    // Web 模板/服务端页面
    expect(getPreviewKind('shell.aspx')).toBe('text')
    expect(getPreviewKind('legacy.asp')).toBe('text')
    expect(getPreviewKind('widget.ascx')).toBe('text')
    expect(getPreviewKind('view.cshtml')).toBe('text')
    expect(getPreviewKind('site.master')).toBe('text')
    expect(getPreviewKind('page.jsp')).toBe('text')
    expect(getPreviewKind('run.cgi')).toBe('text')
    expect(getPreviewKind('mail.erb')).toBe('text')
    expect(getPreviewKind('tpl.ejs')).toBe('text')
    expect(getPreviewKind('layout.pug')).toBe('text')

    // 其他语言源码
    expect(getPreviewKind('Form.vb')).toBe('text')
    expect(getPreviewKind('Lib.fs')).toBe('text')
    expect(getPreviewKind('App.kt')).toBe('text')
    expect(getPreviewKind('Main.scala')).toBe('text')
    expect(getPreviewKind('app.dart')).toBe('text')
    expect(getPreviewKind('router.exs')).toBe('text')
    expect(getPreviewKind('math.erl')).toBe('text')
    expect(getPreviewKind('Main.hs')).toBe('text')
    expect(getPreviewKind('core.clj')).toBe('text')
    expect(getPreviewKind('app.nim')).toBe('text')
    expect(getPreviewKind('main.zig')).toBe('text')
    expect(getPreviewKind('plot.jl')).toBe('text')
    expect(getPreviewKind('stats.r')).toBe('text')

    // 构建/工程/汇编补充
    expect(getPreviewKind('kernel.s')).toBe('text')
    expect(getPreviewKind('script.ld')).toBe('text')
    expect(getPreviewKind('resolve.idc')).toBe('text')
    expect(getPreviewKind('app.rc')).toBe('text')
    expect(getPreviewKind('exports.def')).toBe('text')
    expect(getPreviewKind('app.manifest')).toBe('text')
    expect(getPreviewKind('kernel.vcxproj')).toBe('text')
    expect(getPreviewKind('common.props')).toBe('text')
    expect(getPreviewKind('app.targets')).toBe('text')
    expect(getPreviewKind('build.gradle')).toBe('text')
    expect(getPreviewKind('pipeline.groovy')).toBe('text')
    expect(getPreviewKind('toolchain.cmake')).toBe('text')
    expect(getPreviewKind('Makefile.mk')).toBe('text')
    expect(getPreviewKind('rule.bzl')).toBe('text')
    expect(getPreviewKind('Image.dockerfile')).toBe('text')
  })

  it('classifies image extensions case-insensitively', () => {
    expect(getPreviewKind('shot.PNG')).toBe('image')
    expect(getPreviewKind('photo.jpg')).toBe('image')
    expect(getPreviewKind('anim.webp')).toBe('image')
    expect(getPreviewKind('icon.ico')).toBe('image')
  })

  it('rejects unsupported / extensionless files', () => {
    expect(getPreviewKind('payload.exe')).toBeNull()
    expect(getPreviewKind('archive.zip')).toBeNull()
    expect(getPreviewKind('lib.dll')).toBeNull()
    expect(getPreviewKind('report.docx')).toBeNull()
    expect(getPreviewKind('notes.pdf')).toBeNull()
    expect(getPreviewKind('libc.so')).toBeNull()
    expect(getPreviewKind('noext')).toBeNull()
    expect(getPreviewKind('.hidden')).toBeNull()
    expect(getPreviewKind('')).toBeNull()
  })

  it('enforces the 2MB size limit', () => {
    expect(isPreviewTooLarge(PREVIEW_MAX_BYTES)).toBe(false)
    expect(isPreviewTooLarge(PREVIEW_MAX_BYTES + 1)).toBe(true)
    expect(isPreviewTooLarge(0)).toBe(false)
    expect(isPreviewTooLarge(NaN)).toBe(false)
  })
})

describe('preview store', () => {
  it('rejects unsupported types without calling the API', async () => {
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\payload.exe', 'payload.exe', 1024)
    expect(mocks.createPreview).not.toHaveBeenCalled()
    expect(store.visible).toBe(false)
    expect(store.status).toBe('idle')
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
      mime: 'text/plain; charset=utf-8',
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
    expect(mocks.fetchPreviewText).not.toHaveBeenCalled()
    expect(mocks.fetchPreviewImageBase64).not.toHaveBeenCalled()
  })

  it('fetches and renders text content on ready', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text', mime: 'text/plain; charset=utf-8' })
    mocks.fetchPreviewText.mockResolvedValue('hello world')
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\flag.txt', 'flag.txt', 100)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'ready', mime: 'text/plain; charset=utf-8' })
    expect(mocks.fetchPreviewText).toHaveBeenCalledWith('pv-1')
    expect(store.status).toBe('ready')
    expect(store.content).toBe('hello world')
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
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text', mime: 'text/plain; charset=utf-8' })
    const store = usePreviewStore()
    await store.openPreview('b1', 'C:\\x\\big.log', 'big.log', 100)
    await store.handlePreviewEvent({ preview_id: 'pv-1', status: 'failed', reason: 'too_large' })
    expect(store.status).toBe('failed')
    expect(store.errorMessage).toContain('2MB')
  })

  it('maps read_error failure', async () => {
    mocks.createPreview.mockResolvedValue({ previewId: 'pv-1', kind: 'text', mime: 'text/plain; charset=utf-8' })
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
