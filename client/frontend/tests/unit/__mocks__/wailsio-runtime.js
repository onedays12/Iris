/**
 * Minimal stub of `@wailsio/runtime` for unit tests.
 *
 * The real runtime drives the Wails IPC bridge, which is not available under
 * vitest + jsdom. This mock returns no-op / empty values for the surface area
 * that the bindings files import:
 *   - `Call.ByID(...)` → returns a Promise that resolves to '' (string bindings)
 *   - `CancellablePromise` → alias to native Promise (no cancel semantics in tests)
 *   - `Create.Array(...)` / class `createFrom` → identity pass-through
 *   - `Events`, `Dialogs`, etc. → inert stubs
 *
 * Tests that need to assert specific return values should override these via
 * `vi.mock('@wailsio/runtime', ...)` at the top of the test file.
 */

class CancellablePromise extends Promise {
  cancel() {}
  then(onFulfilled, onRejected) {
    return super.then(onFulfilled, onRejected)
  }
}

export const Call = {
  ByID: () => new CancellablePromise((resolve) => resolve('')),
  ByName: () => new CancellablePromise((resolve) => resolve('')),
}

export const Create = {
  // The real `Create` namespace exposes factory helpers that wrap runtime
  // payloads into typed instances. Under tests we never actually invoke the
  // Wails IPC bridge, so these factories only need to (a) be callable at
  // module-load time when bindings/*.js eagerly build their type trees, and
  // (b) return a function that, if ever called, passes the value through.
  Any: Symbol('create-any'),
  Array: () => (input) => (Array.isArray(input) ? input : input == null ? [] : [input]),
  Map: () => (input) => input,
  Object: (factory) => (input) => (factory ? factory(input) : input),
  Nullable: (factory) => (input) => (input == null ? null : factory(input)),
}

export const Events = {
  On: () => () => {},
  Off: () => {},
  Emit: () => {},
}

export const Dialogs = {
  Info: () => Promise.resolve(),
  Warning: () => Promise.resolve(),
  Error: () => Promise.resolve(),
  Question: () => Promise.resolve({ buttonIndex: 0 }),
  OpenFileDialog: () => Promise.resolve(''),
  SaveFileDialog: () => Promise.resolve(''),
}

export const Window = {
  Minimise: () => {},
  Maximise: () => {},
  Unmaximise: () => {},
  Close: () => {},
}

export const Application = {
  Quit: () => {},
}

export const Clipboard = {
  SetText: () => Promise.resolve(),
  GetText: () => Promise.resolve(''),
}

export const System = {
  Environment: () => Promise.resolve({}),
}

export const WML = {
  Ready: () => Promise.resolve(),
}

export { CancellablePromise }
export default {
  Call,
  Create,
  Events,
  Dialogs,
  Window,
  Application,
  Clipboard,
  System,
  WML,
}
