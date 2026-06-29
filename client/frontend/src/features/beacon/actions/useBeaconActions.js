/**
 * Beacon Action Composable - 封装 Beacon 交互动作的执行逻辑
 *
 * 提供菜单项获取和动作执行两大能力，将右键菜单中的各种操作
 *（打开控制台、文件浏览、进程管理、插件执行等）统一分发到对应的 store 和 API。
 */

// ─── 导入 ───

import { useAgentStore } from '../../../stores/agent.js'
import { useConsoleStore } from '../../../stores/console.js'
import { useModalStore } from '../../../stores/modal.js'
import { usePluginStore } from '../../../stores/plugin.js'
import {
  normalizeBeaconArch,
  normalizeBeaconPlatform,
} from '../../../constants/commands.js'
import { BEACON_ACTION, buildBeaconMenuItems } from './beaconActionDefinitions.js'
import { sendExitCommand } from './beaconCommandActions.js'

// ─── 内部工具函数 ───

/**
 * 截取 Beacon ID 前 8 位用于显示
 * @param {string} beaconid - 完整 Beacon ID
 * @returns {string} 短 ID
 */
function shortBeaconId(beaconid) {
  return String(beaconid || '').substring(0, 8) || 'unknown'
}

// ─── Composable 入口 ───

/**
 * Beacon 动作 composable，返回菜单项获取和动作执行方法
 * @returns {{getBeaconMenuItems: Function, runBeaconAction: Function}}
 */
export function useBeaconActions() {
  const agentStore = useAgentStore()
  const consoleStore = useConsoleStore()
  const modalStore = useModalStore()
  const pluginStore = usePluginStore()

  // ─── 菜单获取 ───

  /**
   * 获取指定 Beacon 的右键菜单项列表
   * @param {string} beaconid - 目标 Beacon ID
   * @returns {Array} 菜单项数组
   */
  function getBeaconMenuItems(beaconid) {
    const targetAgent = agentStore.getAgentById(beaconid)
    return buildBeaconMenuItems(targetAgent, pluginStore.plugins)
  }

  // ─── 动作执行 ───

  /**
   * 执行插件动作
   * @param {string} beaconid - 目标 Beacon ID
   * @param {Object} item - 菜单项（含 pluginAction 信息）
   */
  async function executePluginAction(beaconid, item) {
    const targetAgent = agentStore.getAgentById(beaconid)
    const payload = {
      beacon_id: beaconid,
      selected_beacon_id: beaconid,
      plugin_id: item.pluginId,
      plugin_name: item.pluginName,
      action_id: item.pluginAction.id,
      kind: item.pluginAction.kind,
      action_label: item.pluginAction.label,
      command_id: item.pluginAction.commandId,
      artifact: item.pluginAction.artifact,
      artifact_data: item.pluginAction.artifactData,
      postex: item.pluginAction.postex || null,
      beacon_os: normalizeBeaconPlatform(targetAgent?.os),
      beacon_arch: normalizeBeaconArch(targetAgent?.arch),
      values: {},
    }
    await pluginStore.invokePluginAction(item.pluginId, item.pluginAction.id, payload)
  }

  /**
   * 根据动作类型分发执行对应的 Beacon 操作
   * @param {string} beaconid - 目标 Beacon ID
   * @param {string|Object} item - 动作标识或菜单项对象
   */
  async function runBeaconAction(beaconid, item) {
    if (!beaconid || item?.disabled) return

    const action = typeof item === 'string' ? item : item?.action || item?.type || ''

    switch (action) {
      case BEACON_ACTION.CONSOLE:
        consoleStore.openConsole(beaconid)
        break
      case BEACON_ACTION.FILES:
        modalStore.openFileBrowser(beaconid)
        break
      case BEACON_ACTION.PROCESSES:
        modalStore.openProcessBrowser(beaconid)
        break
      case BEACON_ACTION.NETWORK:
        modalStore.openNetworkBrowser(beaconid)
        break
      case BEACON_ACTION.PLUGIN:
        consoleStore.openConsole(beaconid)
        if (item?.pluginAction?.requiresInput) {
          consoleStore.appendToConsole(beaconid, 'output', '已打开插件执行窗口。')
          modalStore.openPluginAction({
            pluginId: item.pluginId,
            pluginName: item.pluginName,
            beaconid,
            action: item.pluginAction,
          })
        } else {
          try {
            await executePluginAction(beaconid, item)
          } catch (err) {
            console.error('[BeaconActions] 执行插件动作失败:', err)
          }
        }
        break
      case BEACON_ACTION.EXEC_BOF:
        modalStore.openExecuteModal(beaconid, 'bof')
        break
      case BEACON_ACTION.CASCADE_CONNECT_TCP:
        modalStore.openCascadeConnectModal(beaconid, 'tcp')
        break
      case BEACON_ACTION.CASCADE_LINK_SMB:
        modalStore.openCascadeConnectModal(beaconid, 'smb')
        break
      case BEACON_ACTION.EDIT_SLEEP:
        consoleStore.openConsole(beaconid)
        modalStore.openSleepModal(beaconid)
        break
      case BEACON_ACTION.EXIT:
        {
          consoleStore.openConsole(beaconid)
          const confirmed = await modalStore.showConfirm({
            title: '退出 Beacon 会话',
            message: `你确定要向会话 [${shortBeaconId(beaconid)}] 下发退出指令吗？\n这会直接杀掉目标机器上的 Beacon 进程。`,
            type: 'danger',
          })
          if (confirmed) {
            consoleStore.appendToConsole(beaconid, 'input', 'exit')
            consoleStore.appendToConsole(beaconid, 'output', '正在下发退出指令...')
            try {
              await sendExitCommand(beaconid)
              consoleStore.appendToConsole(beaconid, 'output', '退出指令已下发。')
            } catch (err) {
              consoleStore.appendToConsole(beaconid, 'error', `发送退出指令失败: ${err.message || err}`)
              console.error('发送退出指令失败:', err)
            }
          }
        }
        break
      case BEACON_ACTION.DELETE_SESSION:
        {
          const confirmed = await modalStore.showConfirm({
            title: '彻底删除会话',
            message: `你确定要注销并删除会话 [${shortBeaconId(beaconid)}] 吗？\n此操作将同步清理服务端的缓存数据，且不可撤销。`,
            type: 'danger',
          })
          if (confirmed) {
            agentStore.removeBeacon(beaconid).catch(() => {})
          }
        }
        break
    }
  }

  return {
    getBeaconMenuItems,
    runBeaconAction,
  }
}
