import { expectRecord, expectStringField } from '../../../shared/api/guards'
import { request } from '../../../shared/api/httpClient'
import { i18n } from '../../../i18n/index'
import type {
  BeaconType,
  PayloadArch,
  PayloadFormat,
  PayloadGenerateRequest,
  PayloadGenerateResult,
  PayloadOs,
  PayloadStageMode,
  ShellcodeGenerateRequest,
  ShellcodeGenerateResult,
  ShellcodeMode,
} from './types'

const PAYLOAD_OS = new Set<PayloadOs>(['windows', 'linux', 'mac'])
const PAYLOAD_ARCH = new Set<PayloadArch>(['amd64', 'x86', 'arm', 'arm64'])
const PAYLOAD_FORMAT = new Set<PayloadFormat>(['exe', 'dll', 'bin', 'shellcode', 'c', 'elf', 'macho'])
const STAGE_MODE = new Set<PayloadStageMode>(['stagerless', 'stager'])
const BEACON_TYPE = new Set<BeaconType>(['c', 'go'])
const SHELLCODE_MODE = new Set<ShellcodeMode>(['front', 'post', 'embed'])

function parsePayloadResult(value: unknown): PayloadGenerateResult {
  const record = expectRecord(value, 'Payload')
  expectStringField(record, 'payload', 'Payload')
  return record as unknown as PayloadGenerateResult
}

function parseShellcodeResult(value: unknown): ShellcodeGenerateResult {
  const record = expectRecord(value, 'Shellcode')
  expectStringField(record, 'shellcode', 'Shellcode')
  return record as unknown as ShellcodeGenerateResult
}

export async function generatePayload(params: PayloadGenerateRequest): Promise<PayloadGenerateResult> {
  const os = String(params.os).trim().toLowerCase() as PayloadOs
  const arch = String(params.arch).trim().toLowerCase() as PayloadArch
  const format = String(params.format).trim().toLowerCase() as PayloadFormat
  const stageMode = String(params.stage_mode || 'stagerless').trim().toLowerCase() as PayloadStageMode
  const beaconType = params.beacon_type
    ? String(params.beacon_type).trim().toLowerCase() as BeaconType
    : undefined

  if (!PAYLOAD_OS.has(os)) throw new Error(i18n.global.t('payload.osInvalid'))
  if (!PAYLOAD_ARCH.has(arch)) throw new Error(i18n.global.t('payload.archInvalid'))
  if (!PAYLOAD_FORMAT.has(format)) throw new Error(i18n.global.t('payload.formatInvalid'))
  if (!STAGE_MODE.has(stageMode)) throw new Error(i18n.global.t('payload.stageModeInvalid'))
  if (beaconType && !BEACON_TYPE.has(beaconType)) throw new Error(i18n.global.t('payload.beaconTypeInvalid'))
  if (format === 'c' && stageMode !== 'stager') throw new Error(i18n.global.t('payload.cFormatStagerOnly'))

  const payload: PayloadGenerateRequest = {
    listener_id: String(params.listener_id),
    os,
    arch,
    format,
    stage_mode: stageMode,
    ...(beaconType ? { beacon_type: beaconType } : {}),
  }
  return parsePayloadResult(await request<unknown, PayloadGenerateRequest>('POST', '/api/v1/payload/generate', payload))
}

export async function generateShellcode(params: ShellcodeGenerateRequest): Promise<ShellcodeGenerateResult> {
  const mode = String(params.mode || 'front').trim().toLowerCase() as ShellcodeMode
  if (!SHELLCODE_MODE.has(mode)) throw new Error(i18n.global.t('payload.shellcodeModeInvalid'))

  const payload: ShellcodeGenerateRequest = mode === 'embed'
    ? {
        mode,
        pe_base64: String(params.pe_base64 || ''),
        loader_name: String(('loader_name' in params && params.loader_name) || 'ReflectiveLoader'),
      }
    : { mode, pe_base64: String(params.pe_base64 || '') }

  return parseShellcodeResult(await request<unknown, ShellcodeGenerateRequest>('POST', '/api/v1/payload/shellcode', payload))
}
