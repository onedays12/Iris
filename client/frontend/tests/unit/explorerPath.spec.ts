import { describe, expect, it } from 'vitest'
import { desktopExplorerPath, defaultExplorerPath, normalizePathKey, sortExplorerFiles } from '../../src/stores/explorer'
import type { ExplorerFileInfo } from '../../src/stores/explorer'

describe('desktopExplorerPath', () => {
  it('builds the Windows Desktop folder from the SAM username', () => {
    expect(desktopExplorerPath('Windows 10.0.22631', 'Administrator')).toBe('C:\\Users\\Administrator\\Desktop')
  })

  it('hides the shortcut when username is missing or Unknown', () => {
    expect(desktopExplorerPath('windows', '')).toBe('')
    expect(desktopExplorerPath('windows', 'Unknown')).toBe('')
    expect(desktopExplorerPath('windows', 'foo/bar')).toBe('')
  })

  it('uses home directories on Unix', () => {
    expect(desktopExplorerPath('linux', 'root')).toBe('/root')
    expect(desktopExplorerPath('Linux', 'alice')).toBe('/home/alice')
  })

  it('normalizes to the same cache key as a typed path', () => {
    const path = desktopExplorerPath('windows', 'Administrator')
    expect(normalizePathKey(path)).toBe(normalizePathKey('c:\\users\\administrator\\desktop'))
  })
})

describe('defaultExplorerPath', () => {
  it('starts Windows at C:\\ and others at /', () => {
    expect(defaultExplorerPath('Windows')).toBe('C:\\')
    expect(defaultExplorerPath('linux')).toBe('/')
  })
})

function file(name: string, isDir: boolean, modTime: number): ExplorerFileInfo {
  return {
    name,
    path: `C:\\${name}`,
    is_dir: isDir,
    size: isDir ? 0 : 1,
    mod_time: modTime,
    permission: '',
    owner: '',
    is_hidden: false,
  }
}

describe('sortExplorerFiles', () => {
  const rows = [
    file('zebra.txt', false, 300),
    file('Alpha', true, 100),
    file('beta.txt', false, 200),
    file('Docs', true, 400),
  ]

  it('keeps directories first when sorting by name', () => {
    const names = sortExplorerFiles(rows, 'name', 'asc').map((r) => r.name)
    expect(names).toEqual(['Alpha', 'Docs', 'beta.txt', 'zebra.txt'])
  })

  it('sorts files by mtime descending after directories', () => {
    const names = sortExplorerFiles(rows, 'mtime', 'desc').map((r) => r.name)
    expect(names).toEqual(['Docs', 'Alpha', 'zebra.txt', 'beta.txt'])
  })
})
