/**
 * useFileBrowserMenu - 文件浏览器右键菜单 composable
 *
 * 封装右键菜单的显示/定位/动作分发逻辑:
 * - 行右键 / 容器右键 / 三点按钮 toggle
 * - 菜单定位(跟手 + 边界翻转 + 二次微调)
 * - 动作分发到 useFileBrowserActions 提供的回调
 *
 * 与 useFileBrowserActions 的双向依赖解法:
 * menu 先创建(不依赖 actions),actions 后创建(依赖 menu 的 closeMenu/activeMenuTarget),
 * 最后主组件调 menu.setActions(actions) 把动作回调注入 menu。
 */

import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { ExplorerFileInfo } from '../stores/explorer'

const MENU_WIDTH = 168
const MENU_HEIGHT = 286

export interface FileMenuTarget {
  type: 'blank' | 'folder' | 'file'
  path?: string
  file?: ExplorerFileInfo
}

export interface FileBrowserMenuActions {
  handleDownload: (file: ExplorerFileInfo | undefined) => void
  handleZip: (target: FileMenuTarget) => void
  handleMoveCopy: (action: 'move' | 'copy', target: FileMenuTarget) => void
  handleDelete: (target: FileMenuTarget) => void
  handleMkdir: () => void
  openAttributeDialog: (target: FileMenuTarget) => void
}

export interface FileBrowserMenuOptions {
  /** 当前路径 ref */
  currentPath: Ref<string>
}

export function useFileBrowserMenu({ currentPath }: FileBrowserMenuOptions) {
  const activeMenuTarget = ref<FileMenuTarget | null>(null)
  const menuPos = ref({ x: 0, y: 0 })
  const menuRef = ref<{ menuRef: HTMLElement } | null>(null)
  // actions 后绑定(解决与 useFileBrowserActions 的双向依赖)。
  // 保持原行为:未注入的 handler 被分发时抛 TypeError,由调用方保证先 setActions。
  let actions = {} as FileBrowserMenuActions

  function setActions(acts: Partial<FileBrowserMenuActions>): void {
    actions = acts as FileBrowserMenuActions
  }

  // 菜单目标工厂:用于空白菜单项
  function getMenuTarget(file: ExplorerFileInfo | null | undefined): FileMenuTarget {
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

  function placeMenu(x: number, y: number): void {
    let nextX = x
    let nextY = y

    if (nextX + MENU_WIDTH > window.innerWidth) nextX -= MENU_WIDTH
    if (nextY + MENU_HEIGHT > window.innerHeight) nextY -= MENU_HEIGHT

    menuPos.value = {
      x: Math.max(10, nextX),
      y: Math.max(10, nextY),
    }
  }

  function handleMenuAction(action: string, target: FileMenuTarget): void {
    if (!target) return

    switch (action) {
      case 'download':
        actions.handleDownload(target.file)
        break
      case 'zip':
        actions.handleZip(target)
        break
      case 'move':
        actions.handleMoveCopy('move', target)
        break
      case 'copy':
        actions.handleMoveCopy('copy', target)
        break
      case 'delete':
        actions.handleDelete(target)
        break
      case 'mkdir':
        actions.handleMkdir()
        break
      case 'setattr':
        actions.openAttributeDialog(target)
        break
    }
  }

  function closeMenu(): void {
    activeMenuTarget.value = null
  }

  function openMenu(target: FileMenuTarget, x: number, y: number): void {
    activeMenuTarget.value = target
    placeMenu(x, y)
    nextTick(adjustMenuPosition)
  }

  function adjustMenuPosition(): void {
    if (!menuRef.value?.menuRef) return
    const rect = menuRef.value.menuRef.getBoundingClientRect()
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

  // 切换菜单显示逻辑(三点按钮)
  function toggleMenu(file: ExplorerFileInfo, event: MouseEvent): void {
    if (event) event.stopPropagation()
    if (activeMenuTarget.value?.file?.path === file.path) {
      closeMenu()
      return
    }

    if (event?.currentTarget) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      openMenu(getMenuTarget(file), rect.right - MENU_WIDTH, rect.bottom + 8)
    }
  }

  // 右键行处理逻辑(跟手模式)
  function onRowContextMenu(file: ExplorerFileInfo, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    openMenu(getMenuTarget(file), event.clientX, event.clientY)
  }

  function onContainerContextMenu(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    if ((event.target as Element).closest('.file-row')) return
    openMenu(getMenuTarget(null), event.clientX, event.clientY)
  }

  const handleDocumentClick = () => closeMenu()

  onMounted(() => {
    window.addEventListener('click', handleDocumentClick)
  })

  onUnmounted(() => {
    window.removeEventListener('click', handleDocumentClick)
  })

  return {
    activeMenuTarget,
    menuPos,
    menuRef,
    setActions,
    getMenuTarget,
    placeMenu,
    handleMenuAction,
    closeMenu,
    openMenu,
    adjustMenuPosition,
    toggleMenu,
    onRowContextMenu,
    onContainerContextMenu,
  }
}
