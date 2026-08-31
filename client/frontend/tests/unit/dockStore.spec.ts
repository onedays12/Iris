import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DOCK_COLLAPSED_HEIGHT, DOCK_DEFAULT_HEIGHT, DOCK_MIN_HEIGHT, useDockStore } from '../../src/stores/dock'
import { defaultExplorerPath } from '../../src/stores/explorer'
import { useFileTransferStore } from '../../src/stores/fileTransfer'

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
})

describe('dock store (BottomDock 布局状态)', () => {
  it('clamps height into [min, viewport*0.6] and persists', () => {
    const dock = useDockStore()
    dock.setHeight(50)
    expect(dock.height).toBe(DOCK_MIN_HEIGHT)
    dock.setHeight(100000)
    expect(dock.height).toBeLessThanOrEqual(Math.floor(window.innerHeight * 0.6))
    const raw = JSON.parse(window.localStorage.getItem('c2.bottom-dock') || '{}')
    expect(raw.height).toBe(dock.height)
  })

  it('defaults to 300px expanded console tab and remembers collapsed state', () => {
    const dock = useDockStore()
    expect(dock.height).toBe(DOCK_DEFAULT_HEIGHT)
    expect(dock.collapsed).toBe(false)
    expect(dock.activeTab).toBe('console')
    expect(dock.effectiveHeight).toBe(dock.height)

    dock.setCollapsed(true)
    expect(dock.effectiveHeight).toBe(DOCK_COLLAPSED_HEIGHT)

    const revived = useDockStore() // 新 pinia 前先读同实例持久化
    expect(revived.collapsed).toBe(true)
  })

  it('openConsoleTab switches to console and expands', () => {
    const dock = useDockStore()
    dock.setTab('events')
    dock.setCollapsed(true)
    dock.openConsoleTab()
    expect(dock.activeTab).toBe('console')
    expect(dock.collapsed).toBe(false)
  })
})

describe('defaultExplorerPath (M4 目录记忆默认值)', () => {
  it('gives C:\ for windows beacons and / for linux beacons', () => {
    expect(defaultExplorerPath('Windows 6.2.9200')).toBe('C:\\')
    expect(defaultExplorerPath('windows/amd64')).toBe('C:\\')
    expect(defaultExplorerPath('linux/amd64')).toBe('/')
    expect(defaultExplorerPath('')).toBe('/')
  })
})

describe('fileTransfer.recentAll (dock 传输监控聚合)', () => {
  it('aggregates across beacons ordered by updatedAt', () => {
    const store = useFileTransferStore()
    store.handleTransferEvent({ beacon_id: 'b1', task_id: 1, direction: 'download', remote_path: 'C:\\a.bin', status: 'running', received_bytes: 10 })
    store.handleTransferEvent({ beacon_id: 'b2', task_id: 2, direction: 'upload', remote_path: '/tmp/b.bin', status: 'running', received_bytes: 20 })
    store.handleTransferEvent({ beacon_id: 'b3', task_id: 3, direction: 'download', remote_path: '/etc/c.conf', status: 'completed' })
    const all = store.recentAll(10)
    expect(all).toHaveLength(3)
    expect([...all].sort((a, b) => b.updatedAt - a.updatedAt)[0]).toBe(all[0])
    expect(new Set(all.map(t => t.beaconId)).size).toBe(3)
  })
})
