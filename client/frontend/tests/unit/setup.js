/**
 * Vitest global setup.
 *
 * Runs once before any test file. Responsibilities:
 *   1. Ensure `globalThis.crypto` is present (jsdom omits it on older Node).
 *   2. Polyfill `window.matchMedia` and `window.scrollTo` which jsdom does not
 *      implement and Vue components sometimes touch during mount.
 */

import { webcrypto } from 'node:crypto'

// Crypto: Node 19+ exposes globalThis.crypto natively, but jsdom on some
// runners does not surface it on window. Ensure both are populated so
// `crypto.getRandomValues` works (used by listenerForm.generateEncryptKey).
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto
}

// matchMedia: jsdom omits it; some UI components probe it on mount.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// scrollTo: jsdom omits it; Vue scroll-restoration code may call it.
if (!window.scrollTo) {
  window.scrollTo = () => {}
}
