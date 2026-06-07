<script setup>
/**
 * FileBrowserModal - 文件浏览器主组件
 * 提供远程文件系统的目录导航、文件列表展示、右键菜单操作
 * （下载/上传/删除/压缩/属性修改）、传输进度监控等功能。
 */

import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useAgentStore } from '../../stores/agent.js'
import { useModalStore } from '../../stores/modal.js'
import { useExplorerStore, normalizePathKey, joinPaths } from '../../stores/explorer.js'
import { useModalDragResize } from '../../composables/useModalDragResize.js'
import { useFileTransferStore } from '../../stores/fileTransfer.js'
import { useNotificationStore } from '../../stores/notification.js'
import {
  sendCopyFileCommand,
  sendDownloadCommand,
  sendMkdirCommand,
  sendMoveFileCommand,
  sendRemoveFileCommand,
  sendSetAttrCommand,
  sendUploadCommand,
  sendZipCommand,
} from '../../features/beacon/actions/beaconCommandActions.js'
import { uploadFile } from '../../features/files/api/fileApi.js'
import FileAttributeDialog from './FileAttributeDialog.vue'
import FileZipDialog from './FileZipDialog.vue'

const agentStore = useAgentStore()
const modalStore = useModalStore()
const explorerStore = useExplorerStore()
const fileTransferStore = useFileTransferStore()
const notificationStore = useNotificationStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, required: true }
})

const emit = defineEmits(['close'])

const searchQuery = ref('')
const errorMsg = ref('')
const currentPath = ref('')
const uploadInputRef = ref(null)
const uploadTarget = ref(null)
const isUploading = ref(false)
const downloadCooldowns = ref(new Map()) // [新增] 用于存储各文件的下载冷却时间

// [新增] 用于控制行菜单显示的状态与坐标
const activeMenuTarget = ref(null)
const menuPos = ref({ x: 0, y: 0 })
const menuRef = ref(null)
const MENU_WIDTH = 168
const MENU_HEIGHT = 286

const attributeDialogVisible = ref(false)
const attributeDialogTarget = ref(null)
const zipDialogVisible = ref(false)
const zipDialogTarget = ref(null)

// [新增] 窗口定位与尺寸状态
const {
  winPos, winSize, isDragging, isResizing, resizeType,
  initWindowPosition, startDrag, startResize, stopDrag, stopResize,
} = useModalDragResize({
  defaultWidth: 900, defaultHeight: 800,
  minWidth: 600, minHeight: 400,
})

function placeMenu(x, y) {
  let nextX = x
  let nextY = y

  if (nextX + MENU_WIDTH > window.innerWidth) nextX -= MENU_WIDTH
  if (nextY + MENU_HEIGHT > window.innerHeight) nextY -= MENU_HEIGHT

  menuPos.value = {
    x: Math.max(10, nextX),
    y: Math.max(10, nextY)
  }
}

function handleMenuAction(action) {
  if (!activeMenuTarget.value) return
  
  switch (action) {
    case 'download':
      handleDownload(activeMenuTarget.value)
      break
    case 'zip':
      handleZip(activeMenuTarget.value)
      break
    case 'upload':
      triggerUpload(activeMenuTarget.value)
      break
    case 'delete':
      handleDelete(activeMenuTarget.value)
      break
    case 'mkdir':
      handleMkdir()
      break
    case 'setattr':
      openAttributeDialog(activeMenuTarget.value)
      break
    case 'refresh':
      loadDirectory(currentPath.value, true)
      break
  }
}

function closeMenu() {
  activeMenuTarget.value = null
}

function openMenu(target, x, y) {
  activeMenuTarget.value = target
  placeMenu(x, y)
  nextTick(adjustMenuPosition)
}

function adjustMenuPosition() {
  if (!menuRef.value) return
  const rect = menuRef.value.getBoundingClientRect()
  const padding = 10
  let nextX = menuPos.value.x
  let nextY = menuPos.value.y

  if (rect.right > window.innerWidth - padding) {
    nextX -= rect.right - (window.innerWidth - padding)
  }
  if (rect.bottom > window.innerHeight - padding) {
    nextY -= rect.bottom - (window.innerHeight - padding)
  }

  menuPos.value = {
    x: Math.max(padding, nextX),
    y: Math.max(padding, nextY),
  }
}

function getMenuTarget(file) {
  if (!file) {
    return {
      type: 'blank',
      path: currentPath.value || '',
    }
  }

  return {
    type: file.is_dir ? 'folder' : 'file',
    file,
  }
}

// [新增] 切换菜单显示逻辑
function toggleMenu(file, event) {
  if (event) event.stopPropagation()
  if (activeMenuTarget.value?.file?.path === file.path) {
    closeMenu()
    return
  }

  if (event?.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect()
    openMenu(getMenuTarget(file), rect.right - MENU_WIDTH, rect.bottom + 8)
  }
}

// [新增] 右键行处理逻辑 (改位跟手模式)
function onRowContextMenu(file, event) {
  event.preventDefault()
  event.stopPropagation()
  openMenu(getMenuTarget(file), event.clientX, event.clientY)
}

function onContainerContextMenu(event) {
  event.preventDefault()
  event.stopPropagation()
  if (event.target.closest('.file-row')) return
  openMenu(getMenuTarget(null), event.clientX, event.clientY)
}

function triggerUpload(target = activeMenuTarget.value) {
  uploadTarget.value = target || getMenuTarget(null)
  closeMenu()
  uploadInputRef.value?.click()
}

function buildCopyName(file) {
  const name = String(file?.name || '').trim()
  if (!name) return 'Copy'
  if (file?.is_dir) return `${name}_copy`

  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return `${name}_copy`
  return `${name.slice(0, dotIndex)}_copy${name.slice(dotIndex)}`
}

function resolveDestinationPath(basePath, inputPath) {
  const trimmed = String(inputPath || '').trim()
  if (!trimmed) return ''
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed) || trimmed.startsWith('/')) {
    return normalizePathKey(trimmed)
  }
  return joinPaths(basePath, trimmed)
}

function openAttributeDialog(target) {
  if (!target?.file || !target.file.path) {
    notificationStore.error('未找到可修改属性的目标路径')
    return
  }
  closeMenu()
  attributeDialogTarget.value = target
  attributeDialogVisible.value = true
}

function openZipDialog(target) {
  if (!target?.file || !target.file.path) {
    notificationStore.error('未找到可压缩的目标路径')
    return
  }
  closeMenu()
  zipDialogTarget.value = target
  zipDialogVisible.value = true
}

function closeAttributeDialog() {
  attributeDialogVisible.value = false
  attributeDialogTarget.value = null
}

function closeZipDialog() {
  zipDialogVisible.value = false
  zipDialogTarget.value = null
}

async function handleAttributeSubmit(args) {
  const targetName = attributeDialogTarget.value?.file?.name || '目标文件'
  try {
    notificationStore.info(`正在下发属性修改任务: ${targetName}`)
    await sendSetAttrCommand(props.beaconid, args)
    notificationStore.success(`属性修改任务已提交: ${targetName}`)
    closeAttributeDialog()
    await new Promise(resolve => setTimeout(resolve, 300))
    await loadDirectory(currentPath.value, true)
  } catch (err) {
    notificationStore.error(`属性修改失败: ${err.message || err}`)
  }
}

async function handleZipSubmit({ sourcePath, zipPath, overwrite, includeRoot }) {
  const sourceName = zipDialogTarget.value?.file?.name || sourcePath
  try {
    notificationStore.info(`正在下发压缩任务: ${sourceName}`)
    await sendZipCommand(props.beaconid, sourcePath, zipPath, overwrite, includeRoot)
    notificationStore.success(`压缩任务已提交: ${sourceName}`)
    closeZipDialog()
  } catch (err) {
    notificationStore.error(`压缩任务下发失败: ${err.message || err}`)
  }
}

async function handleDownload(file) {
  if (!file || file.is_dir) return

  // [锁定机制] 改为 5 秒时间防抖锁定
  const cooldownKey = `${props.beaconid}:${file.path}`
  const now = Date.now()
  const lastTime = downloadCooldowns.value.get(cooldownKey) || 0
  
  if (now - lastTime < 5000) {
    const remaining = Math.ceil((5000 - (now - lastTime)) / 1000)
    notificationStore.info(`操作太快，请 ${remaining} 秒后再试: ${file.name}`)
    closeMenu()
    return
  }

  // 更新最后点击时间
  downloadCooldowns.value.set(cooldownKey, now)

  try {
    const result = await sendDownloadCommand(props.beaconid, file.path, 524288, 3)
    fileTransferStore.startDownload({
      beaconid: props.beaconid,
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

async function handleDelete(target) {
  const file = target?.file
  if (!file) return
  
  // 关键修复：在弹出确认框前先关闭右键菜单，防止 UI 遮挡
  closeMenu()

  const confirmed = await modalStore.showConfirm({
    title: `确认删除${file.is_dir ? '目录' : '文件'}`,
    message: `你确定要删除 [${file.name}] 吗？\n警告：此操作不可撤销且会物理抹除数据。`,
    type: 'danger'
  })

  if (!confirmed) return

  try {
    notificationStore.info(`正在下发删除指令: ${file.name}`)
    await sendRemoveFileCommand(props.beaconid, file.path)
    notificationStore.success(`删除任务已提交: ${file.name}`)
  } catch (err) {
    notificationStore.error(`删除指令发送失败: ${err.message || err}`)
  }
}

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
    await sendFileCommand(props.beaconid, file.path, destinationPath)
    notificationStore.success(`${isMove ? '移动' : '复制'}任务已提交: ${file.name}`)
    await new Promise(resolve => setTimeout(resolve, 300))
    await loadDirectory(basePath, true)
  } catch (err) {
    notificationStore.error(`${isMove ? '移动' : '复制'}指令发送失败: ${err.message || err}`)
  }
}

async function handleZip(target) {
  openZipDialog(target)
}

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
    await sendMkdirCommand(props.beaconid, fullPath)
    notificationStore.success(`创建任务已提交: ${folderName}`)
    await new Promise(resolve => setTimeout(resolve, 300))
    await loadDirectory(basePath, true)
  } catch (err) {
    notificationStore.error(`创建指令发送失败: ${err.message || err}`)
  }
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
  const cooldownKey = `upload:${props.beaconid}:${remotePath}`
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

    // 第二阶段：下发任务给端 (对齐契约：args[0]=file_id, args[1]=remote_path, args[2]=chunk_size)
    const result = await sendUploadCommand(props.beaconid, fileId, remotePath, 524288)

    // 注册上传进度追踪
    fileTransferStore.startUpload({
      beaconid: props.beaconid,
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

const handleDocumentClick = () => closeMenu()

onMounted(() => {
  initWindowPosition()
  window.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  window.removeEventListener('click', handleDocumentClick)
  stopDrag()
  stopResize()
})

// 当前路径的缓存节点
const currentNode = computed(() => {
  return explorerStore.getCacheNode(props.beaconid, currentPath.value)
})

// 响应式获取当前目录的文件列表
const files = computed(() => currentNode.value?.items || [])
const activeTransfers = computed(() => {
  return fileTransferStore.getTransfers(props.beaconid)
})
const targetAgent = computed(() => agentStore.getAgentById(props.beaconid))
const isWindowsTarget = computed(() => String(targetAgent.value?.os || '').toLowerCase().includes('windows'))
const rootShortcutLabel = computed(() => isWindowsTarget.value ? '我的电脑' : '当前目录')
const pathPlaceholder = computed(() => isWindowsTarget.value ? '输入路径回车...' : '输入绝对路径回车，例如 /etc')
const emptyStateText = computed(() => (
  isWindowsTarget.value
    ? '请在上方输入路径或选择盘符开始预览'
    : '请在上方输入绝对路径，或点击当前目录开始预览'
))
const workingDirectory = computed(() => explorerStore.workingDirectories[props.beaconid] || '')
const rootShortcutActive = computed(() => {
  if (isWindowsTarget.value) return currentPath.value === ''
  return normalizePathKey(currentPath.value) === normalizePathKey(workingDirectory.value)
})

// 正在全局加载中的状态 (用于显示主 Loading)
const isGlobalLoading = computed(() => explorerStore.isPathLoading(props.beaconid, currentPath.value))

// 获取路径错误 (Store 级别)
const storeErrorMsg = computed(() => currentNode.value?.errorMessage || '')

// 响应式获取可用盘符
const drives = computed(() => explorerStore.drives[props.beaconid] || [])

/**
 * 是否已经尝试加载过该路径 (无论成功失败)
 */
const hasCache = computed(() => {
  const node = explorerStore.getCacheNode(props.beaconid, currentPath.value)
  return !!(node && node.isLoaded)
})

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k))
  return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化日期 (Unix 毫秒级时间戳)
function formatDate(timestamp) {
  if (!timestamp || timestamp === 0) return '-'
  const numeric = Number(timestamp)
  if (!Number.isFinite(numeric)) return '-'
  const d = new Date(numeric < 1e12 ? numeric * 1000 : numeric)
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

/**
 * 加载目录核心逻辑 (现在委托给 explorerStore 实现归一化调用)
 */
async function loadDirectory(path, force = false) {
  // 仅作为本地代理，同步当前 UI 路径并透传给 Store
  currentPath.value = normalizePathKey(path)
  errorMsg.value = ''
  await explorerStore.loadDirectory(props.beaconid, path, force)
}

// 处理控制台跳转
function navigateToPath() {
  if (currentPath.value && currentPath.value.trim() !== '') {
    loadDirectory(currentPath.value)
  }
}

// 处理强制刷新
function handleRefresh() {
  loadDirectory(currentPath.value, true)
}

// 处理行点击/双击
function handleDoubleClick(file) {
  if (file.is_dir) {
    const nextPath = file.path
      ? normalizePathKey(file.path)
      : joinPaths(currentPath.value, file.name)
    loadDirectory(nextPath)
  }
}

// 处理返回上级 (归一化逻辑)
function goUp() {
  const norm = normalizePathKey(currentPath.value)
  if (!norm || norm === '') return
  
  // Windows 下如果是 C:\ 这种根路径，则回到盘符列表
  if (/^[a-z]:\\$/.test(norm)) {
    loadDirectory('')
    return
  }

  if (norm === '/') {
    loadDirectory('')
    return
  }

  if (norm.startsWith('/')) {
    const parts = norm.split('/').filter(p => p !== '')
    if (parts.length <= 1) {
      loadDirectory('/')
    } else {
      parts.pop()
      loadDirectory(`/${parts.join('/')}`)
    }
    return
  }

  const parts = norm.split('\\').filter(p => p !== '')
  if (parts.length <= 1) {
    loadDirectory('')
  } else {
    parts.pop()
    loadDirectory(parts.join('\\'))
  }
}

// 初始化加载
onMounted(() => {
  if (props.visible && props.beaconid) {
    loadDirectory(currentPath.value || '')
  }
})

// 每次弹窗打开时重新居中
watch(() => props.visible, (val) => {
  if (val) {
    initWindowPosition()
    if (props.beaconid) {
      loadDirectory(currentPath.value || '')
    }
  }
})

// 监听并同步由 WebSocket 推送触发的路径变更
watch(() => explorerStore.uiCurrentPath[props.beaconid], (newPath) => {
  if (newPath !== undefined && normalizePathKey(newPath) !== normalizePathKey(currentPath.value)) {
    currentPath.value = newPath
  }
})
</script>

<template>
  <div v-if="visible" class="modal-overlay">
    <!-- 外层：坐标定位 + 拉伸手柄容器（overflow: visible） -->
    <div
      class="modal-window"
      :style="{
        left: winPos.x + 'px',
        top: winPos.y + 'px',
        width: winSize.w + 'px',
        height: winSize.h + 'px'
      }"
      :class="{ 'is-dragging': isDragging }"
    >
      <!-- 八向拉伸手柄 -->
      <div class="resize-handle resizer-n" @mousedown="startResize('n', $event)"></div>
      <div class="resize-handle resizer-s" @mousedown="startResize('s', $event)"></div>
      <div class="resize-handle resizer-e" @mousedown="startResize('e', $event)"></div>
      <div class="resize-handle resizer-w" @mousedown="startResize('w', $event)"></div>
      <div class="resize-handle resizer-nw" @mousedown="startResize('nw', $event)"></div>
      <div class="resize-handle resizer-ne" @mousedown="startResize('ne', $event)"></div>
      <div class="resize-handle resizer-sw" @mousedown="startResize('sw', $event)"></div>
      <div class="resize-handle resizer-se" @mousedown="startResize('se', $event)"></div>

      <!-- 内层：视觉内容（overflow: hidden） -->
      <div class="file-browser-modal">
      <div class="modal-title" @mousedown="startDrag">
        <div class="title-left">
          <span class="icon">📁</span>
          <span>文件浏览器 - {{ agentStore.getAgentById(beaconid)?.beaconid.substring(0, 8) }}@{{ agentStore.getAgentById(beaconid)?.hostname || beaconid.substring(0, 8) }}</span>
        </div>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>

      <!-- 导航栏 -->
      <input
        ref="uploadInputRef"
        type="file"
        class="hidden-file-input"
        @change="handleUploadFile"
      />

      <div class="nav-bar">
        <button class="nav-action-btn" @click="goUp" title="返回上一级" :disabled="isGlobalLoading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="path-input-wrapper">
          <input 
            v-model="currentPath" 
            class="input path-input" 
            @keyup.enter="navigateToPath"
            :placeholder="pathPlaceholder"
            :disabled="isGlobalLoading"
          />
        </div>
        <button class="nav-action-btn primary" @click="navigateToPath" :disabled="isGlobalLoading" title="跳转">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M21 12l-6-6M21 12l-6 6"/>
          </svg>
        </button>
        <button 
          class="nav-action-btn refresh" 
          :class="{ spinning: isGlobalLoading }" 
          @click="handleRefresh" 
          title="强制刷新 (绕过缓存)"
          :disabled="isGlobalLoading"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
      
      <!-- 全局操作栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="toolbar-btn" @click="handleMkdir()" :disabled="isGlobalLoading || !currentPath" title="新建文件夹">
            <span class="toolbar-icon">📁+</span> 新建文件夹
          </button>
        </div>
        <div class="toolbar-right" v-if="files.length">
          <span class="info-tag">{{ files.length }} 个项目</span>
        </div>
      </div>

      <div class="main-layout">
        <!-- 侧边栏：快速访问 -->
        <div class="side-nav">
          <div class="nav-group">
            <div class="group-title">快捷入口</div>
            <div @click="loadDirectory('')" class="nav-item" :class="{ active: rootShortcutActive }">
              <span class="icon">💻</span> {{ rootShortcutLabel }}
            </div>
          </div>
          <div class="nav-group" v-if="isWindowsTarget && drives.length">
            <div class="group-title">磁盘驱动器</div>
            <div 
              v-for="drive in drives" 
              :key="drive" 
              @click="loadDirectory(drive)" 
              class="nav-item"
              :class="{ active: normalizePathKey(currentPath) === normalizePathKey(drive) }"
            >
              <span class="icon">💽</span> 本地磁盘 ({{ drive }})
            </div>
          </div>
        </div>

        <!-- 文件列表区域 -->
        <div class="file-list-container" @contextmenu="onContainerContextMenu">
          <div v-if="isGlobalLoading && !files.length" class="loading-state">
            <div class="spinner"></div>
            <span>正在检索文件系统...</span>
          </div>
          <div v-else-if="errorMsg || storeErrorMsg" class="error-state">
            <span>❌ {{ errorMsg || storeErrorMsg }}</span>
          </div>
          <div v-else-if="hasCache && files.length === 0" class="empty-state">
            <span class="icon">📭</span>
            <span>该目录为空</span>
          </div>
          <div v-else-if="!hasCache && !isGlobalLoading" class="empty-state">
            <span>{{ emptyStateText }}</span>
          </div>
        <table v-else class="file-table">
          <thead>
            <tr>
              <th width="40"></th>
              <th>名称</th>
              <th width="100">大小</th>
              <th width="180">修改日期</th>
              <th width="50" style="text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="file in files" 
              :key="file.path" 
              @dblclick="handleDoubleClick(file)"
              @contextmenu.prevent="onRowContextMenu(file, $event)"
              class="file-row"
              :class="{ 'menu-active': activeMenuTarget?.file?.path === file.path }"
            >
              <td class="icon-cell">
                <span v-if="file.is_dir">🗂️</span>
                <span v-else>📄</span>
              </td>
              <td class="name-cell">
                <span
                  class="copyable-name"
                  :title="file.name"
                  @click.stop
                  @dblclick.stop
                >
                  {{ file.name }}
                </span>
              </td>
              <td class="size-cell">{{ file.is_dir ? '-' : formatSize(file.size) }}</td>
              <td class="date-cell">{{ formatDate(file.mod_time) }}</td>
              <td class="action-cell">
                <div class="action-wrapper">
                  <button class="row-action-btn" @click.stop="toggleMenu(file, $event)" title="更多操作">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="12" cy="5" r="1"/>
                      <circle cx="12" cy="12" r="1"/>
                      <circle cx="12" cy="19" r="1"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 传输监控底部状态栏 (极致压缩版) -->
      <div v-if="activeTransfers.length" class="transfer-panel-compact shadow-lg">
        <div class="transfer-compact-header">
          <span class="title">传输监控</span>
          <span class="count">{{ activeTransfers.length }} 个任务进行中</span>
        </div>
        <div class="transfer-compact-list">
          <div
            v-for="transfer in activeTransfers"
            :key="transfer.taskId"
            class="compact-item"
            :class="[transfer.status, transfer.direction]"
          >
            <div class="item-main">
              <span class="icon">{{ transfer.direction === 'upload' ? '📤' : '📥' }}</span>
              <span class="name" :title="transfer.remotePath">{{ transfer.fileName || transfer.remotePath }}</span>
              <span class="status-text">{{ transfer.status === 'completed' ? '完成' : transfer.status === 'error' ? '失败' : transfer.progress + '%' }}</span>
            </div>
            <div class="item-progress">
              <div class="progress-fill" :style="{ width: transfer.progress + '%' }"></div>
            </div>
            <div class="item-side">
              <span v-if="transfer.size > 0" class="bytes">{{ formatSize(transfer.receivedBytes || 0) }}/{{ formatSize(transfer.size) }}</span>
              <span class="chunks">{{ transfer.receivedChunks }}/{{ transfer.totalChunks }} chks</span>
            </div>
            <div v-if="transfer.error" class="error-msg" :title="transfer.error">
              <i class="fas fa-exclamation-circle"></i>
            </div>
          </div>
        </div>
      </div>
      </div> <!-- /main-layout -->
      </div> <!-- /file-browser-modal -->

      <!-- [新增] 磨砂玻璃弹出菜单 (全局定位版) -->
      <Teleport to="body">
        <Transition name="fade-scale">
          <div 
            v-if="activeMenuTarget" 
            class="glass-menu"
            ref="menuRef"
            :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
            @click.stop
          >
            <div
              v-if="activeMenuTarget.type !== 'file'"
              class="menu-item"
              :class="{ disabled: isUploading }"
              @click="!isUploading && triggerUpload(activeMenuTarget)"
            >
              <span class="m-icon">📤</span> {{ isUploading ? '上传中...' : '上传' }}
            </div>
            <div
              v-if="activeMenuTarget.type === 'blank'"
              class="menu-item"
              @click="handleMkdir()"
            >
              <span class="m-icon">📁</span> 创建文件夹
            </div>
            <div v-if="activeMenuTarget.type === 'file'" class="menu-item" @click="handleDownload(activeMenuTarget.file)"><span class="m-icon">📥</span> 下载</div>
            <template v-if="activeMenuTarget.type !== 'blank'">
              <div class="menu-item" @click="handleZip(activeMenuTarget)"><span class="m-icon">🗜️</span> 压缩为 ZIP</div>
              <div class="menu-item" @click="handleMoveCopy('move', activeMenuTarget)"><span class="m-icon">✂️</span> 移动</div>
              <div class="menu-item" @click="handleMoveCopy('copy', activeMenuTarget)"><span class="m-icon">📋</span> 复制</div>
              <div class="menu-item" @click="openAttributeDialog(activeMenuTarget)"><span class="m-icon">🛠️</span> 修改属性</div>
              <div class="menu-divider"></div>
              <div class="menu-item delete" @click="handleDelete(activeMenuTarget)">
                <span class="m-icon">🗑️</span> 删除
              </div>
            </template>
          </div>
        </Transition>
      </Teleport>

      <FileZipDialog
        :visible="zipDialogVisible"
        :target="zipDialogTarget"
        @close="closeZipDialog"
        @submit="handleZipSubmit"
      />

      <FileAttributeDialog
        :visible="attributeDialogVisible"
        :target="attributeDialogTarget"
        :is-windows-target="isWindowsTarget"
        @close="closeAttributeDialog"
        @submit="handleAttributeSubmit"
      />
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  z-index: 2000;
  animation: fadeIn 0.3s ease-out;
  pointer-events: auto;
}

.modal-window {
  position: fixed;
  z-index: 2001;
}

.file-browser-modal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, var(--glass-highlight), rgba(255, 255, 255, 0.10) 38%, rgba(255, 255, 255, 0.04)),
    radial-gradient(var(--glass-grain) 0.5px, transparent 0.5px),
    var(--glass-modal-bg);
  background-size: auto, 3px 3px, auto;
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(155%);
  border-radius: 20px;
  border: 1px solid var(--glass-border-strong);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  transition: opacity 0.2s;
  user-select: none;
}

.modal-window.is-dragging .file-browser-modal {
  opacity: 0.9;
}
.modal-window.is-dragging .modal-title {
  cursor: grabbing !important;
}

/* 模拟液态流动背景 */
.file-browser-modal::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
              radial-gradient(circle at 70% 70%, rgba(168, 85, 247, 0.05) 0%, transparent 40%);
  pointer-events: none;
  z-index: -1;
}

.modal-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.4);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  cursor: grab;
  user-select: none;
}

.modal-title:active {
  cursor: grabbing;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  font-size: 16px;
  color: #1e293b;
  letter-spacing: -0.02em;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  color: #64748b;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  transform: rotate(90deg);
}

.nav-bar {
  display: flex;
  gap: 12px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.2);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  align-items: center;
}

.path-input-wrapper {
  flex: 1;
}

.path-input {
  width: 100%;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  padding: 10px 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  color: #334155;
  transition: all 0.2s;
}

.path-input:focus {
  outline: none;
  border-color: #6366f1;
  background: rgba(255, 255, 255, 0.9);
  outline: 3px solid rgba(99, 102, 241, 0.1);
}

.nav-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.8);
  color: #475569;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-action-btn:hover:not(:disabled) {
  background: #f8fafc;
  transform: translateY(-2px);
  color: #6366f1;
}

.nav-action-btn.primary {
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  color: white;
  border: none;
}

.nav-action-btn.primary:hover:not(:disabled) {
  background: var(--color-primary-light);
}

.nav-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
}

.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.side-nav {
  width: 240px;
  background: rgba(255, 255, 255, 0.3);
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.nav-group {
  display: flex;
  flex-direction: column;
}

.group-title {
  padding: 0 24px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  font-weight: 800;
}

.nav-item {
  padding: 10px 24px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s;
  position: relative;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.5);
  color: #6366f1;
}

.nav-item.active {
  background: white;
  color: #6366f1;
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 4px;
  background: #6366f1;
  border-radius: 0 4px 4px 0;
}

.file-list-container {
  flex: 1;
  overflow-y: auto;
  position: relative;
  padding: 10px 0;
}

.file-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.file-table th {
  position: sticky;
  top: -10px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  padding: 14px 20px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  z-index: 20;
}

.file-row {
  cursor: pointer;
  transition: all 0.2s;
}

.file-row:hover {
  background: rgba(255, 255, 255, 0.6);
}

.file-table td {
  padding: 12px 20px;
  font-size: 13px;
  color: #1e293b;
  border-bottom: 1px solid rgba(0, 0, 0, 0.02);
}

.icon-cell {
  width: 48px;
  text-align: center;
  font-size: 20px;
}

.name-cell {
  font-weight: 500;
}

.copyable-name {
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.size-cell, .date-cell {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #64748b;
}

.action-cell {
  text-align: center;
  padding: 0 !important;
}

.row-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.row-action-btn:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(99, 102, 241, 0.2);
  color: #6366f1;
  transform: translateY(-1px);
}

.row-action-btn:active {
  transform: translateY(0);
}

/* [新增] 全局操作栏样式 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 20px;
  background: rgba(255, 255, 255, 0.62);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.hidden-file-input {
  display: none;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: #475569;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover:not(:disabled) {
  background: white;
  color: #6366f1;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-icon {
  font-size: 14px;
}

.info-tag {
  font-size: 12px;
  color: #94a3b8;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 20px;
}

.transfer-panel {
  padding: 10px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.14);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transfer-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.transfer-item {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 280px) 110px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.45);
}

.transfer-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.transfer-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #334155;
  font-weight: 500;
}

.transfer-status {
  flex-shrink: 0;
  font-size: 11px;
  color: #64748b;
}

.transfer-progress {
  height: 8px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.08);
}

.transfer-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: #6366f1;
  transition: width 0.2s ease;
}

.transfer-item.completed .transfer-progress-bar {
  background: #10b981;
}

.transfer-item.error .transfer-progress-bar {
  background: #ef4444;
}

.transfer-detail {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.transfer-error {
  grid-column: 1 / -1;
  color: #ef4444;
  font-size: 12px;
}

/* [新增] 操作菜单定位与样式 */
.glass-menu {
  position: fixed;
  width: 168px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(15px);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 8px;
  z-index: 10000;
}

/* 缩放手柄系统 */
.resize-handle {
  position: absolute;
  z-index: 1000;
  background: transparent;
}

/* 四边 */
.resizer-n { top: -5px; left: 0; right: 0; height: 10px; cursor: n-resize; }
.resizer-s { bottom: -5px; left: 0; right: 0; height: 10px; cursor: s-resize; }
.resizer-e { top: 0; right: -5px; bottom: 0; width: 10px; cursor: e-resize; }
.resizer-w { top: 0; left: -5px; bottom: 0; width: 10px; cursor: w-resize; }

/* 四角 */
.resizer-nw { top: -8px; left: -8px; width: 16px; height: 16px; cursor: nw-resize; z-index: 1001; }
.resizer-ne { top: -8px; right: -8px; width: 16px; height: 16px; cursor: ne-resize; z-index: 1001; }
.resizer-sw { bottom: -8px; left: -8px; width: 16px; height: 16px; cursor: sw-resize; z-index: 1001; }
.resizer-se { bottom: -2px; right: -2px; width: 24px; height: 24px; cursor: nwse-resize; z-index: 1001;
  background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.05) 100%);
  border-radius: 0 0 12px 0;
}

.resizer-se:hover {
  background: linear-gradient(135deg, transparent 50%, #6366f1 50%, #6366f1 100%);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.menu-item:hover {
  background: #f1f5f9;
  color: #6366f1;
}

.menu-item.delete:hover {
  background: #fef2f2;
  color: #ef4444;
}

.menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.05);
  margin: 4px 0;
}

.m-icon {
  font-size: 14px;
}

/* [新增] 动效 */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-10px);
}

.loading-state, .empty-state, .error-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  color: #64748b;
  z-index: 10;
}

.error-state {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.02);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(99, 102, 241, 0.1);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 滚动条美化 */
.file-list-container::-webkit-scrollbar,
.side-nav::-webkit-scrollbar {
  width: 6px;
}

.file-list-container::-webkit-scrollbar-track,
.side-nav::-webkit-scrollbar-track {
  background: transparent;
}

.file-list-container::-webkit-scrollbar-thumb,
.side-nav::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}

.file-list-container::-webkit-scrollbar-thumb:hover,
.side-nav::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.18);
}
/* 极致压缩传输面板 (底部固定样式) */
.transfer-panel-compact {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  z-index: 100;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.9);
}

.transfer-compact-header {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 15px;
  background: var(--bg-secondary);
  font-size: 11px;
  font-weight: 600;
  opacity: 0.8;
  border-bottom: 1px solid var(--border-color);
}

.transfer-compact-list {
  max-height: 100px;
  overflow-y: auto;
}

.compact-item {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 15px;
  gap: 15px;
  border-bottom: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.compact-item:last-child {
  border-bottom: none;
}

.compact-item .item-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
  z-index: 2;
}

.compact-item .name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
  font-weight: 500;
}

.compact-item .status-text {
  font-size: 10px;
  opacity: 0.6;
  font-weight: 600;
}

.compact-item .item-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: rgba(0, 0, 0, 0.05);
  z-index: 1;
}

.compact-item .progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.3s ease;
}

.compact-item.upload .progress-fill {
  background: #722ed1; /* 上传用紫色 */
}

.compact-item.download .progress-fill {
  background: #1890ff; /* 下载用蓝色 */
}

.compact-item.completed .progress-fill {
  background: #52c41a;
}

.compact-item.error .progress-fill {
  background: #ff4d4f;
}

.compact-item .item-side {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  opacity: 0.7;
  z-index: 2;
}

.compact-item .error-msg {
  color: #ff4d4f;
  font-size: 14px;
  z-index: 2;
}

.compact-item.error {
  background: rgba(255, 77, 79, 0.03);
}

/* 调整 modal-body 留白，防止底部被遮挡 */
.modal-body {
  padding-bottom: 34px; /* 给一个默认传输项留出位置 */
}

:global(html[data-ui-theme="dark"] .file-browser-modal){
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.04) 42%, rgba(2, 6, 23, 0.02)),
    radial-gradient(rgba(255, 255, 255, 0.06) 0.5px, transparent 0.5px),
    rgba(15, 23, 42, 0.94);
  background-size: auto, 3px 3px, auto;
  border-color: rgba(148, 163, 184, 0.22);
  color: #e5e7eb;
}

:global(html[data-ui-theme="dark"] .file-browser-modal::before){
  opacity: 0.55;
}

:global(html[data-ui-theme="dark"] .modal-title),
:global(html[data-ui-theme="dark"] .nav-bar),
:global(html[data-ui-theme="dark"] .toolbar){
  background: rgba(15, 23, 42, 0.82);
  border-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .title-left){
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .close-btn),
:global(html[data-ui-theme="dark"] .nav-action-btn),
:global(html[data-ui-theme="dark"] .toolbar-btn){
  background: rgba(30, 41, 59, 0.82);
  border-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .close-btn:hover){
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .nav-action-btn:hover:not(:disabled)),
:global(html[data-ui-theme="dark"] .toolbar-btn:hover:not(:disabled)){
  background: rgba(51, 65, 85, 0.92);
  color: #c7d2fe;
}

:global(html[data-ui-theme="dark"] .nav-action-btn.primary){
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
}

:global(html[data-ui-theme="dark"] .path-input){
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .path-input::placeholder){
  color: #94a3b8;
  opacity: 1;
}

:global(html[data-ui-theme="dark"] .path-input:focus){
  background: rgba(15, 23, 42, 1);
  border-color: rgba(129, 140, 248, 0.62);
  outline-color: rgba(129, 140, 248, 0.18);
}

:global(html[data-ui-theme="dark"] .side-nav){
  background: rgba(15, 23, 42, 0.68);
  border-right-color: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .group-title),
:global(html[data-ui-theme="dark"] .info-tag){
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .nav-item){
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .nav-item:hover){
  background: rgba(129, 140, 248, 0.12);
  color: #c7d2fe;
}

:global(html[data-ui-theme="dark"] .nav-item.active){
  background: rgba(129, 140, 248, 0.18);
  color: #e0e7ff;
}

:global(html[data-ui-theme="dark"] .file-list-container){
  background: rgba(15, 23, 42, 0.34);
}

:global(html[data-ui-theme="dark"] .file-table th){
  background: rgba(15, 23, 42, 0.96);
  border-bottom-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .file-table td){
  color: #e5e7eb;
  border-bottom-color: rgba(148, 163, 184, 0.08);
}

:global(html[data-ui-theme="dark"] .size-cell),
:global(html[data-ui-theme="dark"] .date-cell){
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .file-row:hover),
:global(html[data-ui-theme="dark"] .file-row.menu-active){
  background: rgba(129, 140, 248, 0.14);
}

:global(html[data-ui-theme="dark"] .row-action-btn){
  color: #94a3b8;
}

:global(html[data-ui-theme="dark"] .row-action-btn:hover){
  background: rgba(30, 41, 59, 0.92);
  border-color: rgba(129, 140, 248, 0.32);
  color: #c7d2fe;
}

:global(html[data-ui-theme="dark"] .loading-state),
:global(html[data-ui-theme="dark"] .empty-state){
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .error-state){
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
}

:global(html[data-ui-theme="dark"] .glass-menu){
  background: rgba(15, 23, 42, 0.94);
  border-color: rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

:global(html[data-ui-theme="dark"] .menu-item){
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .menu-item:hover){
  background: rgba(129, 140, 248, 0.14);
  color: #e0e7ff;
}

:global(html[data-ui-theme="dark"] .menu-item.delete:hover){
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .menu-divider){
  background: rgba(148, 163, 184, 0.14);
}

:global(html[data-ui-theme="dark"] .transfer-panel-compact){
  background: rgba(15, 23, 42, 0.94);
  border-top-color: rgba(148, 163, 184, 0.16);
  color: #e5e7eb;
}

:global(html[data-ui-theme="dark"] .transfer-compact-header){
  background: rgba(30, 41, 59, 0.82);
  border-bottom-color: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

:global(html[data-ui-theme="dark"] .compact-item){
  border-bottom-color: rgba(148, 163, 184, 0.1);
}

:global(html[data-ui-theme="dark"] .file-list-container::-webkit-scrollbar-thumb),
:global(html[data-ui-theme="dark"] .side-nav::-webkit-scrollbar-thumb){
  background: rgba(148, 163, 184, 0.26);
}

:global(html[data-ui-theme="dark"] .file-list-container::-webkit-scrollbar-thumb:hover),
:global(html[data-ui-theme="dark"] .side-nav::-webkit-scrollbar-thumb:hover){
  background: rgba(148, 163, 184, 0.42);
}
</style>
