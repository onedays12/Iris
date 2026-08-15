import { normalizeBeaconArch, normalizeBeaconPlatform } from '../../../constants/commands'

export interface MigrateListenerInfo {
  id: string
  name: string
  status: string
  listenerType: string
  protocol: string
  config: Record<string, unknown>
  host: string
  endpoint: string
}

function readObjectValue(source: unknown, keys: string[] = []): string {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return ''
  const record = source as Record<string, unknown>
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return String(record[key])
    }
  }
  return ''
}

function parseConfig(config: unknown): Record<string, unknown> {
  if (!config) return {}
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return typeof config === 'object' && !Array.isArray(config) ? config as Record<string, unknown> : {}
}

function readConfigValue(config: Record<string, unknown>, keys: string[] = []): string {
  return readObjectValue(config, keys)
}

function normalizeListenerStatus(value: unknown): string {
  const status = String(value || '').trim().toLowerCase()
  if (['started', 'running', 'active', 'resumed'].includes(status)) return 'started'
  if (['paused', 'stopped', 'stopping', 'removed', 'error'].includes(status)) return status
  return status
}

export function normalizeMigrateArch(value: unknown): string {
  const arch = normalizeBeaconArch(value)
  if (arch === 'amd64') return 'x64'
  if (arch === 'x86') return 'x86'
  return 'unknown'
}

export function normalizeMigrateListener(listener: unknown): MigrateListenerInfo {
  const config = parseConfig((listener as Record<string, unknown> | null | undefined)?.config)
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

export function isWindowsMigrateListener(listener: unknown): boolean {
  const item = normalizeMigrateListener(listener)
  if (item.status !== 'started') return false
  if (item.listenerType === 'external') return ['http', 'https', 'tcp'].includes(item.protocol)
  if (item.listenerType === 'internal') return ['tcp', 'smb'].includes(item.protocol)
  return false
}

export function getMigrateBehavior(listener: unknown, t?: (key: string) => string): string {
  const item = normalizeMigrateListener(listener)
  if (item.listenerType === 'external') {
    return t ? t('migrateInject.behaviorExternal') : '新 Beacon 直接上线 TeamServer'
  }
  if (item.listenerType === 'internal' && item.protocol === 'tcp') {
    return t ? t('migrateInject.behaviorInternalTcp') : '新 Beacon 作为当前 Beacon 的 child，通过 TCP 级联上线'
  }
  if (item.listenerType === 'internal' && item.protocol === 'smb') {
    return t ? t('migrateInject.behaviorInternalSmb') : '新 Beacon 作为当前 Beacon 的 child，通过 SMB pipe 级联上线'
  }
  return t ? t('migrateInject.behaviorUnsupported') : '该 Listener 不支持 migrate inject'
}

export function getMigrateListenerLabel(listener: unknown): string {
  const item = normalizeMigrateListener(listener)
  const endpointLabel = item.endpoint ? ` · ${item.endpoint}` : ''
  return `${item.name} (${item.listenerType}/${item.protocol}${endpointLabel})`
}

export function getEligibleMigrateListeners(listeners: unknown[] = []): MigrateListenerInfo[] {
  return (Array.isArray(listeners) ? listeners : [])
    .map(normalizeMigrateListener)
    .filter(listener => listener.name)
    .filter(isWindowsMigrateListener)
}

export function isWindowsBeacon(agent: unknown): boolean {
  return normalizeBeaconPlatform((agent as { os?: unknown } | null | undefined)?.os) === 'windows'
}

export function isX86ToX64Blocked(parentArch: unknown, targetArch: unknown): boolean {
  return normalizeMigrateArch(parentArch) === 'x86' && normalizeMigrateArch(targetArch) === 'x64'
}
