import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import {
  EVENT_TYPE,
  getCommandError,
  getCommandResultPayload,
  getTextResultContent,
  normalizeEventType,
  normalizeResultType,
} from '../src/features/events/eventPayload.js'
import {
  formatNetInfo,
  formatNetstatTable,
  formatProcessTable,
} from '../src/features/events/commandResultFormatters.js'
import { formatEventSummary } from '../src/stores/eventPanel.js'
import { useFileTransferStore } from '../src/stores/fileTransfer.js'

setActivePinia(createPinia())

function match(text, pattern, label) {
  assert.match(text, pattern, label)
}

assert.equal(EVENT_TYPE.LISTENER_STATE_CHANGED, 'LISTENER_STATE_CHANGED', 'listener event uses current TeamServer name')
assert.equal(EVENT_TYPE.TUNNEL_ACK, 'TUNNEL_ACK', 'tunnel ack event is part of the current event set')
assert.equal(EVENT_TYPE.TASK_RESULT, undefined, 'TASK_RESULT is no longer a client event constant')
assert.equal(EVENT_TYPE.FILE_TRANSFER_PROGRESS, undefined, 'file transfer progress uses COMMAND_EVENT now')
assert.equal(EVENT_TYPE.TUNNEL_ERROR, undefined, 'TUNNEL_ERROR is no longer a client event constant')
assert.equal(normalizeEventType('LISTENER_STATE_CHANGED'), EVENT_TYPE.LISTENER_STATE_CHANGED, 'current listener event normalizes')

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

const processPayload = getCommandResultPayload(psEvent)
assert.equal(Array.isArray(processPayload), true, 'ps_list payload is the TeamServer data array')
assert.equal(normalizeResultType(psEvent.result_type), 'ps_list', 'ps_list keeps TeamServer result type')
assert.equal(
  formatEventSummary(EVENT_TYPE.COMMAND_EVENT, psEvent),
  '进程列表: 2 个进程',
  'event panel summarizes TeamServer ps_list'
)
const processTable = formatProcessTable(processPayload)
match(processTable, /^PID\s+PPID\s+Arch\s+Session\s+User\s+Name\s+Path/m, 'process table uses browser columns')
match(processTable, /C:\\Windows\\System32\\smss\.exe/, 'process table keeps process path')
match(processTable, /总进程数: 2/, 'process table counts rows')

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
assert.equal(
  formatEventSummary(EVENT_TYPE.COMMAND_EVENT, netInfoEvent),
  '网络信息: 1 个接口',
  'event panel summarizes TeamServer net_info'
)
match(netInfoText, /网络接口数: 1/, 'netinfo counts interfaces')
match(netInfoText, /\[12\] Ethernet0/, 'netinfo reads TeamServer interface shape')
match(netInfoText, /MAC: 00:11:22:33:44:55/, 'netinfo reads hardware_addr')
match(netInfoText, /State: up=yes \/ loopback=no \/ multicast=yes/, 'netinfo renders booleans')

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
assert.equal(
  formatEventSummary(EVENT_TYPE.COMMAND_EVENT, netstatEvent),
  '网络连接: 1 条记录',
  'event panel summarizes TeamServer netstat'
)
match(netstatText, /^PROTO\s+LOCAL\s+REMOTE\s+STATE\s+PID/m, 'netstat table keeps headers')
match(netstatText, /TCP\s+127\.0\.0\.1:8080\s+10\.0\.0\.8:443\s+ESTABLISHED\s+1234/, 'netstat reads TeamServer connection shape')
match(netstatText, /总连接数: 1/, 'netstat counts rows')

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
assert.equal(getCommandError(errorEvent), 'invalid process count: -1', 'error text comes from CommandEvent.error')
assert.equal(
  formatEventSummary(EVENT_TYPE.COMMAND_EVENT, errorEvent),
  '任务失败: ps - invalid process count: -1',
  'event panel summarizes TeamServer CommandEvent.error'
)

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
assert.equal(
  formatEventSummary(EVENT_TYPE.COMMAND_EVENT, textErrorEvent),
  '任务失败: powershell - powershell failed',
  'event panel prefers TeamServer error over text fallback'
)

assert.equal(
  getTextResultContent({ text: 'whoami: NT AUTHORITY\\SYSTEM' }),
  'whoami: NT AUTHORITY\\SYSTEM',
  'text result reads TeamServer data.text'
)

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
  queued_chunks: 12,
  queued_bytes: 6291456,
  status: 'queued',
}, 'queued')

assert.equal(transferStore.transfers.length, 3, 'transfer key is direction + task_id')
const download900 = transferStore.transfers.find(item => item.transferKey === 'download:900')
const upload900 = transferStore.transfers.find(item => item.transferKey === 'upload:900')
const upload901 = transferStore.transfers.find(item => item.transferKey === 'upload:901')
assert.equal(download900?.progress, 60, 'download progress updates by matching direction:task_id')
assert.equal(download900?.taskId, '900', 'download progress backfills task_id into the queued placeholder')
assert.equal(download900?.fileName, 'large-renamed.bin', 'download update merges into the same transfer')
assert.equal(upload900?.progress, 30, 'upload with same task_id uses separate upload key')
assert.equal(upload901?.progress, 0, 'queued upload does not treat queued_chunks as completed progress')

console.log('command results compatibility ok')
