import { pickScreenshot } from '../../shared/protocol/adapter'
import { toNumber } from '../../utils/object'

export interface Screenshot {
  screenshotId: string
  beaconId: string
  hostname: string
  username: string
  resolution: string
  imageSize: number
  capturedAt: number
  fileName: string
  previewUrl: string
  downloadUrl: string
  raw: unknown
}

export function normalizeScreenshot(item: unknown): Screenshot {
  const c = pickScreenshot(item)
  return {
    screenshotId: String(c.screenshotId),
    beaconId: String(c.beaconId),
    hostname: String(c.hostname || '未知'),
    username: String(c.username || '未知'),
    resolution: String(c.resolution || '-'),
    imageSize: toNumber(c.imageSize),
    capturedAt: toNumber(c.capturedAt),
    fileName: String(c.fileName || 'screenshot.jpg'),
    previewUrl: String(c.previewUrl),
    downloadUrl: String(c.downloadUrl),
    raw: item,
  }
}

export function sameScreenshot(left: Screenshot, right: Screenshot): boolean {
  if (left.screenshotId && right.screenshotId && left.screenshotId === right.screenshotId) return true
  if (left.fileName && right.fileName && left.fileName === right.fileName) return true
  return Boolean(
    left.beaconId &&
    right.beaconId &&
    left.beaconId === right.beaconId &&
    left.capturedAt &&
    right.capturedAt &&
    left.capturedAt === right.capturedAt,
  )
}
