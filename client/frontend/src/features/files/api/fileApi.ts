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

/** 服务端 /transfers/active 返回的传输运行态快照。 */
export interface ActiveTransferSnapshot {
  transfer_id: string
  direction: string
  beacon_id: string
  file_name: string
  remote_path: string
  total_chunks: number
  done_chunks: number
  done_bytes: number
  size: number
  status: string
  failed_chunks: number
  started_at: string
  updated_at: string
}

/**
 * 拉取传输运行态快照供传输面板对账。
 * 映射为 store 已理解的进度帧字段契约(download: received_*;upload: acked_*)。
 */
export async function listActiveTransfers(): Promise<ActiveTransferSnapshot[]> {
  const data = await request<unknown>('GET', '/api/v1/transfers/active')
  return expectArray(data, 'Active transfers').map((raw) => {
    const s = expectRecord(raw, 'Active transfer')
    return {
      transfer_id: expectStringField(s, 'transfer_id', 'Active transfer'),
      direction: expectStringField(s, 'direction', 'Active transfer'),
      beacon_id: expectStringField(s, 'beacon_id', 'Active transfer'),
      file_name: String(s.file_name ?? ''),
      remote_path: String(s.remote_path ?? ''),
      total_chunks: Number(s.total_chunks ?? 0),
      done_chunks: Number(s.done_chunks ?? 0),
      done_bytes: Number(s.done_bytes ?? 0),
      size: Number(s.size ?? 0),
      status: String(s.status ?? 'running'),
      failed_chunks: Number(s.failed_chunks ?? 0),
      started_at: String(s.started_at ?? ''),
      updated_at: String(s.updated_at ?? ''),
    }
  })
}

export async function downloadFileBase64({ fileId, downloadUrl }: DownloadFileParams): Promise<string> {
  const path = downloadUrl || `/api/v1/files/downloads/${encodeURIComponent(fileId)}`
  return downloadBinaryBase64(path)
}

/**
 * 按 base64 直接入服务器暂存区(拖拽上传桥专用):
 * 文件内容已在 Go 侧经 FileService 读取,无需浏览器 File 对象。
 */
export async function uploadFileByBase64(fileName: string, base64Data: string): Promise<StoredFile> {
  return parseStoredFile(await uploadFileBase64<unknown>('/api/v1/files/uploads', fileName, base64Data))
}
