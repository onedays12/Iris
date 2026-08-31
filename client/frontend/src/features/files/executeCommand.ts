/**
 * 文件浏览器「执行」：把选中文件拼成现有 SHELL 命令。
 * Windows 走 cmd.exe /c（beacon 已加前缀），Linux 走 POSIX sh。
 */

export function quoteWindowsCmdPath(path: string): string {
  return `"${String(path).replace(/"/g, '""')}"`
}

export function quoteUnixShellPath(path: string): string {
  return `'${String(path).replace(/'/g, `'\\''`)}'`
}

export function parentDirectory(path: string, isWindows: boolean): string {
  const raw = String(path || '').replace(/[/\\]+$/, '')
  if (!raw) return ''
  if (isWindows) {
    const n = raw.replace(/\//g, '\\')
    const idx = n.lastIndexOf('\\')
    if (idx < 0) return ''
    if (/^[a-zA-Z]:\\/.test(n) && idx === 2) return n.slice(0, 3)
    return n.slice(0, idx)
  }
  const idx = raw.lastIndexOf('/')
  if (idx <= 0) return '/'
  return raw.slice(0, idx)
}

export function resolveExecuteCwd(currentPath: string, filePath: string, isWindows: boolean): string {
  const cwd = String(currentPath || '').trim()
  if (cwd) return cwd
  return parentDirectory(filePath, isWindows)
}

export function buildExecuteShellCommand(opts: {
  isWindows: boolean
  cwd: string
  filePath: string
  args: string
}): string {
  const filePath = String(opts.filePath || '').trim()
  const cwd = String(opts.cwd || '').trim()
  const extra = String(opts.args || '').trim()
  const file = opts.isWindows ? quoteWindowsCmdPath(filePath) : quoteUnixShellPath(filePath)
  const body = extra ? `${file} ${extra}` : file
  if (!cwd) return body
  if (opts.isWindows) {
    // start "" 让 cmd 把第一个引号参数当窗口标题，真正的文件路径才能带空格/括号。
    return `cd /d ${quoteWindowsCmdPath(cwd)} && start "" ${body}`
  }
  return `cd ${quoteUnixShellPath(cwd)} && ${body}`
}

export function isShellJobAck(text: string): boolean {
  return /^Job\s+\d+\s+started:/i.test(String(text || '').trim())
}

export interface ExecuteHistoryEntry {
  type: string
  content: string
}

/** 从 sendCommand 之前的 history 下标起，挑出真正的 SHELL 输出（跳过 Job started ACK）。 */
export function pickExecuteOutputFrom(
  entries: ExecuteHistoryEntry[],
  startIndex: number,
): { text: string; ready: boolean } {
  const slice = entries.slice(Math.max(0, startIndex)).filter((e) => e.type !== 'input')
  const finals = slice.filter((e) => !isShellJobAck(e.content))
  if (finals.length) {
    return { text: finals.map((e) => e.content).join('\n'), ready: true }
  }
  if (slice.length) {
    return { text: slice.map((e) => e.content).join('\n'), ready: false }
  }
  return { text: '', ready: false }
}

export const EXECUTE_WAIT_MS = 30_000
export const EXECUTE_POLL_MS = 250
