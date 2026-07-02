/**
 * 命令结果格式化模块 - 将结构化数据渲染为可读文本表格
 *
 * 提供进程列表、网络接口和网络连接等命令结果的文本表格格式化，
 * 用于在控制台中以对齐的文本形式展示结构化数据。
 */

// ─── 进程列表格式化 ───

export const EMPTY_PROCESS_TABLE_TEXT = '未获取到进程数据。'
export const EMPTY_NETINFO_TEXT = '未获取到网络接口数据。'
export const EMPTY_NETSTAT_TEXT = '未获取到网络连接数据。'

function normalizeArch(value) {
  switch (Number(value)) {
    case 0: return 'x86'
    case 1: return 'x64'
    case 2: return 'arm64'
    default: return value ? String(value) : 'unk'
  }
}

function normalizeProcessInfo(process) {
  if (!process || typeof process !== 'object') return null

  const pid = process.pid
  const name = process.name

  if (pid === undefined && !name) return null

  return {
    pid: String(pid ?? ''),
    ppid: String(process.ppid ?? '-'),
    arch: String(process.arch_name ?? '') || normalizeArch(process.arch),
    session: String(process.session_id ?? '-'),
    user: String(process.user ?? '-'),
    name: String(name ?? 'Unknown'),
    path: String(process.path ?? '-'),
  }
}

function normalizeProcessList(payload) {
  if (!Array.isArray(payload)) return []
  return payload.map(normalizeProcessInfo).filter(Boolean)
}

function comparePid(a, b) {
  const left = Number(a.pid)
  const right = Number(b.pid)
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right
  return String(a.pid).localeCompare(String(b.pid))
}

/**
 * 将进程列表格式化为文本表格
 * @param {Array} processes - 进程对象数组
 * @returns {string} 格式化后的文本表格
 */
export function formatProcessTable(processes) {
  const data = normalizeProcessList(processes).sort(comparePid)
  if (data.length === 0) return EMPTY_PROCESS_TABLE_TEXT

  const columns = [
    { key: 'pid', header: 'PID', align: 'right' },
    { key: 'ppid', header: 'PPID', align: 'right' },
    { key: 'arch', header: 'Arch' },
    { key: 'session', header: 'Session', align: 'right' },
    { key: 'user', header: 'User' },
    { key: 'name', header: 'Name' },
    { key: 'path', header: 'Path' },
  ]

  const widths = Object.fromEntries(columns.map(column => [
    column.key,
    Math.max(column.header.length, ...data.map(row => String(row[column.key] ?? '').length)),
  ]))

  const formatCell = (value, column, isLast = false) => {
    const text = String(value ?? '-')
    const padded = column.align === 'right'
      ? text.padStart(widths[column.key])
      : text.padEnd(widths[column.key])
    return isLast ? padded : `${padded}  `
  }

  const formatRow = (row, useHeader = false) => columns.map((column, index) => {
    const value = useHeader ? column.header : row[column.key]
    return formatCell(value, { ...column, align: useHeader ? 'left' : column.align }, index === columns.length - 1)
  }).join('')

  const headerRow = formatRow({}, true)
  const separator = columns.map((column, index) => {
    const text = '-'.repeat(widths[column.key])
    return index === columns.length - 1 ? text : `${text}  `
  }).join('')
  const bodyRows = data.map(row => formatRow(row))

  return [headerRow, separator, ...bodyRows, '', `总进程数: ${data.length}`].join('\n')
}

// ─── 网络信息格式化 ───

function formatBoolean(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const text = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) return 'yes'
  if (['false', '0', 'no', 'n', 'off'].includes(text)) return 'no'
  return '-'
}

function joinList(value) {
  if (Array.isArray(value)) return value.join(', ')
  const text = String(value ?? '').trim()
  return text || '-'
}

function normalizeInterfaceList(payload) {
  return Array.isArray(payload?.interfaces) ? payload.interfaces : []
}

/**
 * 将网络接口列表格式化为文本
 * @param {Array} interfaces - 网络接口对象数组
 * @returns {string} 格式化后的文本
 */
export function formatNetInfo(interfaces) {
  const list = normalizeInterfaceList(interfaces)
  if (list.length === 0) return EMPTY_NETINFO_TEXT

  const sorted = [...list].sort((a, b) => Number(a?.index ?? a?.Index ?? 0) - Number(b?.index ?? b?.Index ?? 0))
  const lines = [`网络接口数: ${sorted.length}`]

  for (const iface of sorted) {
    const index = iface?.index ?? '-'
    const name = iface?.name || 'Unknown'
    const mtu = iface?.mtu ?? '-'
    const flags = joinList(iface?.flags)
    const mac = iface?.hardware_addr || '-'
    const addrs = joinList(iface?.addrs)
    const up = formatBoolean(iface?.is_up)
    const loopback = formatBoolean(iface?.is_loopback)
    const multicast = formatBoolean(iface?.is_multicast)

    lines.push(
      '',
      `[${index}] ${name}`,
      `  MTU: ${mtu}`,
      `  Flags: ${flags}`,
      `  MAC: ${mac}`,
      `  Addrs: ${addrs}`,
      `  State: up=${up} / loopback=${loopback} / multicast=${multicast}`,
    )
  }

  return lines.join('\n')
}

function normalizeConnectionList(payload) {
  return Array.isArray(payload?.connections) ? payload.connections : []
}

/**
 * 将网络连接列表格式化为文本表格
 * @param {Array} connections - 网络连接对象数组
 * @returns {string} 格式化后的文本表格
 */
export function formatNetstatTable(connections) {
  const list = normalizeConnectionList(connections)
  if (list.length === 0) return EMPTY_NETSTAT_TEXT

  const headers = ['PROTO', 'LOCAL', 'REMOTE', 'STATE', 'PID']
  const data = list.map(conn => ({
    proto: String(conn?.protocol || 'unk').toUpperCase(),
    local: `${conn?.local_address || '-'}:${conn?.local_port ?? '-'}`,
    remote: `${conn?.remote_address || '-'}:${conn?.remote_port ?? '-'}`,
    state: String(conn?.state || '-'),
    pid: String(conn?.pid ?? '-'),
  }))
    .sort((a, b) => {
      const protoCmp = a.proto.localeCompare(b.proto)
      if (protoCmp !== 0) return protoCmp
      const localCmp = a.local.localeCompare(b.local)
      if (localCmp !== 0) return localCmp
      return a.remote.localeCompare(b.remote)
    })

  const colWidths = {}
  headers.forEach(h => {
    colWidths[h.toLowerCase()] = Math.max(h.length, ...data.map(row => String(row[h.toLowerCase()]).length))
  })

  const pad = (str, width) => String(str).padEnd(width + 2)
  const headerRow = headers.map(h => pad(h, colWidths[h.toLowerCase()])).join('')
  const separator = headers.map(h => pad('-'.repeat(h.length), colWidths[h.toLowerCase()])).join('')
  const bodyRows = data.map(row => headers.map(h => pad(row[h.toLowerCase()], colWidths[h.toLowerCase()])).join(''))

  return [headerRow, separator, ...bodyRows, '', `总连接数: ${data.length}`].join('\n')
}
