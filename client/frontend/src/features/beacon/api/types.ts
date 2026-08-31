import type { BeaconArg } from './commandArgs'

export interface BeaconViewDto {
  id: number
  beacon_id: string
  hostname: string
  internal_ip: string
  external_ip: string
  listener: string
  listener_type: 'external' | 'internal' | string
  parent_id: string
  gateway_id: string
  depth: number
  link_protocol: 'tcp' | 'smb' | string
  link_state: 'online' | 'lost' | 'closed' | string
  link_addr: string
  os: string
  arch: string
  protocol: string
  username: string
  process_name: string
  pid: number
  acp: number
  is_admin: boolean
  sleep: number
  jitter: number
  last_seen: string
  created_at: string
  updated_at: string
  note?: string
  group_name?: string
}

export interface BeaconMetaRequest {
  beacon_ids: string[]
  note?: string
  group_name?: string
}

export interface BeaconMetaItemDto {
  beacon_id: string
  hostname: string
  note: string
  group_name: string
}

export interface BeaconMetaUpdateDto {
  operator: string
  action: string
  beacon_ids: string[]
  note: string
  group_name: string
  items: BeaconMetaItemDto[]
}

export interface BeaconCommandRequest {
  beacon_id: string
  command: number
  args: BeaconArg[]
}

export interface RemoveBeaconRequest {
  beacon_id: string
}

export interface RemoveBeaconBatchRequest {
  beacon_ids: string[]
}

export interface RemoveBeaconBatchResult {
  beacon_ids: string[]
}
