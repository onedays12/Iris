import { pickBeacon, pickBeaconId } from '../../shared/protocol/adapter'

export interface Beacon {
  beaconid: string
  hostname: string
  username: string
  os: string
  arch: string
  ip: string
  externalIp: string
  lastSeen: string
  status: string
  processName: string
  pid: number
  acp: number
  isAdmin: boolean
  sleep: number
  jitter: number
  protocol: string
  listener: string
  listenerType: string
  parentId: string
  gatewayId: string
  depth: number
  linkProtocol: string
  linkState: string
  linkHint: string
  linkAddr: string
}

/**
 * 历史版本曾支持多种信封包裹（beacon/agent/data 等），破坏性收敛后
 * 契约（FRONTEND_API_CONTRACT.md）规定 API 列表项与 WS 事件数据均为
 * 扁平 beacon 对象（beacon_id 顶层），无需解包。
 */
export function unwrapBeaconPayload(value: unknown): unknown {
  return value
}

export function getBeaconId(value: unknown): string {
  return pickBeaconId(value)
}

export function normalizeLastSeen(value: unknown, now: number): string {
  const fallback = new Date(now).toISOString()
  if (!value) return fallback
  const time = new Date(String(value)).getTime()
  if (!Number.isFinite(time) || time > now) return fallback
  return String(value)
}

export function normalizeBeacon(value: unknown, now = Date.now()): Beacon | null {
  const source = unwrapBeaconPayload(value)
  const beaconid = getBeaconId(source)
  if (!beaconid) return null

  const c = pickBeacon(source)
  return {
    beaconid: String(beaconid),
    hostname: String(c.hostname || 'Unknown'),
    username: String(c.username || 'Unknown').split('\\').pop() || 'Unknown',
    os: String(c.os || 'Unknown'),
    arch: String(c.arch || 'Unknown'),
    ip: String(c.internalIp || '0.0.0.0'),
    externalIp: String(c.externalIp || '-'),
    lastSeen: normalizeLastSeen(c.lastSeen, now),
    status: String(c.status || 'online'),
    processName: String(c.processName || '-'),
    pid: Number(c.pid) || 0,
    acp: Number(c.acp) || 0,
    isAdmin: Boolean(c.isAdmin),
    sleep: Number(c.sleep) || 0,
    jitter: Number(c.jitter) || 0,
    protocol: String(c.protocol || 'http'),
    listener: String(c.listener || '-'),
    listenerType: String(c.listenerType || ''),
    parentId: String(c.parentId || ''),
    gatewayId: String(c.gatewayId || ''),
    depth: Number(c.depth) || 0,
    linkProtocol: String(c.linkProtocol || ''),
    linkState: String(c.linkState || ''),
    linkHint: String(c.linkHint || ''),
    linkAddr: String(c.linkAddr || ''),
  }
}
