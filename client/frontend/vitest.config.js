// Vitest configuration — shares the vue plugin and alias map with vite.config.js.
//
// Scope: unit tests under tests/unit/. Existing tests/check-*.mjs scripts continue
// to run via `npm run check:all` and are deliberately excluded from vitest to keep
// the two test runners independent.
//
// `@wailsio/runtime` is globally stubbed in tests/unit/setup.js so component
// tests do not trigger real IPC calls.

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wailsio/runtime': resolve(__dirname, 'tests/unit/__mocks__/wailsio-runtime.js'),
      // Stub the Wails-generated service barrel so pure-function tests don't
      // transitively load bindings/*.js (which import @wailsio/runtime and the
      // gitignored internal/plugin/models.js type factories — absent on CI).
      // Individual specs that need real binding call shapes can vi.mock() locally.
      '../../../bindings/irisclient/service': resolve(__dirname, 'tests/unit/__mocks__/bindings-service.js'),
      '../../bindings/irisclient/service': resolve(__dirname, 'tests/unit/__mocks__/bindings-service.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    setupFiles: ['tests/unit/setup.js'],
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
