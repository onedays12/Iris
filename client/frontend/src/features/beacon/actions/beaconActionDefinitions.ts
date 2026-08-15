/**
 * Beacon Action 定义模块 - 右键菜单动作常量与菜单构建
 *
 * 定义所有 Beacon 交互动作类型，并根据目标平台和已加载插件
 * 动态构建右键菜单项列表。
 */

// ─── 导入 ───

import {
  PLUGIN_COMMAND_ID,
  isMenuActionSupportedForOS,
  normalizeBeaconArch,
  normalizeBeaconPlatform,
} from '../../../constants/commands'
import { i18n } from '../../../i18n'
import { localizedText } from '../../plugin/model'

// ─── 动作类型常量 ───

/**
 * Beacon 交互动作枚举
 * @readonly
 */
export const BEACON_ACTION = Object.freeze({
  CONSOLE: 'console',
  FILES: 'files',
  PROCESSES: 'processes',
  NETWORK: 'network',
  PLUGIN: 'plugin-action',
  EXEC_BOF: 'exec-bof',
  CASCADE_CONNECT_TCP: 'cascade-connect-tcp',
  CASCADE_LINK_SMB: 'cascade-link-smb',
  EDIT_SLEEP: 'edit-sleep',
  EXIT: 'exit',
  DELETE_SESSION: 'delete-session',
})

// ─── 菜单项类型 ───

export interface BeaconMenuPluginAction {
  id: string
  kind: string
  label: string
  description: string
  os: string[]
  arch: string[]
  artifact: string
  artifactByArch: Record<string, string>
  artifactData: string
  commandId: number
  requiresInput: boolean
  fields: unknown[]
  postex: unknown
}

export interface BeaconMenuItem {
  type?: string
  labelKey?: string
  label?: string
  icon?: string
  action?: string
  danger?: boolean
  disabled?: boolean
  disabledReason?: string
  disabledReasonKey?: string
  pluginId?: string
  pluginName?: string
  pluginAction?: BeaconMenuPluginAction
  children?: BeaconMenuItem[]
}

// ─── 平台归一化工具 ───

/**
 * 将操作系统列表归一化为标准平台标识
 * @param values - 原始平台值数组
 * @returns 归一化后的平台标识数组
 */
export function normalizeTargetOSList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map(item => normalizeBeaconPlatform(item))
    .filter(item => item && item !== 'unknown')
}

/**
 * 将架构列表归一化为标准架构标识
 * @param values - 原始架构值数组
 * @returns 归一化后的架构标识数组
 */
export function normalizeTargetArchList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map(item => normalizeBeaconArch(item))
    .filter(item => item && item !== 'unknown')
}

/**
 * 归一化按架构分发的工件映射表
 * @param value - 原始 {arch: artifact} 映射
 * @returns 归一化后的映射
 */
export function normalizeArtifactByArchMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizeBeaconArch(key), String(item || '').trim()])
      .filter(([key, item]) => key && key !== 'unknown' && item)
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * 根据目标架构解析插件动作的工件路径
 * @param action - 插件动作定义
 * @param beaconArch - 目标 Beacon 架构
 * @returns 解析后的工件路径
 */
export function resolveActionArtifact(action: unknown, beaconArch: unknown): string {
  const kind = normalizePluginActionKind(action)
  const record = asRecord(action)
  const postex = normalizePostExConfig(record?.postex)
  const artifactByArch = kind === 'postex'
    ? normalizeArtifactByArchMap(postex?.dllByArch ?? {})
    : normalizeArtifactByArchMap(record?.artifactByArch ?? {})
  const arch = normalizeBeaconArch(beaconArch)
  return artifactByArch[arch] || String(kind === 'postex' ? postex?.dll || '' : record?.artifact || '').trim()
}

function normalizePluginActionKind(action: unknown): string {
  const record = asRecord(action)
  const postex = record?.postex
  return String(record?.kind ?? (postex ? 'postex' : 'bof')).trim().toLowerCase() || 'bof'
}

export interface BeaconPostExConfig {
  mode: string
  dll: string
  dllByArch: Record<string, string>
  waitMs: number
  maxRuntimeMs: number
  idleTimeoutMs: number
  description: string
  moduleArgs: string
  spawnPath: string
  spawnPathByArch: Record<string, string>
  spawnArgs: string
  backend: string
}

function normalizePostExConfig(postex: unknown): BeaconPostExConfig | null {
  const record = asRecord(postex)
  if (!record) return null
  return {
    mode: String(record.mode ?? '').trim().toLowerCase().replace(/_/g, '-'),
    dll: String(record.dll ?? '').trim(),
    dllByArch: normalizeArtifactByArchMap(record.dllByArch ?? {}),
    waitMs: Number(record.waitMs ?? 0) || 0,
    maxRuntimeMs: Number(record.maxRuntimeMs ?? 0) || 0,
    idleTimeoutMs: Number(record.idleTimeoutMs ?? 0) || 0,
    description: String(record.description ?? '').trim(),
    moduleArgs: String(record.moduleArgs ?? '').trim(),
    spawnPath: String(record.spawnPath ?? '').trim(),
    spawnPathByArch: normalizeArtifactByArchMap(record.spawnPathByArch ?? {}),
    spawnArgs: String(record.spawnArgs ?? '').trim(),
    backend: String(record.backend ?? '').trim(),
  }
}

/**
 * 判断插件动作是否支持指定的目标平台和架构
 * @param action - 插件动作定义
 * @param commandId - 命令 ID
 * @param targetOs - 目标操作系统
 * @param targetArch - 目标架构
 */
export function isPluginActionTargetSupported(action: unknown, commandId: number, targetOs: unknown, targetArch: unknown): boolean {
  if (!isMenuActionSupportedForOS(BEACON_ACTION.PLUGIN, targetOs, commandId)) return false

  const record = asRecord(action)
  const kind = normalizePluginActionKind(action)
  const beaconOS = normalizeBeaconPlatform(targetOs)
  const beaconArch = normalizeBeaconArch(targetArch)
  const supportedOS = normalizeTargetOSList(record?.os)
  const supportedArch = normalizeTargetArchList(record?.arch)

  if (kind === 'postex' && beaconOS !== 'windows') return false
  if (supportedOS.length && !supportedOS.includes(beaconOS)) return false
  if (supportedArch.length && !supportedArch.includes(beaconArch)) return false

  const postex = normalizePostExConfig(record?.postex)
  const artifactByArch = kind === 'postex'
    ? normalizeArtifactByArchMap(postex?.dllByArch ?? {})
    : normalizeArtifactByArchMap(record?.artifactByArch ?? {})
  const fallbackArtifact = kind === 'postex' ? postex?.dll : record?.artifact
  if (kind === 'postex' && !Object.keys(artifactByArch).length && !String(fallbackArtifact || '').trim()) {
    return false
  }
  if (Object.keys(artifactByArch).length && !artifactByArch[beaconArch] && !String(fallbackArtifact || '').trim()) {
    return false
  }

  return true
}

// ─── 菜单构建内部函数 ───

/**
 * 根据目标 Agent 和已加载插件构建插件菜单分组
 * @param targetAgent - 目标 Beacon 信息
 * @param plugins - 已加载的插件列表
 * @returns 菜单分组数组
 */
function buildPluginMenuGroups(targetAgent: unknown, plugins: unknown[]): BeaconMenuItem[] {
  const targetRecord = asRecord(targetAgent)
  const targetOs = String(targetRecord?.os ?? '')
  const targetArch = String(targetRecord?.arch ?? '')

  return plugins
    .map((plugin): BeaconMenuItem | null => {
      const pluginRecord = asRecord(plugin)
      if (!pluginRecord) return null
      const actionValues = pluginRecord.actions
      const actions = Array.isArray(actionValues) ? actionValues : []
      const children = actions
        .map((action): BeaconMenuItem | null => {
          const actionRecord = asRecord(action)
          if (!actionRecord) return null
          const actionId = String(actionRecord.id ?? '').trim()
          // schema v2 本地化文案: label 可为 string 或 {zh, en}
          const label = localizedText(actionRecord.label, i18n.global.locale.value) || actionId
          if (!actionId || !label) return null

          const kind = normalizePluginActionKind(actionRecord)
          const postex = normalizePostExConfig(actionRecord.postex)
          const artifactByArch = kind === 'postex'
            ? normalizeArtifactByArchMap(postex?.dllByArch ?? {})
            : normalizeArtifactByArchMap(actionRecord.artifactByArch ?? {})
          const resolvedArtifact = resolveActionArtifact(actionRecord, targetArch)

          return {
            type: BEACON_ACTION.PLUGIN,
            action: BEACON_ACTION.PLUGIN,
            label,
            icon: '•',
            pluginId: String(pluginRecord.id ?? ''),
            pluginName: localizedText(pluginRecord.displayName, i18n.global.locale.value) || String(pluginRecord.name ?? pluginRecord.id ?? ''),
            pluginAction: {
              id: actionId,
              kind,
              label,
              description: localizedText(actionRecord.description, i18n.global.locale.value),
              os: normalizeTargetOSList(actionRecord.os),
              arch: normalizeTargetArchList(actionRecord.arch),
              artifact: resolvedArtifact,
              artifactByArch,
              artifactData: String(actionRecord.artifactData ?? ''),
              commandId: Number(actionRecord.commandId ?? 0) || 0,
              requiresInput: Boolean(actionRecord.requiresInput ?? (Array.isArray(actionRecord.fields) && actionRecord.fields.length)),
              fields: Array.isArray(actionRecord.fields) ? actionRecord.fields : [],
              postex,
            },
          }
        })
        .filter((item): item is BeaconMenuItem => Boolean(item))
        .filter((item) => {
          const kind = item?.pluginAction?.kind || 'bof'
          const defaultCommandId = kind === 'postex' ? PLUGIN_COMMAND_ID.POSTEX : PLUGIN_COMMAND_ID.EXECUTION_BOF
          const commandId = Number(item?.pluginAction?.commandId || 0) || defaultCommandId
          return isPluginActionTargetSupported(item?.pluginAction, commandId, targetOs, targetArch)
        })

      if (!children.length) return null

      return {
        type: 'group',
        label: localizedText(pluginRecord.displayName, i18n.global.locale.value) || String(pluginRecord.name ?? pluginRecord.id ?? ''),
        icon: '🧩',
        children,
      }
    })
    .filter((item): item is BeaconMenuItem => Boolean(item))
}

/**
 * 将菜单项列表全部标记为禁用状态
 * @param items - 菜单项数组
 * @param reason - 禁用原因
 * @returns 禁用后的菜单项数组
 */
function disableBeaconItems(items: BeaconMenuItem[], reason: string, reasonKey = ''): BeaconMenuItem[] {
  return items.map((item) => {
    if (item.type === 'divider') return item
    if (item.type === 'group') {
      return {
        ...item,
        children: (item.children ?? []).map(child => ({ ...child, disabled: true, disabledReason: reason, disabledReasonKey: reasonKey })),
      }
    }
    return { ...item, disabled: true, disabledReason: reason, disabledReasonKey: reasonKey }
  })
}

// ─── 菜单构建入口 ───

/**
 * 构建 Beacon 右键菜单项列表
 * @param targetAgent - 目标 Beacon 信息，为空时全部禁用
 * @param plugins - 已加载的插件列表
 * @returns 菜单项数组
 */
export function buildBeaconMenuItems(targetAgent: unknown, plugins: unknown[] = []): BeaconMenuItem[] {
  const targetRecord = asRecord(targetAgent)
  const targetOs = String(targetRecord?.os ?? '')
  const pluginMenuGroups = targetAgent ? buildPluginMenuGroups(targetAgent, plugins) : []

  const items: BeaconMenuItem[] = [
    { labelKey: 'beaconMenu.openConsole', label: '打开控制台', icon: '⌨️', action: BEACON_ACTION.CONSOLE },
    { labelKey: 'beaconMenu.browseFiles', label: '查看文件目录', icon: '📁', action: BEACON_ACTION.FILES },
    { labelKey: 'beaconMenu.processList', label: '进程列表浏览', icon: '🔍', action: BEACON_ACTION.PROCESSES },
    { labelKey: 'beaconMenu.networkBrowser', label: '网络浏览器', icon: '🌐', action: BEACON_ACTION.NETWORK },
    ...(pluginMenuGroups.length ? [{ type: 'divider' }] : []),
    ...pluginMenuGroups,
    { type: 'divider' },
    ...(isMenuActionSupportedForOS(BEACON_ACTION.EXEC_BOF, targetOs)
      ? [{ labelKey: 'beaconMenu.execBof', label: 'Execute BOF', icon: '⚡', action: BEACON_ACTION.EXEC_BOF }]
      : []),
    { type: 'divider' },
    { labelKey: 'beaconMenu.connectTcpChild', label: 'Connect TCP Child', icon: '🔗', action: BEACON_ACTION.CASCADE_CONNECT_TCP },
    { labelKey: 'beaconMenu.linkSmbChild', label: 'Link SMB Child', icon: '🔗', action: BEACON_ACTION.CASCADE_LINK_SMB },
    { type: 'divider' },
    { labelKey: 'beaconMenu.editSleep', label: '修改 SleepTime', icon: '⏰', action: BEACON_ACTION.EDIT_SLEEP },
    { labelKey: 'beaconMenu.exit', label: '退出', icon: '🚪', action: BEACON_ACTION.EXIT },
    { labelKey: 'beaconMenu.deleteSession', label: '删除会话', icon: '🗑️', action: BEACON_ACTION.DELETE_SESSION, danger: true },
  ]

  if (!targetAgent) {
    return disableBeaconItems(items, '未找到目标 Beacon', 'beaconMenu.noTarget')
  }

  return items
}
