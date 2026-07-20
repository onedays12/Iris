/**
 * 下载保存模块 - 将完成的下载文件保存到本地磁盘
 *
 * 从下载事件数据中提取文件信息，通过 Wails 文件对话框
 * 让用户选择保存路径，然后将 base64 数据写入本地文件。
 */

// ─── 导入 ───

import {
  getTransferDownloadUrl,
  getTransferFileId,
  getTransferFileName,
} from './eventPayload.js'
import { downloadFileBase64 } from '../files/api/fileApi.js'

// ─── 导出函数 ───

/**
 * 将已完成的下载文件保存到本地
 * @param {Object} data - 下载事件数据
 * @returns {Promise<boolean>} 是否成功保存（用户取消则返回 false）
 */
export async function saveCompletedDownload(data) {
  const fileId = getTransferFileId(data)
  const downloadUrl = getTransferDownloadUrl(data)
  const fileName = getTransferFileName(data)
  if (!fileId && !downloadUrl) {
    throw new Error('缺少 download_url 或 file_id')
  }

  const { Dialogs } = await import('@wailsio/runtime')
  const FileService = await import('../../../bindings/irisclient/service/fileservice.js')

  const savePath = await Dialogs.SaveFile({
    Title: '保存下载文件',
    Filename: fileName,
  })
  if (!savePath) return false

  const base64Data = await downloadFileBase64({ fileId, downloadUrl })
  await FileService.WriteBinaryFile(savePath, base64Data)
  return true
}
