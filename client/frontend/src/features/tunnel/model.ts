import { pickChannel, pickTunnel } from '../../shared/protocol/adapter'
import { TUNNEL_FIELDS } from '../../shared/protocol/fieldMap'
import { pick, toNumber } from '../../utils/object'

export interface Tunnel {
  tunnelId: string
  beaconId: string
  mode: string
  type: string
  typeLabel: string
  bindHost: string
  bindPort: number
  remoteHost: string
  remotePort: number
  socksAuthMode: string
  socksUsername: string
  socksUdpAssociate: boolean
  activeChannels: number
  channelCount: number
  bytesIn: number
  bytesOut: number
  status: string
  errorMessage: string
  channelId: string
  queueDepth: number
  dropCount: number
  timeoutCount: number
  openLatencyMs: number
  createdAt: number
  updatedAt: number
  raw: unknown
}

export interface TunnelChannel {
  channelId: string
  tunnelId: string
  targetAddress: string
  remoteHost: string
  remotePort: number
  localHost: string
  localPort: number
  status: string
  bytesIn: number
  bytesOut: number
  reason: string
  createdAt: number
  updatedAt: number
  raw: unknown
}

export interface PagePayload<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

const TUNNEL_TYPE_LABELS: Record<string, string> = {
  socks5: 'SOCKS5',
  port_forward: 'Port Forward',
  reverse_port_map: 'Reverse Port Map',
  http_proxy: 'HTTP Proxy',
  udp_proxy: 'UDP Proxy',
}

function toCount(value: unknown): number {
  const number = toNumber(value)
  return number > 0 ? number : 0
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off', ''].includes(text)) return false
  return Boolean(value)
}

// 契约: tunnel created_at/updated_at 为 Go time.Time 的 ISO/RFC3339 字符串。
// 历史版本兼容过 unix 秒/毫秒时间戳, 已破坏性移除。
function normalizeTime(value: unknown): number {
  if (!value) return 0
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function hasAny(item: unknown, keys: readonly string[]): boolean {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  return keys.some(key => record[key] !== undefined && record[key] !== null && record[key] !== '')
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function normalizePagePayload(payload: unknown): PagePayload<unknown> {
  if (Array.isArray(payload)) {
    return { items: payload, page: 1, pageSize: payload.length, total: payload.length, hasMore: false }
  }

  const record = recordOrEmpty(payload)
  const items = Array.isArray(record.items) ? record.items : Array.isArray(record.Items) ? record.Items : []
  return {
    items,
    page: toNumber(pick(record, ['page', 'Page'], 1)),
    pageSize: toNumber(pick(record, ['page_size', 'pageSize', 'PageSize'], items.length || 0)),
    total: toNumber(pick(record, ['total', 'Total'], items.length || 0)),
    hasMore: toBool(pick(record, ['has_more', 'hasMore', 'HasMore'], false)),
  }
}

export function normalizeTunnel(item: unknown): Tunnel {
  const c = pickTunnel(item)
  const metricsSource = pick(item, ['metrics', 'Metrics', 'stats', 'Stats'], item)
  const mode = String(c.mode || 'unknown').toLowerCase()
  const activeChannels = toCount(c.activeChannels)
  return {
    tunnelId: String(c.tunnelId),
    beaconId: String(c.beaconId),
    mode,
    type: mode,
    typeLabel: TUNNEL_TYPE_LABELS[mode] || mode || '-',
    bindHost: String(c.bindHost || '127.0.0.1'),
    bindPort: toNumber(c.bindPort),
    remoteHost: String(c.remoteHost),
    remotePort: toNumber(c.remotePort),
    socksAuthMode: String(c.socksAuthMode || 'no_auth').toLowerCase(),
    socksUsername: String(c.socksUsername),
    socksUdpAssociate: toBool(c.socksUdpAssociate),
    activeChannels,
    channelCount: activeChannels,
    bytesIn: toNumber(c.bytesIn),
    bytesOut: toNumber(c.bytesOut),
    status: String(c.status || 'unknown').toLowerCase(),
    errorMessage: String(c.errorMessage),
    channelId: String(pick(metricsSource, ['channel_id', 'channelId', 'ChannelID', 'ChannelId'], '')),
    queueDepth: toCount(pick(metricsSource, ['queue_depth', 'queueDepth', 'QueueDepth'], 0)),
    dropCount: toCount(pick(metricsSource, ['drop_count', 'dropCount', 'DropCount'], 0)),
    timeoutCount: toCount(pick(metricsSource, ['timeout_count', 'timeoutCount', 'TimeoutCount'], 0)),
    openLatencyMs: toCount(pick(metricsSource, ['open_latency_ms', 'openLatencyMs', 'OpenLatencyMs'], 0)),
    createdAt: normalizeTime(c.createdAt),
    updatedAt: normalizeTime(c.updatedAt),
    raw: item,
  }
}

export function normalizeChannel(item: unknown): TunnelChannel {
  const c = pickChannel(item)
  return {
    channelId: String(c.channelId),
    tunnelId: String(c.tunnelId),
    targetAddress: String(c.targetAddress),
    remoteHost: String(c.remoteHost),
    remotePort: toNumber(c.remotePort),
    localHost: String(c.localHost),
    localPort: toNumber(c.localPort),
    status: String(c.status || 'unknown').toLowerCase(),
    bytesIn: toNumber(c.bytesIn),
    bytesOut: toNumber(c.bytesOut),
    reason: String(c.reason),
    createdAt: normalizeTime(c.createdAt),
    updatedAt: normalizeTime(c.updatedAt),
    raw: item,
  }
}

export function sameTunnel(left: Tunnel, right: Tunnel): boolean {
  if (left.tunnelId && right.tunnelId && left.tunnelId === right.tunnelId) return true
  return Boolean(
    left.beaconId && right.beaconId && left.beaconId === right.beaconId &&
    left.type === right.type && left.bindHost === right.bindHost && left.bindPort === right.bindPort &&
    left.remoteHost === right.remoteHost && left.remotePort === right.remotePort &&
    left.socksAuthMode === right.socksAuthMode && left.socksUdpAssociate === right.socksUdpAssociate,
  )
}

export function mergeTunnel(current: Tunnel, next: Tunnel): Tunnel {
  const merged = { ...current, ...next }
  const mergedRecord = merged as unknown as Record<string, unknown>
  const currentRecord = current as unknown as Record<string, unknown>
  const nextRecord = next as unknown as Record<string, unknown>

  for (const [field, keys] of Object.entries(TUNNEL_FIELDS)) {
    mergedRecord[field] = hasAny(next.raw, keys) ? nextRecord[field] : currentRecord[field]
  }

  merged.channelCount = merged.activeChannels
  merged.type = merged.mode
  merged.typeLabel = TUNNEL_TYPE_LABELS[merged.mode] || merged.mode || '-'
  merged.raw = { ...recordOrEmpty(current.raw), ...recordOrEmpty(next.raw) }
  return merged
}
