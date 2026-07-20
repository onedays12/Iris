/**
 * @fileoverview Protocol adapter — single entry point for canonical field extraction.
 *
 * Business code imports `pickBeacon`, `pickTunnel`, etc. instead of writing
 * `a.x || a.y || a.z` chains. All alias logic lives in fieldMap.js.
 *
 * @typedef {import('./types.jsdoc.js').CanonicalBeacon}      CanonicalBeacon
 * @typedef {import('./types.jsdoc.js').CanonicalTunnel}      CanonicalTunnel
 * @typedef {import('./types.jsdoc.js').CanonicalChannel}     CanonicalChannel
 * @typedef {import('./types.jsdoc.js').CanonicalListener}    CanonicalListener
 * @typedef {import('./types.jsdoc.js').CanonicalTransfer}    CanonicalTransfer
 * @typedef {import('./types.jsdoc.js').CanonicalCommandEvent} CanonicalCommandEvent
 * @typedef {import('./types.jsdoc.js').CanonicalFile}        CanonicalFile
 * @typedef {import('./types.jsdoc.js').CanonicalScreenshot}  CanonicalScreenshot
 * @typedef {import('./types.jsdoc.js').FieldMap}             FieldMap
 */

import { pick } from '../../utils/object.js'
import {
  BEACON_FIELDS,
  TUNNEL_FIELDS,
  CHANNEL_FIELDS,
  LISTENER_FIELDS,
  TRANSFER_FIELDS,
  COMMAND_EVENT_FIELDS,
  FILE_FIELDS,
  SCREENSHOT_FIELDS,
} from './fieldMap.js'

// ─── Generic helpers ───

/**
 * Build a canonical object from a raw source using a field map.
 *
 * Every canonical field is populated via {@link pick}; when no alias matches,
 * the field is set to `''` (the fallback). Numeric / boolean fields therefore
 * arrive as strings and must be coerced at the call site.
 *
 * @param {object|null|undefined} source - raw data from API or WS
 * @param {FieldMap} fieldMap - canonical name -> alias list
 * @returns {Record<string, string>} canonical object with every field defaulted to `''`
 */
function adaptEntity(source, fieldMap) {
  const out = {}
  for (const [canonical, aliases] of Object.entries(fieldMap)) {
    out[canonical] = pick(source, aliases, '')
  }
  return out
}

// ─── Per-entity adapters ───

/**
 * Extract the canonical beacon ID from a raw source.
 * @param {object|null|undefined} source
 * @returns {string}
 */
export function pickBeaconId(source) {
  return String(pick(source, BEACON_FIELDS.beaconId, '') || '')
}

/**
 * Adapt a raw beacon record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalBeacon}
 */
export function pickBeacon(source) {
  return adaptEntity(source, BEACON_FIELDS)
}

/**
 * Adapt a raw tunnel record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalTunnel}
 */
export function pickTunnel(source) {
  return adaptEntity(source, TUNNEL_FIELDS)
}

/**
 * Adapt a raw tunnel channel record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalChannel}
 */
export function pickChannel(source) {
  return adaptEntity(source, CHANNEL_FIELDS)
}

/**
 * Adapt a raw listener record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalListener}
 */
export function pickListener(source) {
  return adaptEntity(source, LISTENER_FIELDS)
}

/**
 * Adapt a raw file transfer task record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalTransfer}
 */
export function pickTransfer(source) {
  return adaptEntity(source, TRANSFER_FIELDS)
}

/**
 * Adapt a raw COMMAND_EVENT payload into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalCommandEvent}
 */
export function pickCommandEvent(source) {
  return adaptEntity(source, COMMAND_EVENT_FIELDS)
}

/**
 * Adapt a raw download-pool file metadata record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalFile}
 */
export function pickFile(source) {
  return adaptEntity(source, FILE_FIELDS)
}

/**
 * Adapt a raw screenshot record into a canonical shape.
 * @param {object|null|undefined} source
 * @returns {CanonicalScreenshot}
 */
export function pickScreenshot(source) {
  return adaptEntity(source, SCREENSHOT_FIELDS)
}
