/**
 * Listener 表单工具函数
 *
 * 从 ListenerDialog 拆出。包含配置解析、host:port 拆分、
 * 端口校验、profile 推断、加密密钥生成等纯逻辑。
 *
 * 注意:validateHostOnly / parsePort 接收 onError 回调,由调用方传入
 * notificationStore.error,保持报错行为不变的同时避免 composable 硬依赖 store。
 */

export function parseListenerConfig(config) {
  if (!config) return {}
  if (typeof config === 'string') {
    try {
      return JSON.parse(config)
    } catch {
      return {}
    }
  }
  if (typeof config === 'object' && !Array.isArray(config)) {
    return config
  }
  return {}
}

export function splitHostPort(value, fallbackPort) {
  const text = String(value || '').trim()
  if (!text) return { host: '', port: fallbackPort }

  const bracket = text.match(/^\[([^\]]+)\]:(\d+)$/)
  if (bracket) {
    return { host: bracket[1], port: Number(bracket[2]) || fallbackPort }
  }

  const lastColon = text.lastIndexOf(':')
  if (lastColon > 0 && text.indexOf(':') === lastColon) {
    const maybePort = text.slice(lastColon + 1)
    if (/^\d+$/.test(maybePort)) {
      return { host: text.slice(0, lastColon), port: Number(maybePort) || fallbackPort }
    }
  }

  return { host: text, port: fallbackPort }
}

export function hostHasPort(value) {
  const text = String(value || '').trim()
  if (/^\[[^\]]+\]:\d+$/.test(text)) return true
  const lastColon = text.lastIndexOf(':')
  if (lastColon <= 0 || text.indexOf(':') !== lastColon) return false
  return /^\d+$/.test(text.slice(lastColon + 1))
}

/**
 * 校验 host(不含协议/端口),失败时调 onError 并返回空串。
 * @returns {string} 合法的 host,或空串(校验失败)
 */
export function validateHostOnly(value, label, onError, { allowUnspecified = true } = {}) {
  const host = String(value || '').trim()
  if (!host) {
    onError(`${label}不能为空`)
    return ''
  }
  if (host.includes('://') || hostHasPort(host)) {
    onError(`${label}只能填写 host/IP，不能包含协议或端口`)
    return ''
  }
  if (!allowUnspecified && (host === '0.0.0.0' || host === '::')) {
    onError(`${label}必须是 Beacon 可访问的地址，不能使用 0.0.0.0 或 ::`)
    return ''
  }
  return host
}

/**
 * 校验端口,失败时调 onError 并返回 null。
 * @returns {number|null} 合法的端口,或 null(校验失败)
 */
export function parsePort(value, label, onError) {
  const port = parseInt(value, 10)
  if (isNaN(port) || port < 1 || port > 65535) {
    onError(`${label}必须在 1-65535 之间`)
    return null
  }
  return port
}

export function inferProfile(config) {
  if (typeof config.profile === 'string' && config.profile.trim()) return config.profile.trim()
  if (config.stager && typeof config.stager === 'object' && Object.keys(config.stager).length) return 'http-stager'
  return 'http-default'
}

export function generateEncryptKey() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
