/**
 * 主题切换 Store
 * 管理 UI 主题（liquid/dark）的切换与持久化。
 */

import { defineStore } from 'pinia'

const STORAGE_KEY = 'ui-theme'
const THEMES = ['liquid', 'dark', 'paper']

function normalizeTheme(value) {
  const theme = String(value || '').trim().toLowerCase()
  return THEMES.includes(theme) ? theme : 'liquid'
}

function applyTheme(theme) {
  document.documentElement.dataset.uiTheme = normalizeTheme(theme)
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    currentTheme: 'liquid',
  }),

  getters: {
    isDark: (state) => state.currentTheme === 'dark',
    isPaper: (state) => state.currentTheme === 'paper',
    label: (state) => ({ liquid: 'Liquid', dark: 'Dark', paper: 'Paper' })[state.currentTheme] || 'Liquid',
    nextLabel: (state) => {
      const idx = THEMES.indexOf(state.currentTheme)
      return THEMES[(idx + 1) % THEMES.length].charAt(0).toUpperCase() + THEMES[(idx + 1) % THEMES.length].slice(1)
    },
  },

  actions: {
    initTheme() {
      const savedTheme = normalizeTheme(localStorage.getItem(STORAGE_KEY))
      this.currentTheme = savedTheme
      applyTheme(savedTheme)
    },

    setTheme(theme) {
      const normalized = normalizeTheme(theme)
      this.currentTheme = normalized
      localStorage.setItem(STORAGE_KEY, normalized)
      applyTheme(normalized)
    },

    toggleTheme() {
      const idx = THEMES.indexOf(this.currentTheme)
      this.setTheme(THEMES[(idx + 1) % THEMES.length])
    },
  },
})
