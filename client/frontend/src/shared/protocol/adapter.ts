/**
 * @fileoverview Protocol adapter — single entry point for canonical field extraction.
 *
 * Business code imports `pickBeacon`, `pickTunnel`, etc. instead of writing
 * `a.x || a.y || a.z` chains. All alias logic lives in fieldMap.ts.
 */

import { pick } from '../../utils/object'
import {
  BEACON_FIELDS,
  TUNNEL_FIELDS,
  CHANNEL_FIELDS,
  LISTENER_FIELDS,
  TRANSFER_FIELDS,
  COMMAND_EVENT_FIELDS,
  FILE_FIELDS,
  SCREENSHOT_FIELDS,
} from './fieldMap'
import type {
  AdaptedField,
  CanonicalBeacon,
  CanonicalChannel,
  CanonicalCommandEvent,
  CanonicalFile,
  CanonicalListener,
  CanonicalScreenshot,
  CanonicalTransfer,
  CanonicalTunnel,
} from './types'

// ─── Generic helpers ───

/**
 * Build a canonical object from a raw source using a field map.
 *
 * Every canonical field is populated via {@link pick}; when no alias matches,
 * the field is set to `''` (the fallback). Hits keep the raw source value.
 */
function adaptEntity<T extends Record<string, readonly string[]>>(
  source: unknown,
  fieldMap: T,
): Record<keyof T, AdaptedField> {
  const out = {} as Record<keyof T, AdaptedField>
  for (const [canonical, aliases] of Object.entries(fieldMap) as [keyof T, readonly string[]][]) {
    out[canonical] = pick(source, aliases, '') as AdaptedField
  }
  return out
}

// ─── Per-entity adapters ───

/**
 * Extract the canonical beacon ID from a raw source.
 */
export function pickBeaconId(source: unknown): string {
  return String(pick(source, BEACON_FIELDS.beaconId, '') || '')
}

/**
 * Adapt a raw beacon record into a canonical shape.
 */
export function pickBeacon(source: unknown): CanonicalBeacon {
  return adaptEntity(source, BEACON_FIELDS)
}

/**
 * Adapt a raw tunnel record into a canonical shape.
 */
export function pickTunnel(source: unknown): CanonicalTunnel {
  return adaptEntity(source, TUNNEL_FIELDS)
}

/**
 * Adapt a raw tunnel channel record into a canonical shape.
 */
export function pickChannel(source: unknown): CanonicalChannel {
  return adaptEntity(source, CHANNEL_FIELDS)
}

/**
 * Adapt a raw listener record into a canonical shape.
 */
export function pickListener(source: unknown): CanonicalListener {
  return adaptEntity(source, LISTENER_FIELDS)
}

/**
 * Adapt a raw file transfer task record into a canonical shape.
 */
export function pickTransfer(source: unknown): CanonicalTransfer {
  return adaptEntity(source, TRANSFER_FIELDS)
}

/**
 * Adapt a raw COMMAND_EVENT payload into a canonical shape.
 */
export function pickCommandEvent(source: unknown): CanonicalCommandEvent {
  return adaptEntity(source, COMMAND_EVENT_FIELDS)
}

/**
 * Adapt a raw download-pool file metadata record into a canonical shape.
 */
export function pickFile(source: unknown): CanonicalFile {
  return adaptEntity(source, FILE_FIELDS)
}

/**
 * Adapt a raw screenshot record into a canonical shape.
 */
export function pickScreenshot(source: unknown): CanonicalScreenshot {
  return adaptEntity(source, SCREENSHOT_FIELDS)
}
