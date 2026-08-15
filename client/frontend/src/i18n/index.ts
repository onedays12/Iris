/**
 * i18n 基础设施
 *
 * - vue-i18n v11 (composition API, legacy: false)
 * - 支持语言: zh-CN / en-US
 * - fallback: zh-CN -> key 本身
 * - locale 消息文件懒加载 (Vite dynamic import)
 */

import { createI18n } from 'vue-i18n'

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US']
export const DEFAULT_LOCALE = 'zh-CN'

export function normalizeLocale(value: unknown): string {
  const locale = String(value || '').trim().toLowerCase()
  if (locale.startsWith('zh')) return 'zh-CN'
  if (locale.startsWith('en')) return 'en-US'
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': {},
    'en-US': {},
  },
})

const localeLoaders: Record<string, () => Promise<unknown>> = {
  'zh-CN': () => import('../locales/zh-CN.json'),
  'en-US': () => import('../locales/en-US.json'),
}

const loadedLocales = new Set<string>()

/**
 * 懒加载并注册指定语言的翻译消息 (幂等)。
 * 加载失败时保留回退语言, 由调用方决定是否告警。
 */
export async function loadLocale(locale: unknown): Promise<void> {
  const normalized = normalizeLocale(locale)
  if (loadedLocales.has(normalized)) return
  const loader = localeLoaders[normalized]
  if (!loader) return
  const messages = await loader()
  const messageData = ((messages as { default?: unknown }).default || messages) as Parameters<typeof i18n.global.setLocaleMessage>[1]
  i18n.global.setLocaleMessage(normalized, messageData)
  loadedLocales.add(normalized)
}
