/**
 * @fileoverview Canonical field map（破坏性收敛后）。
 *
 * 每个字段只保留文档契约（FRONTEND_API_CONTRACT.md）定义的 canonical snake_case 名。
 * 历史大小写别名（camelCase / PascalCase / 紧凑写法）已全部移除：
 * TeamServer 与 Go 后端均只产出 canonical 字段，前端不再做多键回退。
 *
 * Business code should NEVER write `a.x || a.y || a.z` — import from adapter.js instead.
 */

/**
 * Beacon field aliases.
 */
export const BEACON_FIELDS = {
  beaconId:      ['beacon_id'],
  hostname:      ['hostname'],
  internalIp:    ['internal_ip'],
  externalIp:    ['external_ip'],
  listener:      ['listener'],
  listenerType:  ['listener_type'],
  parentId:      ['parent_id'],
  gatewayId:     ['gateway_id'],
  depth:         ['depth'],
  linkProtocol:  ['link_protocol'],
  linkState:     ['link_state'],
  linkHint:      ['link_hint'],
  linkAddr:      ['link_addr'],
  os:            ['os'],
  arch:          ['arch'],
  protocol:      ['protocol'],
  username:      ['username'],
  processName:   ['process_name'],
  pid:           ['pid'],
  acp:           ['acp'],
  isAdmin:       ['is_admin'],
  sleep:         ['sleep'],
  jitter:        ['jitter'],
  lastSeen:      ['last_seen'],
  status:        ['status'],
  note:          ['note'],
  groupName:     ['group_name'],
} as const

/**
 * Tunnel field aliases (applies to tunnel metadata + per-tunnel stats).
 */
export const TUNNEL_FIELDS = {
  tunnelId:        ['tunnel_id'],
  beaconId:        ['beacon_id'],
  mode:            ['mode'],
  bindHost:        ['bind_host'],
  bindPort:        ['bind_port'],
  remoteHost:      ['remote_host'],
  remotePort:      ['remote_port'],
  socksAuthMode:   ['socks_auth_mode'],
  socksUsername:   ['socks_username'],
  socksUdpAssociate: ['socks_udp_associate'],
  activeChannels:  ['active_channels'],
  bytesIn:         ['bytes_in'],
  bytesOut:        ['bytes_out'],
  status:          ['status'],
  errorMessage:    ['error_message'],
  channelId:       ['channel_id'],
  queueDepth:      ['queue_depth'],
  dropCount:       ['drop_count'],
  timeoutCount:    ['timeout_count'],
  openLatencyMs:   ['open_latency_ms'],
  createdAt:       ['created_at'],
  updatedAt:       ['updated_at'],
} as const

/**
 * Tunnel channel field aliases (a single connection within a tunnel).
 */
export const CHANNEL_FIELDS = {
  channelId:      ['channel_id'],
  tunnelId:       ['tunnel_id'],
  beaconId:       ['beacon_id'],
  targetAddress:  ['target_address'],
  remoteHost:     ['remote_host'],
  remotePort:     ['remote_port'],
  localHost:      ['local_host'],
  localPort:      ['local_port'],
  status:         ['status'],
  bytesIn:        ['bytes_in'],
  bytesOut:       ['bytes_out'],
  reason:         ['reason'],
  createdAt:      ['created_at'],
  updatedAt:      ['updated_at'],
} as const

/**
 * Listener field aliases.
 */
export const LISTENER_FIELDS = {
  id:            ['id'],
  name:          ['name'],
  protocol:      ['protocol'],
  bindAddr:      ['bind_addr'],
  bindPort:      ['bind_port'],
  status:        ['status'],
  listenerType:  ['listener_type'],
  config:        ['config'],
  createdAt:     ['created_at'],
  updatedAt:     ['updated_at'],
} as const

/**
 * File transfer task field aliases (upload/download progress tracking).
 * 契约: download 进度用 received_chunks/received_bytes; upload 确认用 acked_chunks/acked_bytes。
 */
export const TRANSFER_FIELDS = {
  taskId:         ['task_id'],
  direction:      ['direction'],
  beaconId:       ['beacon_id'],
  fileId:         ['file_id'],
  fileName:       ['file_name'],
  remotePath:     ['remote_path'],
  totalChunks:    ['total_chunks'],
  receivedChunks: ['received_chunks'],
  receivedBytes:  ['received_bytes'],
  ackedChunks:    ['acked_chunks'],
  ackedBytes:     ['acked_bytes'],
  size:           ['size'],
  status:         ['status'],
  error:          ['error'],
} as const

/**
 * COMMAND_EVENT payload field aliases.
 */
export const COMMAND_EVENT_FIELDS = {
  taskId:       ['task_id'],
  beaconId:     ['beacon_id'],
  phase:        ['phase'],
  status:       ['status'],
  resultType:   ['result_type'],
  error:        ['error'],
  // ─── Post-Ex / Cascade 事件字段（commandEventHandler 经 pickCommandEvent 读取）───
  jobId:        ['job_id'],
  description:  ['description'],
  artifactId:   ['artifact_id'],
  fileId:       ['file_id'],
  artifactName: ['name'],
  mime:         ['mime'],
  totalSize:    ['total_size'],
  downloadUrl:  ['download_url'],
  frameName:    ['frame_name'],
  text:         ['text'],
  code:         ['code'],
  stage:        ['stage'],
  win32Error:   ['win32_error'],
  ntstatus:     ['ntstatus'],
  source:       ['source'],
  message:      ['message'],
  offset:       ['offset'],
  chunkSize:    ['chunk_size'],
  action:       ['action'],
  childId:      ['child_id'],
  reason:       ['reason'],
  data:         ['data'],
} as const

/**
 * Download pool / artifact file metadata field aliases.
 */
export const FILE_FIELDS = {
  fileId:       ['file_id'],
  fileName:     ['file_name'],
  size:         ['size'],
  sha256:       ['sha256'],
  modTime:      ['mod_time'],
  downloadUrl:  ['download_url'],
} as const

/**
 * Screenshot metadata field aliases.
 */
export const SCREENSHOT_FIELDS = {
  screenshotId: ['screenshot_id'],
  beaconId:     ['beacon_id'],
  hostname:     ['hostname'],
  username:     ['username'],
  resolution:   ['resolution'],
  imageSize:    ['image_size'],
  capturedAt:   ['captured_at'],
  fileName:     ['file_name'],
  previewUrl:   ['preview_url'],
  downloadUrl:  ['download_url'],
} as const
