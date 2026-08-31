// Vitest configuration — unit tests under tests/unit/.
//
// `@wailsio/runtime` is globally stubbed in tests/unit/setup.ts so component
// tests do not trigger real IPC calls.

import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wailsio/runtime': resolve(__dirname, 'tests/unit/__mocks__/wailsio-runtime.ts'),
      // Stub the Wails-generated service barrel so pure-function tests don't
      // transitively load bindings/*.js (which import @wailsio/runtime and the
      // gitignored internal/plugin/models.js type factories — absent on CI).
      // Individual specs that need real binding call shapes can vi.mock() locally.
      '../../../bindings/irisclient/service': resolve(__dirname, 'tests/unit/__mocks__/bindings-service.ts'),
      '../../bindings/irisclient/service': resolve(__dirname, 'tests/unit/__mocks__/bindings-service.ts'),
      // 子路径动态导入(downloadSave 等)绕过 barrel alias,单独挡住
      '../../../bindings/irisclient/service/fileservice': resolve(__dirname, 'tests/unit/__mocks__/bindings-fileservice.ts'),
      '../../bindings/irisclient/service/fileservice': resolve(__dirname, 'tests/unit/__mocks__/bindings-fileservice.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    setupFiles: ['tests/unit/setup.ts'],
    // Wails binding .js files import `@wailsio/runtime` — our mock covers the
    // call surface, but the dep optimizer still needs to crawl the package.
    // Inline it so vitest doesn't choke on the real runtime's exports.
    server: {
      deps: {
        inline: [/^@wailsio\//],
      },
    },
  },
})
