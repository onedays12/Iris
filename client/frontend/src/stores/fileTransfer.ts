/**
 * 文件传输 Store
 * 管理上传/下载任务的进度追踪、状态更新，
 * 以及传输完成/失败的处理。
 */

import { defineStore } from 'pinia'
import { pickTransfer } from '../shared/protocol/adapter'
import { bus } from '../shared/bus'
import { pick, toNumber } from '../utils/object'
import { i18n } from '../i18n/index'

const ACTIVE_TRANSFER_STATUSES = new Set(['queued', 'running', 'receiving', 'uploading'])

export interface TransferItem {
  taskId: string
  direction: string
  beaconId: string
  fileId: string
  fileName: string
  remotePath: string
  totalChunks: number
  receivedChunks: number
  receivedBytes: number
  size: number
  status: string
  error: string
  updatedAt: number
  progress: number
  transferKey: string
}

interface FileTransferState {
  transfers: TransferItem[]
  _subscribed: boolean
}

function calcProgress(receivedBytes: number, size: number, receivedChunks: number, totalChunks: number, status: string): number {
  if (status === 'completed' || status === 'success') return 100
  if (status === 'queued') return 0

  // 优先基于字节计算
  if (size > 0 && receivedBytes > 0) {
    const p = Math.floor((receivedBytes / size) * 100)
    // 过程中最高 99%，只有完成才 100
    return Math.min(99, p)
  }

  // 次选基于块计算
  if (totalChunks > 0 && receivedChunks >= 0) {
    const p = Math.floor((receivedChunks / totalChunks) * 100)
    return Math.min(99, p)
  }

  return 0
}

function pickBeaconId(current: TransferItem, next: TransferItem): string {
  if (current.status === 'queued' && current.beaconId) return current.beaconId
  if (next.status === 'queued' && next.beaconId) return next.beaconId
  return next.beaconId || current.beaconId
}

export function normalizePath(path: unknown): string {
  if (!path) return ''
  // 统一转小写，转单斜杠，去掉多余空格
  return String(path).trim()
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .toLowerCase()
}

function normalizeName(name: unknown): string {
  return String(name || '').trim().toLowerCase()
}

export function transferKey(item: TransferItem): string {
  return item.beaconId && item.direction && item.taskId
    ? `${item.beaconId}:${item.direction}:${item.taskId}`
    : ''
}

function sameBeacon(left: TransferItem, right: TransferItem): boolean {
  return Boolean(left.beaconId && right.beaconId && left.beaconId === right.beaconId)
}

function sameTransferFallback(left: TransferItem, right: TransferItem): boolean {
  if (left.direction !== right.direction) return false
  if (!sameBeacon(left, right)) return false
  if (left.remotePath && right.remotePath && normalizePath(left.remotePath) === normalizePath(right.remotePath)) return true
  return Boolean(left.fileName && right.fileName && normalizeName(left.fileName) === normalizeName(right.fileName))
}

function normalizeTransfer(data: unknown, fallbackStatus = 'running'): TransferItem {
  // 一次 pickTransfer 拿全部规范化字段(别名表集中在 fieldMap.js,不在此内联)
  const adapted = pickTransfer(data)

  let totalChunks = toNumber(adapted.totalChunks)
  const size = toNumber(adapted.size)

  // 如果没有总块数，但有文件大小，按 512KB 分块估算
  if (!totalChunks && size > 0) {
    totalChunks = Math.ceil(size / 524288)
  }

  // chunk_index 不在 TRANSFER_FIELDS(是进度 chunk 的兜底来源),单独 pick。
  // 契约: download 用 received_chunks, upload 用 acked_chunks。
  const direction = String(adapted.direction || '').toLowerCase()
  const rawReceivedChunks = direction === 'upload' ? adapted.ackedChunks : adapted.receivedChunks
  const chunkIndex = pick(data, ['chunk_index'], null)
  const receivedChunks = rawReceivedChunks !== ''
    ? toNumber(rawReceivedChunks)
    : (chunkIndex !== null ? toNumber(chunkIndex) + 1 : 0)

  const status = String(adapted.status || fallbackStatus)

  const res: TransferItem = {
    taskId: String(adapted.taskId || ''),
    direction: String(adapted.direction || 'download').toLowerCase(),
    beaconId: String(adapted.beaconId || ''),
    fileId: String(adapted.fileId || ''),
    fileName: String(adapted.fileName || ''),
    remotePath: String(adapted.remotePath || ''),
    totalChunks,
    receivedChunks,
    receivedBytes: toNumber(adapted.receivedBytes),
    size,
    status,
    error: String(adapted.error || ''),
    updatedAt: Date.now(),
    progress: 0,
    transferKey: '',
  }

  // 状态转换：如果收到了进度数据且当前是 queued，则转为 running/uploading 状态
  if (res.status === 'queued' && (res.receivedChunks > 0 || res.receivedBytes > 0)) {
    res.status = res.direction === 'upload' ? 'uploading' : 'running'
  }

  res.progress = calcProgress(res.receivedBytes, res.size, res.receivedChunks, res.totalChunks, res.status)
  res.transferKey = transferKey(res)
  return res
}

function sameTransfer(left: TransferItem, right: TransferItem): boolean {
  const leftKey = transferKey(left)
  const rightKey = transferKey(right)

  if (leftKey && rightKey) return leftKey === rightKey
  if (leftKey || rightKey) return sameTransferFallback(left, right)

  // 本地 queued 记录可能早于 task_id 返回，保留同 Beacon 内的兜底匹配。
  if (left.fileId && right.fileId && left.fileId === right.fileId && sameBeacon(left, right)) return true

  return sameTransferFallback(left, right)
}

export const useFileTransferStore = defineStore('fileTransfer', {
  state: (): FileTransferState => ({
    transfers: [],
    _subscribed: false,
  }),

  getters: {
    getTransfers: (state) => (beaconid: unknown) => {
      // 合并下载与上传，并返回最近的 3 个
      return state.transfers
        .filter(item => item.beaconId === String(beaconid))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
    },
  },

  actions: {
    startDownload({ beaconid, taskId = '', remotePath, fileName, size = 0 }: { beaconid: string; taskId?: string; remotePath: string; fileName: string; size?: number }): void {
      this.upsert({
        task_id: taskId,
        direction: 'download',
        beacon_id: String(beaconid),
        remote_path: remotePath,
        file_name: fileName,
        size,
        status: 'queued',
      }, 'queued')
    },

    startUpload({ beaconid, taskId = '', remotePath, fileName, size = 0 }: { beaconid: string; taskId?: string; remotePath: string; fileName: string; size?: number }): void {
      this.upsert({
        task_id: taskId,
        direction: 'upload',
        beacon_id: String(beaconid),
        remote_path: remotePath,
        file_name: fileName,
        size,
        status: 'queued',
      }, 'queued')
    },

    handleTransferEvent(data: unknown, status = 'running'): void {
      this.upsert(data, status)
    },

    unshift(next: TransferItem): void {
      this.transfers.unshift(next)
    },

    /**
     * 检查是否已存在活跃的传输任务（避免重复点击）
     */
    hasActiveTransfer(beaconId: unknown, remotePath: unknown, direction = 'download'): boolean {
      const normPath = normalizePath(remotePath)
      const bid = String(beaconId)

      return this.transfers.some(t => {
        if (t.direction !== direction) return false

        // 匹配信标 ID (处理 UUID 与短 ID 的模糊匹配)
        const idMatch = t.beaconId === bid
        if (!idMatch) return false

        // 匹配路径
        if (normalizePath(t.remotePath) !== normPath) return false

        // 只锁定正在进行的任务
        return ACTIVE_TRANSFER_STATUSES.has(t.status)
      })
    },

    cancelByBeacon(beaconid: unknown, reason = i18n.global.t('transfer.beaconRemoved')): void {
      const bid = String(beaconid || '')
      if (!bid) return

      const now = Date.now()
      this.transfers = this.transfers.map((transfer) => {
        if (!sameBeacon(transfer, { beaconId: bid, status: 'cancelled' } as TransferItem)) return transfer
        if (!ACTIVE_TRANSFER_STATUSES.has(transfer.status)) return transfer

        return {
          ...transfer,
          status: 'cancelled',
          error: reason,
          updatedAt: now,
        }
      })
    },

    initSubscriptions(): void {
      if (this._subscribed) return
      this._subscribed = true

      bus.on('agent:removed', ({ beaconid }) => {
        this.cancelByBeacon(beaconid)
      })
    },

    upsert(data: unknown, fallbackStatus = 'running'): void {
      const next = normalizeTransfer(data, fallbackStatus)
      const index = this.transfers.findIndex(item => sameTransfer(item, next))

      if (index >= 0) {
        const current = this.transfers[index]
        if (current.status === 'cancelled') return

        const mergedStatus = (next.status && next.status !== 'running') ? next.status : (current.status === 'queued' ? 'running' : current.status)

        // 使用 splice 确保响应式更新
        this.transfers.splice(index, 1, {
          ...current,
          ...next,
          transferKey: transferKey(next) || transferKey(current),
          taskId: next.taskId || current.taskId,
          fileId: next.fileId || current.fileId,
          fileName: next.fileName || current.fileName,
          remotePath: next.remotePath || current.remotePath,
          beaconId: pickBeaconId(current, next),
          size: next.size || current.size,
          totalChunks: next.totalChunks || current.totalChunks,
          receivedChunks: next.receivedChunks !== undefined ? next.receivedChunks : current.receivedChunks,
          receivedBytes: next.receivedBytes !== undefined ? next.receivedBytes : current.receivedBytes,
          status: mergedStatus,
          progress: calcProgress(
            next.receivedBytes !== undefined ? next.receivedBytes : current.receivedBytes,
            next.size || current.size,
            next.receivedChunks !== undefined ? next.receivedChunks : current.receivedChunks,
            next.totalChunks || current.totalChunks,
            mergedStatus
          ),
          updatedAt: Date.now()
        })
      } else {
        this.transfers.unshift(next)
      }
    },
  },
})
