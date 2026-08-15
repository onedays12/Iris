import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { bus } from '../../src/shared/bus'
import { EVENT_TYPE } from '../../src/features/events/eventPayload'
import { useEventPanelStore, formatEventSummary } from '../../src/stores/eventPanel'
import type { WsEventRecordPayload } from '../../src/shared/bus'

function makePayload(partial: Partial<WsEventRecordPayload> = {}): WsEventRecordPayload {
  return {
    rawType: '',
    type: '',
    data: {},
    raw: {},
    commandId: '',
    phase: '',
    status: '',
    resultType: '',
    ...partial,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  bus.clear()
})

describe('eventPanel store', () => {
  it('records a beacon registration with summary, tone and beacon id', () => {
    const store = useEventPanelStore()

    store.recordEvent(makePayload({
      type: EVENT_TYPE.BEACON_REGISTERED,
      data: { beacon_id: 'b-1' },
    }))

    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({
      type: EVENT_TYPE.BEACON_REGISTERED,
      tone: 'success',
      beaconId: 'b-1',
      summary: 'Beacon b-1 已上线',
      commandId: '',
      commandName: '',
    })
    expect(store.latest).toBe(store.events[0])
  })

  it('keeps command metadata and derives tone from status', () => {
    const store = useEventPanelStore()

    store.recordEvent(makePayload({
      type: EVENT_TYPE.COMMAND_EVENT,
      data: { beacon_id: 'b-1', task_id: '999', result_type: 'text', result: 'done' },
      commandId: '999',
      status: 'completed',
      resultType: 'text',
    }))

    expect(store.events[0]).toMatchObject({
      type: EVENT_TYPE.COMMAND_EVENT,
      commandId: '999',
      commandName: 'command_999',
      phase: '',
      status: 'completed',
      resultType: 'text',
      tone: 'success',
      summary: '任务回传: command_999',
    })

    store.recordEvent(makePayload({
      type: EVENT_TYPE.COMMAND_EVENT,
      data: { task_id: '999', result_type: 'text', result: 'done' },
      commandId: '999',
      status: 'error',
      resultType: 'text',
    }))
    expect(store.events[0].tone).toBe('error')
  })

  it('ignores quiet event types (tick and tunnel channel events)', () => {
    const store = useEventPanelStore()

    store.recordEvent(makePayload({ type: EVENT_TYPE.BEACON_TICK, data: { beacon_id: 'b-1' } }))
    store.recordEvent(makePayload({ type: EVENT_TYPE.TUNNEL_STATS, data: { tunnel_id: 't-1' } }))
    store.recordEvent(makePayload({ type: EVENT_TYPE.TUNNEL_CHANNEL_OPEN, data: { tunnel_id: 't-1', channel_id: 'c-1' } }))
    store.recordEvent(makePayload({ type: EVENT_TYPE.TUNNEL_CHANNEL_CLOSE, data: { tunnel_id: 't-1', channel_id: 'c-1' } }))
    store.recordEvent(makePayload({ type: EVENT_TYPE.TUNNEL_CHANNEL_RECYCLED, data: { tunnel_id: 't-1' } }))

    expect(store.events).toHaveLength(0)
  })

  it('caps the list at maxEvents keeping the newest entries first', () => {
    const store = useEventPanelStore()

    for (let i = 1; i <= 100; i++) {
      store.recordEvent(makePayload({
        type: EVENT_TYPE.BEACON_REGISTERED,
        data: { beacon_id: `b-${i}` },
      }))
    }

    expect(store.events).toHaveLength(80)
    expect(store.events[0].id).toBe(100)
    expect(store.events.at(-1)?.id).toBe(21)
  })

  it('passes formerly-aliased rawTypes through as unknown and keeps unknown types forward-compatible', () => {
    const store = useEventPanelStore()

    store.recordEvent(makePayload({ rawType: 'BeaconOnline', type: '', data: { beacon_id: 'b-9' } }))
    expect(store.events[0]).toMatchObject({
      type: 'BEACON_ONLINE',
      rawType: 'BeaconOnline',
    })

    store.recordEvent(makePayload({ type: 'FOO_BAR', data: {} }))
    expect(store.events[0]).toMatchObject({ type: 'FOO_BAR', tone: 'info', summary: '{}' })
  })

  it('clear() resets events and id sequence', () => {
    const store = useEventPanelStore()

    store.recordEvent(makePayload({ type: EVENT_TYPE.BEACON_REGISTERED, data: { beacon_id: 'b-1' } }))
    store.clear()

    expect(store.events).toEqual([])
    store.recordEvent(makePayload({ type: EVENT_TYPE.BEACON_REGISTERED, data: { beacon_id: 'b-2' } }))
    expect(store.events[0].id).toBe(1)
  })

  it('subscribes to ws:event-record idempotently', () => {
    const store = useEventPanelStore()

    store.initSubscriptions()
    store.initSubscriptions()

    bus.emit('ws:event-record', makePayload({
      type: EVENT_TYPE.BEACON_REGISTERED,
      data: { beacon_id: 'b-1' },
    }))
    bus.emit('ws:event-record', makePayload({
      type: EVENT_TYPE.BEACON_REMOVED,
      data: { beacon_id: 'b-1' },
    }))

    expect(store.events).toHaveLength(2)
    expect(store.events[0].type).toBe(EVENT_TYPE.BEACON_REMOVED)
  })

  it('formats offline and user online summaries', () => {
    expect(formatEventSummary(EVENT_TYPE.BEACON_REMOVED, { beacon_id: 'b-2' })).toBe('Beacon b-2 已下线')
    expect(formatEventSummary(EVENT_TYPE.USER_ONLINE, { username: 'admin' })).toBe('用户上线: admin')
    expect(formatEventSummary(EVENT_TYPE.LISTENER_STATE_CHANGED, { id: 'l-1' })).toBe('监听器状态变更')
  })
})
