import { describe, it, expect } from 'vitest'
import { parseCommandLine, getRawCommandAfterName } from '../../src/utils/commandParser'
import { COMMAND_ID } from '../../src/constants/commands'

describe('commandParser.parseCommandLine', () => {
  it('returns null for empty / whitespace-only input', () => {
    expect(parseCommandLine('')).toBeNull()
    expect(parseCommandLine('   ')).toBeNull()
    expect(parseCommandLine('\t\n')).toBeNull()
  })

  it('parses a no-arg command', () => {
    const out = parseCommandLine('pwd')!
    expect(out).toEqual({ cmdName: 'pwd', cmdId: COMMAND_ID.PWD, args: [] })
  })

  it('parses command + space-separated args', () => {
    const out = parseCommandLine('cd C:\\Temp')!
    expect(out.cmdName).toBe('cd')
    expect(out.cmdId).toBe(COMMAND_ID.CD)
    expect(out.args).toEqual(['C:\\Temp'])
  })

  it('preserves quoted paths with spaces (double quotes)', () => {
    const out = parseCommandLine('shell copy "C:\\Temp\\a (1).txt" C:\\Temp\\b.txt')!
    expect(out.cmdName).toBe('shell')
    expect(out.args).toEqual(['copy', 'C:\\Temp\\a (1).txt', 'C:\\Temp\\b.txt'])
  })

  it('preserves single-quoted args', () => {
    const out = parseCommandLine("mv '/tmp/a b.txt' /tmp/c.txt")!
    expect(out.args).toEqual(['/tmp/a b.txt', '/tmp/c.txt'])
  })

  it('resolves command ID for known commands', () => {
    expect(parseCommandLine('sleep 5000')!.cmdId).toBe(COMMAND_ID.SLEEP)
    expect(parseCommandLine('SLEEP 5000')!.cmdId).toBe(COMMAND_ID.SLEEP)
    expect(parseCommandLine('Sleep 5000')!.cmdId).toBe(COMMAND_ID.SLEEP)
  })

  it('returns null cmdId for unknown command names', () => {
    expect(parseCommandLine('madeupcmd foo')!.cmdId).toBeNull()
  })

  it('handles mixed quoted and unquoted args', () => {
    const out = parseCommandLine('zip "C:\\a b.zip" C:\\Temp 1 1')!
    expect(out.args).toEqual(['C:\\a b.zip', 'C:\\Temp', '1', '1'])
  })
})

describe('commandParser.getRawCommandAfterName', () => {
  it('returns empty when input empty', () => {
    expect(getRawCommandAfterName('', 'shell')).toBe('')
  })

  it('returns empty when only the command name is present', () => {
    expect(getRawCommandAfterName('pwd', 'pwd')).toBe('')
  })

  it('returns rest after command name, preserving quotes and spaces', () => {
    expect(getRawCommandAfterName('shell copy "C:\\a b.txt" C:\\c.txt', 'shell')).toBe(
      'copy "C:\\a b.txt" C:\\c.txt',
    )
  })

  it('strips only leading whitespace after the command name', () => {
    expect(getRawCommandAfterName('shell   copy foo', 'shell')).toBe('copy foo')
  })

  it('returns input unchanged when cmdName is empty', () => {
    // Edge case: empty cmdName slices 0 chars, then strips leading whitespace.
    expect(getRawCommandAfterName('  hello', '')).toBe('hello')
  })
})
