/**
 * 通用对象工具函数
 * 提供 pick、toNumber、pickString 等数据提取与转换工具，
 * 被多个 store 共用以统一后端数据的规范化逻辑。
 */

// ─── 数据提取 ───

/**
 * 从对象中按优先级提取第一个有效值
 * @param {object} data - 源对象
 * @param {string[]} keys - 候选键名列表（按优先级排列）
 * @param {*} fallback - 全部缺失时的默认值
 * @returns {*} 第一个非空值或 fallback
 */
export function pick(data, keys, fallback = '') {
  if (!data || typeof data !== 'object') return fallback
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key]
  }
  return fallback
}

// ─── 类型转换 ───

/**
 * 安全转换为有限数值，NaN/Infinity 归零
 * @param {*} value
 * @returns {number}
 */
export function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * 安全转换为字符串，空值返回 fallback
 * @param {*} value
 * @param {string} fallback
 * @returns {string}
 */
export function pickString(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  const text = String(value)
  return text === '' ? fallback : text
}
