/**
 * eventPayload 单测 — 验证事件归一化、字段提取的正确性
 * 运行: node tests/check-event-payload.mjs
 */
import assert from 'node:assert/strict'
import {
  EVENT_TYPE,
  normalizeEventType,
  normalizeResultType,
  normalizeWsEvent,
  getBeaconId,
  getTaskCommandId,
  getCommandField,
  getCommandPhase,
  getCommandStatus,
  getCommandError,
  getCommandResultType,
  getTransferDirection,
  getTransferFileId,
  getTransferFileName,
  getTransferDownloadUrl,
  getTransferError,
} from '../src/features/events/eventPayload.js'

// ─── normalizeEventType ───

assert.equal(normalizeEventType('BEACON_REGISTERED'), EVENT_TYPE.BEACON_REGISTERED, 'standard event type')
assert.equal(normalizeEventType('beacon_registered'), EVENT_TYPE.BEACON_REGISTERED, 'lowercase normalizes')
assert.equal(normalizeEventType('BeaconRegistered'), EVENT_TYPE.BEACON_REGISTERED, 'camelCase normalizes')
assert.equal(normalizeEventType('BEACONREGISTERED'), EVENT_TYPE.BEACON_REGISTERED, 'compact normalizes')
assert.equal(normalizeEventType('EVENT_BEACON_REGISTERED'), EVENT_TYPE.BEACON_REGISTERED, 'EVENT_ prefix stripped')
assert.equal(normalizeEventType('USER_ONLINE'), EVENT_TYPE.USER_ONLINE, 'user online')
assert.equal(normalizeEventType('COMMAND_EVENT'), EVENT_TYPE.COMMAND_EVENT, 'command event')
assert.equal(normalizeEventType('TUNNEL_ACK'), EVENT_TYPE.TUNNEL_ACK, 'tunnel ack')
assert.equal(normalizeEventType('LISTENER_STATE_CHANGED'), EVENT_TYPE.LISTENER_STATE_CHANGED, 'listener state changed')

// ─── normalizeResultType ───

assert.equal(normalizeResultType('explorer_files'), 'explorer_files', 'explorer_files standard')
assert.equal(normalizeResultType('EXPLORERFILES'), 'explorer_files', 'explorer_files compact')
assert.equal(normalizeResultType('EXPLORER_FILES'), 'explorer_files', 'explorer_files underscore')
assert.equal(normalizeResultType('net_info'), 'net_info', 'net_info standard')
assert.equal(normalizeResultType('NETINFO'), 'net_info', 'net_info compact')
assert.equal(normalizeResultType('ps_list'), 'ps_list', 'ps_list standard')
assert.equal(normalizeResultType('PSLIST'), 'ps_list', 'ps_list compact')
assert.equal(normalizeResultType('postex_artifact'), 'postex_artifact', 'postex_artifact standard')
assert.equal(normalizeResultType('POSTEXARTIFACT'), 'postex_artifact', 'postex_artifact compact')

// ─── normalizeWsEvent ───

const wsMsg = normalizeWsEvent('{"type":"BEACON_REGISTERED","data":{"beacon_id":"abc123"}}')
assert.equal(wsMsg.type, EVENT_TYPE.BEACON_REGISTERED, 'ws event type parsed')
assert.equal(wsMsg.raw.type, 'BEACON_REGISTERED', 'ws event raw.type preserved')
assert.deepEqual(wsMsg.data, { beacon_id: 'abc123' }, 'ws event data extracted')

const wsMsgObj = normalizeWsEvent({ type: 'COMMAND_EVENT', data: { task_id: 42 } })
assert.equal(wsMsgObj.type, EVENT_TYPE.COMMAND_EVENT, 'ws event from object')
assert.equal(wsMsgObj.data.task_id, 42, 'ws event data from object')

// ─── getBeaconId ───

assert.equal(getBeaconId({ beacon_id: 'abc' }), 'abc', 'beacon_id snake_case')
assert.equal(getBeaconId({ beaconId: 'def' }), 'def', 'beaconId camelCase')
assert.equal(getBeaconId({ BeaconID: 'ghi' }), 'ghi', 'BeaconID PascalCase')
assert.equal(getBeaconId({}), '', 'empty beacon id returns empty string')

// ─── getTaskCommandId ───

assert.equal(getTaskCommandId({ command_id: 42 }, null), 42, 'command_id from data')
assert.equal(getTaskCommandId({ commandId: 43 }, null), 43, 'commandId from data')
assert.equal(getTaskCommandId({}, { CommandID: 44 }), 44, 'CommandID from raw')
assert.equal(getTaskCommandId({}, {}), '', 'empty command id')

// ─── getCommandField ───

assert.equal(getCommandField({ phase: 'progress' }, null, ['phase', 'Phase']), 'progress', 'field from data')
assert.equal(getCommandField({}, { Phase: 'result' }, ['phase', 'Phase']), 'result', 'field from raw fallback')
assert.equal(getCommandField({}, {}, ['phase', 'Phase'], 'idle'), 'idle', 'field fallback default')

// ─── getCommandPhase / getCommandStatus ───

assert.equal(getCommandPhase({ phase: 'Progress' }), 'progress', 'phase lowercased')
assert.equal(getCommandStatus({ status: 'Completed' }), 'completed', 'status lowercased')

// ─── getCommandError ───

assert.equal(getCommandError({ error: 'something broke' }), 'something broke', 'error from data')
assert.equal(getCommandError({}, { Error: 'raw error' }), 'raw error', 'error from raw fallback')
assert.equal(getCommandError({}), '', 'empty error')

// ─── getCommandResultType ───

assert.equal(getCommandResultType({ result_type: 'ps_list' }), 'ps_list', 'result_type from data')
assert.equal(getCommandResultType({ resultType: 'net_info' }), 'net_info', 'resultType from data')
assert.equal(getCommandResultType({ type: 'screenshot' }), 'screenshot', 'type fallback as result type')
assert.equal(getCommandResultType({}), '', 'empty result type')

// ─── Transfer field extraction ───

assert.equal(getTransferDirection({ direction: 'download' }), 'download', 'transfer direction')
assert.equal(getTransferDirection({ Direction: 'Upload' }), 'upload', 'transfer direction PascalCase lowercased')
assert.equal(getTransferFileId({ file_id: 'f123' }), 'f123', 'transfer file_id')
assert.equal(getTransferFileId({ fileId: 'f456' }), 'f456', 'transfer fileId')
assert.equal(getTransferFileName({ file_name: 'test.bin' }), 'test.bin', 'transfer file_name')
assert.equal(getTransferFileName({}), 'download.bin', 'transfer file_name default')
assert.equal(getTransferDownloadUrl({ download_url: '/dl/123' }), '/dl/123', 'transfer download_url')
assert.equal(getTransferError({ error: 'failed' }), 'failed', 'transfer error')
assert.equal(getTransferError({}), '文件传输失败', 'transfer error default')

console.log('event payload tests ok')
