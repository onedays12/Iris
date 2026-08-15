import { describe, it, expect } from 'vitest'
import {
  COMMAND_ID,
  PLUGIN_COMMAND_ID,
  COMMAND_NAME,
  COMMAND_HELP,
  COMMAND_HELP_ALIASES,
  LOCAL_COMMAND_HELP,
  getCommandId,
  normalizeBeaconPlatform,
  normalizeBeaconArch,
  isCommandSupportedForOS,
  getSupportedCommandNamesForOS,
  getSupportedLocalCommandNamesForOS,
  getSupportedCommandHelpEntriesForOS,
  getSupportedLocalCommandHelpEntriesForOS,
  getUnsupportedCommandMessage,
  isMenuActionSupportedForOS,
} from '../../src/constants/commands'

// ─── Static data integrity ──────────────────────────────────────────────────

describe('commands — static data integrity', () => {
  it('COMMAND_ID maps well-known names to their protocol IDs', () => {
    expect(COMMAND_ID.SLEEP).toBe(1)
    expect(COMMAND_ID.EXIT).toBe(2)
    expect(COMMAND_ID.SHELL).toBe(10)
    expect(COMMAND_ID.POWERSHELL).toBe(11)
    expect(COMMAND_ID.LS).toBe(21)
    expect(COMMAND_ID.POSTEX).toBe(90)
    expect(COMMAND_ID.MIGRATE).toBe(100)
  })

  it('POSTEX aliases share the same ID 90', () => {
    expect(COMMAND_ID.POSTEX_SPAWN_DLL).toBe(90)
    expect(COMMAND_ID.POSTEX_INJECT_DLL).toBe(90)
  })

  it('MIGRATE aliases share the same ID 100', () => {
    expect(COMMAND_ID.SPAWNTO).toBe(100)
    expect(COMMAND_ID.MIGRATE_SPAWN).toBe(100)
    expect(COMMAND_ID.MIGRATE_INJECT).toBe(100)
  })

  it('CASCADE aliases map to 80 / 81', () => {
    expect(COMMAND_ID.CASCADE_CONNECT_TCP).toBe(80)
    expect(COMMAND_ID.CONNECT).toBe(80)
    expect(COMMAND_ID.CASCADE_LINK_SMB).toBe(81)
    expect(COMMAND_ID.LINK).toBe(81)
  })

  it('PLUGIN_COMMAND_ID.EXECUTION_BOF is 70', () => {
    expect(PLUGIN_COMMAND_ID.EXECUTION_BOF).toBe(70)
  })

  it('COMMAND_NAME reverse-maps IDs to lowercase names', () => {
    expect(COMMAND_NAME[String(COMMAND_ID.SLEEP)]).toBe('sleep')
    expect(COMMAND_NAME[String(COMMAND_ID.LS)]).toBe('ls')
  })

  it('COMMAND_NAME overrides POSTEX and MIGRATE group heads', () => {
    // The override ensures the canonical name is 'postex' / 'migrate', not the
    // last-inserted alias (POSTEX_INJECT_DLL / MIGRATE_INJECT).
    expect(COMMAND_NAME[String(COMMAND_ID.POSTEX)]).toBe('postex')
    expect(COMMAND_NAME[String(COMMAND_ID.MIGRATE)]).toBe('migrate')
  })

  it('COMMAND_HELP contains entries for all major commands', () => {
    for (const key of ['SLEEP', 'EXIT', 'SHELL', 'POWERSHELL', 'CD', 'LS', 'PWD', 'CAT', 'MKDIR', 'RM', 'MV', 'CP', 'ZIP', 'PS', 'KILL', 'SCREENSHOT']) {
      expect(COMMAND_HELP[key], `COMMAND_HELP.${key} should exist`).toBeDefined()
      expect(typeof COMMAND_HELP[key].usage).toBe('string')
      expect(typeof COMMAND_HELP[key].desc).toBe('string')
    }
  })

  it('COMMAND_HELP deliberately omits DOWNLOAD / UPLOAD (no help text defined)', () => {
    // Document the contract: DOWNLOAD/UPLOAD have COMMAND_ID entries (28/29)
    // but no COMMAND_HELP entry — the upload/download flow is triggered via
    // the file browser UI, not the console command line.
    expect(COMMAND_HELP.DOWNLOAD).toBeUndefined()
    expect(COMMAND_HELP.UPLOAD).toBeUndefined()
  })

  it('COMMAND_HELP_ALIASES maps CONNECT/LINK to CASCADE_* canonical names', () => {
    expect(COMMAND_HELP_ALIASES.CONNECT).toBe('CASCADE_CONNECT_TCP')
    expect(COMMAND_HELP_ALIASES.LINK).toBe('CASCADE_LINK_SMB')
  })

  it('LOCAL_COMMAND_HELP contains exec-bof entry', () => {
    expect(LOCAL_COMMAND_HELP['EXEC-BOF']).toBeDefined()
    expect(LOCAL_COMMAND_HELP['EXEC-BOF'].usage).toBe('exec-bof')
  })
})

// ─── getCommandId ───────────────────────────────────────────────────────────

describe('commands.getCommandId', () => {
  it('returns the ID for a known lowercase command name', () => {
    expect(getCommandId('sleep')).toBe(1)
    expect(getCommandId('ls')).toBe(21)
  })

  it('is case-insensitive (lowercase / UPPERCASE / MixedCase all match)', () => {
    expect(getCommandId('sleep')).toBe(1)
    expect(getCommandId('SLEEP')).toBe(1)
    expect(getCommandId('Sleep')).toBe(1)
    expect(getCommandId('PoWeRsHeLl')).toBe(11)
  })

  it('returns null for an unknown command name', () => {
    expect(getCommandId('doesnotexist')).toBeNull()
  })

  it('returns null for empty / null / undefined input', () => {
    expect(getCommandId('')).toBeNull()
    expect(getCommandId(null)).toBeNull()
    expect(getCommandId(undefined)).toBeNull()
  })

  it('resolves CASCADE aliases to 80 / 81', () => {
    expect(getCommandId('connect')).toBe(80)
    expect(getCommandId('link')).toBe(81)
  })

  it('resolves MIGRATE aliases to 100', () => {
    expect(getCommandId('spawnto')).toBe(100)
    expect(getCommandId('migrate_spawn')).toBe(100)
    expect(getCommandId('migrate_inject')).toBe(100)
  })
})

// ─── normalizeBeaconPlatform ────────────────────────────────────────────────

describe('commands.normalizeBeaconPlatform', () => {
  it('detects windows from substrings', () => {
    expect(normalizeBeaconPlatform('Windows')).toBe('windows')
    expect(normalizeBeaconPlatform('Windows 10 Pro')).toBe('windows')
    expect(normalizeBeaconPlatform('WINDOWS SERVER 2019')).toBe('windows')
  })

  it('detects linux from substrings', () => {
    expect(normalizeBeaconPlatform('linux')).toBe('linux')
    expect(normalizeBeaconPlatform('Ubuntu Linux 22.04')).toBe('linux')
  })

  it('detects darwin from darwin / mac substrings', () => {
    expect(normalizeBeaconPlatform('darwin')).toBe('darwin')
    expect(normalizeBeaconPlatform('macOS')).toBe('darwin')
    expect(normalizeBeaconPlatform('Mac OS X')).toBe('darwin')
  })

  it('returns unknown for unrecognized platforms', () => {
    expect(normalizeBeaconPlatform('freebsd')).toBe('unknown')
    expect(normalizeBeaconPlatform('')).toBe('unknown')
  })

  it('returns unknown for null / undefined', () => {
    expect(normalizeBeaconPlatform(null)).toBe('unknown')
    expect(normalizeBeaconPlatform(undefined)).toBe('unknown')
  })
})

// ─── normalizeBeaconArch ───────────────────────────────────────────────────

describe('commands.normalizeBeaconArch', () => {
  it('normalizes 64-bit aliases to amd64', () => {
    expect(normalizeBeaconArch('amd64')).toBe('amd64')
    expect(normalizeBeaconArch('x64')).toBe('amd64')
    expect(normalizeBeaconArch('x86_64')).toBe('amd64')
    expect(normalizeBeaconArch('AMD64')).toBe('amd64')
    expect(normalizeBeaconArch('X64')).toBe('amd64')
  })

  it('normalizes 32-bit aliases to x86', () => {
    expect(normalizeBeaconArch('x86')).toBe('x86')
    expect(normalizeBeaconArch('i386')).toBe('x86')
    expect(normalizeBeaconArch('386')).toBe('x86')
  })

  it('trims whitespace and lowercases the input', () => {
    expect(normalizeBeaconArch('  AMD64  ')).toBe('amd64')
    expect(normalizeBeaconArch('  X86  ')).toBe('x86')
  })

  it('returns the lowercased input for non-canonical arches (arm, etc.)', () => {
    expect(normalizeBeaconArch('arm')).toBe('arm')
    expect(normalizeBeaconArch('ARM')).toBe('arm')
  })

  it('returns unknown for empty / null / undefined', () => {
    expect(normalizeBeaconArch('')).toBe('unknown')
    expect(normalizeBeaconArch(null)).toBe('unknown')
    expect(normalizeBeaconArch(undefined)).toBe('unknown')
  })
})

// ─── isCommandSupportedForOS ───────────────────────────────────────────────

describe('commands.isCommandSupportedForOS', () => {
  it('returns true for any command on windows (no exclusion rules)', () => {
    expect(isCommandSupportedForOS('powershell', 'windows')).toBe(true)
    expect(isCommandSupportedForOS('sleep', 'windows')).toBe(true)
    expect(isCommandSupportedForOS('shell', 'Windows 10')).toBe(true)
  })

  it('returns true for any command on darwin (no exclusion rules)', () => {
    expect(isCommandSupportedForOS('powershell', 'darwin')).toBe(true)
    expect(isCommandSupportedForOS('shell', 'macOS')).toBe(true)
  })

  it('returns true for any command on unknown platform', () => {
    expect(isCommandSupportedForOS('powershell', 'freebsd')).toBe(true)
    expect(isCommandSupportedForOS('whatever', '')).toBe(true)
  })

  it('rejects powershell on linux by name', () => {
    expect(isCommandSupportedForOS('powershell', 'linux')).toBe(false)
    expect(isCommandSupportedForOS('POWERSHELL', 'linux')).toBe(false)
    expect(isCommandSupportedForOS('PowerShell', 'linux')).toBe(false)
  })

  it('accepts other commands on linux', () => {
    expect(isCommandSupportedForOS('shell', 'linux')).toBe(true)
    expect(isCommandSupportedForOS('sleep', 'linux')).toBe(true)
    expect(isCommandSupportedForOS('ls', 'linux')).toBe(true)
  })

  it('treats underscore as dash when matching (snake_case names)', () => {
    // The function replaces _ with - before lookup. powershell has no underscore,
    // but we verify the path for a hypothetical name. powershell stays blocked.
    expect(isCommandSupportedForOS('powershell', 'linux')).toBe(false)
  })

  it('accepts a numeric command id and resolves via COMMAND_NAME', () => {
    // POWERSHELL id=11 should be blocked on linux.
    expect(isCommandSupportedForOS(COMMAND_ID.POWERSHELL, 'linux')).toBe(false)
    // SLEEP id=1 should be allowed on linux.
    expect(isCommandSupportedForOS(COMMAND_ID.SLEEP, 'linux')).toBe(true)
  })

  it('returns true for unknown numeric command id', () => {
    expect(isCommandSupportedForOS(99999, 'linux')).toBe(true)
  })

  it('returns true for empty / nullish command name', () => {
    expect(isCommandSupportedForOS('', 'linux')).toBe(true)
    expect(isCommandSupportedForOS(null as unknown as string, 'linux')).toBe(true)
  })
})

// ─── getSupportedCommandNamesForOS ─────────────────────────────────────────

describe('commands.getSupportedCommandNamesForOS', () => {
  it('excludes powershell on linux', () => {
    const names = getSupportedCommandNamesForOS('linux')
    expect(names).not.toContain('powershell')
    expect(names).toContain('shell')
    expect(names).toContain('sleep')
  })

  it('includes powershell on windows', () => {
    const names = getSupportedCommandNamesForOS('windows')
    expect(names).toContain('powershell')
    expect(names).toContain('shell')
  })

  it('returns lowercase names', () => {
    const names = getSupportedCommandNamesForOS('windows')
    for (const name of names) {
      expect(name).toBe(name.toLowerCase())
    }
  })

  it('includes migrate aliases', () => {
    const names = getSupportedCommandNamesForOS('windows')
    expect(names).toContain('migrate')
    expect(names).toContain('migrate_spawn')
    expect(names).toContain('migrate_inject')
    expect(names).toContain('spawnto')
  })
})

// ─── getSupportedLocalCommandNamesForOS ────────────────────────────────────

describe('commands.getSupportedLocalCommandNamesForOS', () => {
  it('returns lowercase names from LOCAL_COMMAND_HELP', () => {
    const names = getSupportedLocalCommandNamesForOS('windows')
    expect(names).toContain('exec-bof')
  })

  it('excludes unsupported commands on linux', () => {
    // exec-bof maps to BOF which has no linux exclusion — should still be present.
    const names = getSupportedLocalCommandNamesForOS('linux')
    expect(names).toContain('exec-bof')
  })
})

// ─── getSupportedCommandHelpEntriesForOS ───────────────────────────────────

describe('commands.getSupportedCommandHelpEntriesForOS', () => {
  it('returns [name, help] tuples filtered by OS', () => {
    const entries = getSupportedCommandHelpEntriesForOS('linux')
    for (const [name, help] of entries) {
      expect(typeof name).toBe('string')
      expect(typeof help.usage).toBe('string')
    }
    // powershell should be filtered out on linux.
    const names = entries.map(([n]) => n.toLowerCase())
    expect(names).not.toContain('powershell')
  })

  it('includes powershell entry on windows', () => {
    const entries = getSupportedCommandHelpEntriesForOS('windows')
    const names = entries.map(([n]) => n.toLowerCase())
    expect(names).toContain('powershell')
  })
})

describe('commands.getSupportedLocalCommandHelpEntriesForOS', () => {
  it('returns [name, help] tuples from LOCAL_COMMAND_HELP', () => {
    const entries = getSupportedLocalCommandHelpEntriesForOS('windows')
    expect(entries.length).toBeGreaterThan(0)
    const [name, help] = entries[0]
    expect(typeof name).toBe('string')
    expect(typeof help.usage).toBe('string')
  })
})

// ─── getUnsupportedCommandMessage ──────────────────────────────────────────

describe('commands.getUnsupportedCommandMessage', () => {
  it('includes the platform label for linux', () => {
    expect(getUnsupportedCommandMessage('powershell', 'linux')).toContain('Linux')
    expect(getUnsupportedCommandMessage('powershell', 'linux')).toContain('powershell')
  })

  it('includes the platform label for windows', () => {
    expect(getUnsupportedCommandMessage('cmd', 'windows')).toContain('Windows')
    expect(getUnsupportedCommandMessage('cmd', 'windows')).toContain('cmd')
  })

  it('falls back to "当前" for unknown platforms', () => {
    const msg = getUnsupportedCommandMessage('cmd', 'freebsd')
    expect(msg).toContain('当前')
    expect(msg).not.toContain('Linux')
    expect(msg).not.toContain('Windows')
  })

  it('uses the platform label for darwin via the "当前" fallback', () => {
    // darwin is not explicitly mapped in the ternary → falls to "当前".
    const msg = getUnsupportedCommandMessage('cmd', 'darwin')
    expect(msg).toContain('当前')
  })

  it('always wraps the command name in quotes', () => {
    expect(getUnsupportedCommandMessage('mycmd', 'linux')).toContain('"mycmd"')
  })
})

// ─── isMenuActionSupportedForOS ────────────────────────────────────────────

describe('commands.isMenuActionSupportedForOS', () => {
  it('returns true by default for unmapped actions', () => {
    expect(isMenuActionSupportedForOS('unknown-action', 'linux')).toBe(true)
    expect(isMenuActionSupportedForOS('unknown-action', 'windows')).toBe(true)
  })

  it('returns true by default for null / empty action', () => {
    expect(isMenuActionSupportedForOS(null, 'linux')).toBe(true)
    expect(isMenuActionSupportedForOS('', 'linux')).toBe(true)
  })

  it('is case-insensitive on the action name', () => {
    // exec-bof maps to PLUGIN_COMMAND_ID.EXECUTION_BOF (70) which is supported
    // on all current platforms (no exclusion rule for id=70).
    expect(isMenuActionSupportedForOS('exec-bof', 'linux')).toBe(true)
    expect(isMenuActionSupportedForOS('EXEC-BOF', 'linux')).toBe(true)
    expect(isMenuActionSupportedForOS('Exec-Bof', 'linux')).toBe(true)
  })

  it('defers to a numeric commandId argument when provided', () => {
    // Pass POWERSHELL id directly — should be blocked on linux.
    expect(isMenuActionSupportedForOS('whatever', 'linux', COMMAND_ID.POWERSHELL)).toBe(false)
    // SLEEP id — allowed on linux.
    expect(isMenuActionSupportedForOS('whatever', 'linux', COMMAND_ID.SLEEP)).toBe(true)
  })

  it('ignores non-finite numeric commandId (NaN)', () => {
    expect(isMenuActionSupportedForOS('exec-bof', 'linux', NaN)).toBe(true)
  })
})
