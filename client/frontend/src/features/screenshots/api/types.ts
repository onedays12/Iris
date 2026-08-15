export interface StoredScreenshotDto {
  screenshot_id: string
  beacon_id: string
  hostname: string
  username: string
  resolution: string
  image_size: number
  captured_at: number
  file_name: string
  preview_url: string
  download_url: string
}

export interface DownloadScreenshotParams {
  screenshotId: string
  downloadUrl?: string
}
