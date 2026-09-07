export type PayloadOs = 'windows' | 'linux' | 'mac'
export type PayloadArch = 'amd64' | 'x86' | 'arm' | 'arm64'
export type PayloadFormat = 'exe' | 'dll' | 'bin' | 'shellcode' | 'c' | 'elf' | 'macho'
export type PayloadStageMode = 'stagerless' | 'stager'
export type BeaconType = 'c' | 'go'

export interface PayloadGenerateRequest {
  listener_id: string
  os: PayloadOs
  arch: PayloadArch
  format: PayloadFormat
  stage_mode?: PayloadStageMode
  beacon_type?: BeaconType
}

export interface PayloadGenerateResult {
  payload: string
  encoding: 'base64'
  format: PayloadFormat
  stage_mode: PayloadStageMode
  file_name?: string
  stage_id?: string
  stage_url?: string
}

export type ShellcodeMode = 'front' | 'post'
export type ShellcodeArch = 'auto' | 'x64' | 'x86'

export interface ShellcodeGenerateRequest {
  mode: ShellcodeMode
  pe_base64: string
  arch?: ShellcodeArch | 'amd64'
  export_name?: string
  export_hash?: string | number
  user_data_base64?: string
  user_data_hex?: string
}

export interface ShellcodeGenerateResult {
  shellcode: string
  encoding: 'base64'
  mode: ShellcodeMode
  size: number
}
