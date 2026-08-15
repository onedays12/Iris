import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  EVENT_TYPE,
  getCommandError,
  getCommandResultPayload,
  getTextResultContent,
  normalizeEventType,
  normalizeResultType,
} from '../../src/features/events/eventPayload'
import {
  formatNetInfo,
  formatNetstatTable,
  formatProcessTable,
} from '../../src/features/events/commandResultFormatters'
import { formatEventSummary } from '../../src/stores/eventPanel'
import { useFileTransferStore } from '../../src/stores/fileTransfer'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('command result event constants', () => {
  it('keeps the current TeamServer event names', () => {
    expect(EVENT_TYPE.LISTENER_STATE_CHANGED).toBe('LISTENER_STATE_CHANGED')
    expect(EVENT_TYPE.TUNNEL_ACK).toBe('TUNNEL_ACK')
    expect((EVENT_TYPE as Record<string, unknown>).TASK_RESULT).toBeUndefined()
    expect((EVENT_TYPE as Record<string, unknown>).FILE_TRANSFER_PROGRESS).toBeUndefined()
    expect((EVENT_TYPE as Record<string, unknown>).TUNNEL_ERROR).toBeUndefined()
    expect(normalizeEventType('LISTENER_STATE_CHANGED')).toBe(EVENT_TYPE.LISTENER_STATE_CHANGED)
  })
})

describe('command result formatters and event panel summaries', () => {
  const psEvent = {
    phase: 'result',
    status: 'completed',
    result_type: 'ps_list',
    command_id: 40,
    task_id: 1001,
    beacon_id: 'beacon-a',
    data: [
      { pid: 4, ppid: 0, name: 'System', path: '', user: 'NT AUTHORITY\\SYSTEM', arch: 1, arch_name: 'x64', session_id: 0 },
      { pid: 708, ppid: 4, name: 'smss.exe', path: 'C:\\Windows\\System32\\smss.exe', user: 'NT AUTHORITY\\SYSTEM', arch: 1, arch_name: 'x64', session_id: 0 },
    ],
  }

  it('summarizes TeamServer ps_list results', () => {
    const processPayload = getCommandResultPayload(psEvent)
    expect(Array.isArray(processPayload)).toBe(true)
    expect(normalizeResultType(psEvent.result_type)).toBe('ps_list')
    expect(formatEventSummary(EVENT_TYPE.COMMAND_EVENT, psEvent)).toBe('进程列表: 2 个进程')
    const processTable = formatProcessTable(processPayload)
    expect(processTable).toMatch(/^PID\s+PPID\s+Arch\s+Session\s+User\s+Name\s+Path/m)
    expect(processTable).toMatch(/C:\\Windows\\System32\\smss\.exe/)
    expect(processTable).toMatch(/总进程数: 2/)
  })

  it('summarizes TeamServer net_info results', () => {
    const netInfoEvent = {
      phase: 'result',
      status: 'completed',
      result_type: 'net_info',
      command_id: 52,
      task_id: 1002,
      beacon_id: 'beacon-a',
      data: {
        interfaces: [
          {
            index: 12,
            name: 'Ethernet0',
            mtu: 1500,
            flags: ['up', 'broadcast'],
            hardware_addr: '00:11:22:33:44:55',
            addrs: ['10.0.0.5/24', 'fe80::1/64'],
            is_up: true,
            is_loopback: false,
            is_multicast: true,
          },
        ],
      },
    }

    const netInfoText = formatNetInfo(getCommandResultPayload(netInfoEvent))
    expect(formatEventSummary(EVENT_TYPE.COMMAND_EVENT, netInfoEvent)).toBe('网络信息: 1 个接口')
    expect(netInfoText).toMatch(/网络接口数: 1/)
    expect(netInfoText).toMatch(/\[12\] Ethernet0/)
    expect(netInfoText).toMatch(/MAC: 00:11:22:33:44:55/)
    expect(netInfoText).toMatch(/State: up=yes \/ loopback=no \/ multicast=yes/)
  })

  it('summarizes TeamServer netstat results', () => {
    const netstatEvent = {
      phase: 'result',
      status: 'completed',
      result_type: 'netstat',
      command_id: 53,
      task_id: 1003,
      beacon_id: 'beacon-a',
      data: {
        connections: [
          {
            protocol: 'tcp',
            local_address: '127.0.0.1',
            local_port: 8080,
            remote_address: '10.0.0.8',
            remote_port: 443,
            state: 'ESTABLISHED',
            pid: 1234,
          },
        ],
      },
    }

    const netstatText = formatNetstatTable(getCommandResultPayload(netstatEvent))
    expect(formatEventSummary(EVENT_TYPE.COMMAND_EVENT, netstatEvent)).toBe('网络连接: 1 条记录')
    expect(netstatText).toMatch(/^PROTO\s+LOCAL\s+REMOTE\s+STATE\s+PID/m)
    expect(netstatText).toMatch(/TCP\s+127\.0\.0\.1:8080\s+10\.0\.0\.8:443\s+ESTABLISHED\s+1234/)
    expect(netstatText).toMatch(/总连接数: 1/)
  })

  it('summarizes TeamServer CommandEvent.error', () => {
    const errorEvent = {
      phase: 'result',
      status: 'error',
      result_type: 'ps_list',
      command_id: 40,
      task_id: 1004,
      beacon_id: 'beacon-a',
      data: {},
      error: 'invalid process count: -1',
    }
    expect(getCommandError(errorEvent)).toBe('invalid process count: -1')
    expect(formatEventSummary(EVENT_TYPE.COMMAND_EVENT, errorEvent)).toBe('任务失败: ps - invalid process count: -1')
  })

  it('prefers TeamServer error over text fallback', () => {
    const textErrorEvent = {
      phase: 'result',
      status: 'error',
      result_type: 'text',
      command_id: 11,
      task_id: 1005,
      beacon_id: 'beacon-a',
      data: { text: 'fallback stderr' },
      error: 'powershell failed',
    }
    expect(formatEventSummary(EVENT_TYPE.COMMAND_EVENT, textErrorEvent)).toBe('任务失败: powershell - powershell failed')
  })

  it('reads TeamServer data.text', () => {
    expect(getTextResultContent({ text: 'whoami: NT AUTHORITY\\SYSTEM' })).toBe('whoami: NT AUTHORITY\\SYSTEM')
  })
})

describe('command result transfer keys', () => {
  it('keys transfers by beacon_id + direction + task_id', () => {
    const transferStore = useFileTransferStore()
    transferStore.startDownload({
      beaconid: 'beacon-a',
      remotePath: 'C:\\Temp\\large.bin',
      fileName: 'large.bin',
      size: 10240,
    })
    transferStore.handleTransferEvent({
      direction: 'download',
      task_id: '900',
      beacon_id: 'beacon-a',
      file_name: 'large.bin',
      total_chunks: 10,
      received_chunks: 2,
      status: 'receiving',
    }, 'receiving')
    transferStore.handleTransferEvent({
      direction: 'upload',
      task_id: '900',
      beacon_id: 'beacon-a',
      file_name: 'large.bin',
      total_chunks: 10,
      acked_chunks: 3,
      status: 'uploading',
    }, 'uploading')
    transferStore.handleTransferEvent({
      direction: 'download',
      task_id: '900',
      beacon_id: 'beacon-a',
      file_name: 'large-renamed.bin',
      total_chunks: 10,
      received_chunks: 6,
      status: 'receiving',
    }, 'receiving')
    transferStore.handleTransferEvent({
      direction: 'upload',
      task_id: '901',
      beacon_id: 'beacon-a',
      file_name: 'queued.bin',
      total_chunks: 12,
      size: 6291456,
      status: 'queued',
    }, 'queued')

    expect(transferStore.transfers).toHaveLength(3)
    const download900 = transferStore.transfers.find(item => item.transferKey === 'beacon-a:download:900')
    const upload900 = transferStore.transfers.find(item => item.transferKey === 'beacon-a:upload:900')
    const upload901 = transferStore.transfers.find(item => item.transferKey === 'beacon-a:upload:901')
    expect(download900?.progress).toBe(60)
    expect(download900?.taskId).toBe('900')
    expect(download900?.fileName).toBe('large-renamed.bin')
    expect(upload900?.progress).toBe(30)
    expect(upload901?.progress).toBe(0)
  })
})
