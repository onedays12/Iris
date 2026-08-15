export interface ExplorerFilesRequest {
  beacon_id: string
  path: string
  limit: number
  offset: number
}

export interface StoredFileDto {
  file_id: string
  file_name: string
  size: number
  sha256: string
  mod_time: string
  download_url?: string
}

export interface DownloadFileParams {
  fileId: string
  downloadUrl?: string
}
