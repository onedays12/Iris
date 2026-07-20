/**
 * @fileoverview Canonical field alias map.
 *
 * Each entry: canonicalName -> [alias1, alias2, ...]
 * First non-empty value wins. Canonical name (first) matches TeamServer FRONTEND_API_CONTRACT.md.
 *
 * Business code should NEVER write `a.x || a.y || a.z` — import from adapter.js instead.
 *
 * @typedef {import('./types.jsdoc.js').FieldMap} FieldMap
 */

/**
 * Beacon field aliases.
 * @type {FieldMap}
 */
export const BEACON_FIELDS = {
  beaconId:      ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId', 'beaconid', 'id', 'ID', 'uuid', 'UUID'],
  hostname:      ['hostname', 'Hostname', 'host_name', 'HostName'],
  internalIp:    ['internal_ip', 'internalIp', 'InternalIP', 'InternalIp', 'ip', 'IP'],
  externalIp:    ['external_ip', 'externalIp', 'ExternalIP', 'ExternalIp'],
  listener:      ['listener', 'Listener'],
  listenerType:  ['listener_type', 'listenerType', 'ListenerType'],
  parentId:      ['parent_id', 'parentId', 'ParentId', 'ParentID'],
  gatewayId:     ['gateway_id', 'gatewayId', 'GatewayID', 'GatewayId'],
  depth:         ['depth', 'Depth'],
  linkProtocol:  ['link_protocol', 'linkProtocol', 'LinkProtocol'],
  linkState:     ['link_state', 'linkState', 'LinkState'],
  linkHint:      ['link_hint', 'linkHint', 'LinkHint'],
  linkAddr:      ['link_addr', 'linkAddr', 'LinkAddr'],
  os:            ['os', 'OS'],
  arch:          ['arch', 'Arch'],
  protocol:      ['protocol', 'Protocol'],
  username:      ['username', 'Username', 'user_name', 'UserName'],
  processName:   ['process_name', 'processName', 'ProcessName', 'process', 'Process'],
  pid:           ['pid', 'PID'],
  acp:           ['acp', 'ACP'],
  isAdmin:       ['is_admin', 'isAdmin', 'IsAdmin'],
  sleep:         ['sleep', 'Sleep'],
  jitter:        ['jitter', 'Jitter'],
  lastSeen:      ['last_seen', 'lastSeen', 'LastSeen'],
  status:        ['status', 'Status'],
}

/**
 * Tunnel field aliases (applies to tunnel metadata + per-tunnel stats).
 * @type {FieldMap}
 */
export const TUNNEL_FIELDS = {
  tunnelId:        ['tunnel_id', 'tunnelId', 'TunnelID', 'TunnelId', 'id', 'ID'],
  beaconId:        ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId'],
  mode:            ['mode', 'Mode', 'type', 'Type'],
  bindHost:        ['bind_host', 'bindHost', 'BindHost', 'listen_host', 'listenHost'],
  bindPort:        ['bind_port', 'bindPort', 'BindPort', 'listen_port', 'listenPort'],
  remoteHost:      ['remote_host', 'remoteHost', 'RemoteHost', 'target_host', 'targetHost'],
  remotePort:      ['remote_port', 'remotePort', 'RemotePort', 'target_port', 'targetPort'],
  socksAuthMode:   ['socks_auth_mode', 'socksAuthMode', 'SocksAuthMode'],
  socksUsername:   ['socks_username', 'socksUsername', 'SocksUsername'],
  socksUdpAssociate: ['socks_udp_associate', 'socksUdpAssociate', 'SocksUdpAssociate'],
  activeChannels:  ['active_channels', 'activeChannels', 'ActiveChannels', 'connections', 'Connections', 'conn_count', 'connCount'],
  bytesIn:         ['bytes_in', 'bytesIn', 'BytesIn', 'in_bytes', 'inBytes'],
  bytesOut:        ['bytes_out', 'bytesOut', 'BytesOut', 'out_bytes', 'outBytes'],
  status:          ['status', 'Status', 'state', 'State'],
  errorMessage:    ['error_message', 'errorMessage', 'ErrorMessage'],
  channelId:       ['channel_id', 'channelId', 'ChannelID', 'ChannelId'],
  queueDepth:      ['queue_depth', 'queueDepth', 'QueueDepth'],
  dropCount:       ['drop_count', 'dropCount', 'DropCount'],
  timeoutCount:    ['timeout_count', 'timeoutCount', 'TimeoutCount'],
  openLatencyMs:   ['open_latency_ms', 'openLatencyMs', 'OpenLatencyMs'],
  createdAt:       ['created_at', 'createdAt', 'CreatedAt', 'start_time', 'startTime', 'StartTime'],
  updatedAt:       ['updated_at', 'updatedAt', 'UpdatedAt', 'last_seen', 'lastSeen', 'LastSeen'],
}

/**
 * Tunnel channel field aliases (a single connection within a tunnel).
 * @type {FieldMap}
 */
export const CHANNEL_FIELDS = {
  channelId:      ['channel_id', 'channelId', 'ChannelID', 'ChannelId', 'id', 'ID'],
  tunnelId:       ['tunnel_id', 'tunnelId', 'TunnelID', 'TunnelId'],
  beaconId:       ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId'],
  targetAddress:  ['target_address', 'targetAddress', 'TargetAddress', 'target', 'Target'],
  remoteHost:     ['remote_host', 'remoteHost', 'RemoteHost', 'dst_addr', 'dstAddr', 'target_host', 'targetHost'],
  remotePort:     ['remote_port', 'remotePort', 'RemotePort', 'dst_port', 'dstPort', 'target_port', 'targetPort'],
  localHost:      ['local_host', 'localHost', 'LocalHost', 'src_addr', 'srcAddr', 'client_addr', 'clientAddr'],
  localPort:      ['local_port', 'localPort', 'LocalPort', 'src_port', 'srcPort', 'client_port', 'clientPort'],
  status:         ['status', 'Status', 'state', 'State'],
  bytesIn:        ['bytes_in', 'bytesIn', 'BytesIn', 'in_bytes', 'inBytes'],
  bytesOut:       ['bytes_out', 'bytesOut', 'BytesOut', 'out_bytes', 'outBytes'],
  reason:         ['reason', 'Reason'],
  createdAt:      ['created_at', 'createdAt', 'CreatedAt', 'time', 'Time'],
  updatedAt:      ['updated_at', 'updatedAt', 'UpdatedAt', 'last_seen', 'lastSeen', 'LastSeen'],
}

/**
 * Listener field aliases.
 * @type {FieldMap}
 */
export const LISTENER_FIELDS = {
  id:            ['id', 'ID'],
  name:          ['name', 'Name'],
  protocol:      ['protocol', 'Protocol'],
  bindAddr:      ['bind_addr', 'bindAddr', 'BindAddr'],
  bindPort:      ['bind_port', 'bindPort', 'BindPort'],
  status:        ['status', 'Status'],
  listenerType:  ['listener_type', 'listenerType', 'ListenerType'],
  config:        ['config', 'Config'],
  createdAt:     ['created_at', 'createdAt', 'CreatedAt'],
  updatedAt:     ['updated_at', 'updatedAt', 'UpdatedAt'],
}

/**
 * File transfer task field aliases (upload/download progress tracking).
 * @type {FieldMap}
 */
export const TRANSFER_FIELDS = {
  taskId:         ['task_id', 'taskId', 'TaskID', 'TaskId'],
  direction:      ['direction', 'Direction'],
  beaconId:       ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId', 'becon_id', 'beaconid'],
  fileId:         ['file_id', 'fileId', 'FileID', 'FileId'],
  fileName:       ['file_name', 'fileName', 'FileName'],
  remotePath:     ['remote_path', 'remotePath', 'RemotePath'],
  totalChunks:    ['total_chunks', 'totalChunks', 'TotalChunks', 'total_chunk', 'totalChunk', 'TotalChunk', 'chunk_count', 'chunkCount', 'ChunkCount', 'chunks_total', 'chunksTotal', 'ChunksTotal'],
  receivedChunks: ['received_chunks', 'receivedChunks', 'ReceivedChunks', 'acked_chunks', 'ackedChunks', 'AckedChunks'],
  receivedBytes:  ['received_bytes', 'receivedBytes', 'ReceivedBytes', 'acked_bytes', 'ackedBytes', 'AckedBytes', 'written_bytes', 'writtenBytes', 'WrittenBytes'],
  size:           ['size', 'Size', 'queued_bytes', 'queuedBytes', 'QueuedBytes'],
  status:         ['status', 'Status'],
  error:          ['error', 'Error', 'error_message', 'errorMessage', 'message', 'Message'],
}

/**
 * COMMAND_EVENT payload field aliases.
 * @type {FieldMap}
 */
export const COMMAND_EVENT_FIELDS = {
  taskId:       ['task_id', 'taskId', 'TaskID', 'TaskId', 'command_id', 'commandId', 'CommandID', 'CommandId'],
  beaconId:     ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId'],
  phase:        ['phase', 'Phase'],
  status:       ['status', 'Status'],
  resultType:   ['result_type', 'resultType', 'ResultType', 'type', 'Type'],
  error:        ['error', 'Error'],
}

/**
 * Download pool / artifact file metadata field aliases.
 * @type {FieldMap}
 */
export const FILE_FIELDS = {
  fileId:       ['file_id', 'fileId', 'FileID', 'FileId'],
  fileName:    ['file_name', 'fileName', 'FileName'],
  size:         ['size', 'Size'],
  sha256:       ['sha256', 'Sha256', 'SHA256'],
  modTime:      ['mod_time', 'modTime', 'ModTime'],
  downloadUrl:  ['download_url', 'downloadUrl', 'DownloadURL', 'DownloadUrl'],
}

/**
 * Screenshot metadata field aliases.
 * @type {FieldMap}
 */
export const SCREENSHOT_FIELDS = {
  screenshotId: ['screenshot_id', 'screenshotId', 'ScreenshotID', 'ScreenshotId'],
  beaconId:    ['beacon_id', 'beaconId', 'BeaconID', 'BeaconId'],
  hostname:    ['hostname', 'Hostname'],
  username:    ['username', 'Username'],
  resolution:  ['resolution', 'Resolution'],
  imageSize:   ['image_size', 'imageSize', 'ImageSize'],
  capturedAt:   ['captured_at', 'capturedAt', 'CapturedAt'],
  fileName:    ['file_name', 'fileName', 'FileName'],
  previewUrl:  ['preview_url', 'previewUrl', 'PreviewURL', 'PreviewUrl'],
  downloadUrl: ['download_url', 'downloadUrl', 'DownloadURL', 'DownloadUrl'],
}
