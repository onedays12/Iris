/**
 * 文件传输 Store
 * 管理上传/下载任务的进度追踪、状态更新，
 * 以及传输完成/失败的处理。
 */

import { defineStore } from 'pinia'
import { pickTransfer } from '../shared/protocol/adapter.js'
import { pick, toNumber } from '../utils/object.js'

function calcProgress(receivedBytes, size, receivedChunks, totalChunks, status) {
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

function pickBeaconId(current, next) {
  if (current.status === 'queued' && current.beaconId) return current.beaconId
  if (next.status === 'queued' && next.beaconId) return next.beaconId
  return next.beaconId || current.beaconId
}

export function normalizePath(path) {
  if (!path) return ''
  // 统一转小写，转单斜杠，去掉多余空格
  return String(path).trim()
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .toLowerCase()
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase()
}

function transferKey(item) {
  return item.direction && item.taskId ? `${item.direction}:${item.taskId}` : ''
}

function sameBeacon(left, right) {
  if (!left.beaconId || !right.beaconId) return left.status === 'queued' || right.status === 'queued'
  return left.beaconId === right.beaconId ||
    left.beaconId.startsWith(right.beaconId) ||
    right.beaconId.startsWith(left.beaconId)
}

function sameTransferFallback(left, right) {
  if (left.direction !== right.direction) return false
  if (!sameBeacon(left, right)) return false
  if (left.remotePath && right.remotePath && normalizePath(left.remotePath) === normalizePath(right.remotePath)) return true
  return Boolean(left.fileName && right.fileName && normalizeName(left.fileName) === normalizeName(right.fileName))
}

function normalizeTransfer(data, fallbackStatus = 'running') {
  // 一次 pickTransfer 拿全部规范化字段(别名表集中在 fieldMap.js,不在此内联)
  const adapted = pickTransfer(data)

  let totalChunks = toNumber(adapted.totalChunks)
  const size = toNumber(adapted.size)

  // 如果没有总块数，但有文件大小，按 512KB 分块估算
  if (!totalChunks && size > 0) {
    totalChunks = Math.ceil(size / 524288)
  }

  // chunk_index 不在 TRANSFER_FIELDS(是 receivedChunks 的兜底来源),单独 pick
  const rawReceivedChunks = adapted.receivedChunks || ''
  const chunkIndex = pick(data, ['chunk_index', 'chunkIndex', 'ChunkIndex'], null)
  const receivedChunks = rawReceivedChunks !== ''
    ? toNumber(rawReceivedChunks)
    : (chunkIndex !== null ? toNumber(chunkIndex) + 1 : 0)

  const status = String(adapted.status || fallbackStatus)

  const res = {
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
  }

  // 状态转换：如果收到了进度数据且当前是 queued，则转为 running/uploading 状态
  if (res.status === 'queued' && (res.receivedChunks > 0 || res.receivedBytes > 0)) {
    res.status = res.direction === 'upload' ? 'uploading' : 'running'
  }

  res.progress = calcProgress(res.receivedBytes, res.size, res.receivedChunks, res.totalChunks, res.status)
  res.transferKey = transferKey(res)
  return res
}

function sameTransfer(left, right) {
  const leftKey = transferKey(left)
  const rightKey = transferKey(right)

  if (leftKey && rightKey) return leftKey === rightKey
  if (leftKey || rightKey) return sameTransferFallback(left, right)
  
  // 本地 queued 记录可能早于 task_id 返回，保留路径/文件名兜底匹配。
  if (left.fileId && right.fileId && left.fileId === right.fileId) return true
  
  return sameTransferFallback(left, right)
}

export const useFileTransferStore = defineStore('fileTransfer', {
  state: () => ({
    transfers: [],
  }),

  getters: {
    getTransfers: (state) => (beaconid) => {
      // 合并下载与上传，并返回最近的 3 个
      return state.transfers
        .filter(item => item.beaconId === String(beaconid))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
    },
  },

  actions: {
    startDownload({ beaconid, taskId = '', remotePath, fileName, size = 0 }) {
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

    startUpload({ beaconid, taskId = '', remotePath, fileName, size = 0 }) {
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

    handleTransferEvent(data, status = 'running') {
      this.upsert(data, status)
    },

    unshift(next) {
      this.transfers.unshift(next)
    },

    /**
     * 检查是否已存在活跃的传输任务（避免重复点击）
     */
    hasActiveTransfer(beaconId, remotePath, direction = 'download') {
      const normPath = normalizePath(remotePath)
      const bid = String(beaconId)
      
      return this.transfers.some(t => {
        if (t.direction !== direction) return false
        
        // 匹配信标 ID (处理 UUID 与短 ID 的模糊匹配)
        const idMatch = t.beaconId === bid || t.beaconId.startsWith(bid) || bid.startsWith(t.beaconId)
        if (!idMatch) return false
        
        // 匹配路径
        if (normalizePath(t.remotePath) !== normPath) return false
        
        // 只锁定正在进行的任务
        return ['queued', 'running', 'receiving', 'uploading'].includes(t.status)
      })
    },

    upsert(data, fallbackStatus = 'running') {
      const next = normalizeTransfer(data, fallbackStatus)
      const index = this.transfers.findIndex(item => sameTransfer(item, next))

      if (index >= 0) {
        const current = this.transfers[index]
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
