<script setup>
/**
 * ProcessBrowserModal - 进程浏览器弹窗
 * 展示远程主机的进程列表，支持搜索、排序、
 * 右键菜单操作（终止进程、迁移注入等）。
 */

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agent.js'
import { useModalStore } from '../../stores/modal.js'
import { useNotificationStore } from '../../stores/notification.js'
import { useProcessBrowserStore } from '../../stores/processBrowser.js'
import { sendKillProcessCommand } from '../../features/beacon/actions/beaconCommandActions.js'
import {
  isWindowsBeacon,
  isX86ToX64Blocked,
  normalizeMigrateArch,
} from '../../features/beacon/migrate/migrateOptions.js'
import { useModalDragResize } from '../../composables/useModalDragResize.js'

const agentStore = useAgentStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const processStore = useProcessBrowserStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  beaconid: { type: String, required: true }
})

const emit = defineEmits(['close'])

const searchQuery = ref('')
const sortBy = ref('pid')
const sortDesc = ref(false)
const contextMenu = ref({ visible: false, x: 0, y: 0, process: null })
const contextMenuRef = ref(null)
const adjustedMenuX = ref(0)
const adjustedMenuY = ref(0)
const columnWidths = ref({
  pid: 88,
  ppid: 88,
  arch: 92,
  session: 100,
  user: 180,
  name: 220,
  path: 360,
})
const resizingColumn = ref('')
const resizeStart = ref({ x: 0, width: 0 })

const MIN_COLUMN_WIDTH = {
  pid: 72,
  ppid: 72,
  arch: 84,
  session: 88,
  user: 140,
  name: 160,
  path: 220,
}

const {
  winPos, winSize, isDragging, isResizing, resizeType,
  initWindowPosition, startResizeListener, stopResizeListener,
  startDrag, startResize, stopDrag, stopResize,
} = useModalDragResize({
  defaultWidth: 800, defaultHeight: 600,
  minWidth: 600, minHeight: 400,
  onBeforeDrag: () => closeContextMenu(),
  onBeforeResize: () => closeContextMenu(),
})

function startColumnResize(column, event) {
  event.preventDefault()
  event.stopPropagation()
  closeContextMenu()
  resizingColumn.value = column
  resizeStart.value = {
    x: event.clientX,
    width: columnWidths.value[column],
  }
  document.addEventListener('mousemove', handleColumnResize)
  document.addEventListener('mouseup', stopColumnResize)
}

function handleColumnResize(event) {
  if (!resizingColumn.value) return
  const column = resizingColumn.value
  const delta = event.clientX - resizeStart.value.x
  columnWidths.value[column] = Math.max(
    MIN_COLUMN_WIDTH[column] || 80,
    resizeStart.value.width + delta
  )
}

function stopColumnResize() {
  resizingColumn.value = ''
  document.removeEventListener('mousemove', handleColumnResize)
  document.removeEventListener('mouseup', stopColumnResize)
}

async function fetchProcesses() {
  if (!props.beaconid) return
  await processStore.requestProcesses(props.beaconid)
}

function handleSort(key) {
  if (sortBy.value === key) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = key
    sortDesc.value = false
  }
}

function compareValue(a, b) {
  if (sortBy.value === 'pid' || sortBy.value === 'ppid' || sortBy.value === 'session') {
    const left = parseInt(a[sortBy.value], 10) || 0
    const right = parseInt(b[sortBy.value], 10) || 0
    return left - right
  }

  return String(a[sortBy.value] || '').localeCompare(String(b[sortBy.value] || ''))
}

const loading = computed(() => processStore.isLoading(props.beaconid))
const error = computed(() => processStore.getError(props.beaconid))
const processes = computed(() => processStore.getProcesses(props.beaconid))
const lastUpdated = computed(() => processStore.getLastUpdated(props.beaconid))
const currentAgent = computed(() => agentStore.getAgentById(props.beaconid))

const filteredProcesses = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const filtered = q
    ? processes.value.filter(p =>
        p.pid.toLowerCase().includes(q) ||
        p.ppid.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q)
      )
    : processes.value

  return [...filtered].sort((a, b) => {
    const result = compareValue(a, b)
    return sortDesc.value ? -result : result
  })
})

function closeContextMenu() {
  contextMenu.value.visible = false
}

function getMigrateDisabledReason(process) {
  if (!process) return '未找到目标进程。'
  if (!isWindowsBeacon(currentAgent.value)) return '仅 Windows Beacon 支持 Migrate Inject。'

  const targetArch = normalizeMigrateArch(process.arch)
  if (!['x86', 'x64'].includes(targetArch)) {
    return '目标进程架构不是 x86/x64，当前不能安全生成 migrate_inject。'
  }

  if (isX86ToX64Blocked(currentAgent.value?.arch, targetArch)) {
    return '当前 Beacon 不支持 x64 stage 注入。'
  }

  return ''
}

function handleProcessContextMenu(event, process) {
  event.preventDefault()
  event.stopPropagation()

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    process,
  }

  nextTick(() => adjustContextMenuPosition())
}

function adjustContextMenuPosition() {
  adjustedMenuX.value = contextMenu.value.x
  adjustedMenuY.value = contextMenu.value.y

  if (!contextMenuRef.value) return

  const rect = contextMenuRef.value.getBoundingClientRect()
  const padding = 10

  if (adjustedMenuX.value + rect.width > window.innerWidth - padding) {
    adjustedMenuX.value = Math.max(padding, adjustedMenuX.value - rect.width)
  }

  if (adjustedMenuY.value + rect.height > window.innerHeight - padding) {
    adjustedMenuY.value = Math.max(padding, adjustedMenuY.value - rect.height)
  }
}

function handleOpenMigrateInject() {
  const process = contextMenu.value.process
  const reason = getMigrateDisabledReason(process)
  closeContextMenu()
  if (reason) {
    notificationStore.warn(reason)
    return
  }
  modalStore.openMigrateInject({
    beaconid: props.beaconid,
    process,
  })
}

async function handleKill() {
  const process = contextMenu.value.process
  if (!process) return
  
  // 1. 立即关闭菜单
  closeContextMenu()

  // 2. 玻璃材质确认框
  const confirmed = await modalStore.showConfirm({
    title: '结束进程',
    message: `你确定要强制结束进程 [${process.name}] (PID: ${process.pid}) 吗？\n警告：这可能会导致目标机器系统不稳定或数据丢失。`,
    type: 'danger'
  })

  if (!confirmed) return

  try {
    notificationStore.info(`正在尝试强杀进程: ${process.name} [${process.pid}]`)
    processStore.markRefreshAfterKill(props.beaconid)
    await sendKillProcessCommand(props.beaconid, process.pid)
    notificationStore.success(`强杀指令已发送: ${process.name}`)
  } catch (err) {
    processStore.clearRefreshAfterKill(props.beaconid)
    notificationStore.error(`强杀指令发送失败: ${err.message || err}`)
  }
}

function handlePlaceholderAction(action) {
  const process = contextMenu.value.process
  console.info(`[ProcessBrowser] 占位操作: ${action}`, process)
  closeContextMenu()
}

function handleDocumentClick() {
  closeContextMenu()
}

function formatTime(iso) {
  if (!iso) return '尚未同步'
  return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false })
}

watch(() => props.visible, (val) => {
  if (val) {
    initWindowPosition()
    startResizeListener()
    fetchProcesses()
    setTimeout(() => document.addEventListener('click', handleDocumentClick), 0)
  } else {
    searchQuery.value = ''
    closeContextMenu()
    stopDrag()
    stopResize()
    stopColumnResize()
    stopResizeListener()
    processStore.clear(props.beaconid)
    document.removeEventListener('click', handleDocumentClick)
  }
})

onMounted(() => {
  initWindowPosition()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  stopDrag()
  stopResize()
  stopColumnResize()
})

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" v-if="visible">
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
        <div class="resize-handle resizer-n" @mousedown="startResize('n', $event)"></div>
        <div class="resize-handle resizer-s" @mousedown="startResize('s', $event)"></div>
        <div class="resize-handle resizer-e" @mousedown="startResize('e', $event)"></div>
        <div class="resize-handle resizer-w" @mousedown="startResize('w', $event)"></div>
        <div class="resize-handle resizer-nw" @mousedown="startResize('nw', $event)"></div>
        <div class="resize-handle resizer-ne" @mousedown="startResize('ne', $event)"></div>
        <div class="resize-handle resizer-sw" @mousedown="startResize('sw', $event)"></div>
        <div class="resize-handle resizer-se" @mousedown="startResize('se', $event)"></div>

        <div class="browser-modal">
        <header class="modal-header" @mousedown="startDrag">
          <div class="header-info">
            <span class="icon">🔍</span>
            <div class="titles">
              <h3>进程浏览器</h3>
              <span class="subtitle">Agent: {{ agentStore.getAgentById(beaconid)?.beaconid.substring(0, 8) }}@{{ agentStore.getAgentById(beaconid)?.hostname || beaconid.substring(0, 8) }}</span>
            </div>
          </div>
          <button class="close-btn" @click="close">×</button>
        </header>

        <div class="toolbar">
          <button
            class="nav-action-btn refresh"
            :class="{ spinning: loading }"
            @click="fetchProcesses"
            :disabled="loading"
            title="刷新进程列表"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="搜索 PID 或进程名..." 
              spellcheck="false"
            />
          </div>
          <span class="sync-time">同步: {{ formatTime(lastUpdated) }}</span>
        </div>

        <div class="content-area">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>正在获取进程数据...</span>
          </div>

          <div v-else-if="error" class="error-state">
            <span class="error-icon">⚠️</span>
            <span>{{ error }}</span>
            <button @click="fetchProcesses" class="retry-btn">重试</button>
          </div>

          <table v-else class="process-table">
            <colgroup>
              <col :style="{ width: columnWidths.pid + 'px' }">
              <col :style="{ width: columnWidths.ppid + 'px' }">
              <col :style="{ width: columnWidths.arch + 'px' }">
              <col :style="{ width: columnWidths.session + 'px' }">
              <col :style="{ width: columnWidths.user + 'px' }">
              <col :style="{ width: columnWidths.name + 'px' }">
              <col :style="{ width: columnWidths.path + 'px' }">
            </colgroup>
            <thead>
              <tr>
                <th class="col-pid" @click="handleSort('pid')">
                  <div class="th-content">
                    <span>PID <span v-show="sortBy === 'pid'">{{ sortDesc ? '↓' : '↑' }}</span></span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('pid', $event)"></span>
                  </div>
                </th>
                <th class="col-ppid" @click="handleSort('ppid')">
                  <div class="th-content">
                    <span>PPID <span v-show="sortBy === 'ppid'">{{ sortDesc ? '↓' : '↑' }}</span></span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('ppid', $event)"></span>
                  </div>
                </th>
                <th class="col-arch" @click="handleSort('arch')">
                  <div class="th-content">
                    <span>Arch <span v-show="sortBy === 'arch'">{{ sortDesc ? '↓' : '↑' }}</span></span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('arch', $event)"></span>
                  </div>
                </th>
                <th class="col-session" @click="handleSort('session')">
                  <div class="th-content">
                    <span>Session <span v-show="sortBy === 'session'">{{ sortDesc ? '↓' : '↑' }}</span></span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('session', $event)"></span>
                  </div>
                </th>
                <th class="col-user" @click="handleSort('user')">
                  <div class="th-content">
                    <span>User <span v-show="sortBy === 'user'">{{ sortDesc ? '↓' : '↑' }}</span></span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('user', $event)"></span>
                  </div>
                </th>
                <th class="col-name" @click="handleSort('name')">
                  <div class="th-content">
                    <span>Name <span v-show="sortBy === 'name'">{{ sortDesc ? '↓' : '↑' }}</span></span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('name', $event)"></span>
                  </div>
                </th>
                <th class="col-path">
                  <div class="th-content">
                    <span>Path</span>
                    <span class="col-resize-handle" @mousedown="startColumnResize('path', $event)"></span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="proc in filteredProcesses"
                :key="`${proc.pid}-${proc.name}`"
                @contextmenu="handleProcessContextMenu($event, proc)"
              >
                <td class="cell-pid copyable-cell">{{ proc.pid }}</td>
                <td class="cell-ppid copyable-cell">{{ proc.ppid }}</td>
                <td class="copyable-cell"><span class="session-tag copyable-tag">{{ proc.arch }}</span></td>
                <td class="cell-session copyable-cell">{{ proc.session }}</td>
                <td class="cell-user copyable-cell" :title="proc.user">{{ proc.user }}</td>
                <td class="cell-name copyable-cell">{{ proc.name }}</td>
                <td class="cell-path copyable-cell" :title="proc.path">{{ proc.path }}</td>
              </tr>
              <tr v-if="filteredProcesses.length === 0">
                <td colspan="7" class="empty-state">没有找到匹配的进程</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="modal-footer">
          <span class="status-text">
            {{ filteredProcesses.length }} 个进程 {{ searchQuery ? '(过滤后)' : '' }}
          </span>
        </footer>

        <Teleport to="body">
          <div
            v-if="contextMenu.visible"
            ref="contextMenuRef"
            class="process-context-menu"
            :style="{ left: adjustedMenuX + 'px', top: adjustedMenuY + 'px' }"
            @click.stop
            @contextmenu.stop.prevent
          >
            <div class="process-menu-title">
              {{ contextMenu.process?.name }} [{{ contextMenu.process?.pid }}]
            </div>
            <div class="divider"></div>
            <button class="process-menu-item danger" @click="handleKill">
              <span>结束进程</span>
              <small>kill</small>
            </button>
            <button
              class="process-menu-item"
              :class="{ disabled: Boolean(getMigrateDisabledReason(contextMenu.process)) }"
              :title="getMigrateDisabledReason(contextMenu.process) || '注入新 Beacon 到此进程'"
              @click="handleOpenMigrateInject"
            >
              <span>Migrate Inject</span>
              <small>迁移到此进程</small>
            </button>
            <button class="process-menu-item" @click="handlePlaceholderAction('steal-token')">
              <span>窃取令牌</span>
              <small>token</small>
            </button>
          </div>
        </Teleport>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import '../../assets/styles/browser-modal-base.css';
.sync-time { font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; white-space: nowrap; }

.search-box {
  flex: 1; display: flex; align-items: center; background: rgba(0,0,0,0.04);
  border: 1px solid var(--border-light); border-radius: 6px; padding: 4px 12px;
}
.search-icon { font-size: 13px; color: var(--text-muted); margin-right: 8px; }
.search-box input { flex: 1; background: transparent; border: none; color: var(--text-primary); outline: none; font-size: 13px; }

.content-area { flex: 1; overflow: auto; position: relative; }

.process-table { width: max-content; min-width: 100%; border-collapse: collapse; text-align: left; table-layout: fixed; }
.process-table th { padding: 0; font-size: 12px; font-weight: 500; color: var(--text-muted); position: sticky; top: 0; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(10px); cursor: pointer; user-select: none; z-index: 10; border-bottom: 1px solid var(--border-light); }
.process-table th:hover { color: var(--text-primary); background: rgba(240, 240, 240, 0.95); }
.process-table td { padding: 8px 16px; font-size: 13px; border-bottom: 1px solid var(--border-light); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.process-table tr:hover { background: rgba(0, 0, 0, 0.02); }

.th-content {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 10px 16px;
}

.col-resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
}

.col-resize-handle::after {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 3px;
  width: 1px;
  background: rgba(100, 116, 139, 0.25);
}

.process-table th:hover .col-resize-handle::after {
  background: rgba(99, 102, 241, 0.45);
}

.copyable-cell,
.copyable-cell * {
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.cell-pid { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--color-accent); font-weight: 500; }
.cell-ppid, .cell-session { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); }
.cell-name { font-weight: 500; color: var(--text-primary); }
.cell-user, .cell-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-path { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); }
.session-tag { font-size: 11px; padding: 2px 6px; background: rgba(0,0,0,0.05); border-radius: 4px; color: var(--text-secondary); }
.copyable-tag { display: inline-block; }

.process-context-menu {
  position: fixed;
  z-index: 10001;
  min-width: 180px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 6px;
  animation: fadeIn 0.15s ease;
}

.process-menu-title {
  padding: 7px 10px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
}

.process-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: none;
  font-size: 13px;
  text-align: left;
  color: var(--text-secondary);
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
}

.process-menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
}

.process-menu-item.disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.process-menu-item.disabled:hover {
  background: transparent;
  color: var(--text-secondary);
}

.process-menu-item.danger {
  color: var(--color-danger);
}

.process-menu-item.danger:hover {
  background: var(--color-danger-dim);
}

.process-menu-item small {
  font-size: 10px;
  color: var(--text-muted);
}

.divider {
  height: 1px;
  background: var(--border);
  margin: 4px 8px;
}

:global(html[data-ui-theme="dark"] .process-context-menu) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.04) 42%, rgba(2, 6, 23, 0.02)),
    rgba(15, 23, 42, 0.96);
  border-color: rgba(148, 163, 184, 0.2);
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.38);
}

:global(html[data-ui-theme="dark"] .process-menu-title) {
  color: #cbd5e1;
  font-weight: 700;
}

:global(html[data-ui-theme="dark"] .process-menu-item) {
  color: #e5e7eb;
  font-weight: 650;
}

:global(html[data-ui-theme="dark"] .process-menu-item:hover) {
  background: rgba(129, 140, 248, 0.16);
  color: #f8fafc;
}

:global(html[data-ui-theme="dark"] .process-menu-item.disabled) {
  color: rgba(229, 231, 235, 0.58);
}

:global(html[data-ui-theme="dark"] .process-menu-item.disabled:hover) {
  background: transparent;
  color: rgba(229, 231, 235, 0.58);
}

:global(html[data-ui-theme="dark"] .process-menu-item.danger) {
  color: #fca5a5;
}

:global(html[data-ui-theme="dark"] .process-menu-item.danger:hover) {
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
}

:global(html[data-ui-theme="dark"] .process-menu-item small) {
  color: #94a3b8;
  font-weight: 700;
}

:global(html[data-ui-theme="dark"] .process-menu-item:hover small) {
  color: #c7d2fe;
}

:global(html[data-ui-theme="dark"] .process-menu-item.disabled small),
:global(html[data-ui-theme="dark"] .process-menu-item.disabled:hover small) {
  color: rgba(148, 163, 184, 0.7);
}

:global(html[data-ui-theme="dark"] .process-menu-item.danger:hover small) {
  color: #fecdd3;
}

:global(html[data-ui-theme="dark"] .divider) {
  background: rgba(148, 163, 184, 0.16);
}
</style>
