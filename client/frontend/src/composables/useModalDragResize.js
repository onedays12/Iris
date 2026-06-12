/**
 * 模态框拖拽与缩放 Composable
 * 提供窗口位置/尺寸状态和八方向缩放、拖拽事件处理器，
 * 供 FileBrowserModal、ProcessBrowserModal、NetworkBrowserModal 共用。
 */

import { ref } from 'vue'

// ─── Composable 定义 ───

export function useModalDragResize(options = {}) {
  const {
    defaultWidth = 800,
    defaultHeight = 600,
    minWidth = 600,
    minHeight = 400,
    sidebarWidth = 220,
    onBeforeDrag = null,
    onBeforeResize = null,
  } = options

  const winPos = ref({ x: 0, y: 0 })
  const winSize = ref({ w: defaultWidth, h: defaultHeight })
  const isDragging = ref(false)
  const isResizing = ref(false)
  const resizeType = ref('')
  const dragOffset = ref({ x: 0, y: 0 })
  const resizeSnapshot = ref({ x: 0, y: 0, w: 0, h: 0, mouseX: 0, mouseY: 0 })

  let viewportResizeHandler = null

  function initWindowPosition() {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const mainWidth = Math.max(0, viewportWidth - sidebarWidth)

    winPos.value = {
      x: sidebarWidth + Math.max(20, (mainWidth - winSize.value.w) / 2),
      y: Math.max(20, (viewportHeight - winSize.value.h) / 2),
    }
  }

  function startResizeListener() {
    stopResizeListener()
    viewportResizeHandler = () => initWindowPosition()
    window.addEventListener('resize', viewportResizeHandler)
  }

  function stopResizeListener() {
    if (viewportResizeHandler) {
      window.removeEventListener('resize', viewportResizeHandler)
      viewportResizeHandler = null
    }
  }

  function startDrag(event) {
    if (event.target.closest('.close-btn')) return
    onBeforeDrag?.()
    isDragging.value = true
    dragOffset.value = {
      x: event.clientX - winPos.value.x,
      y: event.clientY - winPos.value.y,
    }
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', stopDrag)
  }

  function handleDrag(event) {
    if (!isDragging.value) return
    winPos.value = {
      x: event.clientX - dragOffset.value.x,
      y: event.clientY - dragOffset.value.y,
    }
  }

  function stopDrag() {
    isDragging.value = false
    document.removeEventListener('mousemove', handleDrag)
    document.removeEventListener('mouseup', stopDrag)
  }

  function startResize(type, event) {
    event.stopPropagation()
    onBeforeResize?.()
    isResizing.value = true
    resizeType.value = type
    resizeSnapshot.value = {
      x: winPos.value.x,
      y: winPos.value.y,
      w: winSize.value.w,
      h: winSize.value.h,
      mouseX: event.clientX,
      mouseY: event.clientY,
    }
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', stopResize)
  }

  function handleResize(event) {
    if (!isResizing.value) return

    const dx = event.clientX - resizeSnapshot.value.mouseX
    const dy = event.clientY - resizeSnapshot.value.mouseY
    const type = resizeType.value

    let nextX = resizeSnapshot.value.x
    let nextY = resizeSnapshot.value.y
    let nextW = resizeSnapshot.value.w
    let nextH = resizeSnapshot.value.h

    if (type.includes('e')) {
      nextW = Math.max(minWidth, resizeSnapshot.value.w + dx)
    } else if (type.includes('w')) {
      const attemptedW = resizeSnapshot.value.w - dx
      if (attemptedW > minWidth) {
        nextW = attemptedW
        nextX = resizeSnapshot.value.x + dx
      }
    }

    if (type.includes('s')) {
      nextH = Math.max(minHeight, resizeSnapshot.value.h + dy)
    } else if (type.includes('n')) {
      const attemptedH = resizeSnapshot.value.h - dy
      if (attemptedH > minHeight) {
        nextH = attemptedH
        nextY = resizeSnapshot.value.y + dy
      }
    }

    winPos.value = { x: nextX, y: nextY }
    winSize.value = { w: nextW, h: nextH }
  }

  function stopResize() {
    isResizing.value = false
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  }

  return {
    winPos,
    winSize,
    isDragging,
    isResizing,
    resizeType,
    initWindowPosition,
    startResizeListener,
    stopResizeListener,
    startDrag,
    startResize,
    stopDrag,
    stopResize,
  }
}
