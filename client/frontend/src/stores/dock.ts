/**
 * BottomDock 布局状态:高度 / 收起态 / 激活 tab,localStorage 持久化。
 *
 * dock 是应用骨架的一部分(主内容区 + 底部多合一面板),控制台/事件流/传输监控
 * 三个 tab 的可见性由本 store 驱动;控制台联动(M2)经 openConsoleTab 切换并展开。
 */

import { defineStore } from 'pinia'

const STORAGE_KEY = 'c2.bottom-dock'

export const DOCK_DEFAULT_HEIGHT = 300
export const DOCK_MIN_HEIGHT = 140
// 高度上限:视口的 60%,保证主内容区始终有可用空间
export function dockMaxHeight(): number {
  if (typeof window === 'undefined') return 600
  return Math.max(DOCK_MIN_HEIGHT, Math.floor(window.innerHeight * 0.6))
}
export const DOCK_COLLAPSED_HEIGHT = 36

export type DockTab = 'console' | 'events' | 'transfers'

const DOCK_TABS: DockTab[] = ['console', 'events', 'transfers']

interface PersistedDock {
  height?: number
  collapsed?: boolean
  activeTab?: DockTab
}

function loadPersisted(): PersistedDock {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedDock) : {}
  } catch {
    return {}
  }
}

function clampHeight(value: number): number {
  const max = dockMaxHeight()
  return Math.min(max, Math.max(DOCK_MIN_HEIGHT, Math.round(value)))
}

export const useDockStore = defineStore('dock', {
  state: () => {
    const saved = loadPersisted()
    return {
      height: clampHeight(Number(saved.height) || DOCK_DEFAULT_HEIGHT),
      collapsed: Boolean(saved.collapsed),
      activeTab: (DOCK_TABS.includes(saved.activeTab as DockTab) ? saved.activeTab : 'console') as DockTab,
    }
  },

  getters: {
    /** 渲染用实际高度:收起时为细条高度。 */
    effectiveHeight(state): number {
      return state.collapsed ? DOCK_COLLAPSED_HEIGHT : state.height
    },
  },

  actions: {
    persist(): void {
      if (typeof window === 'undefined') return
      try {
        const blob: PersistedDock = { height: this.height, collapsed: this.collapsed, activeTab: this.activeTab }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
      } catch {
        // 存储不可用(隐私模式等)时静默跳过,布局仍在本会话内生效
      }
    },

    setHeight(value: number): void {
      this.height = clampHeight(value)
      this.persist()
    },

    setCollapsed(collapsed: boolean): void {
      this.collapsed = collapsed
      this.persist()
    },

    toggleCollapsed(): void {
      this.setCollapsed(!this.collapsed)
    },

    setTab(tab: DockTab): void {
      this.activeTab = tab
      this.persist()
    },

    /**
     * 控制台联动入口(双击 beacon 行):展开 dock、切到控制台 tab。
     * 会话与聚焦由 console store / ConsolePanel 处理(M2)。
     */
    openConsoleTab(): void {
      this.activeTab = 'console'
      this.collapsed = false
      this.persist()
    },
  },
})
