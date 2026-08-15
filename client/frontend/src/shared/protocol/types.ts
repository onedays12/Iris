/**
 * Canonical type definitions for the protocol adapter layer.
 *
 * These types describe the shape of objects returned by adapter pick* helpers.
 * Runtime matches pick(): a hit keeps the raw source value; a miss is ''.
 * Callers coerce with Number() / String() — adapter does not stringify fields
 * (except pickBeaconId, which always returns a string).
 */

import type {
  BEACON_FIELDS,
  CHANNEL_FIELDS,
  COMMAND_EVENT_FIELDS,
  FILE_FIELDS,
  LISTENER_FIELDS,
  SCREENSHOT_FIELDS,
  TRANSFER_FIELDS,
  TUNNEL_FIELDS,
} from './fieldMap'

/** 未命中任何别名时 adapter 的回退值 */
export type MissingField = ''

/**
 * 命中别名时保留源值（number / boolean / object / string 都可能）。
 * 调用方负责 Number() / String()，与现网 store 一致。
 */
export type AdaptedField = string | number | boolean | object | MissingField

/** A field map: canonical name -> ordered list of candidate aliases. */
export type FieldMap<K extends string = string> = Record<K, readonly string[]>

export type CanonicalBeacon = Record<keyof typeof BEACON_FIELDS, AdaptedField>
export type CanonicalTunnel = Record<keyof typeof TUNNEL_FIELDS, AdaptedField>
export type CanonicalChannel = Record<keyof typeof CHANNEL_FIELDS, AdaptedField>
export type CanonicalListener = Record<keyof typeof LISTENER_FIELDS, AdaptedField>
export type CanonicalTransfer = Record<keyof typeof TRANSFER_FIELDS, AdaptedField>
export type CanonicalCommandEvent = Record<keyof typeof COMMAND_EVENT_FIELDS, AdaptedField>
export type CanonicalFile = Record<keyof typeof FILE_FIELDS, AdaptedField>
export type CanonicalScreenshot = Record<keyof typeof SCREENSHOT_FIELDS, AdaptedField>
