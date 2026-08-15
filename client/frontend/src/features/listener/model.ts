import { pickListener } from '../../shared/protocol/adapter'
import { LISTENER_FIELDS } from '../../shared/protocol/fieldMap'

export interface Listener {
  id: string
  name: string
  protocol: string
  bindAddr: string
  bindPort: number
  status: string
  listenerType: string
  config: string
  createdAt: string
  updatedAt: string
  raw: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasAny(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false
  return keys.some(key => value[key] !== undefined && value[key] !== null && value[key] !== '')
}

export function normalizeListener(value: unknown): Listener {
  const listener = pickListener(value)
  return {
    id: String(listener.id),
    name: String(listener.name),
    protocol: String(listener.protocol),
    bindAddr: String(listener.bindAddr),
    bindPort: Number(listener.bindPort) || 0,
    status: String(listener.status).toLowerCase(),
    listenerType: String(listener.listenerType).toLowerCase(),
    config: String(listener.config),
    createdAt: String(listener.createdAt),
    updatedAt: String(listener.updatedAt),
    raw: value,
  }
}

export function sameListener(left: Listener, right: Listener): boolean {
  return Boolean(
    (left.name && right.name && left.name === right.name) ||
    (left.id && right.id && left.id === right.id),
  )
}

export function mergeListener(current: Listener, next: Listener): Listener {
  const merged = { ...current, ...next }
  const mergedRecord = merged as unknown as Record<string, unknown>
  const currentRecord = current as unknown as Record<string, unknown>
  const nextRecord = next as unknown as Record<string, unknown>

  for (const [field, keys] of Object.entries(LISTENER_FIELDS)) {
    mergedRecord[field] = hasAny(next.raw, keys) ? nextRecord[field] : currentRecord[field]
  }
  merged.raw = {
    ...(isRecord(current.raw) ? current.raw : {}),
    ...(isRecord(next.raw) ? next.raw : {}),
  }
  return merged
}
