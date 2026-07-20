/**
 * useFileBrowserActions - 文件浏览器操作 composable
 *
 * 封装文件浏览器的所有命令下发与对话框联动逻辑：
 * 下载/上传/删除/移动/复制/压缩/新建目录/属性修改。
 * 主组件只需提供 beaconid、currentPath、loadDirectory 等上下文即可复用。
 */

import { ref } from 'vue'
import { useModalStore } from '../stores/modal.js'
import { useFileTransferStore } from '../stores/fileTransfer.js'
import { useNotificationStore } from '../stores/notification.js'
import { normalizePathKey, joinPaths } from '../stores/explorer.js'
import {
  sendCopyFileCommand,
  sendDownloadCommand,
  sendMkdirCommand,
  sendMoveFileCommand,
  sendRemoveFileCommand,
  sendSetAttrCommand,
  sendUploadCommand,
  sendZipCommand,
} from '../features/beacon/actions/beaconCommandActions.js'
import { uploadFile } from '../features/files/api/fileApi.js'

// ─── 工具函数（纯函数，不依赖响应式） ───

/**
 * 生成副本名称：file.txt → file_copy.txt；目录 → dir_copy
 */
export function buildCopyName(file) {
  const name = String(file?.name || '').trim()
  if (!name) return 'Copy'
  if (file?.is_dir) return `${name}_copy`

  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return `${name}_copy`
  return `${name.slice(0, dotIndex)}_copy${name.slice(dotIndex)}`
}

/**
 * 解析目标路径：支持绝对路径与相对当前目录的路径
 */
export function resolveDestinationPath(basePath, inputPath) {
  const trimmed = String(inputPath || '').trim()
  if (!trimmed) return ''
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed) || trimmed.startsWith('/')) {
    return normalizePathKey(trimmed)
  }
  return joinPaths(basePath, trimmed)
}

// ─── composable 入口 ───

/**
 * @param {Object} ctx
 * @param {import('vue').Ref<string>} ctx.beaconid - 目标 Beacon ID
 * @param {import('vue').Ref<string>} ctx.currentPath - 当前目录路径
 * @param {(path: string, force?: boolean) => Promise<void>} ctx.loadDirectory - 加载目录函数
 * @param {import('vue').Ref<any>} ctx.activeMenuTarget - 当前激活的菜单目标
 * @param {() => void} ctx.closeMenu - 关闭菜单回调
 * @param {() => { type: string, path: string }} ctx.getMenuTarget - 获取空白菜单目标
 */
export function useFileBrowserActions({ beaconid, currentPath, loadDirectory, activeMenuTarget, closeMenu, getMenuTarget }) {
  const modalStore = useModalStore()
  const fileTransferStore = useFileTransferStore()
  const notificationStore = useNotificationStore()

  const uploadInputRef = ref(null)
  const uploadTarget = ref(null)
  const isUploading = ref(false)
  const downloadCooldowns = ref(new Map())

  // 属性 / 压缩对话框状态
  const attributeDialogVisible = ref(false)
  const attributeDialogTarget = ref(null)
  const zipDialogVisible = ref(false)
  const zipDialogTarget = ref(null)

  // ─── 上传 ───

  function triggerUpload(target = activeMenuTarget.value) {
    uploadTarget.value = target || getMenuTarget()
    closeMenu()
    uploadInputRef.value?.click()
  }

  async function handleUploadFile(event) {
    const file = event.target.files?.[0]
    const target = uploadTarget.value
    event.target.value = ''
    if (!file || isUploading.value) {
      uploadTarget.value = null
      return
    }

    const basePath = target?.type === 'folder'
      ? (target.file?.path || currentPath.value)
      : (target?.path || currentPath.value)
    if (!basePath) {
      notificationStore.error('请先进入目标目录，或右键目标文件夹后再上传')
      uploadTarget.value = null
      return
    }
    const remotePath = joinPaths(basePath, file.name)

    // [锁定机制] 5 秒时间防抖锁定 (上传)
    const cooldownKey = `upload:${beaconid.value}:${remotePath}`
    const now = Date.now()
    const lastTime = downloadCooldowns.value.get(cooldownKey) || 0
    if (now - lastTime < 5000) {
      notificationStore.info(`文件正在上传中，请稍候: ${file.name}`)
      uploadTarget.value = null
      return
    }
    downloadCooldowns.value.set(cooldownKey, now)

    isUploading.value = true
    try {
      notificationStore.info(`准备上传: ${file.name}`)
      // 第一阶段：上传到服务器暂存区
      const uploaded = await uploadFile(file)
      const fileId = uploaded.file_id
      if (!fileId) {
        throw new Error('服务器未返回有效的 file_id，请检查后端 API 对齐情况')
      }

      // 第二阶段：下发任务给端
      const result = await sendUploadCommand(beaconid.value, fileId, remotePath, 524288)

      fileTransferStore.startUpload({
        beaconid: beaconid.value,
        taskId: result?.task_id || result?.taskId || result?.id || '',
        remotePath: remotePath,
        fileName: file.name,
        size: file.size,
      })

      notificationStore.success(`上传任务已下发: ${file.name}`)
    } catch (err) {
      notificationStore.error(`上传任务失败: ${err.message || err}`)
    } finally {
      isUploading.value = false
      uploadTarget.value = null
    }
  }

  // ─── 下载 ───

  async function handleDownload(file) {
    if (!file || file.is_dir) return

    const cooldownKey = `${beaconid.value}:${file.path}`
    const now = Date.now()
    const lastTime = downloadCooldowns.value.get(cooldownKey) || 0

    if (now - lastTime < 5000) {
      const remaining = Math.ceil((5000 - (now - lastTime)) / 1000)
      notificationStore.info(`操作太快，请 ${remaining} 秒后再试: ${file.name}`)
      closeMenu()
      return
    }

    downloadCooldowns.value.set(cooldownKey, now)

    try {
      const result = await sendDownloadCommand(beaconid.value, file.path, 524288, 3)
      fileTransferStore.startDownload({
        beaconid: beaconid.value,
        taskId: result?.task_id || result?.taskId || result?.id || '',
        remotePath: file.path,
        fileName: file.name,
        size: file.size,
      })
      notificationStore.success(`下载任务已下发: ${file.name}`)
    } catch (err) {
      notificationStore.error(`下载任务下发失败: ${err.message || err}`)
    } finally {
      closeMenu()
    }
  }

  // ─── 删除 ───

  async function handleDelete(target) {
    const file = target?.file
    if (!file) return

    closeMenu()

    const confirmed = await modalStore.showConfirm({
      title: `确认删除${file.is_dir ? '目录' : '文件'}`,
      message: `你确定要删除 [${file.name}] 吗？\n警告：此操作不可撤销且会物理抹除数据。`,
      type: 'danger'
    })

    if (!confirmed) return

    try {
      notificationStore.info(`正在下发删除指令: ${file.name}`)
      await sendRemoveFileCommand(beaconid.value, file.path)
      notificationStore.success(`删除任务已提交: ${file.name}`)
    } catch (err) {
      notificationStore.error(`删除指令发送失败: ${err.message || err}`)
    }
  }

  // ─── 移动 / 复制 ───

  async function handleMoveCopy(action, target) {
    const file = target?.file
    const basePath = currentPath.value || ''
    if (!file) return

    closeMenu()

    if (!basePath) {
      notificationStore.error('请先进入具体目录后再执行移动或复制')
      return
    }

    const isMove = action === 'move'
    const nextName = await modalStore.showPrompt({
      title: isMove ? '移动文件/文件夹' : '复制文件/文件夹',
      message: `当前目录: [${basePath}]\n可输入目标名称，也可直接输入完整路径。`,
      placeholder: isMove ? '请输入目标名称或完整路径...' : '请输入副本名称或完整路径...',
      defaultValue: isMove ? file.name : buildCopyName(file),
    })

    const trimmedName = String(nextName || '').trim()
    if (!trimmedName) return

    const destinationPath = resolveDestinationPath(basePath, trimmedName)
    if (destinationPath === file.path) {
      notificationStore.info('源路径与目标路径一致，未执行操作')
      return
    }

    try {
      notificationStore.info(`正在${isMove ? '移动' : '复制'}: ${file.name}`)
      const sendFileCommand = isMove ? sendMoveFileCommand : sendCopyFileCommand
      await sendFileCommand(beaconid.value, file.path, destinationPath)
      notificationStore.success(`${isMove ? '移动' : '复制'}任务已提交: ${file.name}`)
      await new Promise(resolve => setTimeout(resolve, 300))
      await loadDirectory(basePath, true)
    } catch (err) {
      notificationStore.error(`${isMove ? '移动' : '复制'}指令发送失败: ${err.message || err}`)
    }
  }

  // ─── 压缩 ───

  function handleZip(target) {
    openZipDialog(target)
  }

  async function handleZipSubmit({ sourcePath, zipPath, overwrite, includeRoot }) {
    const sourceName = zipDialogTarget.value?.file?.name || sourcePath
    try {
      notificationStore.info(`正在下发压缩任务: ${sourceName}`)
      await sendZipCommand(beaconid.value, sourcePath, zipPath, overwrite, includeRoot)
      notificationStore.success(`压缩任务已提交: ${sourceName}`)
      closeZipDialog()
    } catch (err) {
      notificationStore.error(`压缩任务下发失败: ${err.message || err}`)
    }
  }

  // ─── 新建目录 ───

  async function handleMkdir() {
    const target = activeMenuTarget.value
    const basePath = target?.type === 'folder'
      ? (target.file?.path || currentPath.value)
      : (target?.path || currentPath.value)

    closeMenu()

    if (!basePath) {
      notificationStore.error('请先进入目标目录后再创建文件夹')
      return
    }

    const folderName = await modalStore.showPrompt({
      title: '新建文件夹',
      message: `将在目录 [${basePath}] 下创建新文件夹`,
      placeholder: '请输入文件夹名称...',
      defaultValue: 'New Folder'
    })

    if (!folderName || !folderName.trim()) return

    const fullPath = joinPaths(basePath, folderName.trim())

    try {
      notificationStore.info(`正在下发创建指令: ${folderName}`)
      await sendMkdirCommand(beaconid.value, fullPath)
      notificationStore.success(`创建任务已提交: ${folderName}`)
      await new Promise(resolve => setTimeout(resolve, 300))
      await loadDirectory(basePath, true)
    } catch (err) {
      notificationStore.error(`创建指令发送失败: ${err.message || err}`)
    }
  }

  // ─── 属性修改 ───

  function openAttributeDialog(target) {
    if (!target?.file || !target.file.path) {
      notificationStore.error('未找到可修改属性的目标路径')
      return
    }
    closeMenu()
    attributeDialogTarget.value = target
    attributeDialogVisible.value = true
  }

  function closeAttributeDialog() {
    attributeDialogVisible.value = false
    attributeDialogTarget.value = null
  }

  async function handleAttributeSubmit(args) {
    const targetName = attributeDialogTarget.value?.file?.name || '目标文件'
    try {
      notificationStore.info(`正在下发属性修改任务: ${targetName}`)
      await sendSetAttrCommand(beaconid.value, args)
      notificationStore.success(`属性修改任务已提交: ${targetName}`)
      closeAttributeDialog()
      await new Promise(resolve => setTimeout(resolve, 300))
      await loadDirectory(currentPath.value, true)
    } catch (err) {
      notificationStore.error(`属性修改失败: ${err.message || err}`)
    }
  }

  // ─── 压缩对话框 ───

  function openZipDialog(target) {
    if (!target?.file || !target.file.path) {
      notificationStore.error('未找到可压缩的目标路径')
      return
    }
    closeMenu()
    zipDialogTarget.value = target
    zipDialogVisible.value = true
  }

  function closeZipDialog() {
    zipDialogVisible.value = false
    zipDialogTarget.value = null
  }

  return {
    // 上传
    uploadInputRef,
    isUploading,
    triggerUpload,
    handleUploadFile,
    // 下载
    handleDownload,
    // 删除 / 移动 / 复制
    handleDelete,
    handleMoveCopy,
    // 压缩
    handleZip,
    handleZipSubmit,
    openZipDialog,
    closeZipDialog,
    zipDialogVisible,
    zipDialogTarget,
    // 新建目录
    handleMkdir,
    // 属性
    openAttributeDialog,
    closeAttributeDialog,
    handleAttributeSubmit,
    attributeDialogVisible,
    attributeDialogTarget,
  }
}
