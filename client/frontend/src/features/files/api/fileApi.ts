import { useNotificationStore } from '../../../stores/notification'
import { expectArray, expectRecord, expectStringField } from '../../../shared/api/guards'
import { downloadBinaryBase64, request, uploadFileBase64 } from '../../../shared/api/httpClient'
import { i18n } from '../../../i18n/index'
import type { ApiOperationResult } from '../../../shared/api/types'
import { normalizeStoredFile, type StoredFile } from '../model'
import type { DownloadFileParams, ExplorerFilesRequest } from './types'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : String(error || fallback)
}

function parseStoredFile(value: unknown): StoredFile {
  const record = expectRecord(value, 'Stored file')
  expectStringField(record, 'file_id', 'Stored file')
  return normalizeStoredFile(record)
}

function parseStoredFileList(value: unknown): StoredFile[] {
  return expectArray(value, 'Downloaded files').map(parseStoredFile)
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error(i18n.global.t('fileApi.readLocalFailed')))
    reader.readAsDataURL(file)
  })
}

export async function explorerFiles(
  beaconid: string,
  path = '',
  limit = 1000,
  offset = 0,
): Promise<ApiOperationResult> {
  const payload: ExplorerFilesRequest = {
    beacon_id: String(beaconid),
    path: String(path),
    limit: Number(limit),
    offset: Number(offset),
  }
  return request<ApiOperationResult, ExplorerFilesRequest>('POST', '/api/v1/explorer/files', payload)
}

export async function uploadFile(file: File): Promise<StoredFile> {
  try {
    const base64Data = await readFileAsBase64(file)
    return parseStoredFile(await uploadFileBase64<unknown>('/api/v1/files/uploads', file.name, base64Data))
  } catch (error: unknown) {
    const userMessage = errorMessage(error, i18n.global.t('fileApi.uploadFailed'))
    useNotificationStore().error(userMessage)
    console.error('[Proxy-API] POST /api/v1/files/uploads failed:', error)
    throw error
  }
}

export async function listDownloads(): Promise<StoredFile[]> {
  return parseStoredFileList(await request<unknown>('GET', '/api/v1/files/downloads'))
}

export async function downloadFileBase64({ fileId, downloadUrl }: DownloadFileParams): Promise<string> {
  const path = downloadUrl || `/api/v1/files/downloads/${encodeURIComponent(fileId)}`
  return downloadBinaryBase64(path)
}
