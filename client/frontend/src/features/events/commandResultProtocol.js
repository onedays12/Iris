import { COMMAND_ID } from '../../constants/commands.js'

export const COMMAND_RESULT_TYPE = Object.freeze({
  TEXT: 'text',
  EXPLORER_FILES: 'explorer_files',
  PS_LIST: 'ps_list',
  SCREENSHOT: 'screenshot',
  NET_INFO: 'net_info',
  NETSTAT: 'netstat',
  POSTEX_ARTIFACT: 'postex_artifact',
  POSTEX_FRAME: 'postex_frame',
  POSTEX_OUTPUT: 'postex_output',
  POSTEX_DEAD: 'postex_dead',
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  CASCADE: 'cascade',
})

const PROCESS_RESULT_TYPES = new Set([
  COMMAND_RESULT_TYPE.PS_LIST,
])

const POSTEX_EVENT_RESULT_TYPES = new Set([
  COMMAND_RESULT_TYPE.POSTEX_OUTPUT,
  COMMAND_RESULT_TYPE.POSTEX_DEAD,
])

const TRANSFER_RESULT_TYPES = new Set([
  COMMAND_RESULT_TYPE.DOWNLOAD,
  COMMAND_RESULT_TYPE.UPLOAD,
])

export function isProcessResult(resultType, commandId) {
  return Number(commandId) === COMMAND_ID.PS || PROCESS_RESULT_TYPES.has(resultType)
}

export function isNetInfoResult(resultType, commandId) {
  return Number(commandId) === COMMAND_ID.NETINFO || resultType === COMMAND_RESULT_TYPE.NET_INFO
}

export function isNetstatResult(resultType, commandId) {
  return Number(commandId) === COMMAND_ID.NETSTAT || resultType === COMMAND_RESULT_TYPE.NETSTAT
}

export function isPostExEventResult(resultType, commandId) {
  return Number(commandId) === COMMAND_ID.POSTEX_EVENT || POSTEX_EVENT_RESULT_TYPES.has(resultType)
}

export function isTransferResult(resultType) {
  return TRANSFER_RESULT_TYPES.has(resultType)
}

export function isCommandResultComplete({ status = '', phase = '', resultType = '' } = {}) {
  return status === 'completed' || phase === 'result' || resultType === COMMAND_RESULT_TYPE.TEXT || !status
}
