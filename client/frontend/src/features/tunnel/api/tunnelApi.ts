import {
  expectArray,
  expectBooleanField,
  expectNumberField,
  expectRecord,
  expectStringField,
} from '../../../shared/api/guards'
import { request } from '../../../shared/api/httpClient'
import { i18n } from '../../../i18n/index'
import type { ApiOperationResult } from '../../../shared/api/types'
import type {
  StartTunnelRequest,
  TunnelChannelListPageDto,
  TunnelChannelViewDto,
  TunnelListPageDto,
  TunnelRecycleResult,
  TunnelViewDto,
  UpdateTunnelRequest,
} from './types'

// ─── 边界解析: 显式逐字段构造, 不用整对象强转 ───
// 必填字段走 guards (缺失/类型错误立即抛错);
// 可选字段宽松提取 (缺失 → undefined), 下游 model 层会再统一归一化。

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === null || value === '') return undefined
  return String(value)
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return undefined
}

/**
 * 枚举字段提取: 取值必须落在契约集合内, 否则按 'unknown' 兜底
 * (而不是静默通过整对象强转)。
 */
function enumField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | 'unknown' {
  const value = optionalString(record, key)
  if (value === undefined) return 'unknown'
  return (allowed as readonly string[]).includes(value) ? value as T : 'unknown'
}

/**
 * 可选枚举字段提取: 缺失或未知 → undefined (字段本身可选, 不用 'unknown' 占位)。
 */
function optionalEnumField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = optionalString(record, key)
  if (value === undefined) return undefined
  return (allowed as readonly string[]).includes(value) ? value as T : undefined
}

const TUNNEL_MODES = ['socks5', 'port_forward', 'reverse_port_map', 'http_proxy', 'udp_proxy'] as const
const TUNNEL_STATUSES = ['running', 'paused', 'stopped', 'error'] as const
const CHANNEL_STATUSES = ['pending', 'active', 'timeout', 'closed', 'failed'] as const
const SOCKS_AUTH_MODES = ['no_auth', 'username_password'] as const

function parseTunnel(value: unknown): TunnelViewDto {
  const record = expectRecord(value, 'Tunnel')
  return {
    tunnel_id: expectStringField(record, 'tunnel_id', 'Tunnel'),
    beacon_id: optionalString(record, 'beacon_id') ?? '',
    mode: enumField(record, 'mode', TUNNEL_MODES),
    bind_host: optionalString(record, 'bind_host') ?? '',
    bind_port: optionalNumber(record, 'bind_port') ?? 0,
    remote_host: optionalString(record, 'remote_host'),
    remote_port: optionalNumber(record, 'remote_port'),
    socks_auth_mode: optionalEnumField(record, 'socks_auth_mode', SOCKS_AUTH_MODES),
    socks_udp_associate: optionalBoolean(record, 'socks_udp_associate'),
    status: enumField(record, 'status', TUNNEL_STATUSES),
    active_channels: optionalNumber(record, 'active_channels') ?? 0,
    bytes_in: optionalNumber(record, 'bytes_in') ?? 0,
    bytes_out: optionalNumber(record, 'bytes_out') ?? 0,
    created_at: optionalString(record, 'created_at') ?? '',
    updated_at: optionalString(record, 'updated_at') ?? '',
    error_message: optionalString(record, 'error_message'),
  }
}

function parseChannel(value: unknown): TunnelChannelViewDto {
  const record = expectRecord(value, 'Tunnel channel')
  return {
    channel_id: expectStringField(record, 'channel_id', 'Tunnel channel'),
    tunnel_id: optionalString(record, 'tunnel_id') ?? '',
    beacon_id: optionalString(record, 'beacon_id') ?? '',
    target_address: optionalString(record, 'target_address') ?? '',
    status: enumField(record, 'status', CHANNEL_STATUSES),
    bytes_in: optionalNumber(record, 'bytes_in') ?? 0,
    bytes_out: optionalNumber(record, 'bytes_out') ?? 0,
    reason: optionalString(record, 'reason'),
    created_at: optionalString(record, 'created_at') ?? '',
    updated_at: optionalString(record, 'updated_at') ?? '',
  }
}

function parsePage<T>(
  value: unknown,
  label: string,
  parseItem: (item: unknown) => T,
): { page: number; page_size: number; total: number; has_more: boolean; items: T[] } {
  const record = expectRecord(value, label)
  return {
    page: expectNumberField(record, 'page', label),
    page_size: expectNumberField(record, 'page_size', label),
    total: expectNumberField(record, 'total', label),
    has_more: expectBooleanField(record, 'has_more', label),
    items: expectArray(record.items, label).map(parseItem),
  }
}

export async function listTunnels(page = 1, pageSize = 20): Promise<TunnelListPageDto> {
  const path = `/api/v1/tunnels?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`
  return parsePage(await request<unknown>('GET', path), 'Tunnel list', parseTunnel)
}

export async function createTunnel(payload: StartTunnelRequest): Promise<TunnelViewDto> {
  if (!['socks5', 'port_forward', 'reverse_port_map'].includes(payload.mode)) {
    throw new Error(i18n.global.t('tunnelPage.undefinedCreateContract', { mode: String(payload.mode) }))
  }
  return parseTunnel(await request<unknown, StartTunnelRequest>('POST', '/api/v1/tunnels', payload))
}

export async function updateTunnel(tunnelId: string, payload: UpdateTunnelRequest): Promise<TunnelViewDto> {
  const path = `/api/v1/tunnels/${encodeURIComponent(tunnelId)}`
  return parseTunnel(await request<unknown, UpdateTunnelRequest>('PATCH', path, payload))
}

export async function listTunnelChannels(
  tunnelId: string,
  page = 1,
  pageSize = 20,
): Promise<TunnelChannelListPageDto> {
  const path = `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/channels?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`
  return parsePage(await request<unknown>('GET', path), 'Tunnel channel list', parseChannel)
}

export async function pauseTunnel(tunnelId: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult>('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/pause`)
}

export async function resumeTunnel(tunnelId: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult>('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/resume`)
}

export async function clearTunnel(tunnelId: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult>('DELETE', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}`)
}

export async function recycleTunnelChannels(
  tunnelId: string,
  _recycledCount = 0,
): Promise<TunnelRecycleResult> {
  const path = `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/channels/recycle`
  const record = expectRecord(await request<unknown>('POST', path), 'Tunnel recycle')
  return { recycled_count: expectNumberField(record, 'recycled_count', 'Tunnel recycle') }
}

export async function stopTunnel(tunnelId: string): Promise<ApiOperationResult> {
  return request<ApiOperationResult>('POST', `/api/v1/tunnels/${encodeURIComponent(tunnelId)}/stop`)
}
