/**
 * Payload API 模块 - Beacon Payload 生成与 Shellcode 转换
 *
 * 提供 Payload 生成（指定架构、格式、stage 模式）
 * 和 PE 到 Shellcode 的转换接口。
 */

// ─── 导入 ───

import { request } from '../../../shared/api/httpClient.js'

// ─── Payload 生成 ───

/**
 * 生成 Beacon Payload
 * @param {Object} params - 生成参数
 * @param {string} params.listener_id - 监听器 ID
 * @param {string} params.os - 目标操作系统
 * @param {string} params.arch - 目标架构 (amd64 | x86)
 * @param {string} params.format - 输出格式
 * @param {string} params.stage_mode - stage 模式 (stagerless | stager)
 * @param {string} params.beacon_type - Beacon 类型 (go | c)
 * @returns {Promise<Object>} 生成结果
 */
export async function generatePayload({ listener_id, os, arch, format, stage_mode = 'stagerless', beacon_type = 'go' }) {
  const normalizedArch = String(arch).trim().toLowerCase()
  if (!['amd64', 'x86', 'arm'].includes(normalizedArch)) {
    throw new Error('Payload arch 只允许 amd64、x86 或 arm')
  }

  const normalizedFormat = String(format).trim().toLowerCase()
  const normalizedStageMode = String(stage_mode || 'stagerless').trim().toLowerCase()
  if (normalizedFormat === 'c' && normalizedStageMode !== 'stager') {
    throw new Error('Payload format=c 仅支持 stager 模式')
  }

  const payload = {
    listener_id: String(listener_id),
    os: String(os),
    arch: normalizedArch,
    format: normalizedFormat,
    stage_mode: normalizedStageMode,
    beacon_type: String(beacon_type || 'go').trim().toLowerCase(),
  }
  return await request('POST', '/api/v1/payload/generate', payload)
}

/**
 * 将 PE 文件转换为 Shellcode
 * @param {Object} params - 转换参数
 * @param {string} params.mode - 转换模式 (front 等)
 * @param {string} params.pe_base64 - PE 文件的 base64 编码
 * @param {string} params.loader_name - 加载器名称
 * @returns {Promise<Object>} 转换结果
 */
export async function generateShellcode({ mode = 'front', pe_base64, loader_name = 'ReflectiveLoader' }) {
  const payload = {
    mode: String(mode),
    pe_base64: String(pe_base64 || ''),
  }
  if (loader_name !== undefined && loader_name !== null && String(loader_name).trim()) {
    payload.loader_name = String(loader_name)
  }
  return await request('POST', '/api/v1/payload/shellcode', payload)
}
