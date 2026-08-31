/**
 * useFileBrowserActions - 文件浏览器操作 composable
 *
 * 封装文件浏览器的所有命令下发与对话框联动逻辑：
 * 下载/上传/删除/移动/复制/压缩/新建目录/属性修改。
 * 主组件只需提供 beaconid、currentPath 等上下文即可复用。
 */

import { ref } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { COMMAND_ID } from '../constants/commands'
import { useModalStore } from '../stores/modal'
import { useFileTransferStore } from '../stores/fileTransfer'
import { useNotificationStore } from '../stores/notification'
import { usePreviewStore } from '../stores/preview'
import { useConsoleStore } from '../stores/console'
import { normalizePathKey, joinPaths } from '../stores/explorer'
import type { ExplorerFileInfo } from '../stores/explorer'
import type { FileMenuTarget } from './useFileBrowserMenu'
import {
  buildExecuteShellCommand,
  resolveExecuteCwd,
} from '../features/files/executeCommand'
import {
  sendCopyFileCommand,
  sendDownloadCommand,
  sendMkdirCommand,
  sendMoveFileCommand,
  sendRemoveFileCommand,
  sendSetAttrCommand,
  sendUploadCommand,
  sendZipCommand,
} from '../features/beacon/actions/beaconCommandActions'
import { uploadFile, uploadFileByBase64 } from '../features/files/api/fileApi'
import type { StoredFile } from '../features/files/model'
import { FileService } from '../../bindings/irisclient/service'

// ─── 工具函数（纯函数，不依赖响应式） ───

/**
 * 生成副本名称：file.txt → file_copy.txt；目录 → dir_copy
 */
export function buildCopyName(file: ExplorerFileInfo | null | undefined): string {
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
export function resolveDestinationPath(basePath: string, inputPath: unknown): string {
  const trimmed = String(inputPath || '').trim()
  if (!trimmed) return ''
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed) || trimmed.startsWith('/')) {
    return normalizePathKey(trimmed)
  }
  return joinPaths(basePath, trimmed)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ─── composable 入口 ───

export interface FileBrowserActionsContext {
  /** 目标 Beacon ID */
  beaconid: Ref<string>
  /** 当前目录路径 */
  currentPath: Ref<string>
  /** 目标是否为 Windows beacon */
  isWindows: Ref<boolean>
  /** 当前激活的菜单目标 */
  activeMenuTarget: Ref<FileMenuTarget | null>
  /** 关闭菜单回调 */
  closeMenu: () => void
  /** 获取空白菜单目标 */
  getMenuTarget: () => FileMenuTarget
}

export function useFileBrowserActions({ beaconid, currentPath, isWindows, activeMenuTarget, closeMenu, getMenuTarget }: FileBrowserActionsContext) {
  const { t } = useI18n()
  const modalStore = useModalStore()
  const fileTransferStore = useFileTransferStore()
  const notificationStore = useNotificationStore()
  const consoleStore = useConsoleStore()

  const uploadInputRef = ref<HTMLInputElement | null>(null)
  const uploadTarget = ref<FileMenuTarget | null>(null)
  const isUploading = ref(false)
  const downloadCooldowns = ref<Map<string, number>>(new Map())

  // 属性 / 压缩对话框状态
  const attributeDialogVisible = ref(false)
  const attributeDialogTarget = ref<FileMenuTarget | null>(null)
  const zipDialogVisible = ref(false)
  const zipDialogTarget = ref<FileMenuTarget | null>(null)
  const executeDialogVisible = ref(false)
  const executeDialogTarget = ref<FileMenuTarget | null>(null)
  const executeCwd = ref('')

  // ─── 上传 ───

  function triggerUpload(target: FileMenuTarget | null = activeMenuTarget.value): void {
    uploadTarget.value = target || getMenuTarget()
    closeMenu()
    uploadInputRef.value?.click()
  }

  async function handleUploadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    const target = uploadTarget.value
    input.value = ''
    uploadTarget.value = null
    if (!file || isUploading.value) return

    // 拖在文件夹行上则入该文件夹,其余(含空白区/路径栏)进当前目录
    const basePath = target?.type === 'folder'
      ? (target.file?.path || currentPath.value)
      : (target?.path || currentPath.value)
    if (!basePath) {
      notificationStore.error(t('fileBrowser.needTargetFolder'))
      return
    }
    await uploadOneFile(file, basePath)
  }

  /**
   * 单文件上传管线(文件选择与拖拽上传共用):
   * 5s 防抖锁 → 服务器暂存区(/files/uploads) → 下发 beacon 上传任务。
   * stage 负责把内容送进暂存区并返回 StoredFile(File 选择与原生拖拽路径各异)。
   */
  async function uploadOneFile(file: File, basePath: string): Promise<void> {
    await uploadOne(file.name, file.size, basePath, () => uploadFile(file))
  }

  /**
   * 原生拖拽上传(Wails dropzone 桥):Windows 上 DOM 收不到 drop,
   * 拖入文件以本机绝对路径经 Go 事件转发而来,内容用 FileService 读 base64。
   */
  async function uploadOneFromPath(path: string, basePath: string): Promise<void> {
    const name = path.split(/[\\/]/).pop() || path
    await uploadOne(name, 0, basePath, async () => {
      const base64 = await FileService.ReadBinaryFileBase64(path)
      return uploadFileByBase64(name, base64)
    })
  }

  async function uploadOne(name: string, sizeHint: number, basePath: string, stage: () => Promise<StoredFile>): Promise<void> {
    const remotePath = joinPaths(basePath, name)

    // [锁定机制] 5 秒时间防抖锁定 (上传)
    const cooldownKey = `upload:${beaconid.value}:${remotePath}`
    const now = Date.now()
    const lastTime = downloadCooldowns.value.get(cooldownKey) || 0
    if (now - lastTime < 5000) {
      notificationStore.info(t('fileBrowser.uploadingCooldown', { name }))
      return
    }
    downloadCooldowns.value.set(cooldownKey, now)

    isUploading.value = true
    try {
      notificationStore.info(t('fileBrowser.preparingUpload', { name }))
      // 第一阶段：上传到服务器暂存区
      const uploaded = await stage()
      const fileId = uploaded.fileId
      if (!fileId) {
        throw new Error(t('fileBrowser.noFileId'))
      }

      // 第二阶段：下发任务给端
      await sendUploadCommand(beaconid.value, fileId, remotePath, 524288)

      fileTransferStore.startUpload({
        beaconid: beaconid.value,
        taskId: '',
        remotePath: remotePath,
        fileName: name,
        size: uploaded.size || sizeHint,
      })

      notificationStore.success(t('fileBrowser.uploadQueued', { name }))
    } catch (err) {
      notificationStore.error(t('fileBrowser.uploadFailed', { message: errorMessage(err) }))
    } finally {
      isUploading.value = false
    }
  }

  /**
   * 拖拽上传:拖入的本地文件批量上传到当前目录。
   * 文件夹条目(Chromium 拖目录会产生 0 字节无类型 File)跳过并提示。
   */
  async function handleDropUpload(event: DragEvent): Promise<void> {
    if (isUploading.value) return
    const dropped = Array.from(event.dataTransfer?.files ?? [])
    const files = dropped.filter((f) => !(f.type === '' && f.size === 0 && !f.name.includes('.')))
    const skipped = dropped.length - files.length
    if (skipped > 0) {
      notificationStore.info(t('fileBrowser.dropSkippedFolders', { count: skipped }))
    }
    if (!files.length) return
    const basePath = currentPath.value
    if (!basePath) {
      notificationStore.error(t('fileBrowser.needTargetFolder'))
      return
    }
    for (const file of files) {
      await uploadOneFile(file, basePath)
    }
  }

  /**
   * Wails 原生拖拽入口:Go 侧 WindowDropZoneFilesDropped 事件桥转发来的
   * 本机绝对路径列表,逐个上传到当前目录。
   */
  async function handleDroppedFilePaths(paths: string[]): Promise<void> {
    if (isUploading.value || !paths.length) return
    const basePath = currentPath.value
    if (!basePath) {
      notificationStore.error(t('fileBrowser.needTargetFolder'))
      return
    }
    for (const path of paths) {
      try {
        await uploadOneFromPath(path, basePath)
      } catch {
        // 单文件失败已在管线内提示,继续处理余下文件
      }
    }
  }

  // ─── 下载 ───

  async function handleDownload(file: ExplorerFileInfo | undefined): Promise<void> {
    if (!file || file.is_dir) return

    const cooldownKey = `${beaconid.value}:${file.path}`
    const now = Date.now()
    const lastTime = downloadCooldowns.value.get(cooldownKey) || 0

    if (now - lastTime < 5000) {
      const remaining = Math.ceil((5000 - (now - lastTime)) / 1000)
      notificationStore.info(t('fileBrowser.tooFast', { seconds: remaining, name: file.name }))
      closeMenu()
      return
    }

    downloadCooldowns.value.set(cooldownKey, now)

    try {
      await sendDownloadCommand(beaconid.value, file.path, 524288, 3)
      fileTransferStore.startDownload({
        beaconid: beaconid.value,
        taskId: '',
        remotePath: file.path,
        fileName: file.name,
        size: file.size,
      })
      notificationStore.success(t('fileBrowser.downloadQueued', { name: file.name }))
    } catch (err) {
      notificationStore.error(t('fileBrowser.downloadFailed', { message: errorMessage(err) }))
    } finally {
      closeMenu()
    }
  }

  // ─── 预览 ───

  /** 打开文件预览弹窗（类型/大小预判在 preview store 内完成）。 */
  function handlePreview(file: ExplorerFileInfo | undefined): void {
    if (!file || file.is_dir) return
    closeMenu()
    usePreviewStore().openPreview(beaconid.value, file.path, file.name, file.size)
  }

  // ─── 删除 ───

  async function handleDelete(target: FileMenuTarget): Promise<void> {
    const file = target?.file
    if (!file) return

    closeMenu()

    const confirmed = await modalStore.showConfirm({
      title: t('fileBrowser.deleteTitle', { type: t(file.is_dir ? 'fileBrowser.deleteTypeDir' : 'fileBrowser.deleteTypeFile') }),
      message: t('fileBrowser.deleteMessage', { name: file.name }),
      type: 'danger'
    })

    if (!confirmed) return

    try {
      notificationStore.info(t('fileBrowser.deleting', { name: file.name }))
      await sendRemoveFileCommand(beaconid.value, file.path)
      notificationStore.success(t('fileBrowser.deleteQueued', { name: file.name }))
    } catch (err) {
      notificationStore.error(t('fileBrowser.deleteFailed', { message: errorMessage(err) }))
    }
  }

  // ─── 移动 / 复制 ───

  async function handleMoveCopy(action: 'move' | 'copy', target: FileMenuTarget): Promise<void> {
    const file = target?.file
    const basePath = currentPath.value || ''
    if (!file) return

    closeMenu()

    if (!basePath) {
      notificationStore.error(t('fileBrowser.needBasePath'))
      return
    }

    const isMove = action === 'move'
    const nextName = await modalStore.showPrompt({
      title: isMove ? t('fileBrowser.moveTitle') : t('fileBrowser.copyTitle'),
      message: t('fileBrowser.moveCopyMessage', { path: basePath }),
      placeholder: isMove ? t('fileBrowser.movePlaceholder') : t('fileBrowser.copyPlaceholder'),
      defaultValue: isMove ? file.name : buildCopyName(file),
    })

    const trimmedName = String(nextName || '').trim()
    if (!trimmedName) return

    const destinationPath = resolveDestinationPath(basePath, trimmedName)
    if (destinationPath === file.path) {
      notificationStore.info(t('fileBrowser.samePath'))
      return
    }

    try {
      notificationStore.info(t(isMove ? 'fileBrowser.moving' : 'fileBrowser.copying', { name: file.name }))
      const sendFileCommand = isMove ? sendMoveFileCommand : sendCopyFileCommand
      await sendFileCommand(beaconid.value, file.path, destinationPath)
      notificationStore.success(t(isMove ? 'fileBrowser.moveQueued' : 'fileBrowser.copyQueued', { name: file.name }))
    } catch (err) {
      notificationStore.error(t(isMove ? 'fileBrowser.moveFailed' : 'fileBrowser.copyFailed', { message: errorMessage(err) }))
    }
  }

  // ─── 压缩 ───

  function handleZip(target: FileMenuTarget): void {
    openZipDialog(target)
  }

  async function handleZipSubmit({ sourcePath, zipPath, overwrite, includeRoot }: { sourcePath: string; zipPath: string; overwrite: number; includeRoot: number }): Promise<void> {
    const sourceName = zipDialogTarget.value?.file?.name || sourcePath
    try {
      notificationStore.info(t('fileBrowser.zipping', { name: sourceName }))
      await sendZipCommand(beaconid.value, sourcePath, zipPath, overwrite, includeRoot)
      notificationStore.success(t('fileBrowser.zipQueued', { name: sourceName }))
      closeZipDialog()
    } catch (err) {
      notificationStore.error(t('fileBrowser.zipFailed', { message: errorMessage(err) }))
    }
  }

  // ─── 新建目录 ───

  async function handleMkdir(): Promise<void> {
    const target = activeMenuTarget.value
    const basePath = target?.type === 'folder'
      ? (target.file?.path || currentPath.value)
      : (target?.path || currentPath.value)

    closeMenu()

    if (!basePath) {
      notificationStore.error(t('fileBrowser.needTargetDirForMkdir'))
      return
    }

    const folderName = await modalStore.showPrompt({
      title: t('fileBrowser.mkdirTitle'),
      message: t('fileBrowser.mkdirMessage', { path: basePath }),
      placeholder: t('fileBrowser.mkdirPlaceholder'),
      defaultValue: 'New Folder'
    })

    if (!folderName || !folderName.trim()) return

    const fullPath = joinPaths(basePath, folderName.trim())

    try {
      notificationStore.info(t('fileBrowser.mkdirSending', { name: folderName }))
      await sendMkdirCommand(beaconid.value, fullPath)
      notificationStore.success(t('fileBrowser.mkdirQueued', { name: folderName }))
    } catch (err) {
      notificationStore.error(t('fileBrowser.mkdirFailed', { message: errorMessage(err) }))
    }
  }

  // ─── 属性修改 ───

  function openAttributeDialog(target: FileMenuTarget): void {
    if (!target?.file || !target.file.path) {
      notificationStore.error(t('fileBrowser.attrNoTarget'))
      return
    }
    closeMenu()
    attributeDialogTarget.value = target
    attributeDialogVisible.value = true
  }

  function closeAttributeDialog(): void {
    attributeDialogVisible.value = false
    attributeDialogTarget.value = null
  }

  async function handleAttributeSubmit(args: unknown[]): Promise<void> {
    const targetName = attributeDialogTarget.value?.file?.name || t('fileBrowser.attrTargetFile')
    try {
      notificationStore.info(t('fileBrowser.attrSending', { name: targetName }))
      await sendSetAttrCommand(beaconid.value, args)
      notificationStore.success(t('fileBrowser.attrQueued', { name: targetName }))
      closeAttributeDialog()
    } catch (err) {
      notificationStore.error(t('fileBrowser.attrFailed', { message: errorMessage(err) }))
    }
  }

  // ─── 压缩对话框 ───

  function openZipDialog(target: FileMenuTarget): void {
    if (!target?.file || !target.file.path) {
      notificationStore.error(t('fileBrowser.zipNoTarget'))
      return
    }
    closeMenu()
    zipDialogTarget.value = target
    zipDialogVisible.value = true
  }

  function closeZipDialog(): void {
    zipDialogVisible.value = false
    zipDialogTarget.value = null
  }

  // ─── 执行 ───

  function handleExecute(target: FileMenuTarget): void {
    if (target?.type !== 'file' || !target.file?.path) {
      notificationStore.error(t('fileBrowser.executeNoTarget'))
      return
    }
    const cwd = resolveExecuteCwd(currentPath.value, target.file.path, isWindows.value)
    if (!cwd) {
      notificationStore.error(t('fileBrowser.executeNeedCwd'))
      return
    }
    closeMenu()
    executeDialogTarget.value = target
    executeCwd.value = cwd
    executeDialogVisible.value = true
  }

  function closeExecuteDialog(): void {
    executeDialogVisible.value = false
    executeDialogTarget.value = null
    executeCwd.value = ''
  }

  async function handleExecuteSubmit(rawArgs: string): Promise<void> {
    const file = executeDialogTarget.value?.file
    if (!file?.path) {
      notificationStore.error(t('fileBrowser.executeNoTarget'))
      return
    }
    const cwd = executeCwd.value || resolveExecuteCwd(currentPath.value, file.path, isWindows.value)
    if (!cwd) {
      notificationStore.error(t('fileBrowser.executeNeedCwd'))
      return
    }
    const cmd = buildExecuteShellCommand({
      isWindows: isWindows.value,
      cwd,
      filePath: file.path,
      args: rawArgs,
    })
    const displayName = file.name || file.path
    closeExecuteDialog()

    try {
      consoleStore.openConsole(beaconid.value)
      await consoleStore.sendCommand(beaconid.value, COMMAND_ID.SHELL, [cmd], `shell ${cmd}`)
      notificationStore.success(t('fileBrowser.executeQueued', { name: displayName }))
    } catch (err) {
      notificationStore.error(t('fileBrowser.executeFailed', { message: errorMessage(err) }))
    }
  }

  return {
    // 上传
    uploadInputRef,
    isUploading,
    triggerUpload,
    handleUploadFile,
    handleDropUpload,
    handleDroppedFilePaths,
    // 下载
    handleDownload,
    // 预览
    handlePreview,
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
    // 执行
    handleExecute,
    handleExecuteSubmit,
    closeExecuteDialog,
    executeDialogVisible,
    executeDialogTarget,
    executeCwd,
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
