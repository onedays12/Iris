/**
 * 命令结果格式化模块 - 将结构化数据渲染为可读文本表格
 *
 * 提供进程列表、网络接口和网络连接等命令结果的文本表格格式化，
 * 用于在控制台中以对齐的文本形式展示结构化数据。
 */

// ─── 进程列表格式化 ───

/**
 * 将进程列表格式化为文本表格
 * @param {Array} processes - 进程对象数组
 * @returns {string} 格式化后的文本表格
 */
export function formatProcessTable(processes) {
  if (!Array.isArray(processes) || processes.length === 0) return '未获取到进程数据。'

  const headers = ['PID', 'PPID', 'Arch', 'Session', 'User', 'Name']
  const data = processes.map(p => ({
    pid: String(p.pid || 0),
    ppid: String(p.ppid || 0),
    arch: p.arch_name || (p.arch === 2 ? 'arm64' : p.arch === 1 ? 'x64' : p.arch === 0 ? 'x86' : 'unk'),
    session: String(p.session_id ?? '-'),
    user: p.user || 'Unknown',
    name: p.name || 'Unknown',
  })).sort((a, b) => parseInt(a.pid) - parseInt(b.pid))

  const colWidths = {}
  headers.forEach(h => {
    colWidths[h.toLowerCase()] = Math.max(h.length, ...data.map(row => String(row[h.toLowerCase()]).length))
  })

  const pad = (str, width) => String(str).padEnd(width + 2)
  const headerRow = headers.map(h => pad(h, colWidths[h.toLowerCase()])).join('')
  const separator = headers.map(h => pad('-'.repeat(h.length), colWidths[h.toLowerCase()])).join('')
  const bodyRows = data.map(row =>
    headers.map(h => pad(row[h.toLowerCase()], colWidths[h.toLowerCase()])).join('')
  )

  return [headerRow, separator, ...bodyRows, '', `总进程数: ${data.length}`].join('\n')
}

// ─── 网络信息格式化 ───

/**
 * 将网络接口列表格式化为文本
 * @param {Array} interfaces - 网络接口对象数组
 * @returns {string} 格式化后的文本
 */
export function formatNetInfo(interfaces) {
  if (!Array.isArray(interfaces) || interfaces.length === 0) return '未获取到网络接口数据。'

  const sorted = [...interfaces].sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
  const lines = [`网络接口数: ${sorted.length}`]

  for (const iface of sorted) {
    const index = iface?.index ?? '-'
    const name = iface?.name || 'Unknown'
    const mtu = iface?.mtu ?? '-'
    const flags = Array.isArray(iface?.flags) ? iface.flags.join(', ') : String(iface?.flags || '-')
    const mac = iface?.hardware_addr || iface?.hardwareAddr || '-'
    const addrs = Array.isArray(iface?.addrs) ? iface.addrs.join(', ') : String(iface?.addrs || '-')
    const up = iface?.is_up === undefined ? '-' : (iface.is_up ? 'yes' : 'no')
    const loopback = iface?.is_loopback === undefined ? '-' : (iface.is_loopback ? 'yes' : 'no')
    const multicast = iface?.is_multicast === undefined ? '-' : (iface.is_multicast ? 'yes' : 'no')

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

/**
 * 将网络连接列表格式化为文本表格
 * @param {Array} connections - 网络连接对象数组
 * @returns {string} 格式化后的文本表格
 */
export function formatNetstatTable(connections) {
  if (!Array.isArray(connections) || connections.length === 0) return '未获取到网络连接数据。'

  const headers = ['PROTO', 'LOCAL', 'REMOTE', 'STATE', 'PID']
  const data = connections.map(conn => ({
    proto: String(conn?.protocol || conn?.proto || 'unk'),
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
