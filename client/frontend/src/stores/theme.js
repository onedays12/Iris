/**
 * 主题切换 Store
 * 管理 UI 主题（liquid/dark）的切换与持久化。
 */

import { defineStore } from 'pinia'

const STORAGE_KEY = 'ui-theme'
const THEMES = ['liquid', 'dark']

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
    label: (state) => state.currentTheme === 'dark' ? 'Dark' : 'Liquid',
    nextLabel: (state) => state.currentTheme === 'dark' ? 'Liquid' : 'Dark',
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
      this.setTheme(this.currentTheme === 'dark' ? 'liquid' : 'dark')
    },
  },
})
