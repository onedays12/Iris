/**
 * Tunnel 格式化与判定纯函数
 *
 * 从 ProxyPivotPage 拆出,供主页面与 TunnelDetailDialog 等子组件复用。
 * 全部为无状态纯函数,不依赖 Vue 响应式或 store。
 */

export interface TunnelFormatView {
  bindHost?: unknown
  bindPort?: unknown
  remoteHost?: unknown
  remotePort?: unknown
  mode?: unknown
  type?: unknown
  status?: unknown
}

export function shortId(value: unknown): string {
  if (!value) return '-'
  return String(value).substring(0, 8)
}

export function formatTime(value: unknown, locale?: string): string {
  if (!value) return '-'
  const numeric = Number(value)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(String(value))
  return date.toLocaleString(locale || 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatBind(tunnel: TunnelFormatView): string {
  return `${tunnel.bindHost || '127.0.0.1'}:${tunnel.bindPort || '-'}`
}

export function formatTarget(tunnel: TunnelFormatView): string {
  if (requiresRemoteTarget(tunnel.mode || tunnel.type)) {
    if (!tunnel.remoteHost && !tunnel.remotePort) return '-'
    return `${tunnel.remoteHost || '-'}:${tunnel.remotePort || '-'}`
  }
  return '-'
}

export function formatTunnelType(type: unknown): string {
  const normalized = String(type || '').toLowerCase()
  if (normalized === 'socks5') return 'SOCKS5'
  if (normalized === 'port_forward') return 'PORT FWD'
  if (normalized === 'reverse_port_map') return 'REVERSE MAP'
  if (normalized === 'http_proxy') return 'HTTP PROXY'
  if (normalized === 'udp_proxy') return 'UDP PROXY'
  return normalized || '-'
}

export function statusClass(status: unknown): string {
  const value = String(status || '').toLowerCase()
  if (['running', 'listening', 'active', 'online'].includes(value)) return 'online'
  if (['paused', 'pause', 'pending', 'timeout', 'closed', 'stopped'].includes(value)) return 'warn'
  if (['error', 'failed'].includes(value)) return 'danger'
  return 'active'
}

// 状态文本 key (供组件通过 t() 渲染)
const STATUS_LABEL_KEYS: Record<string, string> = {
  running: 'tunnelFormat.statusRunning',
  listening: 'tunnelFormat.statusRunning',
  active: 'tunnelFormat.statusRunning',
  online: 'tunnelFormat.statusRunning',
  pending: 'tunnelFormat.statusPending',
  timeout: 'tunnelFormat.statusTimeout',
  paused: 'tunnelFormat.statusPaused',
  pause: 'tunnelFormat.statusPaused',
  closed: 'tunnelFormat.statusClosed',
  stopped: 'tunnelFormat.statusStopped',
  error: 'tunnelFormat.statusError',
  failed: 'tunnelFormat.statusError',
}

export function statusLabelKey(status: unknown): string | null {
  const value = String(status || '').toLowerCase()
  return STATUS_LABEL_KEYS[value] || null
}

export function statusLabel(status: unknown): string {
  const value = String(status || '').toLowerCase()
  if (['running', 'listening', 'active', 'online'].includes(value)) return '运行中'
  if (value === 'pending') return '待处理'
  if (value === 'timeout') return '已超时'
  if (['paused', 'pause'].includes(value)) return '已暂停'
  if (value === 'closed') return '已关闭'
  if (value === 'stopped') return '已停止'
  if (value === 'error' || value === 'failed') return '异常'
  return value || '-'
}

export function isRunningTunnel(tunnel: TunnelFormatView | null | undefined): boolean {
  const value = String(tunnel?.status || '').toLowerCase()
  return ['running', 'listening', 'active', 'online'].includes(value)
}

export function isPausedTunnel(tunnel: TunnelFormatView | null | undefined): boolean {
  const value = String(tunnel?.status || '').toLowerCase()
  return ['paused', 'pause'].includes(value)
}

export function requiresRemoteTarget(mode: unknown): boolean {
  const normalized = String(mode || '').toLowerCase()
  return ['port_forward', 'reverse_port_map'].includes(normalized)
}

export interface ModeDefaults {
  bindHost: string
  bindPort: number
  remoteHost: string
  remotePort: number
  socksAuthMode: string
  socksUsername: string
  socksPassword: string
  socksUdpAssociate: boolean
}

export function getModeDefaults(mode: unknown): ModeDefaults {
  const normalized = String(mode || '').toLowerCase()
  if (normalized === 'port_forward') {
    return { bindHost: '0.0.0.0', bindPort: 8888, remoteHost: '127.0.0.1', remotePort: 3389, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  if (normalized === 'reverse_port_map') {
    return { bindHost: '0.0.0.0', bindPort: 13389, remoteHost: '127.0.0.1', remotePort: 3389, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  if (normalized === 'http_proxy') {
    return { bindHost: '127.0.0.1', bindPort: 8080, remoteHost: '', remotePort: 0, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  if (normalized === 'udp_proxy') {
    return { bindHost: '127.0.0.1', bindPort: 1080, remoteHost: '', remotePort: 0, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
  }
  return { bindHost: '127.0.0.1', bindPort: 1080, remoteHost: '', remotePort: 0, socksAuthMode: 'no_auth', socksUsername: '', socksPassword: '', socksUdpAssociate: false }
}

export function formatBytes(bytes: unknown): string {
  const value = Number(bytes || 0)
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

export function formatCount(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '-'
  return String(Math.max(0, Math.trunc(numeric)))
}

export function displayCount(...values: unknown[]): string {
  for (const value of values) {
    const formatted = formatCount(value)
    if (formatted !== '-') return formatted
  }
  return '-'
}

export function formatLatency(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '-'
  return `${numeric} ms`
}

// 常量(供主组件与子组件复用)
export interface TunnelModeOption {
  value: string
  label: string
  labelKey?: string
  descriptionKey: string
}

export interface SocksAuthModeOption {
  value: string
  label: string
  labelKey: string
  descriptionKey: string
}

export const TUNNEL_MODES: TunnelModeOption[] = [
  { value: 'socks5', label: 'SOCKS5', descriptionKey: 'tunnelFormat.modeSocks5Desc' },
  { value: 'port_forward', label: '端口转发', labelKey: 'tunnelFormat.modePortForward', descriptionKey: 'tunnelFormat.modePortForwardDesc' },
  { value: 'reverse_port_map', label: '反向端口映射', labelKey: 'tunnelFormat.modeReverseMap', descriptionKey: 'tunnelFormat.modeReverseMapDesc' },
]

export const SOCKS_AUTH_MODES: SocksAuthModeOption[] = [
  { value: 'no_auth', label: '无需认证', labelKey: 'tunnelFormat.authNoAuth', descriptionKey: 'tunnelFormat.authNoAuthDesc' },
  { value: 'username_password', label: '用户名 / 密码', labelKey: 'tunnelFormat.authUserPass', descriptionKey: 'tunnelFormat.authUserPassDesc' },
]
