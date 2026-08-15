export const EVENT_TYPE = {
  USER_ONLINE: 'USER_ONLINE',
  BEACON_REGISTERED: 'BEACON_REGISTERED',
  BEACON_TICK: 'BEACON_TICK',
  BEACON_REMOVED: 'BEACON_REMOVED',
  COMMAND_EVENT: 'COMMAND_EVENT',
  LISTENER_STATE_CHANGED: 'LISTENER_STATE_CHANGED',
  TUNNEL_STARTED: 'TUNNEL_STARTED',
  TUNNEL_PAUSED: 'TUNNEL_PAUSED',
  TUNNEL_RESUMED: 'TUNNEL_RESUMED',
  TUNNEL_STOPPED: 'TUNNEL_STOPPED',
  TUNNEL_CLEARED: 'TUNNEL_CLEARED',
  TUNNEL_CHANNEL_OPEN: 'TUNNEL_CHANNEL_OPEN',
  TUNNEL_CHANNEL_CLOSE: 'TUNNEL_CHANNEL_CLOSE',
  TUNNEL_CHANNEL_RECYCLED: 'TUNNEL_CHANNEL_RECYCLED',
  TUNNEL_STATS: 'TUNNEL_STATS',
  TUNNEL_UPDATED: 'TUNNEL_UPDATED',
  TUNNEL_ACK: 'TUNNEL_ACK',
} as const

export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE]
export type EventRecord = Record<string, unknown>

export type UserOnlineEventData = EventRecord & { username: string; time?: string }
export type BeaconRegisteredEventData = EventRecord & { beacon_id: string }
export type BeaconTickEventData = EventRecord & { beacon_id: string; last_seen?: string; status?: string }
export type BeaconRemovedEventData = EventRecord & { beacon_id: string }
export type CommandEventData = EventRecord & {
  beacon_id?: string
  task_id?: string | number
  command_id?: string | number
  phase?: string
  status?: string
  result_type?: string
  error?: string
}
export type ListenerStateChangedEventData = EventRecord & { id?: string; name?: string; status?: string }
export type TunnelEventData = EventRecord & { tunnel_id: string; beacon_id?: string }
export type TunnelChannelEventData = TunnelEventData & { channel_id: string }

interface WsEventBase<TType extends string, TData> {
  raw: EventRecord
  rawType: string
  type: TType
  data: TData
}

export type KnownWsEvent =
  | (WsEventBase<'USER_ONLINE', UserOnlineEventData> & { status: 'known' })
  | (WsEventBase<'BEACON_REGISTERED', BeaconRegisteredEventData> & { status: 'known' })
  | (WsEventBase<'BEACON_TICK', BeaconTickEventData> & { status: 'known' })
  | (WsEventBase<'BEACON_REMOVED', BeaconRemovedEventData> & { status: 'known' })
  | (WsEventBase<'COMMAND_EVENT', CommandEventData> & { status: 'known' })
  | (WsEventBase<'LISTENER_STATE_CHANGED', ListenerStateChangedEventData> & { status: 'known' })
  | (WsEventBase<
      | 'TUNNEL_STARTED'
      | 'TUNNEL_PAUSED'
      | 'TUNNEL_RESUMED'
      | 'TUNNEL_STOPPED'
      | 'TUNNEL_CLEARED'
      | 'TUNNEL_CHANNEL_RECYCLED'
      | 'TUNNEL_STATS'
      | 'TUNNEL_UPDATED',
      TunnelEventData
    > & { status: 'known' })
  | (WsEventBase<'TUNNEL_CHANNEL_OPEN' | 'TUNNEL_CHANNEL_CLOSE' | 'TUNNEL_ACK', TunnelChannelEventData> & { status: 'known' })

export interface UnknownWsEvent extends WsEventBase<string, unknown> {
  status: 'unknown'
}

export interface InvalidWsEvent extends WsEventBase<EventType, unknown> {
  status: 'invalid'
  error: string
}

export type NormalizedWsEvent = KnownWsEvent | UnknownWsEvent | InvalidWsEvent
