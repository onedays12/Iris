/**
 * 截图管理 Store
 * 负责截图列表的加载、规范化，以及按 beaconid 过滤。
 */

import { defineStore } from 'pinia'
import { listScreenshots } from '../features/screenshots/api/screenshotApi.js'
import { pick, toNumber } from '../utils/object.js'

function normalizeScreenshot(item) {
  const screenshotId = String(pick(item, ['screenshot_id', 'screenshotId', 'ScreenshotID', 'ScreenshotId']))
  return {
    screenshotId,
    beaconId: String(pick(item, ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId'])),
    hostname: String(pick(item, ['hostname', 'host_name', 'hostName', 'Hostname'], '未知')),
    username: String(pick(item, ['username', 'user_name', 'userName', 'Username'], '未知')),
    resolution: String(pick(item, ['resolution', 'Resolution'], '-')),
    imageSize: toNumber(pick(item, ['image_size', 'imageSize', 'ImageSize'], 0)),
    capturedAt: toNumber(pick(item, ['captured_at', 'capturedAt', 'CapturedAt'], 0)),
    fileName: String(pick(item, ['file_name', 'fileName', 'FileName'], 'screenshot.jpg')),
    previewUrl: String(pick(item, ['preview_url', 'previewUrl', 'PreviewURL', 'PreviewUrl'], '')),
    downloadUrl: String(pick(item, ['download_url', 'downloadUrl', 'DownloadURL', 'DownloadUrl'], '')),
    raw: item,
  }
}

function sameScreenshot(left, right) {
  if (left.screenshotId && right.screenshotId && left.screenshotId === right.screenshotId) return true
  if (left.fileName && right.fileName && left.fileName === right.fileName) return true
  return Boolean(
    left.beaconId &&
    right.beaconId &&
    left.beaconId === right.beaconId &&
    left.capturedAt &&
    right.capturedAt &&
    left.capturedAt === right.capturedAt
  )
}

export const useScreenshotStore = defineStore('screenshot', {
  state: () => ({
    screenshots: [],
    loading: false,
    error: '',
    lastUpdated: 0,
  }),

  actions: {
    async fetchScreenshots({ silent = false } = {}) {
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
        this.error = err.message || '获取截图列表失败'
        throw err
      } finally {
        if (!silent) this.loading = false
      }
    },

    upsertScreenshot(item) {
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

    removeScreenshot(target) {
      const normalized = normalizeScreenshot(target)
      this.screenshots = this.screenshots.filter(current => !sameScreenshot(current, normalized))
      this.lastUpdated = Date.now()
    },

    clear() {
      this.screenshots = []
      this.error = ''
      this.lastUpdated = 0
    },
  },
})
