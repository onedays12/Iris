import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { bus } from '../../src/shared/bus'
import zhCN from '../../src/locales/zh-CN.json'
import { i18n } from '../../src/i18n/index'
import { transferKey, useFileTransferStore } from '../../src/stores/fileTransfer'
import type { TransferItem } from '../../src/stores/fileTransfer'

type StartTransferArgs = { beaconid: string; taskId?: string; remotePath: string; fileName: string; size?: number }

beforeAll(() => {
  // store 默认文案经 i18n 渲染, 测试环境预载 zh-CN 断言中文文案
  i18n.global.setLocaleMessage('zh-CN', zhCN)
  i18n.global.locale.value = 'zh-CN'
})

beforeEach(() => {
  setActivePinia(createPinia())
  bus.clear()
})

describe('fileTransfer task identity', () => {
  it('includes beacon id in the task key', () => {
    expect(transferKey({ beaconId: 'beacon-a', direction: 'download', taskId: '7' } as TransferItem)).toBe('beacon-a:download:7')
    expect(transferKey({ beaconId: 'beacon-b', direction: 'download', taskId: '7' } as TransferItem)).toBe('beacon-b:download:7')
    expect(transferKey({ beaconId: '', taskId: '7' } as TransferItem)).toBe('')
  })

  it('keeps equal task ids from different beacons separate', () => {
    const store = useFileTransferStore()

    store.handleTransferEvent({
      beacon_id: 'beacon-a',
      task_id: 7,
      direction: 'download',
      remote_path: 'C:\\a.bin',
      status: 'running',
      received_bytes: 10,
    })
    store.handleTransferEvent({
      beacon_id: 'beacon-b',
      task_id: 7,
      direction: 'download',
      remote_path: 'C:\\b.bin',
      status: 'running',
      received_bytes: 20,
    })

    expect(store.transfers).toHaveLength(2)
    expect(store.getTransfers('beacon-a')[0].receivedBytes).toBe(10)
    expect(store.getTransfers('beacon-b')[0].receivedBytes).toBe(20)
  })

  it('updates a queued transfer only within the same beacon scope', () => {
    const store = useFileTransferStore()

    store.startDownload({ beaconid: 'beacon-a', remotePath: 'C:\\same.bin', fileName: 'same.bin' })
    store.startDownload({ beaconid: 'beacon-b', remotePath: 'C:\\same.bin', fileName: 'same.bin' })
    store.handleTransferEvent({
      beacon_id: 'beacon-a',
      task_id: 8,
      direction: 'download',
      remote_path: 'C:\\same.bin',
      status: 'running',
      received_bytes: 32,
    })

    expect(store.transfers).toHaveLength(2)
    expect(store.getTransfers('beacon-a')[0].taskId).toBe('8')
    expect(store.getTransfers('beacon-a')[0].receivedBytes).toBe(32)
    expect(store.getTransfers('beacon-b')[0].taskId).toBe('')
  })
})

describe('fileTransfer beacon removal', () => {
  it('cancels active transfers and ignores late events', () => {
    const store = useFileTransferStore()
    store.initSubscriptions()

    store.handleTransferEvent({
      beacon_id: 'beacon-a',
      task_id: 9,
      direction: 'upload',
      remote_path: 'C:\\out.bin',
      status: 'uploading',
      received_bytes: 12,
    })

    bus.emit('agent:removed', { beaconid: 'beacon-a' })
    expect(store.transfers[0].status).toBe('cancelled')
    expect(store.transfers[0].error).toContain('Beacon 已移除')

    store.handleTransferEvent({
      beacon_id: 'beacon-a',
      task_id: 9,
      direction: 'upload',
      remote_path: 'C:\\out.bin',
      status: 'completed',
      received_bytes: 100,
    })

    expect(store.transfers[0].status).toBe('cancelled')
    expect(store.transfers[0].receivedBytes).toBe(12)
  })
})

describe('fileTransfer progress (from check-file-transfer)', () => {
  it('computes download progress from received chunks', () => {
    const store = useFileTransferStore()
    store.startDownload({
      beaconid: 'b1',
      taskId: 't1',
      remotePath: 'C:\\Temp\\file.bin',
      fileName: 'file.bin',
      size: 10240,
    })
    store.handleTransferEvent({
      direction: 'download',
      task_id: 't1',
      beacon_id: 'b1',
      total_chunks: 10,
      received_chunks: 2,
      status: 'receiving',
    }, 'receiving')
    expect(store.transfers.find(t => t.transferKey === 'b1:download:t1')!.progress).toBe(20)

    store.handleTransferEvent({
      direction: 'download',
      task_id: 't1',
      beacon_id: 'b1',
      total_chunks: 10,
      received_chunks: 5,
      status: 'receiving',
    }, 'receiving')
    expect(store.transfers.find(t => t.transferKey === 'b1:download:t1')!.progress).toBe(50)

    store.handleTransferEvent({
      direction: 'download',
      task_id: 't1',
      beacon_id: 'b1',
      status: 'completed',
    }, 'completed')
    expect(store.transfers.find(t => t.transferKey === 'b1:download:t1')!.progress).toBe(100)
  })

  it('computes upload progress from acked chunks', () => {
    const store = useFileTransferStore()
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
    expect(store.transfers.find(t => t.transferKey === 'b2:upload:t2')!.progress).toBe(50)
  })

  it('keeps queued transfers at 0% and tracks active paths', () => {
    const store = useFileTransferStore()
    store.startDownload({
      beaconid: 'b3',
      taskId: 't3',
      remotePath: 'C:\\queued.bin',
      fileName: 'queued.bin',
      size: 0,
      status: 'queued',
    } as StartTransferArgs & { status: string })
    expect(store.transfers.find(t => t.transferKey === 'b3:download:t3')!.progress).toBe(0)

    store.startDownload({
      beaconid: 'b4',
      taskId: 't4',
      remotePath: 'C:\\active.bin',
      fileName: 'active.bin',
      size: 1024,
      status: 'queued',
    } as StartTransferArgs & { status: string })
    expect(store.hasActiveTransfer('b4', 'C:\\active.bin', 'download')).toBe(true)
    expect(store.hasActiveTransfer('b4', 'C:\\other.bin', 'download')).toBe(false)
  })

  it('maps canonical snake_case transfer fields and caps in-flight progress at 99', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({
      task_id: 't5',
      direction: 'download',
      beacon_id: 'b5',
      total_chunks: 5,
      received_chunks: 3,
      status: 'receiving',
    }, 'receiving')
    const aliasTransfer = store.transfers.find(t => t.transferKey === 'b5:download:t5')!
    expect(aliasTransfer.totalChunks).toBe(5)
    expect(aliasTransfer.receivedChunks).toBe(3)
    expect(aliasTransfer.progress).toBe(60)

    store.handleTransferEvent({
      direction: 'download',
      task_id: 't6',
      beacon_id: 'b6',
      total_chunks: 100,
      received_chunks: 99,
      status: 'receiving',
    }, 'receiving')
    expect(store.transfers.find(t => t.transferKey === 'b6:download:t6')!.progress).toBeLessThanOrEqual(99)
  })
})
