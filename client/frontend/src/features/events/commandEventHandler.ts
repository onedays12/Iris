/**
 * 命令事件处理模块 - 处理 COMMAND_EVENT 类型的 WS 事件
 *
 * 根据命令结果类型（进程列表、网络信息、截图、文件传输等）
 * 分发到对应的 store 进行状态更新和 UI 刷新。
 */

// ─── 导入 ───

import { i18n } from '../../i18n/index'
import {
  formatNetInfo,
  formatNetstatTable,
  formatProcessTable,
} from './commandResultFormatters'
import {
  COMMAND_RESULT_TYPE,
  isCommandResultComplete,
  isNetInfoResult,
  isNetstatResult,
  isPostExEventResult,
  isProcessResult,
  isTransferResult,
} from './commandResultProtocol'
import {
  getBeaconId,
  getCommandError,
  getCommandResultPayload,
  getTextResultContent,
  getTransferDirection,
  getTransferError,
  getTransferFileName,
  isZipSuccessResult,
  normalizeResultType,
} from './eventPayload'
import { saveCompletedDownload } from './downloadSave'
import { COMMAND_ID } from '../../constants/commands'
import { pickCommandEvent } from '../../shared/protocol/adapter'
import type { CommandEventData, EventRecord } from './types'

interface CommandHandlerParams {
  data: CommandEventData
  raw: EventRecord
  commandId?: string | number
  phase?: string
  status?: string
  resultType?: string
}

interface FileTransferHandlerParams {
  data: EventRecord
  phase?: string
  status?: string
  resultType?: string
}

function asRecord(value: unknown): EventRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as EventRecord
    : {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const FILE_BROWSER_REFRESH_COMMANDS = new Set<number>([
  COMMAND_ID.RM,
  COMMAND_ID.MV,
  COMMAND_ID.CP,
  COMMAND_ID.MKDIR,
  COMMAND_ID.SETATTR,
  COMMAND_ID.ZIP,
])

function refreshFileBrowserAfterCommand(beaconId: string): Promise<unknown> {
  return import('../../stores/modal').then(({ useModalStore }) => {
    const modalStore = useModalStore()
    if (!modalStore.fileBrowserVisible || String(modalStore.activeFileBrowserBeaconId || '') !== String(beaconId)) {
      return
    }

    return import('../../stores/explorer').then(({ useExplorerStore }) => {
      const explorerStore = useExplorerStore()
      const currentPath = (explorerStore.uiCurrentPath as Record<string, string>)[beaconId] || ''
      return explorerStore.loadDirectory(String(beaconId), currentPath, true)
    })
  })
}

// ─── 事件处理入口 ───

/**
 * 处理文件传输事件：同时支持独立 FILE_TRANSFER_* 事件和 COMMAND_EVENT 包装事件
 * @param {Object} params - 事件参数
 * @param {Object} params.data - 文件传输数据
 * @param {string} params.phase - 执行阶段
 * @param {string} params.status - 执行状态
 * @param {string} params.resultType - 结果类型或传输方向
 */
export async function handleFileTransferEvent({ data, phase = '', status = '', resultType = '' }: FileTransferHandlerParams): Promise<void> {
  const { useNotificationStore } = await import('../../stores/notification')
  const { useFileTransferStore } = await import('../../stores/fileTransfer')
  const notificationStore = useNotificationStore()
  const fileTransferStore = useFileTransferStore()
  const transferData = asRecord(data)
  const normalizedPhase = String(phase || '').toLowerCase()
  const normalizedStatus = String(status || transferData.status || transferData.Status || '').toLowerCase()
  const normalizedResultType = normalizeResultType(resultType || getTransferDirection(transferData))
  const payloadDirection = getTransferDirection(transferData)
  const direction = isTransferResult(payloadDirection)
    ? payloadDirection
    : (isTransferResult(normalizedResultType) ? normalizedResultType : '')
  const normalizedTransferData = {
    ...transferData,
    direction: transferData.direction || transferData.Direction || direction,
    status: transferData.status || transferData.Status || normalizedStatus,
  }
  const transferStatus = normalizedStatus || (
    normalizedPhase === 'progress'
      ? (direction === 'upload' ? 'uploading' : 'receiving')
      : normalizedPhase === 'result'
        ? 'completed'
        : 'running'
  )

  fileTransferStore.handleTransferEvent(normalizedTransferData, transferStatus)

  if (transferStatus === 'error') {
    notificationStore.error(String(getTransferError(normalizedTransferData)))
  } else if (transferStatus === 'completed' || normalizedPhase === 'result') {
    if (direction === 'download') {
      try {
        const saved = await saveCompletedDownload(normalizedTransferData)
        if (saved) {
          notificationStore.success(i18n.global.t('eventHandler.downloadSaved', { file: getTransferFileName(normalizedTransferData) }))
        } else {
          notificationStore.info(i18n.global.t('eventHandler.downloadNotSaved', { file: getTransferFileName(normalizedTransferData) }))
        }
      } catch (err) {
        notificationStore.error(i18n.global.t('eventHandler.saveFailed', { error: errorMessage(err) }))
      }
    } else {
      notificationStore.success(i18n.global.t('eventHandler.transferComplete', { file: getTransferFileName(normalizedTransferData) }))
    }
  }
}

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
export async function handleCommandEvent({ data, raw, commandId = '', phase = '', status = '', resultType = '' }: CommandHandlerParams): Promise<void> {
  const bid = getBeaconId(data) || getBeaconId(raw)
  if (!bid) return

  const normalizedPhase = String(phase || '').toLowerCase()
  const normalizedStatus = String(status || '').toLowerCase()
  const normalizedResultType = normalizeResultType(resultType)
  const numericCommandId = Number(commandId)
  const commandPayload = getCommandResultPayload(data)
  const resultPayload = commandPayload
  const resultRecord = asRecord(resultPayload)
  // Post-Ex / Cascade 字段统一经 adapter 读取（字段别名集中维护在 fieldMap.ts）
  const cmdRec = pickCommandEvent(resultRecord)
  const { useConsoleStore } = await import('../../stores/console')
  const consoleStore = useConsoleStore()
  const textResult = getTextResultContent(resultPayload)
  const eventError = getCommandError(data, raw)
  const isError = normalizedStatus === 'error'

  if (numericCommandId === COMMAND_ID.PWD && textResult) {
    const { useExplorerStore } = await import('../../stores/explorer')
    useExplorerStore().handlePwdResponse(String(bid), resultPayload)
  }

  if (normalizedResultType === COMMAND_RESULT_TYPE.SCREENSHOT) {
    const { useScreenshotStore } = await import('../../stores/screenshot')
    const screenshotStore = useScreenshotStore()

    if (!isError && resultPayload && typeof resultPayload === 'object') {
      screenshotStore.upsertScreenshot(resultPayload)
    }

    if (isError && eventError) {
      consoleStore.pushCommandResult(bid, eventError)
    }

    if (normalizedStatus === 'completed' || normalizedPhase === 'result') {
      screenshotStore.fetchScreenshots({ silent: true }).catch(err => {
        console.warn('[SCREENSHOT] 列表刷新失败:', err)
      })
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.EXPLORER_FILES) {
    const { useExplorerStore } = await import('../../stores/explorer')
    useExplorerStore().handleExplorerResponse(String(bid), resultPayload)
  } else if (isProcessResult(normalizedResultType, numericCommandId)) {
    const { useProcessBrowserStore } = await import('../../stores/processBrowser')
    const processStore = useProcessBrowserStore()
    if (isError) {
      const message = eventError || i18n.global.t('eventHandler.processDataFetchFailed')
      processStore.handleProcessError(String(bid), message)
      consoleStore.pushCommandResult(bid, message)
    } else {
      processStore.handleProcessResponse(String(bid), resultPayload)
      consoleStore.pushCommandResult(bid, formatProcessTable(resultPayload, i18n.global.t))
    }
  } else if (isNetInfoResult(normalizedResultType, numericCommandId)) {
    const { useNetworkBrowserStore } = await import('../../stores/networkBrowser')
    const networkStore = useNetworkBrowserStore()
    if (isError) {
      const message = eventError || i18n.global.t('eventHandler.networkInterfaceFetchFailed')
      networkStore.handleNetInfoError(String(bid), message)
      consoleStore.pushCommandResult(bid, message)
    } else {
      networkStore.handleNetInfoResponse(String(bid), resultPayload)
      consoleStore.pushCommandResult(bid, formatNetInfo(resultPayload, i18n.global.t))
    }
  } else if (isNetstatResult(normalizedResultType, numericCommandId)) {
    const { useNetworkBrowserStore } = await import('../../stores/networkBrowser')
    const networkStore = useNetworkBrowserStore()
    if (isError) {
      const message = eventError || i18n.global.t('eventHandler.networkConnectionsFetchFailed')
      networkStore.handleNetstatError(String(bid), message)
      consoleStore.pushCommandResult(bid, message)
    } else {
      networkStore.handleNetstatResponse(String(bid), resultPayload)
      consoleStore.pushCommandResult(bid, formatNetstatTable(resultPayload, i18n.global.t))
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.TEXT) {
    if (textResult) {
      consoleStore.pushCommandResult(bid, textResult)
    } else {
      const fallback = typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload)
      if (fallback && fallback !== 'undefined') {
        consoleStore.pushCommandResult(bid, fallback)
      }
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.POSTEX_ARTIFACT) {
    const jobId = cmdRec.jobId || '?'
    const desc = cmdRec.description || 'postex'
    const artifactId = cmdRec.artifactId || ''
    const fileId = cmdRec.fileId || ''
    const name = cmdRec.artifactName || artifactId || fileId || 'artifact'
    const mime = cmdRec.mime || 'application/octet-stream'
    const totalSize = Number(cmdRec.totalSize) || 0
    const downloadUrl = cmdRec.downloadUrl || ''
    const label = `[postex:${jobId}/${desc}]`
    const suffix = downloadUrl ? ` url=${downloadUrl}` : ''
    consoleStore.pushCommandResult(bid, `${label} artifact: ${name} (${mime}) ${formatBytes(totalSize)}${suffix}`)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('downloads:refresh'))
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.POSTEX_FRAME) {
    // event_type=4: Post-Ex 帧事件（metadata / progress / artifact）
    // Server 转发字段：job_id, description, frame_type(u32), frame_name, flags, seq, text, payload_base64
    const jobId = cmdRec.jobId || '?'
    const desc = cmdRec.description || 'postex'
    const frameName = cmdRec.frameName || ''
    const text = String(cmdRec.text || '')
    const label = `[postex:${jobId}/${desc}]`

    if (frameName === 'error') {
      const code = cmdRec.code || 0
      const stage = cmdRec.stage || 0
      const win32Error = cmdRec.win32Error || 0
      const ntstatus = cmdRec.ntstatus || 0
      const source = cmdRec.source || '-'
      const message = cmdRec.message || '-'
      const nt = Number(ntstatus)
      const ntText = Number.isFinite(nt) ? `0x${(nt >>> 0).toString(16).padStart(8, '0')}` : String(ntstatus)
      consoleStore.pushCommandResult(bid,
        `${label} error: code=${code} stage=${stage} win32=${win32Error} ntstatus=${ntText} source=${source} message=${message}`)
    } else if (frameName === 'metadata') {
      // text 是 JSON 字符串，尝试格式化展示
      let display: unknown = text
      try {
        const obj = JSON.parse(text)
        display = Object.entries(obj).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')
      } catch { /* 非 JSON，直接显示原文 */ }
      consoleStore.pushCommandResult(bid, `${label} metadata: ${display}`)
    } else if (frameName === 'progress') {
      // text 是 JSON：{"current":1,"total":3,"percent":33,"message":"running"}
      const parts: string[] = []
      try {
        const obj = JSON.parse(text)
        if (obj.total !== undefined) parts.push(`${obj.current ?? '?'}/${obj.total}`)
        if (obj.percent !== undefined) parts.push(`${obj.percent}%`)
        if (obj.message) parts.push(obj.message)
      } catch { /* 非 JSON，直接用 text */ }
      const content = parts.length ? parts.join(' ') : text
      consoleStore.pushCommandResult(bid, `${label} progress: ${content}`)
    } else if (frameName === 'artifact') {
      const artifactId = cmdRec.artifactId || ''
      const name = cmdRec.artifactName || ''
      const mime = cmdRec.mime || ''
      const offset = Number(cmdRec.offset) || 0
      const chunkSize = Number(cmdRec.chunkSize) || 0
      const totalSize = Number(cmdRec.totalSize) || 0
      const status = cmdRec.status || ''

      const finalTag = status === 'completed' ? ' [completed]' : ''
      consoleStore.pushCommandResult(bid,
        `${label} artifact: ${name || artifactId || 'artifact'} (${mime || 'application/octet-stream'}) chunk ${offset}+${chunkSize}/${totalSize} bytes${finalTag}`)
      if (status === 'completed' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('downloads:refresh'))
      }
    } else {
      // 未知 frame_name，显示 text 原文
      consoleStore.pushCommandResult(bid, `${label} ${frameName || 'frame'}: ${text || '(empty)'}`)
    }
  } else if (isPostExEventResult(normalizedResultType, numericCommandId)) {
    // event_type=2/3: postex_output / postex_dead
    const isDead = normalizedResultType === COMMAND_RESULT_TYPE.POSTEX_DEAD
    const jobId = cmdRec.jobId || '?'
    const desc = cmdRec.description || 'postex'
    if (isDead) {
      const reason = cmdRec.reason || 'unknown'
      consoleStore.pushCommandResult(bid, `[postex:${jobId}/${desc}] ${reason}`)
    } else {
      const text = getTextResultContent(resultPayload)
      const label = `[postex:${jobId}/${desc}]`
      consoleStore.pushCommandResult(bid, text ? `${label} ${text}` : label)
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.CASCADE) {
    const action = String(cmdRec.action || '').toLowerCase()
    const childId = cmdRec.childId || ''
    if (action === 'dead') {
      const reason = cmdRec.reason || 'unknown'
      consoleStore.pushCommandResult(bid, `[cascade:${childId || '?'}] dead: ${reason}`)
    } else if (action === 'ping') {
      const text = cmdRec.data || ''
      consoleStore.pushCommandResult(bid, `[cascade:${childId || '?'}] ping: ${text || 'ok'}`)
    } else {
      consoleStore.pushCommandResult(bid, `[cascade:${childId || '?'}] ${action || 'event'}`)
    }
  } else if (isTransferResult(normalizedResultType)) {
    const transferPayload = resultRecord
    const transferData = {
      ...transferPayload,
      direction: transferPayload.direction || normalizedResultType,
      task_id: transferPayload.task_id ?? data?.task_id ?? '',
      beacon_id: transferPayload.beacon_id || bid,
    }
    await handleFileTransferEvent({
      data: transferData,
      phase: normalizedPhase,
      status: normalizedStatus,
      resultType: normalizedResultType,
    })
  } else {
    const text = getTextResultContent(resultPayload) || (typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload))
    if (text && text !== 'undefined') {
      consoleStore.pushCommandResult(bid, text)
    }
  }

  const hasCompletionSignal = Boolean(normalizedStatus || normalizedPhase || normalizedResultType)
  const commandCompleted = hasCompletionSignal && isCommandResultComplete({
    status: normalizedStatus,
    phase: normalizedPhase,
    resultType: normalizedResultType,
  })
  const zipSucceeded = numericCommandId !== COMMAND_ID.ZIP || isZipSuccessResult(textResult)

  if (FILE_BROWSER_REFRESH_COMMANDS.has(numericCommandId) && !isError && commandCompleted && zipSucceeded) {
    refreshFileBrowserAfterCommand(String(bid)).catch(err => {
      console.warn('[EXPLORER] 命令完成后刷新目录失败:', err)
    })
  }

  if (numericCommandId === COMMAND_ID.KILL && isCommandResultComplete({ status: normalizedStatus, phase: normalizedPhase, resultType: normalizedResultType })) {
    const { useProcessBrowserStore } = await import('../../stores/processBrowser')
    const processStore = useProcessBrowserStore()
    if (processStore.consumeRefreshAfterKill(String(bid))) {
      processStore.requestProcesses(String(bid))
    }
  }
}

function formatBytes(value: unknown): string {
  const size = Number(value) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}
