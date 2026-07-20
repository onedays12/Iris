/**
 * fileTransfer store 单测 — 验证进度计算、状态转换、匹配逻辑
 * 运行: node tests/check-file-transfer.mjs
 */
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useFileTransferStore } from '../src/stores/fileTransfer.js'

setActivePinia(createPinia())

const store = useFileTransferStore()

// ─── Download progress by bytes ───

store.startDownload({
  beaconid: 'b1',
  taskId: 't1',
  remotePath: 'C:\\Temp\\file.bin',
  fileName: 'file.bin',
  size: 10240,
})

// First chunk: 2 of 10 chunks received
store.handleTransferEvent({
  direction: 'download',
  task_id: 't1',
  beacon_id: 'b1',
  total_chunks: 10,
  received_chunks: 2,
  status: 'receiving',
}, 'receiving')

const dl = store.transfers.find(t => t.transferKey === 'download:t1')
assert.ok(dl, 'download transfer created')
assert.equal(dl.progress, 20, '20% progress for 2/10 chunks')

// More chunks
store.handleTransferEvent({
  direction: 'download',
  task_id: 't1',
  beacon_id: 'b1',
  total_chunks: 10,
  received_chunks: 5,
  status: 'receiving',
}, 'receiving')

const dl2 = store.transfers.find(t => t.transferKey === 'download:t1')
assert.equal(dl2.progress, 50, '50% progress for 5/10 chunks')

// ─── Download completed ───

store.handleTransferEvent({
  direction: 'download',
  task_id: 't1',
  beacon_id: 'b1',
  status: 'completed',
}, 'completed')

const dl3 = store.transfers.find(t => t.transferKey === 'download:t1')
assert.equal(dl3.progress, 100, '100% on completed')

// ─── Upload progress ───

store.startUpload({
  beaconid: 'b2',
  taskId: 't2',
  remotePath: 'C:\\Temp\\upload.bin',
  fileName: 'upload.bin',
  size: 1048576,
})

store.handleTransferEvent({
  direction: 'upload',
  task_id: 't2',
  beacon_id: 'b2',
  total_chunks: 2,
  acked_chunks: 1,
  status: 'uploading',
}, 'uploading')

const ul = store.transfers.find(t => t.transferKey === 'upload:t2')
assert.ok(ul, 'upload transfer created')
assert.equal(ul.progress, 50, '50% for 1/2 acked chunks')

// ─── Queued status has 0% progress ───

store.startDownload({
  beaconid: 'b3',
  taskId: 't3',
  remotePath: 'C:\\queued.bin',
  fileName: 'queued.bin',
  size: 0,
  status: 'queued',
})

const queued = store.transfers.find(t => t.transferKey === 'download:t3')
assert.ok(queued, 'queued transfer created')
assert.equal(queued.progress, 0, 'queued has 0% progress')

// ─── hasActiveTransfer prevents duplicate ───

assert.equal(
  store.hasActiveTransfer('b1', 'C:\\Temp\\file.bin', 'download'),
  false,
  'completed download is not active'
)

store.startDownload({
  beaconid: 'b4',
  taskId: 't4',
  remotePath: 'C:\\active.bin',
  fileName: 'active.bin',
  size: 1024,
  status: 'queued',
})

assert.equal(
  store.hasActiveTransfer('b4', 'C:\\active.bin', 'download'),
  true,
  'queued download is active'
)

assert.equal(
  store.hasActiveTransfer('b4', 'C:\\other.bin', 'download'),
  false,
  'different path is not active'
)

// ─── Field alias handling ───

store.handleTransferEvent({
  task_id: 't5',
  direction: 'download',
  beacon_id: 'b5',
  totalChunks: 5,
  receivedChunks: 3,
  status: 'receiving',
}, 'receiving')

const aliasTransfer = store.transfers.find(t => t.transferKey === 'download:t5')
assert.ok(aliasTransfer, 'transfer with camelCase field names created')
assert.equal(aliasTransfer.totalChunks, 5, 'totalChunks camelCase mapped')
assert.equal(aliasTransfer.receivedChunks, 3, 'receivedChunks camelCase mapped')
assert.equal(aliasTransfer.progress, 60, '60% for 3/5 chunks')

// ─── Progress never exceeds 99 during transfer ───

store.handleTransferEvent({
  direction: 'download',
  task_id: 't6',
  beacon_id: 'b6',
  total_chunks: 100,
  received_chunks: 99,
  status: 'receiving',
}, 'receiving')

const almostDone = store.transfers.find(t => t.transferKey === 'download:t6')
assert.ok(almostDone, 'almost-done transfer created')
assert.ok(almostDone.progress <= 99, 'progress capped at 99 during transfer')

console.log('file transfer tests ok')
