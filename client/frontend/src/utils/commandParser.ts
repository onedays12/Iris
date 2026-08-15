/**
 * 命令行解析工具
 *
 * 从 ConsolePanel 拆出。纯函数,无 Vue 响应式或 store 依赖。
 */

import { getCommandId, type CommandId } from '../constants/commands'

export interface ParsedCommandLine {
  cmdName: string
  cmdId: CommandId | null
  args: string[]
}

/**
 * 核心解析逻辑：支持引号包裹的路径解析 (Shell-like)
 */
export function parseCommandLine(input: string): ParsedCommandLine | null {
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
  const parts = []
  let match

  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      parts.push(match[1])
    } else if (match[2] !== undefined) {
      parts.push(match[2])
    } else {
      parts.push(match[0])
    }
  }

  if (parts.length === 0) return null

  const cmdName = parts[0]
  const args = parts.slice(1)
  const cmdId = getCommandId(cmdName)

  return { cmdName, cmdId, args }
}

/**
 * 获取命令名之后的原始字符串(保留引号/空格)
 */
export function getRawCommandAfterName(input: string, cmdName: string): string {
  return String(input || '')
    .slice(String(cmdName || '').length)
    .replace(/^\s+/, '')
}
