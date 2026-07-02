/**
 * 命令事件处理模块 - 处理 COMMAND_EVENT 类型的 WS 事件
 *
 * 根据命令结果类型（进程列表、网络信息、截图、文件传输等）
 * 分发到对应的 store 进行状态更新和 UI 刷新。
 */

// ─── 导入 ───

import {
  formatNetInfo,
  formatNetstatTable,
  formatProcessTable,
} from './commandResultFormatters.js'
import {
  COMMAND_RESULT_TYPE,
  isCommandResultComplete,
  isNetInfoResult,
  isNetstatResult,
  isPostExEventResult,
  isProcessResult,
  isTransferResult,
} from './commandResultProtocol.js'
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
} from './eventPayload.js'
import { saveCompletedDownload } from './downloadSave.js'
import { COMMAND_ID } from '../../constants/commands.js'

// ─── 事件处理入口 ───

/**
 * 处理文件传输事件：同时支持独立 FILE_TRANSFER_* 事件和 COMMAND_EVENT 包装事件
 * @param {Object} params - 事件参数
 * @param {Object} params.data - 文件传输数据
 * @param {string} params.phase - 执行阶段
 * @param {string} params.status - 执行状态
 * @param {string} params.resultType - 结果类型或传输方向
 */
export async function handleFileTransferEvent({ data, phase = '', status = '', resultType = '' }) {
  const { useNotificationStore } = await import('../../stores/notification.js')
  const { useFileTransferStore } = await import('../../stores/fileTransfer.js')
  const notificationStore = useNotificationStore()
  const fileTransferStore = useFileTransferStore()
  const transferData = data && typeof data === 'object' ? data : {}
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
    notificationStore.error(getTransferError(normalizedTransferData))
  } else if (transferStatus === 'completed' || normalizedPhase === 'result') {
    if (direction === 'download') {
      try {
        const saved = await saveCompletedDownload(normalizedTransferData)
        if (saved) {
          notificationStore.success(`下载完成并已保存: ${getTransferFileName(normalizedTransferData)}`)
        } else {
          notificationStore.info(`下载已完成，已取消本地保存: ${getTransferFileName(normalizedTransferData)}`)
        }
      } catch (err) {
        notificationStore.error(`保存下载文件失败: ${err.message || err}`)
      }
    } else {
      notificationStore.success(`文件传输完成: ${getTransferFileName(normalizedTransferData)}`)
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
export async function handleCommandEvent({ data, raw, commandId = '', phase = '', status = '', resultType = '' }) {
  const bid = getBeaconId(data) || getBeaconId(raw)
  if (!bid) return

  const normalizedPhase = String(phase || '').toLowerCase()
  const normalizedStatus = String(status || '').toLowerCase()
  const normalizedResultType = normalizeResultType(resultType)
  const numericCommandId = Number(commandId)
  const commandPayload = getCommandResultPayload(data)
  const resultPayload = commandPayload
  const { useConsoleStore } = await import('../../stores/console.js')
  const consoleStore = useConsoleStore()
  const textResult = getTextResultContent(resultPayload)
  const eventError = getCommandError(data, raw)
  const isError = normalizedStatus === 'error'

  if (numericCommandId === COMMAND_ID.PWD && textResult) {
    const { useExplorerStore } = await import('../../stores/explorer.js')
    useExplorerStore().handlePwdResponse(String(bid), resultPayload)
  }

  if (normalizedResultType === COMMAND_RESULT_TYPE.SCREENSHOT) {
    const { useScreenshotStore } = await import('../../stores/screenshot.js')
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
    const { useExplorerStore } = await import('../../stores/explorer.js')
    useExplorerStore().handleExplorerResponse(String(bid), resultPayload)
  } else if (isProcessResult(normalizedResultType, numericCommandId)) {
    const { useProcessBrowserStore } = await import('../../stores/processBrowser.js')
    const processStore = useProcessBrowserStore()
    if (isError) {
      const message = eventError || '获取进程数据失败'
      processStore.handleProcessError(String(bid), message)
      consoleStore.pushCommandResult(bid, message)
    } else {
      processStore.handleProcessResponse(String(bid), resultPayload)
      consoleStore.pushCommandResult(bid, formatProcessTable(resultPayload))
    }
  } else if (isNetInfoResult(normalizedResultType, numericCommandId)) {
    const { useNetworkBrowserStore } = await import('../../stores/networkBrowser.js')
    const networkStore = useNetworkBrowserStore()
    if (isError) {
      const message = eventError || '获取网络接口失败'
      networkStore.handleNetInfoError(String(bid), message)
      consoleStore.pushCommandResult(bid, message)
    } else {
      networkStore.handleNetInfoResponse(String(bid), resultPayload)
      consoleStore.pushCommandResult(bid, formatNetInfo(resultPayload))
    }
  } else if (isNetstatResult(normalizedResultType, numericCommandId)) {
    const { useNetworkBrowserStore } = await import('../../stores/networkBrowser.js')
    const networkStore = useNetworkBrowserStore()
    if (isError) {
      const message = eventError || '获取网络连接失败'
      networkStore.handleNetstatError(String(bid), message)
      consoleStore.pushCommandResult(bid, message)
    } else {
      networkStore.handleNetstatResponse(String(bid), resultPayload)
      consoleStore.pushCommandResult(bid, formatNetstatTable(resultPayload))
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
    const jobId = resultPayload?.job_id ?? resultPayload?.JobID ?? '?'
    const desc = resultPayload?.description || resultPayload?.Description || 'postex'
    const artifactId = resultPayload?.artifact_id || resultPayload?.artifactId || resultPayload?.ArtifactID || ''
    const fileId = resultPayload?.file_id || resultPayload?.fileId || resultPayload?.FileID || ''
    const name = resultPayload?.name || resultPayload?.Name || artifactId || fileId || 'artifact'
    const mime = resultPayload?.mime || resultPayload?.MIME || 'application/octet-stream'
    const totalSize = Number(resultPayload?.total_size ?? resultPayload?.totalSize ?? resultPayload?.TotalSize ?? 0) || 0
    const downloadUrl = resultPayload?.download_url || resultPayload?.downloadUrl || ''
    const label = `[postex:${jobId}/${desc}]`
    const suffix = downloadUrl ? ` url=${downloadUrl}` : ''
    consoleStore.pushCommandResult(bid, `${label} artifact: ${name} (${mime}) ${formatBytes(totalSize)}${suffix}`)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('downloads:refresh'))
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.POSTEX_FRAME) {
    // event_type=4: Post-Ex 帧事件（metadata / progress / artifact）
    // Server 转发字段：job_id, description, frame_type(u32), frame_name, flags, seq, text, payload_base64
    const jobId = resultPayload?.job_id ?? resultPayload?.JobID ?? '?'
    const desc = resultPayload?.description || resultPayload?.Description || 'postex'
    const frameName = resultPayload?.frame_name || resultPayload?.FrameName || ''
    const text = resultPayload?.text || resultPayload?.Text || ''
    const label = `[postex:${jobId}/${desc}]`

    if (frameName === 'error') {
      const code = resultPayload?.code ?? resultPayload?.Code ?? 0
      const stage = resultPayload?.stage ?? resultPayload?.Stage ?? 0
      const win32Error = resultPayload?.win32_error ?? resultPayload?.win32Error ?? resultPayload?.Win32Error ?? 0
      const ntstatus = resultPayload?.ntstatus ?? resultPayload?.Ntstatus ?? resultPayload?.NTStatus ?? 0
      const source = resultPayload?.source || resultPayload?.Source || '-'
      const message = resultPayload?.message || resultPayload?.Message || '-'
      const nt = Number(ntstatus)
      const ntText = Number.isFinite(nt) ? `0x${(nt >>> 0).toString(16).padStart(8, '0')}` : String(ntstatus)
      consoleStore.pushCommandResult(bid,
        `${label} error: code=${code} stage=${stage} win32=${win32Error} ntstatus=${ntText} source=${source} message=${message}`)
    } else if (frameName === 'metadata') {
      // text 是 JSON 字符串，尝试格式化展示
      let display = text
      try {
        const obj = JSON.parse(text)
        display = Object.entries(obj).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')
      } catch { /* 非 JSON，直接显示原文 */ }
      consoleStore.pushCommandResult(bid, `${label} metadata: ${display}`)
    } else if (frameName === 'progress') {
      // text 是 JSON：{"current":1,"total":3,"percent":33,"message":"running"}
      let parts = []
      try {
        const obj = JSON.parse(text)
        if (obj.total !== undefined) parts.push(`${obj.current ?? '?'}/${obj.total}`)
        if (obj.percent !== undefined) parts.push(`${obj.percent}%`)
        if (obj.message) parts.push(obj.message)
      } catch { /* 非 JSON，直接用 text */ }
      const content = parts.length ? parts.join(' ') : text
      consoleStore.pushCommandResult(bid, `${label} progress: ${content}`)
    } else if (frameName === 'artifact') {
      const artifactId = resultPayload?.artifact_id || resultPayload?.artifactId || resultPayload?.ArtifactID || ''
      const name = resultPayload?.name || resultPayload?.Name || ''
      const mime = resultPayload?.mime || resultPayload?.MIME || ''
      const offset = resultPayload?.offset ?? resultPayload?.Offset ?? 0
      const chunkSize = resultPayload?.chunk_size ?? resultPayload?.chunkSize ?? resultPayload?.ChunkSize ?? 0
      const totalSize = resultPayload?.total_size ?? resultPayload?.totalSize ?? resultPayload?.TotalSize ?? 0
      const status = resultPayload?.status || resultPayload?.Status || ''

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
    const jobId = resultPayload?.job_id ?? resultPayload?.JobID ?? '?'
    const desc = resultPayload?.description || resultPayload?.Description || 'postex'
    if (isDead) {
      const reason = resultPayload?.reason || resultPayload?.Reason || 'unknown'
      consoleStore.pushCommandResult(bid, `[postex:${jobId}/${desc}] ${reason}`)
    } else {
      const text = getTextResultContent(resultPayload)
      const label = `[postex:${jobId}/${desc}]`
      consoleStore.pushCommandResult(bid, text ? `${label} ${text}` : label)
    }
  } else if (normalizedResultType === COMMAND_RESULT_TYPE.CASCADE) {
    const action = String(resultPayload?.action || resultPayload?.Action || '').toLowerCase()
    const childId = resultPayload?.child_id || resultPayload?.childId || resultPayload?.ChildID || ''
    if (action === 'dead') {
      const reason = resultPayload?.reason || resultPayload?.Reason || 'unknown'
      consoleStore.pushCommandResult(bid, `[cascade:${childId || '?'}] dead: ${reason}`)
    } else if (action === 'ping') {
      const text = resultPayload?.data || resultPayload?.Data || ''
      consoleStore.pushCommandResult(bid, `[cascade:${childId || '?'}] ping: ${text || 'ok'}`)
    } else {
      consoleStore.pushCommandResult(bid, `[cascade:${childId || '?'}] ${action || 'event'}`)
    }
  } else if (isTransferResult(normalizedResultType)) {
    const transferPayload = resultPayload && typeof resultPayload === 'object' ? resultPayload : {}
    const transferData = {
      ...transferPayload,
      direction: transferPayload.direction || transferPayload.Direction || normalizedResultType,
      task_id: transferPayload.task_id ?? transferPayload.taskId ?? data?.task_id ?? data?.taskId ?? '',
      beacon_id: transferPayload.beacon_id || transferPayload.beaconId || bid,
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

  if (numericCommandId === COMMAND_ID.ZIP && isZipSuccessResult(textResult)) {
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

  if (numericCommandId === COMMAND_ID.RM && isCommandResultComplete({ status: normalizedStatus, phase: normalizedPhase, resultType: normalizedResultType })) {
    const { useExplorerStore } = await import('../../stores/explorer.js')
    const explorerStore = useExplorerStore()
    const currentPath = explorerStore.uiCurrentPath[bid] || ''
    console.log(`[RM DONE] 指令 25 执行完成，准备强制刷新: ${bid} -> ${currentPath}`)
    explorerStore.loadDirectory(String(bid), currentPath, true)
  }

  if (numericCommandId === COMMAND_ID.KILL && isCommandResultComplete({ status: normalizedStatus, phase: normalizedPhase, resultType: normalizedResultType })) {
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

function formatBytes(value) {
  const size = Number(value) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}
