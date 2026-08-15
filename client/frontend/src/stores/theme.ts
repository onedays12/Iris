/**
 * 主题切换 Store
 * 管理 UI 主题（liquid/dark/paper/sketch）的切换与持久化。
 */

import { defineStore } from 'pinia'

const STORAGE_KEY = 'ui-theme'
const THEMES = ['liquid', 'dark', 'paper', 'sketch'] as const

export type ThemeName = (typeof THEMES)[number]

interface ThemeState {
  currentTheme: ThemeName
}

function normalizeTheme(value: unknown): ThemeName {
  const theme = String(value || '').trim().toLowerCase()
  return (THEMES as readonly string[]).includes(theme) ? theme as ThemeName : 'liquid'
}

function applyTheme(theme: unknown): void {
  document.documentElement.dataset.uiTheme = normalizeTheme(theme)
}

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => ({
    currentTheme: 'liquid',
  }),

  getters: {
    isDark: (state) => state.currentTheme === 'dark',
    isPaper: (state) => state.currentTheme === 'paper',
    isSketch: (state) => state.currentTheme === 'sketch',
    label: (state) => ({ liquid: 'Liquid', dark: 'Dark', paper: 'Paper', sketch: 'Sketch' })[state.currentTheme] || 'Liquid',
    nextLabel: (state) => {
      const idx = THEMES.indexOf(state.currentTheme)
      return THEMES[(idx + 1) % THEMES.length].charAt(0).toUpperCase() + THEMES[(idx + 1) % THEMES.length].slice(1)
    },
  },

  actions: {
    initTheme(): void {
      const savedTheme = normalizeTheme(localStorage.getItem(STORAGE_KEY))
      this.currentTheme = savedTheme
      applyTheme(savedTheme)
    },

    setTheme(theme: unknown): void {
      const normalized = normalizeTheme(theme)
      this.currentTheme = normalized
      localStorage.setItem(STORAGE_KEY, normalized)
      applyTheme(normalized)
    },

    toggleTheme(): void {
      const idx = THEMES.indexOf(this.currentTheme)
      this.setTheme(THEMES[(idx + 1) % THEMES.length])
    },
  },
})
