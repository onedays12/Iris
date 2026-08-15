import { downloadBinaryBase64, request } from '../../../shared/api/httpClient'
import { expectArray, expectRecord, expectStringField } from '../../../shared/api/guards'
import type { ApiOperationResult } from '../../../shared/api/types'
import { sendCommand } from '../../beacon/api/beaconApi'
import type { DownloadScreenshotParams, StoredScreenshotDto } from './types'

function parseScreenshotList(value: unknown): StoredScreenshotDto[] {
  const list = expectArray(value, 'Screenshot list')
  for (const item of list) {
    expectStringField(expectRecord(item, 'Screenshot'), 'screenshot_id', 'Screenshot')
  }
  return list as StoredScreenshotDto[]
}

export async function listScreenshots(): Promise<StoredScreenshotDto[]> {
  return parseScreenshotList(await request<unknown>('GET', '/api/v1/screenshot/list'))
}

export async function requestScreenshot(
  beaconid: string,
  monitorId = 0,
  quality = 80,
): Promise<ApiOperationResult> {
  return sendCommand(beaconid, 51, [monitorId, quality])
}

export async function downloadScreenshotBase64({
  screenshotId,
  downloadUrl,
}: DownloadScreenshotParams): Promise<string> {
  const path = downloadUrl || `/api/v1/screenshot/download?screenshot_id=${encodeURIComponent(screenshotId)}`
  return downloadBinaryBase64(path)
}

export async function deleteScreenshot(screenshotId: string): Promise<ApiOperationResult> {
  const path = `/api/v1/screenshot?screenshot_id=${encodeURIComponent(String(screenshotId || ''))}`
  return request<ApiOperationResult>('DELETE', path)
}
