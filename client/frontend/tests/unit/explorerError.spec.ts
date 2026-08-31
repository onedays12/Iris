import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import zhCN from '../../src/locales/zh-CN.json'
import { i18n } from '../../src/i18n/index'

// explorerFiles 的 REST 调用在单测里拒绝,验证 catch 分支与 pending 清理
vi.mock('../../src/features/files/api/fileApi', () => ({
  explorerFiles: vi.fn().mockRejectedValue(new Error('rest offline')),
}))

import { useExplorerStore } from '../../src/stores/explorer'

beforeAll(() => {
  i18n.global.setLocaleMessage('zh-CN', zhCN)
  i18n.global.locale.value = 'zh-CN'
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('explorer error feedback', () => {
  it('writes the error into the pending request cache node and releases the lock', () => {
    const store = useExplorerStore()
    store.pendingByBeacon['bk-1'] = 'c:\\'
    store.loadingPaths['bk-1'] = new Set(['c:\\'])

    store.handleExplorerError('bk-1', '任务失败: unexpected trailing explorer result data: 170 bytes')

    const node = store.getCacheNode('bk-1', 'c:\\')
    expect(node?.errorMessage).toContain('unexpected trailing explorer result data')
    expect(store.isPathLoading('bk-1', 'c:\\')).toBe(false)
    expect(store.pendingByBeacon['bk-1']).toBeUndefined()
  })

  it('falls back to the focused ui path when no pending request exists', () => {
    const store = useExplorerStore()
    store.uiCurrentPath['bk-2'] = 'C:\\Users'

    store.handleExplorerError('bk-2', '目录加载超时')

    const node = store.getCacheNode('bk-2', 'C:\\Users')
    expect(node?.errorMessage).toBe('目录加载超时')
  })

  it('keeps the modal away from the empty-directory illusion', () => {
    const store = useExplorerStore()
    store.pendingByBeacon['bk-3'] = 'c:\\'

    store.handleExplorerError('bk-3', 'boom')

    // 模态框空态分支条件: hasCache(node.isLoaded) 为假 且 isGlobalLoading 为假。
    // 修复前错误被丢弃 → 走进"该目录为空";修复后 node.errorMessage 存在 → 错误态。
    const node = store.getCacheNode('bk-3', 'c:\\')
    expect(node?.isLoaded).toBe(false)
    expect(node?.errorMessage).toBe('boom')
  })

  it('clears pending state after a rest-level failure in loadDirectory', async () => {
    const store = useExplorerStore()

    await store.loadDirectory('bk-4', 'c:\\')

    const node = store.getCacheNode('bk-4', 'c:\\')
    expect(node?.errorMessage).toBe('rest offline')
    expect(store.pendingByBeacon['bk-4']).toBeUndefined()
    expect(store.isPathLoading('bk-4', 'c:\\')).toBe(false)
  })
})
