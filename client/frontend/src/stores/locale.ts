/**
 * 语言切换 Store
 *
 * 管理 UI 语言 (zh-CN / en-US) 的切换与持久化,
 * 模式与 theme.js 保持一致: localStorage + store + DOM attribute。
 */

import { defineStore } from 'pinia'
import { i18n, loadLocale, normalizeLocale, SUPPORTED_LOCALES } from '../i18n/index'

const STORAGE_KEY = 'ui-locale'

function detectSystemLocale(): string {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return normalizeLocale(navigator.language)
    }
  } catch {
    // ignore
  }
  return normalizeLocale('')
}

interface LocaleState {
  currentLocale: string
}

export const useLocaleStore = defineStore('locale', {
  state: (): LocaleState => ({
    currentLocale: 'zh-CN',
  }),

  getters: {
    /** 按钮上显示的目标语言标记 */
    nextLabel: (state) => (state.currentLocale === 'zh-CN' ? 'EN' : '中'),
  },

  actions: {
    /** 应用启动时初始化: 优先读 localStorage, 否则按系统语言检测并持久化 */
    async initLocale(): Promise<void> {
      let saved = ''
      try {
        saved = localStorage.getItem(STORAGE_KEY) || ''
      } catch {
        // ignore
      }
      const initial = saved ? normalizeLocale(saved) : detectSystemLocale()
      await this.setLocale(initial, { persist: !saved })
    },

    /** 切换并持久化语言; 同步 i18n locale 与 document lang */
    async setLocale(locale: unknown, { persist = true }: { persist?: boolean } = {}): Promise<void> {
      const normalized = normalizeLocale(locale)
      if (!SUPPORTED_LOCALES.includes(normalized)) return

      await loadLocale(normalized)
      this.currentLocale = normalized
      i18n.global.locale.value = normalized as 'zh-CN' | 'en-US'
      try {
        document.documentElement.lang = normalized
      } catch {
        // ignore
      }
      if (persist) {
        try {
          localStorage.setItem(STORAGE_KEY, normalized)
        } catch {
          // ignore
        }
      }
    },

    /** 在中 / EN 之间切换 */
    async toggleLocale(): Promise<void> {
      await this.setLocale(this.currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN')
    },
  },
})
