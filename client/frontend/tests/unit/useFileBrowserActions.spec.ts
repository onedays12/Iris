import { describe, it, expect } from 'vitest'
import type { ExplorerFileInfo } from '../../src/stores/explorer'
import {
  buildCopyName,
  resolveDestinationPath,
} from '../../src/composables/useFileBrowserActions'

// Note: this spec only covers the two top-level pure-function exports.
// The composable body (`useFileBrowserActions`) is heavily coupled to
// 3 Pinia stores + 8 Wails command senders + fileApi.uploadFile, and is
// left for e2e / integration coverage. The pure helpers below contain
// the only reusable domain logic worth unit-testing in isolation.

// ─── buildCopyName ──────────────────────────────────────────────────────────

describe('useFileBrowserActions.buildCopyName', () => {
  it('appends _copy before extension for a normal file', () => {
    expect(buildCopyName({ name: 'a.txt' } as ExplorerFileInfo)).toBe('a_copy.txt')
    expect(buildCopyName({ name: 'report.pdf' } as ExplorerFileInfo)).toBe('report_copy.pdf')
  })

  it('appends _copy as suffix for a directory (no extension handling)', () => {
    expect(buildCopyName({ name: 'mydir', is_dir: true } as ExplorerFileInfo)).toBe('mydir_copy')
  })

  it('appends _copy as suffix for a file with no extension', () => {
    // dotIndex <= 0 branch — Makefile has no dot.
    expect(buildCopyName({ name: 'Makefile' } as ExplorerFileInfo)).toBe('Makefile_copy')
    expect(buildCopyName({ name: 'README' } as ExplorerFileInfo)).toBe('README_copy')
  })

  it('handles dotfiles correctly (leading dot does NOT count as extension)', () => {
    // .gitignore: lastIndexOf('.') === 0, dotIndex <= 0 → suffix _copy.
    expect(buildCopyName({ name: '.gitignore' } as ExplorerFileInfo)).toBe('.gitignore_copy')
    expect(buildCopyName({ name: '.bashrc' } as ExplorerFileInfo)).toBe('.bashrc_copy')
  })

  it('handles multi-dot filenames by splitting at the LAST dot', () => {
    // archive.tar.gz → archive.tar_copy.gz
    expect(buildCopyName({ name: 'archive.tar.gz' } as ExplorerFileInfo)).toBe('archive.tar_copy.gz')
    expect(buildCopyName({ name: 'a.b.c.txt' } as ExplorerFileInfo)).toBe('a.b.c_copy.txt')
  })

  it('returns "Copy" when name is empty', () => {
    expect(buildCopyName({ name: '' } as ExplorerFileInfo)).toBe('Copy')
    expect(buildCopyName({} as ExplorerFileInfo)).toBe('Copy')
    expect(buildCopyName(null)).toBe('Copy')
    expect(buildCopyName(undefined)).toBe('Copy')
  })

  it('trims surrounding whitespace from name before processing', () => {
    expect(buildCopyName({ name: '  a.txt  ' } as ExplorerFileInfo)).toBe('a_copy.txt')
    expect(buildCopyName({ name: '   ' } as ExplorerFileInfo)).toBe('Copy')
  })

  it('ignores is_dir when name is empty (falls to "Copy")', () => {
    expect(buildCopyName({ name: '', is_dir: true } as ExplorerFileInfo)).toBe('Copy')
  })

  it('handles names with dots only at start AND no extension', () => {
    // "..hidden" — lastIndexOf('.') === 1, dotIndex > 0 → treats as extension split.
    // "..hidden".slice(0,1) = "." + "_copy" + ".hidden" = "._copy.hidden"
    // This is the documented (if quirky) behavior; pin it.
    expect(buildCopyName({ name: '..hidden' } as ExplorerFileInfo)).toBe('._copy.hidden')
  })
})

// ─── resolveDestinationPath ─────────────────────────────────────────────────

describe('useFileBrowserActions.resolveDestinationPath', () => {
  it('returns empty string for empty / whitespace-only input', () => {
    expect(resolveDestinationPath('C:\\base', '')).toBe('')
    expect(resolveDestinationPath('C:\\base', '   ')).toBe('')
    expect(resolveDestinationPath('C:\\base', null)).toBe('')
    expect(resolveDestinationPath('C:\\base', undefined)).toBe('')
  })

  it('treats Windows absolute path (drive letter + backslash) as absolute', () => {
    // normalizePathKey lowercases Windows paths and strips trailing slashes.
    expect(resolveDestinationPath('C:\\current', 'D:\\target\\path')).toBe('d:\\target\\path')
  })

  it('treats forward-slash absolute path as absolute (Linux style)', () => {
    expect(resolveDestinationPath('/home/user', '/etc/config')).toBe('/etc/config')
  })

  it('treats UNC path (\\\\server\\share) as absolute', () => {
    // normalizePathKey collapses leading double-backslash to single — pin the
    // actual behavior. The path IS treated as absolute (not joined with base),
    // which is the property we care about; the leading-slash collapsing is a
    // normalizePathKey implementation detail.
    expect(resolveDestinationPath('C:\\base', '\\\\server\\share\\file')).toBe('\\server\\share\\file')
  })

  it('treats drive-relative path (C:path, no separator after colon) as RELATIVE', () => {
    // The regex /^[a-zA-Z]:[\\/]/ requires a separator after the colon.
    // "C:sub" does NOT match → goes through joinPaths (relative). joinPaths
    // does not special-case drive letters in the relative branch, so it
    // concatenates verbatim — pinning the documented (if quirky) behavior.
    const result = resolveDestinationPath('C:\\base', 'C:sub')
    expect(result).toBe('c:\\base\\c:sub')
  })

  it('joins relative path with basePath for Windows paths', () => {
    expect(resolveDestinationPath('C:\\base', 'subdir\\file.txt')).toBe('c:\\base\\subdir\\file.txt')
  })

  it('joins relative path with basePath for Linux paths', () => {
    expect(resolveDestinationPath('/home/user', 'docs/file.txt')).toBe('/home/user/docs/file.txt')
  })

  it('normalizes redundant separators in the joined result', () => {
    // joinPaths collapses duplicate slashes.
    expect(resolveDestinationPath('/home/user', 'docs//file.txt')).toBe('/home/user/docs/file.txt')
    expect(resolveDestinationPath('C:\\base', 'subdir\\\\file.txt')).toBe('c:\\base\\subdir\\file.txt')
  })

  it('handles basePath with trailing separator', () => {
    expect(resolveDestinationPath('C:\\base\\', 'subdir')).toBe('c:\\base\\subdir')
    expect(resolveDestinationPath('/home/user/', 'subdir')).toBe('/home/user/subdir')
  })

  it('handles absolute input when basePath is empty', () => {
    // joinPaths with empty base returns the normalized sub as-is.
    expect(resolveDestinationPath('', '/abs/path')).toBe('/abs/path')
  })

  it('handles relative input when basePath is empty', () => {
    // Empty base + relative sub: joinPaths returns the normalized sub.
    expect(resolveDestinationPath('', 'rel/path')).toBe('rel/path')
  })
})
