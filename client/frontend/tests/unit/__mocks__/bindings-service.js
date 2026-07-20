/**
 * Stub for the Wails-generated `bindings/irisclient/service` index module.
 *
 * The real `index.js` re-exports 4 service modules (FileService / PluginService /
 * ProxyService / WebSocketService), each of which is a generated .js file that
 * imports `@wailsio/runtime` and (for PluginService) the generated
 * `./internal/plugin/models.js` type factories. Those `internal/` files are
 * gitignored (regenerated locally by `wails3 generate`) and therefore absent
 * on CI, which breaks vitest's module resolution whenever a test's import
 * chain transitively pulls in `bindings/irisclient/service`.
 *
 * This stub replaces the entire service barrel with inert no-op functions so
 * that pure-function tests (e.g. useFileBrowserActions.buildCopyName) can load
 * their host module without triggering the binding resolution chain.
 *
 * Tests that actually need to assert binding call shapes should override this
 * via `vi.mock('../../../bindings/irisclient/service', ...)` at the top of
 * the test file.
 */

const noop = () => Promise.resolve('')
const noopVoid = () => Promise.resolve()

export const FileService = {
  ReadBinaryFileBase64: noop,
  ReadBinaryFileBase64Chunked: noop,
  WriteBinaryFile: noopVoid,
}

export const PluginService = {
  AddPlugin: noop,
  DeletePlugin: noop,
  GetPlugin: noop,
  InvokePluginAction: noop,
  ListPlugins: noop,
  ReloadPlugins: noop,
}

export const ProxyService = {
  DoRequest: noop,
  DoRequestWithStatus: noop,
  DownloadFileBase64: noop,
  UploadFileBase64: noop,
}

export const WebSocketService = {
  Connect: noopVoid,
  Disconnect: noopVoid,
  Status: noop,
}

export { FileService, PluginService, ProxyService, WebSocketService }
export default {
  FileService,
  PluginService,
  ProxyService,
  WebSocketService,
}
