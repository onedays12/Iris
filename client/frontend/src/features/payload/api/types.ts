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

export type ShellcodeMode = 'front' | 'post' | 'embed'

export type ShellcodeGenerateRequest =
  | { mode: 'front' | 'post'; pe_base64: string; loader_name?: never }
  | { mode: 'embed'; pe_base64: string; loader_name?: string }

export interface ShellcodeGenerateResult {
  shellcode: string
  encoding: 'base64'
  mode: ShellcodeMode
  size: number
}
