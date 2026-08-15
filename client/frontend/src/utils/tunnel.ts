/**
 * Tunnel 工具函数
 * 提供 Tunnel 断开原因码 → i18n key 的映射与规范化。
 */

// ─── 原因码 → 翻译 key 映射 ───
const TUNNEL_REASON_KEYS: Record<string, string> = {
  error_1: 'tunnelReason.error1',
  error_3: 'tunnelReason.error3',
  error_4: 'tunnelReason.error4',
  error_5: 'tunnelReason.error5',
  error_6: 'tunnelReason.error6',
  error_7: 'tunnelReason.error7',
  error_8: 'tunnelReason.error8',
  error_9: 'tunnelReason.error9',
  error_10: 'tunnelReason.error10',
  error_11: 'tunnelReason.error11',
  error_12: 'tunnelReason.error12',
  error_13: 'tunnelReason.error13',
  error_14: 'tunnelReason.error14',
  error_15: 'tunnelReason.error15',
  'local connection closed': 'tunnelReason.localConnectionClosed',
  'remote connection closed': 'tunnelReason.remoteConnectionClosed',
  'tunnel paused': 'tunnelReason.tunnelPaused',
  'tunnel cleared': 'tunnelReason.tunnelCleared',
  'beacon tunnel connect timeout': 'tunnelReason.connectionTimeout',
  'connection timeout': 'tunnelReason.connectionTimeout',
  'connection refused': 'tunnelReason.connectionRefused',
  'network unreachable': 'tunnelReason.networkUnreachable',
  'dns failed': 'tunnelReason.dnsFailed',
  'gateway failed': 'tunnelReason.gatewayFailed',
  'connection reset': 'tunnelReason.connectionReset',
  'write failed': 'tunnelReason.writeFailed',
  'connection aborted': 'tunnelReason.connectionAborted',
  'unsupported protocol': 'tunnelReason.unsupportedProtocol',
  'unsupported proto': 'tunnelReason.unsupportedProtocol',
  'duplicate channel': 'tunnelReason.duplicateChannel',
}

// ─── 格式化 ───

/**
 * 将 Tunnel 断开原因码/文本规范化后,返回其 i18n key(未命中返回 null)
 * @param reason - 原因码（如 'error_3'、3、'connection refused'）
 * @returns i18n key 或 null
 */
export function formatTunnelReasonKey(reason: unknown): string | null {
  const raw = String(reason ?? '').trim()
  if (!raw) return null

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ')
  if (TUNNEL_REASON_KEYS[normalized]) {
    return TUNNEL_REASON_KEYS[normalized]
  }

  const numericMatch = normalized.match(/^(\d+)$/)
  if (numericMatch) {
    return TUNNEL_REASON_KEYS[`error_${numericMatch[1]}`] || null
  }

  return null
}
