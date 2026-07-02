import assert from 'node:assert/strict'
import { COMMAND_ID, PLUGIN_COMMAND_ID } from '../src/constants/commands.js'
import { buildBeaconCommandArgs } from '../src/features/beacon/api/commandArgs.js'

function eq(actual, expected, label) {
  assert.deepEqual(actual, expected, label)
}

function throws(fn, pattern, label) {
  assert.throws(fn, pattern, label)
}

eq(
  buildBeaconCommandArgs(COMMAND_ID.POWERSHELL, ['Copy-Item -LiteralPath "C:\\a b.txt" -Destination C:\\b.txt']),
  [{ kind: 'string', value: 'Copy-Item -LiteralPath "C:\\a b.txt" -Destination C:\\b.txt' }],
  'PowerShell raw command stays one string'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.LS, []),
  [],
  'ls supports empty args'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.MV, ['C:\\a.txt', 'C:\\b.txt']),
  [
    { kind: 'string', value: 'C:\\a.txt' },
    { kind: 'string', value: 'C:\\b.txt' },
  ],
  'mv uses string args'
)

throws(
  () => buildBeaconCommandArgs(COMMAND_ID.CD, []),
  /至少需要|不能为空/,
  'cd requires a path'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.SETATTR, [
    { kind: 'string', value: 'C:\\Temp\\a.txt' },
    { kind: 'int32', value: 17 },
    { kind: 'string', value: 'b.txt' },
    { kind: 'int32', value: 3 },
  ]),
  [
    { kind: 'string', value: 'C:\\Temp\\a.txt' },
    { kind: 'int32', value: 17 },
    { kind: 'string', value: 'b.txt' },
    { kind: 'int32', value: 3 },
  ],
  'setattr accepts typed args'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.SCREENSHOT, [0, 80]),
  [
    { kind: 'int32', value: 0 },
    { kind: 'int32', value: 80 },
  ],
  'screenshot uses int32 defaults'
)

throws(
  () => buildBeaconCommandArgs(COMMAND_ID.SCREENSHOT, [0, 101]),
  /quality/,
  'screenshot rejects invalid quality'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.DOWNLOAD, ['C:\\Temp\\large.bin', 1, 99]),
  [
    { kind: 'string', value: 'C:\\Temp\\large.bin' },
    { kind: 'int32', value: 65536 },
    { kind: 'int32', value: 5 },
  ],
  'download clamps transfer tuning values'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.MIGRATE, [2, 'http-listener', 'amd64']),
  [
    { kind: 'int32', value: 2 },
    { kind: 'string', value: 'http-listener' },
    { kind: 'string', value: 'x64' },
    { kind: 'string', value: '' },
    { kind: 'string', value: '' },
  ],
  'migrate_spawn fills optional spawn fields'
)

eq(
  buildBeaconCommandArgs(COMMAND_ID.POSTEX, [6, 3000, 15000, 0, 'refl-inject', '--count 1', 1234, { kind: 'bytes', value: 'AAE=' }]),
  [
    { kind: 'int32', value: 6 },
    { kind: 'int32', value: 3000 },
    { kind: 'int32', value: 15000 },
    { kind: 'int32', value: 0 },
    { kind: 'string', value: 'refl-inject' },
    { kind: 'string', value: '--count 1' },
    { kind: 'int32', value: 1234 },
    { kind: 'bytes', value: 'AAE=' },
  ],
  'postex inject builds documented typed args'
)

throws(
  () => buildBeaconCommandArgs(COMMAND_ID.POSTEX, [5, 3000, 0, 0, 'refl-spawn', '', 'C:\\Windows\\System32\\notepad.exe', '']),
  /dll_bytes|最多|至少/,
  'postex spawn requires dll bytes'
)

eq(
  buildBeaconCommandArgs(PLUGIN_COMMAND_ID.EXECUTION_BOF, [{ kind: 'bytes', value: 'AAE=' }, { kind: 'short', value: 77 }, 'hello']),
  [
    { kind: 'bytes', value: 'AAE=' },
    { kind: 'short', value: 77 },
    { kind: 'string', value: 'hello' },
  ],
  'BOF requires bytes first and keeps typed args'
)

throws(
  () => buildBeaconCommandArgs(PLUGIN_COMMAND_ID.EXECUTION_BOF, ['not-bytes']),
  /BOF 工件内容/,
  'BOF rejects non-bytes object'
)

throws(
  () => buildBeaconCommandArgs(COMMAND_ID.SHELL, [{ kind: 'json', value: {} }]),
  /不支持的命令参数类型/,
  'unsupported arg kind is rejected'
)

console.log('command args compatibility ok')
