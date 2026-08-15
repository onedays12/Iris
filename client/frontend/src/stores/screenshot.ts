/**
 * 截图管理 Store
 * 负责截图列表的加载、规范化，以及按 beaconid 过滤。
 */

import { defineStore } from 'pinia'
import { listScreenshots } from '../features/screenshots/api/screenshotApi'
import { normalizeScreenshot, sameScreenshot } from '../features/screenshots/model'
import { i18n } from '../i18n/index'
import type { Screenshot } from '../features/screenshots/model'

interface ScreenshotState {
  screenshots: Screenshot[]
  loading: boolean
  error: string
  lastUpdated: number
}

export const useScreenshotStore = defineStore('screenshot', {
  state: (): ScreenshotState => ({
    screenshots: [],
    loading: false,
    error: '',
    lastUpdated: 0,
  }),

  actions: {
    async fetchScreenshots({ silent = false }: { silent?: boolean } = {}): Promise<Screenshot[]> {
      if (!silent) this.loading = true
      this.error = ''

      try {
        const data = await listScreenshots()
        const list = Array.isArray(data) ? data : []
        this.screenshots = list
          .map(normalizeScreenshot)
          .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))
        this.lastUpdated = Date.now()
        return this.screenshots
      } catch (err) {
        this.error = (err instanceof Error ? err.message : String(err)) || i18n.global.t('screenshots.fetchFailed')
        throw err
      } finally {
        if (!silent) this.loading = false
      }
    },

    upsertScreenshot(item: unknown): void {
      const next = normalizeScreenshot(item)
      if (!next.screenshotId && !next.fileName) return

      const index = this.screenshots.findIndex(current => sameScreenshot(current, next))
      if (index >= 0) {
        this.screenshots.splice(index, 1, {
          ...this.screenshots[index],
          ...next,
        })
      } else {
        this.screenshots.unshift(next)
      }

      this.screenshots.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))
      this.lastUpdated = Date.now()
    },

    removeScreenshot(target: unknown): void {
      const normalized = normalizeScreenshot(target)
      this.screenshots = this.screenshots.filter(current => !sameScreenshot(current, normalized))
      this.lastUpdated = Date.now()
    },

    clear(): void {
      this.screenshots = []
      this.error = ''
      this.lastUpdated = 0
    },
  },
})
