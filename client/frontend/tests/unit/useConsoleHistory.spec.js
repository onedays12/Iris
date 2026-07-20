import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useConsoleHistory } from '../../src/composables/useConsoleHistory.js'

// We use KeyboardEvent-like plain objects; the composable only reads `e.key`
// and calls `e.preventDefault()`. jsdom's KeyboardEvent would also work, but
// the plain object keeps the test focused on the state machine.
function makeKeyEvent(key) {
  return {
    key,
    preventDefault: vi.fn(),
  }
}

function setupHistory({ history = [], os = 'windows' } = {}) {
  const commandInput = ref('')
  const getOs = () => os
  const getHistory = () => history
  const composable = useConsoleHistory({ commandInput, getOs, getHistory })
  return { commandInput, history, ...composable }
}

describe('useConsoleHistory — Up/Down navigation', () => {
  it('ArrowUp does nothing when history is empty', () => {
    const { handleKeyDown, historyIndex } = setupHistory({ history: [] })
    const e = makeKeyEvent('ArrowUp')
    handleKeyDown(e)
    expect(historyIndex.value).toBe(-1)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('ArrowUp walks back through history (newest first)', () => {
    const { handleKeyDown, historyIndex, commandInput } = setupHistory({
      history: ['cmd1', 'cmd2', 'cmd3'],
    })
    // history stored newest-last; ArrowUp should show cmd3 first.
    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(commandInput.value).toBe('cmd3')
    expect(historyIndex.value).toBe(0)

    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(commandInput.value).toBe('cmd2')
    expect(historyIndex.value).toBe(1)

    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(commandInput.value).toBe('cmd1')
    expect(historyIndex.value).toBe(2)

    // Already at oldest — index stays at max.
    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(historyIndex.value).toBe(2)
    expect(commandInput.value).toBe('cmd1')
  })

  it('ArrowUp saves the in-progress input as historyTemp', () => {
    const { handleKeyDown, historyTemp, commandInput } = setupHistory({
      history: ['cmd1'],
    })
    commandInput.value = 'partial'
    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(historyTemp.value).toBe('partial')
    expect(commandInput.value).toBe('cmd1')
  })

  it('ArrowDown restores historyTemp when walking back to the present', () => {
    const { handleKeyDown, historyIndex, commandInput } = setupHistory({
      history: ['cmd1', 'cmd2'],
    })
    commandInput.value = 'partial'
    handleKeyDown(makeKeyEvent('ArrowUp')) // -> cmd2, temp='partial'
    handleKeyDown(makeKeyEvent('ArrowUp')) // -> cmd1
    handleKeyDown(makeKeyEvent('ArrowDown')) // -> cmd2
    expect(historyIndex.value).toBe(0)
    handleKeyDown(makeKeyEvent('ArrowDown')) // -> present
    expect(historyIndex.value).toBe(-1)
    expect(commandInput.value).toBe('partial')
  })

  it('ArrowDown does nothing when not yet navigating history', () => {
    const { handleKeyDown, historyIndex } = setupHistory({ history: ['cmd1'] })
    handleKeyDown(makeKeyEvent('ArrowDown'))
    expect(historyIndex.value).toBe(-1)
  })
})

describe('useConsoleHistory — Tab completion', () => {
  it('Tab does nothing when input is empty', () => {
    const { handleKeyDown, lastTabPrefix, commandInput } = setupHistory()
    commandInput.value = ''
    handleKeyDown(makeKeyEvent('Tab'))
    expect(lastTabPrefix.value).toBe('')
    expect(commandInput.value).toBe('')
  })

  it('Tab does nothing when input contains a space (not a command name)', () => {
    const { handleKeyDown, commandInput } = setupHistory()
    commandInput.value = 'cd C:'
    handleKeyDown(makeKeyEvent('Tab'))
    expect(commandInput.value).toBe('cd C:')
  })

  it('Tab completes partial command name and cycles through matches', () => {
    const { handleKeyDown, commandInput, lastTabIndex } = setupHistory({ os: 'windows' })
    // 'c' should match cd, cp, cat, cascade_*... — we only assert it sets something
    commandInput.value = 'c'
    handleKeyDown(makeKeyEvent('Tab'))
    expect(commandInput.value).not.toBe('c')
    expect(commandInput.value.length).toBeGreaterThan(0)
    const first = commandInput.value

    // Press Tab again — should cycle to a different match (or wrap back).
    handleKeyDown(makeKeyEvent('Tab'))
    expect(lastTabIndex.value).toBeGreaterThanOrEqual(0)
    // We don't assert inequality — there may be only one match for some prefixes.
    // The important invariant is: state advanced and commandInput is non-empty.
    expect(commandInput.value.length).toBeGreaterThan(0)
  })

  it('Tab preserves the original prefix across cycles (does not re-prefix on second Tab)', () => {
    const { handleKeyDown, commandInput, lastTabPrefix } = setupHistory()
    commandInput.value = 'sl'
    handleKeyDown(makeKeyEvent('Tab'))
    const firstPrefix = lastTabPrefix.value
    expect(firstPrefix).toBe('sl')

    handleKeyDown(makeKeyEvent('Tab'))
    // Prefix must remain stable so cycling keeps filtering the same set.
    expect(lastTabPrefix.value).toBe(firstPrefix)
  })
})

describe('useConsoleHistory — reset on non-functional keys', () => {
  it('typing a regular key resets historyIndex and lastTabIndex', () => {
    const { handleKeyDown, historyIndex, lastTabIndex, commandInput } = setupHistory({
      history: ['cmd1', 'cmd2'],
    })
    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(historyIndex.value).toBe(0)

    // Now press a letter — should reset both indices.
    handleKeyDown(makeKeyEvent('a'))
    expect(historyIndex.value).toBe(-1)
    expect(lastTabIndex.value).toBe(-1)
  })

  it('Enter / Shift / Control / Alt do NOT reset state', () => {
    const { handleKeyDown, historyIndex } = setupHistory({ history: ['cmd1'] })
    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(historyIndex.value).toBe(0)

    for (const key of ['Enter', 'Shift', 'Control', 'Alt']) {
      handleKeyDown(makeKeyEvent(key))
      expect(historyIndex.value).toBe(0)
    }
  })
})

describe('useConsoleHistory — reset()', () => {
  it('clears all indices', () => {
    const { reset, handleKeyDown, historyIndex, lastTabPrefix, lastTabIndex } = setupHistory({
      history: ['cmd1'],
    })
    handleKeyDown(makeKeyEvent('ArrowUp'))
    expect(historyIndex.value).toBe(0)

    reset()
    expect(historyIndex.value).toBe(-1)
    expect(lastTabPrefix.value).toBe('')
    expect(lastTabIndex.value).toBe(-1)
  })
})
