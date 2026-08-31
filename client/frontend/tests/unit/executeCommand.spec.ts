import { describe, expect, it } from 'vitest'
import {
  buildExecuteShellCommand,
  isShellJobAck,
  parentDirectory,
  pickExecuteOutputFrom,
  quoteUnixShellPath,
  quoteWindowsCmdPath,
  resolveExecuteCwd,
} from '../../src/features/files/executeCommand'

describe('quote paths', () => {
  it('wraps Windows paths and doubles embedded quotes', () => {
    expect(quoteWindowsCmdPath('C:\\Users\\Public\\foo.exe')).toBe('"C:\\Users\\Public\\foo.exe"')
    expect(quoteWindowsCmdPath('C:\\say "hi"\\a.exe')).toBe('"C:\\say ""hi""\\a.exe"')
  })

  it('wraps Unix paths and escapes single quotes', () => {
    expect(quoteUnixShellPath('/home/a/foo')).toBe("'/home/a/foo'")
    expect(quoteUnixShellPath("/tmp/it's")).toBe("'/tmp/it'\\''s'")
  })
})

describe('parentDirectory / cwd', () => {
  it('returns the parent of a Windows file, including drive root', () => {
    expect(parentDirectory('C:\\Users\\a\\foo.exe', true)).toBe('C:\\Users\\a')
    expect(parentDirectory('C:\\foo.exe', true)).toBe('C:\\')
  })

  it('returns the parent of a Unix file', () => {
    expect(parentDirectory('/tmp/a.bin', false)).toBe('/tmp')
    expect(parentDirectory('/a.bin', false)).toBe('/')
  })

  it('prefers the browse path and falls back to the file parent', () => {
    expect(resolveExecuteCwd('C:\\Users\\a', 'C:\\Users\\a\\foo.exe', true)).toBe('C:\\Users\\a')
    expect(resolveExecuteCwd('', 'C:\\Users\\a\\foo.exe', true)).toBe('C:\\Users\\a')
  })
})

describe('buildExecuteShellCommand', () => {
  it('cds then runs the quoted Windows file with optional args', () => {
    expect(buildExecuteShellCommand({
      isWindows: true,
      cwd: 'C:\\Users\\Public',
      filePath: 'C:\\Users\\Public\\irisclient.exe',
      args: '',
      })).toBe('cd /d "C:\\Users\\Public" && start "" "C:\\Users\\Public\\irisclient.exe"')

    expect(buildExecuteShellCommand({
      isWindows: true,
      cwd: 'C:\\Program Files',
      filePath: 'C:\\Program Files\\a.exe',
      args: '--silent /S',
    })).toBe('cd /d "C:\\Program Files" && start "" "C:\\Program Files\\a.exe" --silent /S')

    expect(buildExecuteShellCommand({
      isWindows: true,
      cwd: 'C:\\Users\\Administrator\\Desktop',
      filePath: 'C:\\Users\\Administrator\\Desktop\\images (1).jpeg',
      args: '',
    })).toBe('cd /d "C:\\Users\\Administrator\\Desktop" && start "" "C:\\Users\\Administrator\\Desktop\\images (1).jpeg"')
  })

  it('cds then runs the quoted Unix file', () => {
    expect(buildExecuteShellCommand({
      isWindows: false,
      cwd: '/home/alice',
      filePath: '/home/alice/run.sh',
      args: '-v',
    })).toBe("cd '/home/alice' && '/home/alice/run.sh' -v")
  })
})

describe('pickExecuteOutputFrom', () => {
  it('treats Job started as an ACK, not the final output', () => {
    expect(isShellJobAck('Job 12 started: shell')).toBe(true)
    const picked = pickExecuteOutputFrom([
      { type: 'input', content: 'shell ...' },
      { type: 'output', content: 'Job 12 started: shell' },
    ], 0)
    expect(picked.ready).toBe(false)
    expect(picked.text).toContain('Job 12 started')
  })

  it('returns later stdout as the final result', () => {
    const picked = pickExecuteOutputFrom([
      { type: 'input', content: 'shell ...' },
      { type: 'output', content: 'Job 12 started: shell' },
      { type: 'output', content: 'hello\nworld' },
    ], 0)
    expect(picked).toEqual({ text: 'hello\nworld', ready: true })
  })

  it('ignores entries before startIndex', () => {
    const picked = pickExecuteOutputFrom([
      { type: 'output', content: 'old' },
      { type: 'output', content: 'new' },
    ], 1)
    expect(picked).toEqual({ text: 'new', ready: true })
  })
})
