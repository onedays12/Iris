import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as mockBarrel from '../../../bindings/irisclient/service'

/**
 * Wails 生成 bindings 的契约测试。
 *
 * 三向一致性:
 *   1. 期望清单 (CONTRACT) == 真实生成文件 (bindings/irisclient/service/*.js, git-tracked)
 *   2. 期望清单 == 测试 mock (tests/unit/__mocks__/bindings-service.ts)
 *
 * Go 侧新增/重命名/删除 Service 方法后, wails3 build 会再生这些 .js 文件,
 * 契约测试随即红掉 —— 强制开发者显式更新 CONTRACT 并同步 mock,
 * 防止 mock 漂移后测试全绿而真实 IPC 签名已损坏。
 */

const BINDINGS_DIR = resolve(__dirname, '../../../bindings/irisclient/service')

interface ServiceContract {
  /** 生成的绑定文件名 (git-tracked) */
  file: string
  /** barrel 中的模块名 */
  module: string
  /** 期望导出的方法清单 */
  methods: string[]
}

// 期望清单: 与 Go service 的导出方法一一对应, 变更 Go 方法时同步更新。
const CONTRACT: ServiceContract[] = [
  {
    file: 'fileservice.js',
    module: 'FileService',
    methods: ['ReadBinaryFileBase64', 'ReadBinaryFileBase64Chunked', 'WriteBinaryFile'],
  },
  {
    file: 'pluginservice.js',
    module: 'PluginService',
    methods: ['AddPlugin', 'DeletePlugin', 'GetPlugin', 'InvokePluginAction', 'ListPlugins', 'ReloadPlugins'],
  },
  {
    file: 'proxyservice.js',
    module: 'ProxyService',
    methods: ['DoRequestWithStatus', 'DownloadFileBase64', 'UploadFileBase64'],
  },
  {
    file: 'websocketservice.js',
    module: 'WebSocketService',
    methods: ['Connect', 'Disconnect', 'Status'],
  },
]

function exportedFunctions(source: string): string[] {
  const names = new Set<string>()
  const re = /\bexport\s+function\s+([A-Za-z0-9_]+)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) names.add(match[1])
  return [...names].sort()
}

describe('Wails binding 契约', () => {
  it('barrel index.js 再导出 4 个 service 模块', () => {
    const source = readFileSync(resolve(BINDINGS_DIR, 'index.js'), 'utf-8')
    for (const { module } of CONTRACT) {
      expect(source).toMatch(new RegExp(`import \\* as ${module} from "\\./\\w+\\.js"`))
      expect(source).toContain(module)
    }
  })

  for (const { file, module, methods } of CONTRACT) {
    it(`真实生成文件 ${file} 的导出面与契约清单一致`, () => {
      const source = readFileSync(resolve(BINDINGS_DIR, file), 'utf-8')
      expect(exportedFunctions(source)).toEqual([...methods].sort())
    })
  }

  it('测试 mock 的导出面与契约清单一致 (防 mock 漂移)', () => {
    for (const { module, methods } of CONTRACT) {
      const service = (mockBarrel as unknown as Record<string, Record<string, unknown>>)[module]
      expect(service, `${module} 应存在`).toBeTruthy()
      expect(Object.keys(service).sort(), `${module} 导出面`).toEqual([...methods].sort())
      for (const method of methods) {
        expect(typeof service[method], `${module}.${method} 应为函数`).toBe('function')
      }
    }
  })
})
