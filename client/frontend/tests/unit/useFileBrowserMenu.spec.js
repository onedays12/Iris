import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useFileBrowserMenu } from '../../src/composables/useFileBrowserMenu.js'

// useFileBrowserMenu calls onMounted/onUnmounted internally (to register a
// document click listener). These hooks require an active component instance,
// so we mount a tiny wrapper component whose setup() invokes the composable.
// Each test mounts and unmounts its own wrapper, ensuring listener cleanup.

// jsdom defaults to innerWidth=1024 / innerHeight=768. Several tests need
// custom dimensions to trigger the boundary-flip branch in placeMenu.
const DEFAULT_INNER_WIDTH = 1024
const DEFAULT_INNER_HEIGHT = 768

let savedInnerWidth
let savedInnerHeight

beforeEach(() => {
  savedInnerWidth = window.innerWidth
  savedInnerHeight = window.innerHeight
})

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: savedInnerWidth,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: savedInnerHeight,
  })
})

function setWindowSize(width, height) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })
}

/**
 * Mount the composable inside a real component instance so onMounted fires.
 * Returns { wrapper, result } — caller must call wrapper.unmount() to clean up.
 */
function mountMenu(currentPathValue = '') {
  const currentPath = ref(currentPathValue)
  let result
  const Wrapper = defineComponent({
    setup() {
      result = useFileBrowserMenu({ currentPath })
      return () => h('div')
    },
  })
  const wrapper = mount(Wrapper)
  return { wrapper, result, currentPath }
}

// ─── getMenuTarget ──────────────────────────────────────────────────────────

describe('useFileBrowserMenu.getMenuTarget', () => {
  it('returns { type: "blank", path: currentPath } for null/undefined file', () => {
    const { wrapper, result } = mountMenu('C:\\current')
    expect(result.getMenuTarget(null)).toEqual({ type: 'blank', path: 'C:\\current' })
    expect(result.getMenuTarget(undefined)).toEqual({ type: 'blank', path: 'C:\\current' })
    wrapper.unmount()
  })

  it('returns { type: "folder", file } for a directory', () => {
    const { wrapper, result } = mountMenu('C:\\current')
    const folder = { name: 'mydir', is_dir: true }
    expect(result.getMenuTarget(folder)).toEqual({ type: 'folder', file: folder })
    wrapper.unmount()
  })

  it('returns { type: "file", file } for a file (is_dir falsy)', () => {
    const { wrapper, result } = mountMenu('C:\\current')
    const file = { name: 'a.txt', is_dir: false }
    expect(result.getMenuTarget(file)).toEqual({ type: 'file', file })
    wrapper.unmount()
  })

  it('returns { type: "file", file } when is_dir is undefined', () => {
    const { wrapper, result } = mountMenu('C:\\current')
    const file = { name: 'a.txt' }
    expect(result.getMenuTarget(file)).toEqual({ type: 'file', file })
    wrapper.unmount()
  })

  it('reflects the live value of currentPath ref', () => {
    const { wrapper, result, currentPath } = mountMenu('C:\\first')
    expect(result.getMenuTarget(null).path).toBe('C:\\first')
    currentPath.value = 'C:\\second'
    expect(result.getMenuTarget(null).path).toBe('C:\\second')
    wrapper.unmount()
  })
})

// ─── placeMenu ──────────────────────────────────────────────────────────────

describe('useFileBrowserMenu.placeMenu', () => {
  it('places menu at the given coordinates when within bounds', () => {
    const { wrapper, result } = mountMenu()
    result.placeMenu(100, 200)
    expect(result.menuPos.value).toEqual({ x: 100, y: 200 })
    wrapper.unmount()
  })

  it('flips the X coordinate when the menu would overflow the right edge', () => {
    // MENU_WIDTH = 168. With innerWidth=400 and x=300, menu extends to
    // 300 + 168 = 468 > 400, so x flips to 300 - 168 = 132.
    setWindowSize(400, 768)
    const { wrapper, result } = mountMenu()
    result.placeMenu(300, 100)
    expect(result.menuPos.value.x).toBe(300 - 168)
    wrapper.unmount()
  })

  it('flips the Y coordinate when the menu would overflow the bottom edge', () => {
    // MENU_HEIGHT = 286. With innerHeight=400 and y=300, menu extends to
    // 300 + 286 = 586 > 400, so y flips to 300 - 286 = 14.
    setWindowSize(1024, 400)
    const { wrapper, result } = mountMenu()
    result.placeMenu(100, 300)
    expect(result.menuPos.value.y).toBe(300 - 286)
    wrapper.unmount()
  })

  it('enforces a minimum of 10 on both axes after flipping', () => {
    setWindowSize(100, 100)
    const { wrapper, result } = mountMenu()
    result.placeMenu(50, 50)
    expect(result.menuPos.value).toEqual({ x: 10, y: 10 })
    wrapper.unmount()
  })

  it('enforces the minimum of 10 even when coordinates are within bounds but < 10', () => {
    // x=5, y=5 with large window — both below the 10 minimum.
    const { wrapper, result } = mountMenu()
    result.placeMenu(5, 5)
    expect(result.menuPos.value).toEqual({ x: 10, y: 10 })
    wrapper.unmount()
  })
})

// ─── closeMenu / openMenu ───────────────────────────────────────────────────

describe('useFileBrowserMenu.closeMenu / openMenu', () => {
  it('closeMenu sets activeMenuTarget to null', () => {
    const { wrapper, result } = mountMenu()
    result.activeMenuTarget.value = { type: 'file', file: { name: 'a' } }
    result.closeMenu()
    expect(result.activeMenuTarget.value).toBeNull()
    wrapper.unmount()
  })

  it('openMenu sets activeMenuTarget to the given target and places the menu', () => {
    const { wrapper, result } = mountMenu()
    const target = { type: 'file', file: { name: 'a.txt' } }
    result.openMenu(target, 100, 200)
    // Vue 3 deeply reactivates objects stored in ref.value, so the stored
    // value is a reactive proxy rather than the original target reference.
    // Compare by structure (toEqual) and by field identity instead of `toBe`.
    expect(result.activeMenuTarget.value).toEqual(target)
    expect(result.activeMenuTarget.value.type).toBe('file')
    expect(result.activeMenuTarget.value.file.name).toBe('a.txt')
    expect(result.menuPos.value).toEqual({ x: 100, y: 200 })
    wrapper.unmount()
  })

  it('openMenu schedules adjustMenuPosition via nextTick (no-op when menuRef is null)', async () => {
    const { wrapper, result } = mountMenu()
    result.openMenu({ type: 'blank', path: '' }, 100, 200)
    // menuRef.value is null in this test (no real DOM mount of the menu),
    // so adjustMenuPosition should be a safe no-op after nextTick.
    await new Promise((r) => setTimeout(r, 0))
    expect(result.menuPos.value).toEqual({ x: 100, y: 200 })
    wrapper.unmount()
  })
})

// ─── handleMenuAction ───────────────────────────────────────────────────────

describe('useFileBrowserMenu.handleMenuAction', () => {
  function mountWithActions(actions) {
    const mounted = mountMenu()
    mounted.result.setActions(actions)
    return mounted
  }

  it('does nothing when target is null/undefined', () => {
    const actions = { handleDownload: vi.fn() }
    const { wrapper, result } = mountWithActions(actions)
    expect(() => result.handleMenuAction('download', null)).not.toThrow()
    expect(() => result.handleMenuAction('download', undefined)).not.toThrow()
    expect(actions.handleDownload).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([
    ['download', 'handleDownload', 'file'],
    ['zip', 'handleZip', 'target'],
    ['delete', 'handleDelete', 'target'],
    ['mkdir', 'handleMkdir', null],
    ['setattr', 'openAttributeDialog', 'target'],
  ])('routes action %s to actions.%s', (action, methodName, argKind) => {
    const actions = {
      [methodName]: vi.fn(),
    }
    const { wrapper, result } = mountWithActions(actions)
    const file = { name: 'a.txt' }
    const target = { type: 'file', file }
    result.handleMenuAction(action, target)
    expect(actions[methodName]).toHaveBeenCalledTimes(1)
    if (argKind === 'file') {
      expect(actions[methodName]).toHaveBeenCalledWith(file)
    } else if (argKind === 'target') {
      expect(actions[methodName]).toHaveBeenCalledWith(target)
    } else {
      expect(actions[methodName]).toHaveBeenCalledWith()
    }
    wrapper.unmount()
  })

  it('routes "move" action to handleMoveCopy with "move" as first arg', () => {
    const actions = { handleMoveCopy: vi.fn() }
    const { wrapper, result } = mountWithActions(actions)
    const target = { type: 'file', file: { name: 'a.txt' } }
    result.handleMenuAction('move', target)
    expect(actions.handleMoveCopy).toHaveBeenCalledWith('move', target)
    wrapper.unmount()
  })

  it('routes "copy" action to handleMoveCopy with "copy" as first arg', () => {
    const actions = { handleMoveCopy: vi.fn() }
    const { wrapper, result } = mountWithActions(actions)
    const target = { type: 'file', file: { name: 'a.txt' } }
    result.handleMenuAction('copy', target)
    expect(actions.handleMoveCopy).toHaveBeenCalledWith('copy', target)
    wrapper.unmount()
  })

  it('silently ignores unknown action names', () => {
    const actions = {
      handleDownload: vi.fn(),
      handleZip: vi.fn(),
    }
    const { wrapper, result } = mountWithActions(actions)
    const target = { type: 'file', file: { name: 'a.txt' } }
    expect(() => result.handleMenuAction('unknown-action', target)).not.toThrow()
    expect(actions.handleDownload).not.toHaveBeenCalled()
    expect(actions.handleZip).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('throws TypeError when a known action is dispatched but its handler is missing', () => {
    // Document the contract: handleMenuAction does NOT guard against missing
    // handlers for KNOWN actions (download/zip/move/copy/delete/mkdir/setattr).
    // Production code always injects a complete actions object via setActions,
    // so this branch is only reachable via programmer error. Pin the behavior.
    const { wrapper, result } = mountMenu()
    const target = { type: 'file', file: { name: 'a.txt' } }
    expect(() => result.handleMenuAction('download', target)).toThrow(TypeError)
    wrapper.unmount()
  })
})

// ─── setActions (post-binding pattern) ──────────────────────────────────────

describe('useFileBrowserMenu.setActions', () => {
  it('injects actions that handleMenuAction later dispatches to', () => {
    const { wrapper, result } = mountMenu()
    // Before setActions, calling 'download' throws (handler is undefined).
    const target = { type: 'file', file: { name: 'a.txt' } }
    expect(() => result.handleMenuAction('download', target)).toThrow(TypeError)

    // After setActions, the handler is reachable.
    const handleDownload = vi.fn()
    result.setActions({ handleDownload })
    result.handleMenuAction('download', target)
    expect(handleDownload).toHaveBeenCalledWith(target.file)
    wrapper.unmount()
  })

  it('can be called multiple times (last wins)', () => {
    const { wrapper, result } = mountMenu()
    const first = vi.fn()
    const second = vi.fn()
    result.setActions({ handleDownload: first })
    result.setActions({ handleDownload: second })
    const target = { type: 'file', file: { name: 'a.txt' } }
    result.handleMenuAction('download', target)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(target.file)
    wrapper.unmount()
  })
})

// ─── onMounted / onUnmounted — document click listener ──────────────────────

describe('useFileBrowserMenu — document click listener lifecycle', () => {
  it('document click closes the menu while the component is mounted', async () => {
    const { wrapper, result } = mountMenu()
    result.activeMenuTarget.value = { type: 'blank', path: '' }
    // The onMounted listener registers on `window`. Dispatch a real click.
    window.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(result.activeMenuTarget.value).toBeNull()
    wrapper.unmount()
  })

  it('stops listening after unmount (onUnmounted cleanup)', () => {
    const { wrapper, result } = mountMenu()
    result.activeMenuTarget.value = { type: 'blank', path: '' }
    wrapper.unmount()
    // After unmount, the document click listener should be removed —
    // reassigning activeMenuTarget and clicking should NOT auto-close.
    result.activeMenuTarget.value = { type: 'blank', path: '' }
    window.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(result.activeMenuTarget.value).not.toBeNull()
  })
})
