import { expectArray, expectRecord, expectStringField } from '../../../shared/api/guards'
import { request } from '../../../shared/api/httpClient'
import type { ApiOperationResult } from '../../../shared/api/types'
import { buildBeaconCommandArgs } from './commandArgs'
import type { BeaconCommandRequest, BeaconViewDto, RemoveBeaconRequest } from './types'

function parseBeaconList(value: unknown): BeaconViewDto[] {
  const list = expectArray(value, 'Beacon list')
  for (const item of list) {
    expectStringField(expectRecord(item, 'Beacon'), 'beacon_id', 'Beacon')
  }
  return list as BeaconViewDto[]
}

export async function listBeacons(): Promise<BeaconViewDto[]> {
  return parseBeaconList(await request<unknown>('GET', '/api/v1/beacon/list'))
}

export async function sendCommand(
  beaconid: string,
  commandId: number,
  args: unknown[] = [],
): Promise<ApiOperationResult> {
  const payload: BeaconCommandRequest = {
    beacon_id: String(beaconid),
    command: Number(commandId),
    args: buildBeaconCommandArgs(commandId, args),
  }
  return request<ApiOperationResult, BeaconCommandRequest>('POST', '/api/v1/beacon/command', payload)
}

export async function removeBeacon(beaconid: string): Promise<ApiOperationResult> {
  const payload: RemoveBeaconRequest = { beacon_id: String(beaconid) }
  return request<ApiOperationResult, RemoveBeaconRequest>('POST', '/api/v1/beacon/remove', payload)
}
