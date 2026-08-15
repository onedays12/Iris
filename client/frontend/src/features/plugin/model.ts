import { pick, pickString } from '../../utils/object'

/**
 * 本地化文案: schema v2 允许 "text" 或 {"zh": "...", "en": "..."} 两种声明形式。
 */
export type LocalizedTextValue = string | Record<string, string>

/**
 * 按当前 locale 解析本地化文案。
 * 优先级: locale(如 zh-CN) → 语言前缀(zh) → en → zh → default → 任一值 → 字符串本身兜底。
 */
export function localizedText(value: unknown, locale: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const candidates = [locale]
    const dashIndex = locale.indexOf('-')
    if (dashIndex > 0) candidates.push(locale.slice(0, dashIndex))
    candidates.push('en', 'zh', 'default')
    for (const key of candidates) {
      const text = String(record[key] ?? '').trim()
      if (text) return text
    }
    for (const text of Object.values(record)) {
      const resolved = String(text ?? '').trim()
      if (resolved) return resolved
    }
    return ''
  }
  return String(value).trim()
}

/** 提取字段的本地化值(字符串原样保留, 对象原样保留, 缺失回退 fallback)。 */
function pickLocalizedValue(source: unknown, keys: readonly string[], fallback: string): LocalizedTextValue {
  const value = pick(source, keys)
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, string>
  return fallback
}

export interface PluginActionField {
  name: string
  label: LocalizedTextValue
  type: string
  placeholder: string
  defaultValue: unknown
  defaultByArch: Record<string, unknown>
  required: boolean
  help: LocalizedTextValue
  options: string[]
  role: string
  postexArg: string
}

export interface PluginPostExConfig {
  mode: string
  dll: string
  dllByArch: Record<string, string>
  waitMs: number
  maxRuntimeMs: number
  idleTimeoutMs: number
  description: string
  moduleArgs: string
  spawnPath: string
  spawnPathByArch: Record<string, string>
  spawnArgs: string
  backend: string
}

export interface PluginAction {
  id: string
  kind: string
  label: LocalizedTextValue
  description: LocalizedTextValue
  os: string[]
  arch: string[]
  artifact: string
  artifactByArch: Record<string, string>
  artifactData: string
  commandId: number
  requiresInput: boolean
  fields: PluginActionField[]
  postex: PluginPostExConfig | null
  raw: unknown
}

export interface Plugin {
  id: string
  name: string
  displayName: LocalizedTextValue
  version: string
  description: LocalizedTextValue
  path: string
  /** schema v2 capabilities.command_ids 白名单 */
  capabilities: number[]
  actions: PluginAction[]
  status: string
  lastError: string
  loadedAt: unknown
  updatedAt: unknown
  raw: unknown
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => pickString(item).trim().toLowerCase()).filter(Boolean)
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [pickString(key).trim().toLowerCase(), pickString(item).trim()])
      .filter(([key, item]) => key && item),
  )
}

function normalizeArchKey(key: unknown): string {
  const text = pickString(key).trim().toLowerCase()
  if (['amd64', 'x64', 'x86_64'].includes(text)) return 'amd64'
  if (['x86', 'i386', '386'].includes(text)) return 'x86'
  return text
}

function normalizeDefaultByArch(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizeArchKey(key), item])
      .filter(([key, item]) => key && item !== undefined && item !== null),
  )
}

function normalizeCapabilities(value: unknown): number[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const record = value as Record<string, unknown>
  const ids = record.command_ids ?? record.commandIds ?? record.CommandIDs
  if (!Array.isArray(ids)) return []
  return ids
    .map(item => Number(item))
    .filter(item => Number.isFinite(item) && item > 0)
}

function normalizePluginActionField(field: unknown): PluginActionField | null {
  if (!field || typeof field !== 'object') return null
  const options = pick(field, ['options'])
  return {
    name: pickString(pick(field, ['name'])),
    label: pickLocalizedValue(field, ['label', 'name'], ''),
    type: pickString(pick(field, ['type'], 'string')).toLowerCase(),
    placeholder: pickString(pick(field, ['placeholder'], '')),
    defaultValue: pick(field, ['default'], ''),
    defaultByArch: normalizeDefaultByArch(pick(field, ['default_by_arch'])),
    required: Boolean(pick(field, ['required'], false)),
    help: pickLocalizedValue(field, ['help'], ''),
    options: Array.isArray(options) ? options.map(item => pickString(item)).filter(Boolean) : [],
    role: pickString(pick(field, ['role'], '')).toLowerCase(),
    postexArg: pickString(pick(field, ['postex_arg'], '')),
  }
}

function normalizePostExConfig(postex: unknown): PluginPostExConfig | null {
  if (!postex || typeof postex !== 'object') return null
  return {
    mode: pickString(pick(postex, ['mode'], '')).toLowerCase().replace(/_/g, '-'),
    dll: pickString(pick(postex, ['dll'], '')),
    dllByArch: normalizeStringMap(pick(postex, ['dll_by_arch'])),
    waitMs: Number(pick(postex, ['wait_ms'], 0)) || 0,
    maxRuntimeMs: Number(pick(postex, ['max_runtime_ms'], 0)) || 0,
    idleTimeoutMs: Number(pick(postex, ['idle_timeout_ms'], 0)) || 0,
    description: pickString(pick(postex, ['description'], '')),
    moduleArgs: pickString(pick(postex, ['module_args'], '')),
    spawnPath: pickString(pick(postex, ['spawn_path'], '')),
    spawnPathByArch: normalizeStringMap(pick(postex, ['spawn_path_by_arch'])),
    spawnArgs: pickString(pick(postex, ['spawn_args'], '')),
    backend: pickString(pick(postex, ['backend'], '')),
  }
}

function normalizePluginAction(action: unknown): PluginAction | null {
  if (!action || typeof action !== 'object') return null
  const fieldValues = pick(action, ['fields'])
  const fields = Array.isArray(fieldValues)
    ? fieldValues.map(normalizePluginActionField).filter((field): field is PluginActionField => Boolean(field))
    : []
  const postex = normalizePostExConfig(pick(action, ['postex']))
  const kind = pickString(pick(action, ['kind'], postex ? 'postex' : 'bof')).toLowerCase() || 'bof'

  return {
    id: pickString(pick(action, ['id', 'name'])),
    kind,
    label: pickLocalizedValue(action, ['label', 'display_name', 'name', 'id'], ''),
    description: pickLocalizedValue(action, ['description'], ''),
    os: normalizeStringList(pick(action, ['os'])),
    arch: normalizeStringList(pick(action, ['arch'])),
    artifact: pickString(pick(action, ['artifact'], '')),
    artifactByArch: normalizeStringMap(pick(action, ['artifact_by_arch'])),
    artifactData: pickString(pick(action, ['artifact_data'], '')),
    commandId: Number(pick(action, ['command_id'], 0)) || 0,
    requiresInput: Boolean(pick(action, ['requires_input'], fields.length)),
    fields,
    postex,
    raw: action,
  }
}

export function normalizePlugin(plugin: unknown): Plugin | null {
  if (!plugin || typeof plugin !== 'object') return null
  const actionValues = pick(plugin, ['actions'])
  const actions = Array.isArray(actionValues)
    ? actionValues.map(normalizePluginAction).filter((action): action is PluginAction => Boolean(action))
    : []

  return {
    id: pickString(pick(plugin, ['id', 'name'])),
    name: pickString(pick(plugin, ['name', 'id'])),
    displayName: pickLocalizedValue(plugin, ['display_name', 'name', 'id'], 'Plugin'),
    version: pickString(pick(plugin, ['version'], '')),
    description: pickLocalizedValue(plugin, ['description'], ''),
    path: pickString(pick(plugin, ['path'], '')),
    capabilities: normalizeCapabilities(pick(plugin, ['capabilities'])),
    actions,
    status: pickString(pick(plugin, ['status'], 'unknown')),
    lastError: pickString(pick(plugin, ['last_error'], '')),
    loadedAt: pick(plugin, ['loaded_at'], null),
    updatedAt: pick(plugin, ['updated_at'], null),
    raw: plugin,
  }
}
