/**
 * 文件传输 Store
 * 管理上传/下载任务的进度追踪、状态更新，
 * 以及传输完成/失败的处理。
 */

import { defineStore } from 'pinia'
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
  const totalChunksRaw = pick(data, [
    'total_chunks', 'total_chunk', 'totalChunks', 'totalChunk', 'TotalChunks', 'TotalChunk', 
    'chunk_count', 'chunkCount', 'ChunkCount', 'chunks_total', 'chunksTotal', 'ChunksTotal'
  ])
  
  const size = toNumber(pick(data, ['size', 'Size', 'queued_bytes', 'queuedBytes', 'QueuedBytes']))
  let totalChunks = toNumber(totalChunksRaw)
  
  // 如果没有总块数，但有文件大小，按 512KB 分块估算
  if (!totalChunks && size > 0) {
    totalChunks = Math.ceil(size / 524288)
  }

  const rawReceivedChunks = pick(data, ['received_chunks', 'receivedChunks', 'ReceivedChunks', 'acked_chunks', 'ackedChunks', 'AckedChunks'], null)
  const chunkIndex = pick(data, ['chunk_index', 'chunkIndex', 'ChunkIndex'], null)
  const receivedChunks = rawReceivedChunks !== null
    ? toNumber(rawReceivedChunks)
    : (chunkIndex !== null ? toNumber(chunkIndex) + 1 : 0)

  const status = String(pick(data, ['status', 'Status'], fallbackStatus))
  
  // 处理 ID，避免出现 "undefined" 或 "null" 字符串
  const pickId = (keys) => {
    const val = pick(data, keys)
    return (val === undefined || val === null || val === '') ? '' : String(val)
  }

  const res = {
    taskId: pickId(['task_id', 'taskId', 'TaskID', 'TaskId']),
    direction: String(pick(data, ['direction', 'Direction'], 'download')).toLowerCase(),
    beaconId: pickId(['beacon_id', 'becon_id', 'beaconid', 'beaconId', 'BeaconID', 'BeaconId']),
    fileId: pickId(['file_id', 'fileId', 'FileID', 'FileId']),
    fileName: String(pick(data, ['file_name', 'fileName', 'FileName'])),
    remotePath: String(pick(data, ['remote_path', 'remotePath', 'RemotePath'])),
    totalChunks,
    receivedChunks,
    receivedBytes: toNumber(pick(data, ['received_bytes', 'receivedBytes', 'ReceivedBytes', 'acked_bytes', 'ackedBytes', 'AckedBytes', 'written_bytes', 'writtenBytes', 'WrittenBytes'])),
    size,
    status,
    error: String(pick(data, ['error', 'Error', 'error_message', 'errorMessage', 'message', 'Message'])),
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
