import { describe, expect, it } from 'vitest'
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
} from '../../src/features/events/eventPayload'

describe('normalizeEventType', () => {
  it('normalizes canonical event names and input case variants', () => {
    expect(normalizeEventType('BEACON_REGISTERED')).toBe(EVENT_TYPE.BEACON_REGISTERED)
    expect(normalizeEventType('beacon_registered')).toBe(EVENT_TYPE.BEACON_REGISTERED)
    expect(normalizeEventType('BeaconRegistered')).toBe(EVENT_TYPE.BEACON_REGISTERED)
    expect(normalizeEventType('EVENT_BEACON_REGISTERED')).toBe(EVENT_TYPE.BEACON_REGISTERED)
    expect(normalizeEventType('USER_ONLINE')).toBe(EVENT_TYPE.USER_ONLINE)
    expect(normalizeEventType('COMMAND_EVENT')).toBe(EVENT_TYPE.COMMAND_EVENT)
    expect(normalizeEventType('TUNNEL_ACK')).toBe(EVENT_TYPE.TUNNEL_ACK)
    expect(normalizeEventType('LISTENER_STATE_CHANGED')).toBe(EVENT_TYPE.LISTENER_STATE_CHANGED)
  })

  it('does not map legacy compact / alias event names back to canonical types', () => {
    expect(normalizeEventType('BEACONREGISTERED')).toBe('BEACONREGISTERED')
    expect(normalizeEventType('BEACON_ONLINE')).toBe('BEACON_ONLINE')
  })
})

describe('normalizeResultType', () => {
  it('lowercases canonical snake_case result types', () => {
    expect(normalizeResultType('explorer_files')).toBe('explorer_files')
    expect(normalizeResultType('EXPLORER_FILES')).toBe('explorer_files')
    expect(normalizeResultType('net_info')).toBe('net_info')
    expect(normalizeResultType('ps_list')).toBe('ps_list')
    expect(normalizeResultType('postex_artifact')).toBe('postex_artifact')
  })

  it('does not map legacy compact result types back to canonical', () => {
    expect(normalizeResultType('EXPLORERFILES')).toBe('explorerfiles')
    expect(normalizeResultType('NETINFO')).toBe('netinfo')
    expect(normalizeResultType('PSLIST')).toBe('pslist')
    expect(normalizeResultType('POSTEXARTIFACT')).toBe('postexartifact')
  })
})

describe('normalizeWsEvent', () => {
  it('parses a JSON string envelope', () => {
    const wsMsg = normalizeWsEvent('{"type":"BEACON_REGISTERED","data":{"beacon_id":"abc123"}}')
    expect(wsMsg.status).toBe('known')
    expect(wsMsg.type).toBe(EVENT_TYPE.BEACON_REGISTERED)
    expect(wsMsg.raw.type).toBe('BEACON_REGISTERED')
    expect(wsMsg.data).toEqual({ beacon_id: 'abc123' })
  })

  it('parses an object envelope', () => {
    const wsMsgObj = normalizeWsEvent({ type: 'COMMAND_EVENT', data: { task_id: 42 } })
    expect(wsMsgObj.type).toBe(EVENT_TYPE.COMMAND_EVENT)
    expect((wsMsgObj.data as { task_id: number }).task_id).toBe(42)
  })

  it('reads only the canonical type/data envelope keys', () => {
    const legacy = normalizeWsEvent({ Type: 'BeaconTick', Data: { BeaconID: 'b-1' } })
    expect(legacy.status).toBe('unknown')

    const channel = normalizeWsEvent({ type: 'TUNNEL_CHANNEL_OPEN', data: { tunnel_id: 't-1', channel_id: 'c-1' } })
    expect(channel).toMatchObject({
      status: 'known',
      data: { tunnel_id: 't-1', channel_id: 'c-1' },
    })
  })

  it('marks malformed known event payloads invalid without rejecting unknown events', () => {
    expect(normalizeWsEvent({ type: 'BEACON_REMOVED', data: {} })).toMatchObject({
      status: 'invalid',
      error: 'BEACON_REMOVED requires data.beacon_id',
    })
    expect(normalizeWsEvent({ type: 'LISTENER_STATE_CHANGED', data: [] })).toMatchObject({
      status: 'invalid',
      error: 'LISTENER_STATE_CHANGED requires an object data payload',
    })
    expect(normalizeWsEvent({ type: 'FUTURE_EVENT', data: 'opaque' })).toMatchObject({
      status: 'unknown',
      type: 'FUTURE_EVENT',
      data: 'opaque',
    })
  })
})

describe('event field extractors', () => {
  it('reads the canonical beacon_id field', () => {
    expect(getBeaconId({ beacon_id: 'abc' })).toBe('abc')
    expect(getBeaconId({ beaconId: 'def' })).toBe('')
    expect(getBeaconId({ BeaconID: 'ghi' })).toBe('')
    expect(getBeaconId({})).toBe('')
  })

  it('reads command ids from data or raw', () => {
    expect(getTaskCommandId({ command_id: 42 }, null)).toBe(42)
    expect(getTaskCommandId({}, { command_id: 44 })).toBe(44)
    expect(getTaskCommandId({ commandId: 43 }, null)).toBe('')
    expect(getTaskCommandId({}, {})).toBe('')
  })

  it('reads canonical command fields, phase, status, error and result type', () => {
    expect(getCommandField({ phase: 'progress' }, null, ['phase'])).toBe('progress')
    expect(getCommandField({}, { phase: 'result' }, ['phase'])).toBe('result')
    expect(getCommandField({}, {}, ['phase'], 'idle')).toBe('idle')
    expect(getCommandPhase({ phase: 'Progress' })).toBe('progress')
    expect(getCommandStatus({ status: 'Completed' })).toBe('completed')
    expect(getCommandError({ error: 'something broke' })).toBe('something broke')
    expect(getCommandError({}, { error: 'raw error' })).toBe('raw error')
    expect(getCommandError({})).toBe('')
    expect(getCommandResultType({ result_type: 'ps_list' })).toBe('ps_list')
    expect(getCommandResultType({ result_type: 'net_info' })).toBe('net_info')
    expect(getCommandResultType({ resultType: 'net_info' })).toBe('')
    expect(getCommandResultType({ type: 'screenshot' })).toBe('')
    expect(getCommandResultType({})).toBe('')
  })

  it('reads canonical transfer fields', () => {
    expect(getTransferDirection({ direction: 'download' })).toBe('download')
    expect(getTransferDirection({ Direction: 'Upload' })).toBe('')
    expect(getTransferFileId({ file_id: 'f123' })).toBe('f123')
    expect(getTransferFileId({ fileId: 'f456' })).toBe('')
    expect(getTransferFileName({ file_name: 'test.bin' })).toBe('test.bin')
    expect(getTransferFileName({})).toBe('download.bin')
    expect(getTransferDownloadUrl({ download_url: '/dl/123' })).toBe('/dl/123')
    expect(getTransferError({ error: 'failed' })).toBe('failed')
    expect(getTransferError({})).toBe('文件传输失败')
  })
})
