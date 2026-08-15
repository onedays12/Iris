/**
 * Beacon Action Composable - 封装 Beacon 交互动作的执行逻辑
 *
 * 提供菜单项获取和动作执行两大能力，将右键菜单中的各种操作
 *（打开控制台、文件浏览、进程管理、插件执行等）统一分发到对应的 store 和 API。
 */

// ─── 导入 ───

import { useI18n } from 'vue-i18n'
import { useAgentStore } from '../../../stores/agent'
import { useConsoleStore } from '../../../stores/console'
import { useModalStore } from '../../../stores/modal'
import { usePluginStore } from '../../../stores/plugin'
import {
  normalizeBeaconArch,
  normalizeBeaconPlatform,
} from '../../../constants/commands'
import { BEACON_ACTION, buildBeaconMenuItems } from './beaconActionDefinitions'
import type { BeaconMenuItem } from './beaconActionDefinitions'
import { sendExitCommand } from './beaconCommandActions'

// ─── 内部工具函数 ───

/**
 * 截取 Beacon ID 前 8 位用于显示
 * @param beaconid - 完整 Beacon ID
 * @returns 短 ID
 */
function shortBeaconId(beaconid: string): string {
  return String(beaconid || '').substring(0, 8) || 'unknown'
}

// ─── Composable 入口 ───

/**
 * Beacon 动作 composable，返回菜单项获取和动作执行方法
 */
export function useBeaconActions() {
  const { t } = useI18n()
  const agentStore = useAgentStore()
  const consoleStore = useConsoleStore()
  const modalStore = useModalStore()
  const pluginStore = usePluginStore()

  // ─── 菜单获取 ───

  /**
   * 获取指定 Beacon 的右键菜单项列表
   * @param beaconid - 目标 Beacon ID
   * @returns 菜单项数组
   */
  function getBeaconMenuItems(beaconid: string): BeaconMenuItem[] {
    const targetAgent = agentStore.getAgentById(beaconid)
    return buildBeaconMenuItems(targetAgent, pluginStore.plugins)
  }

  // ─── 动作执行 ───

  /**
   * 执行插件动作
   * @param beaconid - 目标 Beacon ID
   * @param item - 菜单项（含 pluginAction 信息）
   */
  async function executePluginAction(beaconid: string, item: BeaconMenuItem): Promise<void> {
    const targetAgent = agentStore.getAgentById(beaconid)
    const payload = {
      beacon_id: beaconid,
      selected_beacon_id: beaconid,
      plugin_id: item.pluginId,
      plugin_name: item.pluginName,
      action_id: item.pluginAction?.id,
      kind: item.pluginAction?.kind,
      action_label: item.pluginAction?.label,
      command_id: item.pluginAction?.commandId,
      artifact: item.pluginAction?.artifact,
      artifact_data: item.pluginAction?.artifactData,
      postex: item.pluginAction?.postex || null,
      beacon_os: normalizeBeaconPlatform(targetAgent?.os),
      beacon_arch: normalizeBeaconArch(targetAgent?.arch),
      values: {},
    }
    await pluginStore.invokePluginAction(String(item.pluginId ?? ''), String(item.pluginAction?.id ?? ''), payload)
  }

  /**
   * 根据动作类型分发执行对应的 Beacon 操作
   * @param beaconid - 目标 Beacon ID
   * @param item - 动作标识或菜单项对象
   */
  async function runBeaconAction(beaconid: string, item: BeaconMenuItem | string): Promise<void> {
    if (!beaconid || (typeof item !== 'string' && item?.disabled)) return

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
        if (typeof item !== 'string' && item?.pluginAction?.requiresInput) {
          consoleStore.appendToConsole(beaconid, 'output', t('beaconAction.pluginWindowOpened'))
          modalStore.openPluginAction({
            pluginId: item.pluginId,
            pluginName: item.pluginName,
            beaconid,
            action: item.pluginAction,
          })
        } else if (typeof item !== 'string') {
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
            title: t('beaconAction.exitTitle'),
            message: t('beaconAction.exitMessage', { id: shortBeaconId(beaconid) }),
            type: 'danger',
          })
          if (confirmed) {
            consoleStore.appendToConsole(beaconid, 'input', 'exit')
            consoleStore.appendToConsole(beaconid, 'output', t('beaconAction.exitSending'))
            try {
              await sendExitCommand(beaconid)
              consoleStore.appendToConsole(beaconid, 'output', t('beaconAction.exitSent'))
            } catch (err) {
              consoleStore.appendToConsole(beaconid, 'error', t('beaconAction.exitFailed', { message: err instanceof Error ? err.message : String(err) }))
              console.error('发送退出指令失败:', err)
            }
          }
        }
        break
      case BEACON_ACTION.DELETE_SESSION:
        {
          const confirmed = await modalStore.showConfirm({
            title: t('beaconAction.deleteTitle'),
            message: t('beaconAction.deleteMessage', { id: shortBeaconId(beaconid) }),
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
