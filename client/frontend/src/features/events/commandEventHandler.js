/**
 * 命令事件处理模块 - 处理 COMMANDEVENT 类型的 WS 事件
 *
 * 根据命令结果类型（进程列表、网络信息、截图、文件传输等）
 * 分发到对应的 store 进行状态更新和 UI 刷新。
 */

// ─── 导入 ───

import { formatNetInfo, formatNetstatTable, formatProcessTable } from './commandResultFormatters.js'
import {
  getBeaconId,
  getCommandResultPayload,
  getTextResultContent,
  getTransferDirection,
  getTransferError,
  getTransferFileName,
  isZipSuccessResult,
  normalizeEventType,
} from './eventPayload.js'
import { saveCompletedDownload } from './downloadSave.js'

// ─── 事件处理入口 ───

/**
 * 处理命令事件：根据结果类型分发到对应处理器
 * @param {Object} params - 事件参数
 * @param {Object} params.data - 事件数据
 * @param {Object} params.raw - 原始消息
 * @param {string} params.commandId - 命令 ID
 * @param {string} params.phase - 执行阶段
 * @param {string} params.status - 执行状态
 * @param {string} params.resultType - 结果类型
 */
export async function handleCommandEvent({ data, raw, commandId = '', phase = '', status = '', resultType = '' }) {
  const bid = getBeaconId(data) || getBeaconId(raw)
  if (!bid) return

  const normalizedPhase = String(phase || '').toLowerCase()
  const normalizedStatus = String(status || '').toLowerCase()
  const normalizedResultType = normalizeEventType(resultType)
  const numericCommandId = Number(commandId)
  const commandPayload = getCommandResultPayload(data)
  const resultPayload = commandPayload
  const { useConsoleStore } = await import('../../stores/console.js')
  const consoleStore = useConsoleStore()
  const textResult = getTextResultContent(resultPayload)

  if (numericCommandId === 22 && textResult) {
    const { useExplorerStore } = await import('../../stores/explorer.js')
    useExplorerStore().handlePwdResponse(String(bid), resultPayload)
  }

  if (normalizedResultType === 'SCREENSHOT') {
    const { useScreenshotStore } = await import('../../stores/screenshot.js')
    const screenshotStore = useScreenshotStore()

    if (normalizedStatus !== 'error' && resultPayload && typeof resultPayload === 'object') {
      screenshotStore.upsertScreenshot(resultPayload)
    }

    if (normalizedStatus === 'completed' || normalizedPhase === 'result') {
      screenshotStore.fetchScreenshots({ silent: true }).catch(err => {
        console.warn('[SCREENSHOT] 列表刷新失败:', err)
      })
    }
  } else if (normalizedResultType === 'EXPLORERFILES') {
    const { useExplorerStore } = await import('../../stores/explorer.js')
    useExplorerStore().handleExplorerResponse(String(bid), resultPayload)
  } else if (['PSLIST', 'PROCESSLIST', 'PROCESSES', 'PS'].includes(normalizedResultType)) {
    const { useProcessBrowserStore } = await import('../../stores/processBrowser.js')
    useProcessBrowserStore().handleProcessResponse(String(bid), resultPayload)

    if (Array.isArray(resultPayload)) {
      consoleStore.pushCommandResult(bid, formatProcessTable(resultPayload))
    } else {
      const text = typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload)
      if (text && text !== 'undefined') {
        consoleStore.pushCommandResult(bid, text)
      }
    }
  } else if (['NETINFO', 'NET_INFO'].includes(normalizedResultType) || numericCommandId === 52) {
    const interfaces = Array.isArray(resultPayload)
      ? resultPayload
      : (resultPayload && typeof resultPayload === 'object'
        ? (resultPayload.interfaces || resultPayload.Interfaces || [])
        : [])
    const { useNetworkBrowserStore } = await import('../../stores/networkBrowser.js')
    useNetworkBrowserStore().handleNetInfoResponse(String(bid), resultPayload)
    consoleStore.pushCommandResult(bid, formatNetInfo(interfaces))
  } else if (['NETSTAT'].includes(normalizedResultType) || numericCommandId === 53) {
    const connections = Array.isArray(resultPayload)
      ? resultPayload
      : (resultPayload && typeof resultPayload === 'object'
        ? (resultPayload.connections || resultPayload.Connections || [])
        : [])
    const { useNetworkBrowserStore } = await import('../../stores/networkBrowser.js')
    useNetworkBrowserStore().handleNetstatResponse(String(bid), resultPayload)
    consoleStore.pushCommandResult(bid, formatNetstatTable(connections))
  } else if (normalizedResultType === 'TEXT') {
    if (textResult) {
      consoleStore.pushCommandResult(bid, textResult)
    } else {
      const fallback = typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload)
      if (fallback && fallback !== 'undefined') {
        consoleStore.pushCommandResult(bid, fallback)
      }
    }
  } else if (['DOWNLOAD', 'UPLOAD'].includes(normalizedResultType)) {
    const { useNotificationStore } = await import('../../stores/notification.js')
    const { useFileTransferStore } = await import('../../stores/fileTransfer.js')
    const notificationStore = useNotificationStore()
    const fileTransferStore = useFileTransferStore()
    const transferData = resultPayload && typeof resultPayload === 'object' ? resultPayload : data
    const transferStatus = normalizedStatus || (
      normalizedPhase === 'progress'
        ? (normalizedResultType === 'UPLOAD' ? 'uploading' : 'receiving')
        : normalizedPhase === 'result'
          ? 'completed'
          : 'running'
    )

    fileTransferStore.handleTransferEvent(transferData, transferStatus)

    if (transferStatus === 'error') {
      notificationStore.error(getTransferError(transferData))
    } else if (transferStatus === 'completed' || normalizedPhase === 'result') {
      if (getTransferDirection(transferData) === 'download' || normalizedResultType === 'DOWNLOAD') {
        try {
          const saved = await saveCompletedDownload(transferData)
          if (saved) {
            notificationStore.success(`下载完成并已保存: ${getTransferFileName(transferData)}`)
          } else {
            notificationStore.info(`下载已完成，已取消本地保存: ${getTransferFileName(transferData)}`)
          }
        } catch (err) {
          notificationStore.error(`保存下载文件失败: ${err.message || err}`)
        }
      } else {
        notificationStore.success(`文件传输完成: ${getTransferFileName(transferData)}`)
      }
    }
  } else {
    const text = getTextResultContent(resultPayload) || (typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload))
    if (text && text !== 'undefined') {
      consoleStore.pushCommandResult(bid, text)
    }
  }

  if (Number(commandId) === 32 && isZipSuccessResult(textResult)) {
    const { useModalStore } = await import('../../stores/modal.js')
    const modalStore = useModalStore()
    if (modalStore.fileBrowserVisible && String(modalStore.activeFileBrowserBeaconId || '') === String(bid)) {
      const { useExplorerStore } = await import('../../stores/explorer.js')
      const explorerStore = useExplorerStore()
      const currentPath = explorerStore.uiCurrentPath[bid] || ''
      console.log(`[ZIP DONE] 指令 32 执行成功，准备刷新文件浏览器: ${bid} -> ${currentPath}`)
      explorerStore.loadDirectory(String(bid), currentPath, true)
    }
  }

  if (Number(commandId) === 25 && (normalizedStatus === 'completed' || normalizedPhase === 'result' || normalizedResultType === 'TEXT' || !normalizedStatus)) {
    const { useExplorerStore } = await import('../../stores/explorer.js')
    const explorerStore = useExplorerStore()
    const currentPath = explorerStore.uiCurrentPath[bid] || ''
    console.log(`[RM DONE] 指令 25 执行完成，准备强制刷新: ${bid} -> ${currentPath}`)
    explorerStore.loadDirectory(String(bid), currentPath, true)
  }

  if (Number(commandId) === 42 && (normalizedStatus === 'completed' || normalizedPhase === 'result' || normalizedResultType === 'TEXT' || !normalizedStatus)) {
    const { useProcessBrowserStore } = await import('../../stores/processBrowser.js')
    const processStore = useProcessBrowserStore()
    if (processStore.consumeRefreshAfterKill(String(bid))) {
      console.log(`[KILL DONE] 指令 42 执行完成，准备刷新进程列表: ${bid}`)
      processStore.requestProcesses(String(bid))
    } else {
      console.log(`[KILL DONE] 指令 42 执行完成，但来源不是进程浏览器，跳过自动刷新: ${bid}`)
    }
  }
}
