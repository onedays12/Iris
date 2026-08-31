import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('fileTransfer upload fidelity (acked_bytes / completion backfill)', () => {
  it('falls back upload receivedBytes to acked_bytes so the panel stops showing 0 B', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({
      task_id: 'u1',
      direction: 'upload',
      beacon_id: 'b1',
      total_chunks: 20,
      acked_chunks: 15,
      acked_bytes: 7864320,
      size: 10181673,
      status: 'uploading',
    }, 'uploading')
    const rec = store.transfers.find(t => t.transferKey === 'b1:upload:u1')!
    expect(rec.receivedBytes).toBe(7864320)
    expect(rec.progress).toBe(77) // 7864320/10181673 ≈ 77%,基于字节而非块
  })

  it('backfills chunks and bytes when only a bare completion frame arrives', () => {
    const store = useFileTransferStore()
    store.startUpload({ beaconid: 'b2', taskId: '', remotePath: 'C:\\x\\aigc.exe', fileName: 'aigc.exe', size: 10181673 })
    // 断连前的最后进度
    store.handleTransferEvent({
      task_id: 'srv-1', direction: 'upload', beacon_id: 'b2',
      remote_path: 'C:\\x\\aigc.exe', file_name: 'aigc.exe',
      total_chunks: 20, acked_chunks: 15, acked_bytes: 7864320, status: 'uploading',
    }, 'uploading')
    // 丢帧后只等到最终完成帧(无计数)
    store.handleTransferEvent({
      task_id: 'srv-1', direction: 'upload', beacon_id: 'b2',
      remote_path: 'C:\\x\\aigc.exe', file_name: 'aigc.exe', size: 10181673,
      status: 'completed',
    }, 'completed')
    const rec = store.transfers.find(t => t.beaconId === 'b2' && t.direction === 'upload')!
    expect(rec.status).toBe('completed')
    expect(rec.progress).toBe(100)
    expect(rec.receivedChunks).toBe(20)
    expect(rec.receivedBytes).toBe(10181673)
  })
})

describe('fileTransfer reconcile with /transfers/active snapshots', () => {
  it('heals a frozen record from the server snapshot (lost progress frames)', () => {
    const store = useFileTransferStore()
    store.startUpload({ beaconid: 'b1', taskId: '', remotePath: 'C:\\x\\aigc.exe', fileName: 'aigc.exe', size: 10181673 })
    store.handleTransferEvent({
      task_id: 'srv-9', direction: 'upload', beacon_id: 'b1',
      remote_path: 'C:\\x\\aigc.exe', file_name: 'aigc.exe',
      total_chunks: 20, acked_chunks: 15, acked_bytes: 7864320, status: 'uploading',
    }, 'uploading')

    // 断连期间 16~20 块的帧丢失;服务端快照已是完成态
    store.reconcileWithServer([{
      transfer_id: 'srv-9', direction: 'upload', beacon_id: 'b1',
      file_name: 'aigc.exe', remote_path: 'C:\\x\\aigc.exe',
      total_chunks: 20, done_chunks: 20, done_bytes: 10181673,
      size: 10181673, status: 'completed', failed_chunks: 0,
    }])

    const rec = store.transfers.find(t => t.beaconId === 'b1' && t.direction === 'upload')!
    expect(rec.status).toBe('completed')
    expect(rec.receivedChunks).toBe(20)
    expect(rec.receivedBytes).toBe(10181673)
    expect(rec.progress).toBe(100)
  })

  it('maps upload snapshot done_chunks onto acked_chunks so reconcile cannot zero progress', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({
      task_id: 'srv-u', direction: 'upload', beacon_id: 'b-u',
      remote_path: 'C:\\x\\dogcs.jar', file_name: 'dogcs.jar',
      total_chunks: 57, acked_chunks: 6, acked_bytes: 3145728, status: 'uploading',
    }, 'uploading')

    store.reconcileWithServer([{
      transfer_id: 'srv-u', direction: 'upload', beacon_id: 'b-u',
      file_name: 'dogcs.jar', remote_path: 'C:\\x\\dogcs.jar',
      total_chunks: 57, done_chunks: 6, done_bytes: 3145728,
      size: 29609741, status: 'uploading', failed_chunks: 0,
    }])

    const rec = store.transfers.find(t => t.beaconId === 'b-u' && t.direction === 'upload')!
    expect(rec.receivedChunks).toBe(6)
    expect(rec.receivedBytes).toBe(3145728)
    expect(rec.status).toBe('uploading')
  })

  it('does not let a missing-acked frame regress in-flight upload counts', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({
      task_id: 'srv-u2', direction: 'upload', beacon_id: 'b-u2',
      remote_path: 'C:\\x\\a.bin', file_name: 'a.bin',
      total_chunks: 57, acked_chunks: 5, acked_bytes: 2621440, status: 'uploading',
    }, 'uploading')
    store.handleTransferEvent({
      task_id: 'srv-u2', direction: 'upload', beacon_id: 'b-u2',
      remote_path: 'C:\\x\\a.bin', file_name: 'a.bin',
      total_chunks: 57, status: 'queued',
    }, 'queued')

    const rec = store.transfers.find(t => t.beaconId === 'b-u2' && t.direction === 'upload')!
    expect(rec.receivedChunks).toBe(5)
    expect(rec.receivedBytes).toBe(2621440)
  })

  it('applies in-flight snapshot counts to a lagging record', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({
      task_id: 'srv-2', direction: 'download', beacon_id: 'b2',
      remote_path: 'C:\\l\\loot.zip', file_name: 'loot.zip',
      total_chunks: 10, received_chunks: 2, received_bytes: 1000, status: 'receiving',
    }, 'receiving')

    store.reconcileWithServer([{
      transfer_id: 'srv-2', direction: 'download', beacon_id: 'b2',
      file_name: 'loot.zip', remote_path: 'C:\\l\\loot.zip',
      total_chunks: 10, done_chunks: 8, done_bytes: 4000,
      size: 5000, status: 'receiving', failed_chunks: 0,
    }])

    const rec = store.transfers.find(t => t.beaconId === 'b2' && t.direction === 'download')!
    expect(rec.receivedChunks).toBe(8)
    expect(rec.receivedBytes).toBe(4000)
    expect(rec.status).toBe('receiving')
  })

  it('marks a long-silenced active record stale when the server has no such transfer', () => {
    vi.useFakeTimers()
    try {
      const store = useFileTransferStore()
      store.startUpload({ beaconid: 'b3', taskId: '', remotePath: 'C:\\x\\gone.bin', fileName: 'gone.bin', size: 1 })
      store.handleTransferEvent({
        task_id: 'srv-3', direction: 'upload', beacon_id: 'b3',
        remote_path: 'C:\\x\\gone.bin', file_name: 'gone.bin',
        total_chunks: 4, acked_chunks: 1, acked_bytes: 1, status: 'uploading',
      }, 'uploading')

      // 宽限期内不误伤
      store.reconcileWithServer([])
      expect(store.transfers[0].status).toBe('uploading')

      // 超过宽限期且服务端查无 → stale
      vi.advanceTimersByTime(31_000)
      store.reconcileWithServer([])
      const rec = store.transfers.find(t => t.beaconId === 'b3' && t.direction === 'upload')!
      expect(rec.status).toBe('stale')
      // stale 不再算活跃,允许操作员重试
      expect(store.hasActiveTransfer('b3', 'C:\\x\\gone.bin', 'upload')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves records of other beacons untouched', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({
      task_id: 'srv-4', direction: 'upload', beacon_id: 'b9',
      remote_path: 'C:\\x\\a.exe', file_name: 'a.exe',
      total_chunks: 5, acked_chunks: 1, acked_bytes: 10, status: 'uploading',
    }, 'uploading')
    store.reconcileWithServer([])
    expect(store.transfers[0].status).toBe('uploading') // 未到宽限期,保持原状
  })
})
