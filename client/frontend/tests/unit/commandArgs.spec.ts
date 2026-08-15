import { beforeAll, describe, expect, it } from 'vitest'
import zhCN from '../../src/locales/zh-CN.json'
import { i18n } from '../../src/i18n/index'
import { COMMAND_ID, PLUGIN_COMMAND_ID } from '../../src/constants/commands'
import { buildBeaconCommandArgs } from '../../src/features/beacon/api/commandArgs'

beforeAll(() => {
  // 校验错误消息经 i18n 渲染, 测试环境预载 zh-CN 断言中文文案
  i18n.global.setLocaleMessage('zh-CN', zhCN)
  i18n.global.locale.value = 'zh-CN'
})

describe('buildBeaconCommandArgs', () => {
  it('keeps a PowerShell raw command as one string', () => {
    expect(
      buildBeaconCommandArgs(COMMAND_ID.POWERSHELL, ['Copy-Item -LiteralPath "C:\\a b.txt" -Destination C:\\b.txt']),
    ).toEqual([{ kind: 'string', value: 'Copy-Item -LiteralPath "C:\\a b.txt" -Destination C:\\b.txt' }])
  })

  it('allows empty ls args', () => {
    expect(buildBeaconCommandArgs(COMMAND_ID.LS, [])).toEqual([])
  })

  it('uses string args for mv', () => {
    expect(buildBeaconCommandArgs(COMMAND_ID.MV, ['C:\\a.txt', 'C:\\b.txt'])).toEqual([
      { kind: 'string', value: 'C:\\a.txt' },
      { kind: 'string', value: 'C:\\b.txt' },
    ])
  })

  it('requires a path for cd', () => {
    expect(() => buildBeaconCommandArgs(COMMAND_ID.CD, [])).toThrow(/至少需要|不能为空/)
  })

  it('accepts typed setattr args', () => {
    expect(
      buildBeaconCommandArgs(COMMAND_ID.SETATTR, [
        { kind: 'string', value: 'C:\\Temp\\a.txt' },
        { kind: 'int32', value: 17 },
        { kind: 'string', value: 'b.txt' },
        { kind: 'int32', value: 3 },
      ]),
    ).toEqual([
      { kind: 'string', value: 'C:\\Temp\\a.txt' },
      { kind: 'int32', value: 17 },
      { kind: 'string', value: 'b.txt' },
      { kind: 'int32', value: 3 },
    ])
  })

  it('uses int32 screenshot defaults and rejects invalid quality', () => {
    expect(buildBeaconCommandArgs(COMMAND_ID.SCREENSHOT, [0, 80])).toEqual([
      { kind: 'int32', value: 0 },
      { kind: 'int32', value: 80 },
    ])
    expect(() => buildBeaconCommandArgs(COMMAND_ID.SCREENSHOT, [0, 101])).toThrow(/quality/)
  })

  it('clamps download transfer tuning values', () => {
    expect(buildBeaconCommandArgs(COMMAND_ID.DOWNLOAD, ['C:\\Temp\\large.bin', 1, 99])).toEqual([
      { kind: 'string', value: 'C:\\Temp\\large.bin' },
      { kind: 'int32', value: 65536 },
      { kind: 'int32', value: 5 },
    ])
  })

  it('fills optional migrate_spawn fields', () => {
    expect(buildBeaconCommandArgs(COMMAND_ID.MIGRATE, [2, 'http-listener', 'amd64'])).toEqual([
      { kind: 'int32', value: 2 },
      { kind: 'string', value: 'http-listener' },
      { kind: 'string', value: 'x64' },
      { kind: 'string', value: '' },
      { kind: 'string', value: '' },
    ])
  })

  it('builds documented postex inject args and requires dll bytes for spawn', () => {
    expect(
      buildBeaconCommandArgs(COMMAND_ID.POSTEX, [6, 3000, 15000, 0, 'refl-inject', '--count 1', 1234, { kind: 'bytes', value: 'AAE=' }]),
    ).toEqual([
      { kind: 'int32', value: 6 },
      { kind: 'int32', value: 3000 },
      { kind: 'int32', value: 15000 },
      { kind: 'int32', value: 0 },
      { kind: 'string', value: 'refl-inject' },
      { kind: 'string', value: '--count 1' },
      { kind: 'int32', value: 1234 },
      { kind: 'bytes', value: 'AAE=' },
    ])
    expect(() =>
      buildBeaconCommandArgs(COMMAND_ID.POSTEX, [5, 3000, 0, 0, 'refl-spawn', '', 'C:\\Windows\\System32\\notepad.exe', '']),
    ).toThrow(/dll_bytes|最多|至少/)
  })

  it('requires BOF bytes first and rejects unsupported arg kinds', () => {
    expect(
      buildBeaconCommandArgs(PLUGIN_COMMAND_ID.EXECUTION_BOF, [{ kind: 'bytes', value: 'AAE=' }, { kind: 'short', value: 77 }, 'hello']),
    ).toEqual([
      { kind: 'bytes', value: 'AAE=' },
      { kind: 'short', value: 77 },
      { kind: 'string', value: 'hello' },
    ])
    expect(() => buildBeaconCommandArgs(PLUGIN_COMMAND_ID.EXECUTION_BOF, ['not-bytes'])).toThrow(/BOF artifact/)
    expect(() => buildBeaconCommandArgs(COMMAND_ID.SHELL, [{ kind: 'json', value: {} }])).toThrow(/不支持的命令参数类型/)
  })
})
