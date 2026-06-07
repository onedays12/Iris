/**
 * Beacon 命令发送模块 - 封装各类 Beacon 命令的发送函数
 *
 * 将底层 sendCommand 调用包装为语义化的命令函数，
 * 简化上层组件对各类命令的调用方式。
 */

// ─── 导入 ───

import { COMMAND_ID, PLUGIN_COMMAND_ID } from '../../../constants/commands.js'
import { sendCommand } from '../api/beaconApi.js'

// ─── 通用命令 ───

/**
 * 发送通用 Beacon 命令
 * @param {string} beaconid - 目标 Beacon ID
 * @param {number} commandId - 命令 ID
 * @param {Array} args - 命令参数
 * @returns {Promise<Object>}
 */
export function sendBeaconCommand(beaconid, commandId, args = []) {
  return sendCommand(beaconid, commandId, args)
}

/**
 * 发送 Sleep 命令，设置 Beacon 回连间隔
 * @param {string} beaconid - 目标 Beacon ID
 * @param {number} sleeptime - 休眠时间（毫秒）
 * @param {number} jitter - 抖动百分比
 * @returns {Promise<Object>}
 */
export function sendSleepCommand(beaconid, sleeptime, jitter) {
  return sendCommand(beaconid, COMMAND_ID.SLEEP, [sleeptime, jitter])
}

/**
 * 请求 Beacon 返回进程列表
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<Object>}
 */
export function sendProcessListCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.PS, [])
}

/**
 * 发送 Kill 命令终止指定进程
 * @param {string} beaconid - 目标 Beacon ID
 * @param {number} pid - 目标进程 PID
 * @returns {Promise<Object>}
 */
export function sendKillProcessCommand(beaconid, pid) {
  return sendCommand(beaconid, COMMAND_ID.KILL || 42, [pid])
}

/**
 * 请求 Beacon 返回网络接口信息
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<Object>}
 */
export function sendNetworkInfoCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.NETINFO, [])
}

/**
 * 请求 Beacon 返回网络连接列表
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<Object>}
 */
export function sendNetworkStatCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.NETSTAT, [])
}

/**
 * 同时发送网络信息和网络连接查询
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<[Object, Object]>}
 */
export function sendNetworkBrowserCommands(beaconid) {
  return Promise.all([
    sendNetworkInfoCommand(beaconid),
    sendNetworkStatCommand(beaconid),
  ])
}

/**
 * 请求 Beacon 返回当前工作目录
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<Object>}
 */
export function sendPwdCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.PWD, [])
}

/**
 * 发送 setattr 命令修改文件属性
 * @param {string} beaconid - 目标 Beacon ID
 * @param {Array} args - setattr 参数
 * @returns {Promise<Object>}
 */
export function sendSetAttrCommand(beaconid, args) {
  return sendCommand(beaconid, COMMAND_ID.SETATTR, args)
}

/**
 * 发送 zip 命令压缩目录
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} sourcePath - 源目录路径
 * @param {string} zipPath - 输出 zip 路径
 * @param {number} overwrite - 是否覆盖
 * @param {number} includeRoot - 是否包含根目录
 * @returns {Promise<Object>}
 */
export function sendZipCommand(beaconid, sourcePath, zipPath, overwrite, includeRoot) {
  return sendCommand(beaconid, COMMAND_ID.ZIP, [sourcePath, zipPath, overwrite, includeRoot])
}

// ─── 文件操作命令 ───

/**
 * 发送下载命令，从 Beacon 下载远程文件
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} remotePath - 远程文件路径
 * @param {number} chunkSize - 分块大小
 * @param {number} retries - 重试次数
 * @returns {Promise<Object>}
 */
export function sendDownloadCommand(beaconid, remotePath, chunkSize = 524288, retries = 3) {
  return sendCommand(beaconid, COMMAND_ID.DOWNLOAD, [remotePath, chunkSize, retries])
}

/**
 * 发送 rm 命令删除远程文件
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} remotePath - 远程文件路径
 * @returns {Promise<Object>}
 */
export function sendRemoveFileCommand(beaconid, remotePath) {
  return sendCommand(beaconid, COMMAND_ID.RM, [remotePath])
}

/**
 * 发送 mv 命令移动远程文件
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} sourcePath - 源路径
 * @param {string} destinationPath - 目标路径
 * @returns {Promise<Object>}
 */
export function sendMoveFileCommand(beaconid, sourcePath, destinationPath) {
  return sendCommand(beaconid, COMMAND_ID.MV, [sourcePath, destinationPath])
}

/**
 * 发送 cp 命令复制远程文件
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} sourcePath - 源路径
 * @param {string} destinationPath - 目标路径
 * @returns {Promise<Object>}
 */
export function sendCopyFileCommand(beaconid, sourcePath, destinationPath) {
  return sendCommand(beaconid, COMMAND_ID.CP, [sourcePath, destinationPath])
}

/**
 * 发送 mkdir 命令创建远程目录
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} remotePath - 目录路径
 * @returns {Promise<Object>}
 */
export function sendMkdirCommand(beaconid, remotePath) {
  return sendCommand(beaconid, COMMAND_ID.MKDIR, [remotePath])
}

/**
 * 发送上传命令，将文件上传到 Beacon 所在主机
 * @param {string} beaconid - 目标 Beacon ID
 * @param {string} fileId - 服务端文件 ID
 * @param {string} remotePath - 远程目标路径
 * @param {number} chunkSize - 分块大小
 * @returns {Promise<Object>}
 */
export function sendUploadCommand(beaconid, fileId, remotePath, chunkSize = 524288) {
  return sendCommand(beaconid, COMMAND_ID.UPLOAD, [fileId, remotePath, chunkSize])
}

// ─── 级联与插件命令 ───

/**
 * 发送级联连接命令（TCP / SMB）
 * @param {string} beaconid - 父 Beacon ID
 * @param {string} mode - 连接模式 ('tcp' | 'smb')
 * @param {Array} args - 连接参数
 * @returns {Promise<Object>}
 */
export function sendCascadeConnectCommand(beaconid, mode, args) {
  const commandId = mode === 'tcp' ? COMMAND_ID.CASCADE_CONNECT_TCP : COMMAND_ID.CASCADE_LINK_SMB
  return sendCommand(beaconid, commandId, args)
}

/**
 * 发送 BOF 执行命令
 * @param {string} beaconid - 目标 Beacon ID
 * @param {Array} args - BOF 参数（第一个为工件 bytes）
 * @returns {Promise<Object>}
 */
export function sendExecutionBofCommand(beaconid, args) {
  return sendCommand(beaconid, PLUGIN_COMMAND_ID.EXECUTION_BOF, args)
}

/**
 * 发送退出命令，终止 Beacon 进程
 * @param {string} beaconid - 目标 Beacon ID
 * @returns {Promise<Object>}
 */
export function sendExitCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.EXIT)
}
