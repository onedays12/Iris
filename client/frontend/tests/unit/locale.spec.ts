import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, normalizeLocale } from '../../src/i18n/index'
import { useLocaleStore } from '../../src/stores/locale'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  document.documentElement.lang = ''
})

describe('normalizeLocale', () => {
  it('maps zh variants to zh-CN', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN')
    expect(normalizeLocale('zh')).toBe('zh-CN')
    expect(normalizeLocale('ZH-HANS')).toBe('zh-CN')
  })

  it('maps en variants to en-US', () => {
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('en')).toBe('en-US')
    expect(normalizeLocale('EN-GB')).toBe('en-US')
  })

  it('falls back to zh-CN for unknown or empty input', () => {
    expect(normalizeLocale('')).toBe('zh-CN')
    expect(normalizeLocale(null)).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
    expect(normalizeLocale('fr-FR')).toBe('zh-CN')
  })
})

describe('locale store', () => {
  it('loads messages and persists on setLocale', async () => {
    const store = useLocaleStore()

    await store.setLocale('en-US')

    expect(store.currentLocale).toBe('en-US')
    expect(i18n.global.locale.value).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
    expect(localStorage.getItem('ui-locale')).toBe('en-US')
    expect(i18n.global.t('common.cancel')).toBe('Cancel')
  })

  it('switches messages back to zh-CN', async () => {
    const store = useLocaleStore()

    await store.setLocale('en-US')
    expect(i18n.global.t('common.cancel')).toBe('Cancel')

    await store.setLocale('zh-CN')
    expect(i18n.global.t('common.cancel')).toBe('取消')
    expect(localStorage.getItem('ui-locale')).toBe('zh-CN')
  })

  it('toggles between zh-CN and en-US', async () => {
    const store = useLocaleStore()

    await store.setLocale('zh-CN')
    await store.toggleLocale()
    expect(store.currentLocale).toBe('en-US')

    await store.toggleLocale()
    expect(store.currentLocale).toBe('zh-CN')
  })

  it('initLocale prefers the saved value', async () => {
    localStorage.setItem('ui-locale', 'en-US')
    const store = useLocaleStore()

    await store.initLocale()

    expect(store.currentLocale).toBe('en-US')
    expect(localStorage.getItem('ui-locale')).toBe('en-US')
  })

  it('initLocale detects system language when nothing is saved', async () => {
    // jsdom default navigator.language is 'en-US'
    const store = useLocaleStore()

    await store.initLocale()

    expect(store.currentLocale).toBe('en-US')
    expect(localStorage.getItem('ui-locale')).toBe('en-US')
  })
})
