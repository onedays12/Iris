import { normalizeBeaconArch, normalizeBeaconPlatform } from '../../../constants/commands.js'

function readObjectValue(source, keys = []) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return ''
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return String(source[key])
    }
  }
  return ''
}

function parseConfig(config) {
  if (!config) return {}
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof config === 'object' && !Array.isArray(config) ? config : {}
}

function readConfigValue(config, keys = []) {
  return readObjectValue(config, keys)
}

function normalizeListenerStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  if (['started', 'running', 'active', 'resumed'].includes(status)) return 'started'
  if (['paused', 'stopped', 'stopping', 'removed', 'error'].includes(status)) return status
  return status
}

export function normalizeMigrateArch(value) {
  const arch = normalizeBeaconArch(value)
  if (arch === 'amd64') return 'x64'
  if (arch === 'x86') return 'x86'
  return 'unknown'
}

export function normalizeMigrateListener(listener) {
  const config = parseConfig(listener?.config)
  const listenerType = String(
    readObjectValue(listener, ['listener_type', 'listenerType', 'ListenerType', 'ltype']) ||
    readConfigValue(config, ['listener_type', 'listenerType', 'ListenerType', 'ltype']) ||
    'external'
  ).trim().toLowerCase()
  const protocol = String(
    readObjectValue(listener, ['protocol', 'Protocol', 'type', 'Type']) ||
    readConfigValue(config, ['protocol', 'Protocol', 'type', 'Type']) ||
    ''
  ).trim().toLowerCase()
  const status = normalizeListenerStatus(
    readObjectValue(listener, ['status', 'Status']) ||
    readConfigValue(config, ['status', 'Status'])
  )
  const name = String(
    readObjectValue(listener, ['name', 'Name', 'id', 'ID']) ||
    readConfigValue(config, ['name', 'Name'])
  ).trim()
  const host = readObjectValue(
    listener,
    listenerType === 'internal'
      ? ['bind_host', 'bindHost', 'BindHost', 'bind_addr', 'bindAddr', 'BindAddr', 'host', 'Host']
      : ['host', 'Host', 'bind_host', 'bindHost', 'BindHost', 'bind_addr', 'bindAddr', 'BindAddr']
  ) || readConfigValue(
    config,
    listenerType === 'internal'
      ? ['bind_host', 'bindHost', 'BindHost', 'bind_addr', 'bindAddr', 'BindAddr', 'host', 'Host']
      : ['host', 'Host', 'bind_host', 'bindHost', 'BindHost', 'bind_addr', 'bindAddr', 'BindAddr']
  )

  let endpoint = ''
  if (listenerType === 'internal' && protocol === 'smb') {
    endpoint = readObjectValue(listener, ['pipe_name', 'pipe_name', 'pipe', 'PipeName', 'Pipe']) ||
      readConfigValue(config, ['pipe_name', 'pipe', 'PipeName', 'Pipe'])
  } else {
    const port = readObjectValue(
      listener,
      listenerType === 'internal'
        ? ['bind_port', 'bindPort', 'BindPort', 'port', 'Port']
        : ['port', 'Port', 'bind_port', 'bindPort', 'BindPort']
    ) || readConfigValue(
      config,
      listenerType === 'internal'
        ? ['bind_port', 'bindPort', 'BindPort', 'port', 'Port']
        : ['port', 'Port', 'bind_port', 'bindPort', 'BindPort']
    )
    endpoint = host && port ? `${host}:${port}` : (port || host)
  }

  return {
    id: String(readObjectValue(listener, ['id', 'ID', 'name', 'Name']) || '').trim(),
    name,
    status,
    listenerType,
    protocol,
    config,
    host,
    endpoint,
  }
}

export function isWindowsMigrateListener(listener) {
  const item = normalizeMigrateListener(listener)
  if (item.status !== 'started') return false
  if (item.listenerType === 'external') return ['http', 'https', 'tcp'].includes(item.protocol)
  if (item.listenerType === 'internal') return ['tcp', 'smb'].includes(item.protocol)
  return false
}

export function getMigrateBehavior(listener) {
  const item = normalizeMigrateListener(listener)
  if (item.listenerType === 'external') {
    return '新 Beacon 直接上线 TeamServer'
  }
  if (item.listenerType === 'internal' && item.protocol === 'tcp') {
    return '新 Beacon 作为当前 Beacon 的 child，通过 TCP 级联上线'
  }
  if (item.listenerType === 'internal' && item.protocol === 'smb') {
    return '新 Beacon 作为当前 Beacon 的 child，通过 SMB pipe 级联上线'
  }
  return '该 Listener 不支持 migrate inject'
}

export function getMigrateListenerLabel(listener) {
  const item = normalizeMigrateListener(listener)
  const endpointLabel = item.endpoint ? ` · ${item.endpoint}` : ''
  return `${item.name} (${item.listenerType}/${item.protocol}${endpointLabel})`
}

export function getEligibleMigrateListeners(listeners = []) {
  return (Array.isArray(listeners) ? listeners : [])
    .map(normalizeMigrateListener)
    .filter(listener => listener.name)
    .filter(isWindowsMigrateListener)
}

export function isWindowsBeacon(agent) {
  return normalizeBeaconPlatform(agent?.os) === 'windows'
}

export function isX86ToX64Blocked(parentArch, targetArch) {
  return normalizeMigrateArch(parentArch) === 'x86' && normalizeMigrateArch(targetArch) === 'x64'
}
