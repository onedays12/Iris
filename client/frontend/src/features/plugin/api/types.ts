import type { BeaconArg } from '../../beacon/api/commandArgs'

/** schema v2 本地化文案: "text" 或 {"zh": "...", "en": "..."} */
export type LocalizedTextDto = string | Record<string, string>

export interface PluginActionFieldDto {
  name: string
  label: LocalizedTextDto
  type: string
  placeholder: string
  default: unknown
  default_by_arch?: Record<string, unknown>
  required: boolean
  help: LocalizedTextDto
  options?: string[]
  role?: string
  postex_arg?: string
}

export interface PluginPostExActionDto {
  mode: string
  dll?: string
  dll_by_arch?: Record<string, string>
  manifest?: string
  wait_ms?: number
  max_runtime_ms?: number
  idle_timeout_ms?: number
  description?: string
  module_args?: string
  spawn_path?: string
  spawn_path_by_arch?: Record<string, string>
  spawn_args?: string
  backend?: string
}

export interface PluginActionDto {
  id: string
  kind?: string
  label: LocalizedTextDto
  description: LocalizedTextDto
  os?: string[]
  arch?: string[]
  artifact: string
  artifact_by_arch?: Record<string, string>
  artifact_data?: string
  postex?: PluginPostExActionDto | null
  module?: string
  command_id?: number
  /** 显式覆盖标记; 缺失时前端回退为"有字段即需要输入" */
  requires_input?: boolean
  fields?: PluginActionFieldDto[]
  args?: BeaconArg[]
}

export interface PluginCapabilitiesDto {
  command_ids: number[]
}

export interface PluginSnapshotDto {
  id: string
  name: string
  display_name: LocalizedTextDto
  version: string
  description: LocalizedTextDto
  path: string
  capabilities: PluginCapabilitiesDto | null
  actions: PluginActionDto[]
  status: string
  last_error: string
  loaded_at: unknown
  updated_at: unknown
}
