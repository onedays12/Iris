/**
 * 文件预览 API - 对接 TeamServer Preview REST 接口
 *
 * - POST   /api/v1/beacon/:beacon_id/preview  创建预览任务（内存中转，不落盘）
 * - GET    /api/v1/preview/:preview_id        拉取预览内容（文本 UTF-8 / 图片原始字节）
 * - DELETE /api/v1/preview/:preview_id        释放预览内容
 *
 * 文本与图片均经 Wails ProxyService.DownloadFileBase64 拉取（返回 base64），
 * 文本由前端解码为 UTF-8，图片拼 data URL 渲染。
 */

import { ProxyService } from '../../../bindings/irisclient/service'
import { authHeaders, resolveApiUrl, request } from '../../shared/api/httpClient'
import { expectRecord, expectStringField } from '../../shared/api/guards'
import type { PreviewKind } from './model'

export interface PreviewView {
  previewId: string
  beaconId: string
  remotePath: string
  fileName: string
  kind: PreviewKind
  mime: string
  status: string
  createdAt?: string
}

function parsePreviewView(value: unknown): PreviewView {
  const record = expectRecord(value, 'Preview view')
  const previewId = expectStringField(record, 'preview_id', 'Preview view')
  const kindRaw = String(record.kind || 'text').toLowerCase()
  const kind: PreviewKind = kindRaw === 'image' ? 'image' : 'text'
  return {
    previewId,
    beaconId: String(record.beacon_id || ''),
    remotePath: String(record.remote_path || ''),
    fileName: String(record.file_name || ''),
    kind,
    mime: String(record.mime || ''),
    status: String(record.status || ''),
    createdAt: record.created_at !== undefined ? String(record.created_at) : undefined,
  }
}

/** 创建预览任务，返回服务器分配的 preview_id 等元数据。 */
export async function createPreview(beaconId: string, path: string): Promise<PreviewView> {
  const data = await request<unknown, { path: string }>('POST', `/api/v1/beacon/${encodeURIComponent(beaconId)}/preview`, {
    path: String(path),
  })
  return parsePreviewView(data)
}

function decodeBase64Text(base64: string): string {
  const binary = atob(String(base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/** 拉取预览文本内容（后端已按 ACP/BOM 转 UTF-8）。 */
export async function fetchPreviewText(previewId: string): Promise<string> {
  const base64 = await ProxyService.DownloadFileBase64(
    resolveApiUrl(`/api/v1/preview/${encodeURIComponent(previewId)}`),
    authHeaders(),
  )
  return decodeBase64Text(base64)
}

/** 拉取预览图片内容，返回 base64（组件拼 data URL 渲染）。 */
export async function fetchPreviewImageBase64(previewId: string): Promise<string> {
  return ProxyService.DownloadFileBase64(
    resolveApiUrl(`/api/v1/preview/${encodeURIComponent(previewId)}`),
    authHeaders(),
  )
}

/** 释放预览内容（可选调用；后端 TTL 5 分钟兜底清理）。 */
export async function releasePreview(previewId: string): Promise<void> {
  if (!previewId) return
  await request<unknown>('DELETE', `/api/v1/preview/${encodeURIComponent(previewId)}`)
}
