/**
 * Tunnel 工具函数
 * 提供 Tunnel 断开原因的中文映射与格式化。
 */

// ─── 原因码映射表 ───

const TUNNEL_REASON_LABELS = {
  error_1: '未知错误',
  error_3: 'Beacon 侧网络不可达',
  error_4: 'Beacon 连接目标超时',
  error_5: 'Beacon 侧目标端口拒绝连接',
  error_6: 'Beacon 侧 DNS 解析失败',
  error_7: 'Beacon 侧网关失败',
  error_8: 'Beacon 侧连接被取消',
  error_9: 'Beacon 隧道队列已满',
  error_10: 'Beacon 不支持的协议',
  error_11: 'Beacon 侧通道重复',
  error_12: 'Beacon 侧远端连接已关闭',
  error_13: 'Beacon 侧连接被重置',
  error_14: 'Beacon 侧写入失败',
  error_15: 'Beacon 侧连接被中止',
  'local connection closed': '本地连接已关闭',
  'remote connection closed': '远端连接已关闭',
  'tunnel paused': 'Tunnel 已暂停',
  'tunnel cleared': 'Tunnel 已清除',
  'beacon tunnel connect timeout': 'Beacon 连接目标超时',
  'connection timeout': 'Beacon 连接目标超时',
  'connection refused': 'Beacon 侧目标端口拒绝连接',
  'network unreachable': 'Beacon 侧网络不可达',
  'dns failed': 'Beacon 侧 DNS 解析失败',
  'gateway failed': 'Beacon 侧网关失败',
  'connection reset': 'Beacon 侧连接被重置',
  'write failed': 'Beacon 侧写入失败',
  'connection aborted': 'Beacon 侧连接被中止',
  'unsupported protocol': 'Beacon 不支持的协议',
  'unsupported proto': 'Beacon 不支持的协议',
  'duplicate channel': 'Beacon 侧通道重复',
}

// ─── 格式化 ───

/**
 * 将 Tunnel 断开原因码/文本转换为中文描述
 * @param {string|number} reason - 原因码（如 'error_3'、3、'connection refused'）
 * @returns {string} 中文描述或原始文本
 */
export function formatTunnelReason(reason) {
  if (reason === undefined || reason === null) return ''

  const raw = String(reason).trim()
  if (!raw) return ''

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ')
  if (TUNNEL_REASON_LABELS[normalized]) {
    return TUNNEL_REASON_LABELS[normalized]
  }

  const numericMatch = normalized.match(/^(\d+)$/)
  if (numericMatch) {
    const codeKey = `error_${numericMatch[1]}`
    return TUNNEL_REASON_LABELS[codeKey] || raw
  }

  return raw
}
