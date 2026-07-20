/**
 * @fileoverview Canonical type definitions for the protocol adapter layer.
 *
 * These typedefs describe the shape of objects returned by `adapter.js`'s
 * `pickBeacon` / `pickTunnel` / etc. They are JSDoc-only — no runtime values
 * are exported. Import them via `@typedef` references in consuming files.
 *
 * All fields default to `''` (empty string) when the source has no matching
 * alias, because `pick()` returns the provided fallback. Numeric fields (ports,
 * byte counts, depths) arrive as strings and must be coerced at the call site
 * if a number is required.
 */

/**
 * Canonical Beacon entity (adapted from raw API/WS data via `pickBeacon`).
 * @typedef {Object} CanonicalBeacon
 * @property {string} beaconId
 * @property {string} hostname
 * @property {string} internalIp
 * @property {string} externalIp
 * @property {string} listener
 * @property {string} listenerType
 * @property {string} parentId
 * @property {string} gatewayId
 * @property {string} depth        - numeric, but stringified (coerce at call site)
 * @property {string} linkProtocol
 * @property {string} linkState
 * @property {string} linkHint
 * @property {string} linkAddr
 * @property {string} os
 * @property {string} arch
 * @property {string} protocol
 * @property {string} username
 * @property {string} processName
 * @property {string} pid          - numeric, but stringified
 * @property {string} acp          - numeric, but stringified
 * @property {string} isAdmin      - boolean-like, but stringified
 * @property {string} sleep        - numeric, but stringified
 * @property {string} jitter       - numeric, but stringified
 * @property {string} lastSeen
 * @property {string} status
 */

/**
 * Canonical Tunnel entity.
 * @typedef {Object} CanonicalTunnel
 * @property {string} tunnelId
 * @property {string} beaconId
 * @property {string} mode
 * @property {string} bindHost
 * @property {string} bindPort     - numeric, but stringified
 * @property {string} remoteHost
 * @property {string} remotePort   - numeric, but stringified
 * @property {string} socksAuthMode
 * @property {string} socksUsername
 * @property {string} socksUdpAssociate
 * @property {string} activeChannels - numeric, but stringified
 * @property {string} bytesIn      - numeric, but stringified
 * @property {string} bytesOut     - numeric, but stringified
 * @property {string} status
 * @property {string} errorMessage
 * @property {string} channelId
 * @property {string} queueDepth   - numeric, but stringified
 * @property {string} dropCount    - numeric, but stringified
 * @property {string} timeoutCount - numeric, but stringified
 * @property {string} openLatencyMs - numeric, but stringified
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Canonical Tunnel Channel entity (a single connection within a tunnel).
 * @typedef {Object} CanonicalChannel
 * @property {string} channelId
 * @property {string} tunnelId
 * @property {string} beaconId
 * @property {string} targetAddress
 * @property {string} remoteHost
 * @property {string} remotePort   - numeric, but stringified
 * @property {string} localHost
 * @property {string} localPort    - numeric, but stringified
 * @property {string} status
 * @property {string} bytesIn      - numeric, but stringified
 * @property {string} bytesOut     - numeric, but stringified
 * @property {string} reason
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Canonical Listener entity.
 * @typedef {Object} CanonicalListener
 * @property {string} id
 * @property {string} name
 * @property {string} protocol
 * @property {string} bindAddr
 * @property {string} bindPort     - numeric, but stringified
 * @property {string} status
 * @property {string} listenerType
 * @property {string} config       - JSON string; parse at call site if object needed
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Canonical file Transfer entity (upload/download task progress).
 * @typedef {Object} CanonicalTransfer
 * @property {string} taskId
 * @property {string} direction    - 'upload' | 'download'
 * @property {string} beaconId
 * @property {string} fileId
 * @property {string} fileName
 * @property {string} remotePath
 * @property {string} totalChunks  - numeric, but stringified
 * @property {string} receivedChunks - numeric, but stringified
 * @property {string} receivedBytes  - numeric, but stringified
 * @property {string} size         - numeric, but stringified
 * @property {string} status
 * @property {string} error
 */

/**
 * Canonical COMMAND_EVENT payload (a single command result/progress frame).
 * @typedef {Object} CanonicalCommandEvent
 * @property {string} taskId
 * @property {string} beaconId
 * @property {string} phase        - 'progress' | 'output' | 'final' | etc.
 * @property {string} status       - 'success' | 'error' | '' when not applicable
 * @property {string} resultType   - e.g. 'explorer_files', 'screenshot', 'postex_output'
 * @property {string} error
 */

/**
 * Canonical File metadata entity (from download pool / artifact listing).
 * @typedef {Object} CanonicalFile
 * @property {string} fileId
 * @property {string} fileName
 * @property {string} size         - numeric, but stringified
 * @property {string} sha256
 * @property {string} modTime
 * @property {string} downloadUrl
 */

/**
 * Canonical Screenshot entity.
 * @typedef {Object} CanonicalScreenshot
 * @property {string} screenshotId
 * @property {string} beaconId
 * @property {string} hostname
 * @property {string} username
 * @property {string} resolution
 * @property {string} imageSize    - numeric, but stringified
 * @property {string} capturedAt
 * @property {string} fileName
 * @property {string} previewUrl
 * @property {string} downloadUrl
 */

/**
 * A field map: canonical name → ordered list of candidate aliases.
 * The first non-empty value in `source[alias]` wins; if none match, the
 * fallback (default `''`) is used.
 * @typedef {Record<string, readonly string[]>} FieldMap
 */

export {}
