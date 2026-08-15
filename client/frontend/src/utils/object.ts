/**
 * 通用对象工具函数
 * 提供 pick、toNumber、pickString 等数据提取与转换工具，
 * 被多个 store 共用以统一后端数据的规范化逻辑。
 */

// ─── 数据提取 ───

/**
 * 从对象中按优先级提取第一个有效值
 * @param data 源对象
 * @param keys 候选键名列表（按优先级排列）
 * @param fallback 全部缺失时的默认值
 * @returns 第一个非空值或 fallback
 */
export function pick(data: unknown, keys: readonly string[], fallback: unknown = ''): unknown {
  if (!data || typeof data !== 'object') return fallback
  const record = data as Record<string, unknown>
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key]
  }
  return fallback
}

// ─── 类型转换 ───

/**
 * 安全转换为有限数值，NaN/Infinity 归零
 */
export function toNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * 安全转换为字符串，空值返回 fallback
 */
export function pickString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  const text = String(value)
  return text === '' ? fallback : text
}
