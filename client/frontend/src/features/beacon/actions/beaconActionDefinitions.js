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
} from '../../../constants/commands.js'

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

// ─── 平台归一化工具 ───

/**
 * 将操作系统列表归一化为标准平台标识
 * @param {Array} values - 原始平台值数组
 * @returns {string[]} 归一化后的平台标识数组
 */
export function normalizeTargetOSList(values) {
  if (!Array.isArray(values)) return []
  return values
    .map(item => normalizeBeaconPlatform(item))
    .filter(item => item && item !== 'unknown')
}

/**
 * 将架构列表归一化为标准架构标识
 * @param {Array} values - 原始架构值数组
 * @returns {string[]} 归一化后的架构标识数组
 */
export function normalizeTargetArchList(values) {
  if (!Array.isArray(values)) return []
  return values
    .map(item => normalizeBeaconArch(item))
    .filter(item => item && item !== 'unknown')
}

/**
 * 归一化按架构分发的工件映射表
 * @param {Object} value - 原始 {arch: artifact} 映射
 * @returns {Object} 归一化后的映射
 */
export function normalizeArtifactByArchMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizeBeaconArch(key), String(item || '').trim()])
      .filter(([key, item]) => key && key !== 'unknown' && item)
  )
}

/**
 * 根据目标架构解析插件动作的工件路径
 * @param {Object} action - 插件动作定义
 * @param {string} beaconArch - 目标 Beacon 架构
 * @returns {string} 解析后的工件路径
 */
export function resolveActionArtifact(action, beaconArch) {
  const artifactByArch = normalizeArtifactByArchMap(action?.artifactByArch || action?.artifact_by_arch || {})
  const arch = normalizeBeaconArch(beaconArch)
  return artifactByArch[arch] || String(action?.artifact || '').trim()
}

/**
 * 判断插件动作是否支持指定的目标平台和架构
 * @param {Object} action - 插件动作定义
 * @param {number} commandId - 命令 ID
 * @param {string} targetOs - 目标操作系统
 * @param {string} targetArch - 目标架构
 * @returns {boolean}
 */
export function isPluginActionTargetSupported(action, commandId, targetOs, targetArch) {
  if (!isMenuActionSupportedForOS(BEACON_ACTION.PLUGIN, targetOs, commandId)) return false

  const beaconOS = normalizeBeaconPlatform(targetOs)
  const beaconArch = normalizeBeaconArch(targetArch)
  const supportedOS = normalizeTargetOSList(action?.os || action?.OS)
  const supportedArch = normalizeTargetArchList(action?.arch || action?.Arch)

  if (supportedOS.length && !supportedOS.includes(beaconOS)) return false
  if (supportedArch.length && !supportedArch.includes(beaconArch)) return false

  const artifactByArch = normalizeArtifactByArchMap(action?.artifactByArch || action?.artifact_by_arch || {})
  if (Object.keys(artifactByArch).length && !artifactByArch[beaconArch] && !String(action?.artifact || '').trim()) {
    return false
  }

  return true
}

// ─── 菜单构建内部函数 ───

/**
 * 根据目标 Agent 和已加载插件构建插件菜单分组
 * @param {Object} targetAgent - 目标 Beacon 信息
 * @param {Array} plugins - 已加载的插件列表
 * @returns {Array} 菜单分组数组
 */
function buildPluginMenuGroups(targetAgent, plugins) {
  const targetOs = String(targetAgent?.os || '')
  const targetArch = String(targetAgent?.arch || '')

  return plugins
    .map((plugin) => {
      const actions = Array.isArray(plugin.actions) ? plugin.actions : []
      const children = actions
        .map((action) => {
          const actionId = String(action?.id || '').trim()
          const label = String(action?.label || actionId || '').trim()
          if (!actionId || !label) return null

          const artifactByArch = normalizeArtifactByArchMap(action?.artifactByArch || action?.artifact_by_arch || {})
          const resolvedArtifact = resolveActionArtifact(action, targetArch)

          return {
            type: BEACON_ACTION.PLUGIN,
            action: BEACON_ACTION.PLUGIN,
            label,
            icon: '•',
            pluginId: plugin.id,
            pluginName: plugin.displayName || plugin.name || plugin.id,
            pluginAction: {
              id: actionId,
              label,
              description: String(action?.description || ''),
              os: normalizeTargetOSList(action?.os || action?.OS),
              arch: normalizeTargetArchList(action?.arch || action?.Arch),
              artifact: resolvedArtifact,
              artifactByArch,
              artifactData: String(action?.artifactData || action?.artifact_data || ''),
              commandId: Number(action?.commandId || action?.command_id || 0) || 0,
              requiresInput: Boolean(action?.requiresInput || action?.requires_input || (Array.isArray(action?.fields) && action.fields.length)),
              fields: Array.isArray(action?.fields) ? action.fields : [],
            },
          }
        })
        .filter(Boolean)
        .filter((item) => {
          const commandId = Number(item?.pluginAction?.commandId || 0) || PLUGIN_COMMAND_ID.EXECUTION_BOF
          return isPluginActionTargetSupported(item?.pluginAction, commandId, targetOs, targetArch)
        })

      if (!children.length) return null

      return {
        type: 'group',
        label: plugin.displayName || plugin.name || plugin.id,
        icon: '🧩',
        children,
      }
    })
    .filter(Boolean)
}

/**
 * 将菜单项列表全部标记为禁用状态
 * @param {Array} items - 菜单项数组
 * @param {string} reason - 禁用原因
 * @returns {Array} 禁用后的菜单项数组
 */
function disableBeaconItems(items, reason) {
  return items.map((item) => {
    if (item.type === 'divider') return item
    if (item.type === 'group') {
      return {
        ...item,
        children: item.children.map(child => ({ ...child, disabled: true, disabledReason: reason })),
      }
    }
    return { ...item, disabled: true, disabledReason: reason }
  })
}

// ─── 菜单构建入口 ───

/**
 * 构建 Beacon 右键菜单项列表
 * @param {Object|null} targetAgent - 目标 Beacon 信息，为空时全部禁用
 * @param {Array} plugins - 已加载的插件列表
 * @returns {Array} 菜单项数组
 */
export function buildBeaconMenuItems(targetAgent, plugins = []) {
  const targetOs = String(targetAgent?.os || '')
  const pluginMenuGroups = targetAgent ? buildPluginMenuGroups(targetAgent, plugins) : []

  const items = [
    { label: '打开控制台', icon: '⌨️', action: BEACON_ACTION.CONSOLE },
    { label: '查看文件目录', icon: '📁', action: BEACON_ACTION.FILES },
    { label: '进程列表浏览', icon: '🔍', action: BEACON_ACTION.PROCESSES },
    { label: '网络浏览器', icon: '🌐', action: BEACON_ACTION.NETWORK },
    ...(pluginMenuGroups.length ? [{ type: 'divider' }] : []),
    ...pluginMenuGroups,
    { type: 'divider' },
    ...(isMenuActionSupportedForOS(BEACON_ACTION.EXEC_BOF, targetOs)
      ? [{ label: 'Execute BOF', icon: '⚡', action: BEACON_ACTION.EXEC_BOF }]
      : []),
    { type: 'divider' },
    { label: 'Connect TCP Child', icon: '🔗', action: BEACON_ACTION.CASCADE_CONNECT_TCP },
    { label: 'Link SMB Child', icon: '🔗', action: BEACON_ACTION.CASCADE_LINK_SMB },
    { type: 'divider' },
    { label: '修改 SleepTime', icon: '⏰', action: BEACON_ACTION.EDIT_SLEEP },
    { label: '退出', icon: '🚪', action: BEACON_ACTION.EXIT },
    { label: '删除会话', icon: '🗑️', action: BEACON_ACTION.DELETE_SESSION, danger: true },
  ]

  if (!targetAgent) {
    return disableBeaconItems(items, '未找到目标 Beacon')
  }

  return items
}
