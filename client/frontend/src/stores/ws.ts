/**
 * WebSocket 连接管理 Store
 * 负责与 Teamserver 的 WebSocket 链路建立、断开、自动重连，
 * 以及将原始消息分发到 wsEventRouter 进行事件路由。
 *
 * 重连策略：指数退避 + 抖动，始终携带原 token（统一密码模型下 60s 断连宽限期内
 * 服务端按 token 自动恢复会话）；重连耗尽后若存在缓存凭据则静默重登——
 * 宽限期内同名重登必 409，等宽限结束后自动重试一次；否则提示用户重新登录
 * （针对 TeamServer 重启导致 token 失效场景）。
 */

import { defineStore } from 'pinia'
import { Events } from '@wailsio/runtime'
import { WebSocketService } from '../../bindings/irisclient/service'
import { handleWsEventMessage } from '../features/events/wsEventRouter'
import { bus } from '../shared/bus'
import { i18n } from '../i18n/index'
import type { ClassifiedErrorInfo } from '../shared/api/types'

export type WebSocketStatus = 'closed' | 'connecting' | 'open' | 'error'
type StatusWaiter = (status: WebSocketStatus) => void

// ─── 统一密码模型的断连宽限参数（契约:FRONTEND_API_CONTRACT 登录节） ───

/** 服务端断连宽限期:期内用户名保留、原 token 可恢复会话。 */
export const RECONNECT_GRACE_MS = 60000
/** 宽限结束后的重试缓冲,避免卡点。 */
export const REAUTH_GRACE_RETRY_PAD_MS = 5000

/**
 * 计算静默重登撞 409(同名会话仍占用户名)后的重试等待:
 * 距宽限结束的剩余时间 + 缓冲;无断连时间戳(已过期/未知)返回 0 立即重试。
 */
export function graceReauthDelayMs(disconnectedAt: number, now: number): number {
  if (!disconnectedAt) return 0
  return Math.max(0, RECONNECT_GRACE_MS - (now - disconnectedAt)) + REAUTH_GRACE_RETRY_PAD_MS
}

/** TeamServer 拒绝当前会话（重启丢内存表、被顶号、已吊销）时，握手会带 401。 */
export function isUnauthorizedHandshake(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '')
  return /\b401\b/.test(msg) || msg.toLowerCase().includes('session is no longer active')
}

interface WebSocketState {
  status: WebSocketStatus
  reconnectCount: number
  maxReconnect: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  nativeWsRegistered: boolean
  nativeWsUnsubscribers: Array<() => void>
  manualDisconnect: boolean
  reauthenticating: boolean
  /** 最近一次非主动断连的时刻(ms);静默重登撞 409 时据此等宽限结束 */
  disconnectedAt: number
  /** 409 宽限重试是否已安排(只自动重试一次) */
  reauthDeferred: boolean
  hasConnected: boolean
}

// ─── 重连参数 ───

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const RECONNECT_MAX_ATTEMPTS = 5

/**
 * 计算指数退避 + 抖动延迟
 * @param {number} attempt 当前已重试次数（从 1 开始）
 * @returns {number} 延迟毫秒
 */
export function computeBackoffDelay(attempt: number): number {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, attempt - 1))
  // 抖动：0.5 ~ 1.0 倍，避免多客户端同步重连
  const jitter = 0.5 + Math.random() * 0.5
  return Math.floor(exp * jitter)
}

// ─── waitForConnection 事件订阅管理 ───

const waiters = new Set<StatusWaiter>()

function notifyWaiters(status: WebSocketStatus): void {
  for (const w of waiters) {
    try { w(status) } catch { /* 忽略单个 waiter 异常 */ }
  }
}

// ─── Store 定义 ───

export const useWSStore = defineStore('ws', {

  // ─── 状态 ───

  state: (): WebSocketState => ({
    status: 'closed',
    reconnectCount: 0,
    maxReconnect: RECONNECT_MAX_ATTEMPTS,
    reconnectTimer: null,
    nativeWsRegistered: false,
    nativeWsUnsubscribers: [],
    manualDisconnect: false,
    /** 是否正在静默重登（重连耗尽后自动 login 拿新 token） */
    reauthenticating: false,
    disconnectedAt: 0,
    reauthDeferred: false,
    hasConnected: false,
  }),

  actions: {

    // ─── Wails 原生事件桥接 ───

    ensureNativeWebSocketEvents(): void {
      if (this.nativeWsRegistered) return

      this.nativeWsUnsubscribers = [
        Events.On('teamserver:ws:message', (event) => {
          const payload = event?.data
          const data = payload?.data
          if (data !== undefined && data !== null) {
            this.handleMessage(String(data))
          }
        }),
        Events.On('teamserver:ws:status', (event) => {
          const payload = event?.data || {}
          const status = String(payload.status ?? '').toLowerCase()

          if (status === 'open') {
            this.markConnected()
            return
          }

          if (status === 'connecting') {
            this.status = 'connecting'
            return
          }

          if (status === 'closed') {
            this.status = 'closed'
            if (!this.manualDisconnect && !this.disconnectedAt) {
              this.disconnectedAt = Date.now()
            }
            notifyWaiters('closed')
            if (!this.manualDisconnect) {
              this.recoverAfterConnectFailure(payload.message)
            }
          }
        }),
        Events.On('teamserver:ws:error', (event) => {
          const payload = event?.data || {}
          const message = payload.message ?? 'unknown websocket error'
          console.error('[WS] ⚠️ Go WebSocket 链路异常:', message)
          this.status = 'error'
          if (!this.manualDisconnect && !this.disconnectedAt) {
            this.disconnectedAt = Date.now()
          }
          notifyWaiters('error')
          if (!this.manualDisconnect) {
            this.recoverAfterConnectFailure(message)
          }
        }),
      ]

      this.nativeWsRegistered = true
    },

    // ─── 连接管理 ───

    /**
     * 核心连接方法
     * @param {string} explicitToken 如果提供，则直接使用该 Token
     */
    async connect(explicitToken: string | null = null): Promise<void> {
      if (this.status === 'open' || this.status === 'connecting') return

      let token = explicitToken
      let apiBase = ''
      
      try {
        const { useAuthStore } = await import('./auth')
        const authStore = useAuthStore()
        if (!token) token = authStore.token
        apiBase = authStore.apiBase
      } catch (e) {
        console.error('[WS] Failed to get context from authStore:', e)
      }

      if (!token) {
        console.warn('[WS] No token available for connection')
        return
      }

      const targetApiBase = apiBase || window.location.origin
      this.ensureNativeWebSocketEvents()
      this.manualDisconnect = false
      this.status = 'connecting'

      try {
        await WebSocketService.Connect(targetApiBase, token)
        if (!this.manualDisconnect) {
          this.markConnected()
        }
      } catch (err) {
        console.error('[WS] 🚨 Go WebSocket 链路创建失败:', err)
        this.status = 'error'
        notifyWaiters('error')
        if (!this.manualDisconnect) {
          this.recoverAfterConnectFailure(err)
        }
      }
    },

    /**
     * 等待连接成功（事件驱动，替代轮询）
     * @param {number} timeout 超时毫秒
     * @returns {Promise<void>}
     */
    waitForConnection(timeout = 10000): Promise<void> {
      if (this.status === 'open') return Promise.resolve()

      return new Promise<void>((resolve, reject) => {
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          waiters.delete(onStatus)
          reject(new Error(i18n.global.t('ws.linkTimeout', { seconds: 10 })))
        }, timeout)

        const onStatus: StatusWaiter = (status) => {
          if (settled) return
          if (status === 'open') {
            settled = true
            clearTimeout(timer)
            waiters.delete(onStatus)
            resolve()
          } else if (status === 'error') {
            settled = true
            clearTimeout(timer)
            waiters.delete(onStatus)
            reject(new Error(i18n.global.t('ws.linkFailed')))
          }
          // 'closed'/'connecting' 不结算，继续等待
        }
        waiters.add(onStatus)
      })
    },

    /**
     * 处理收到的原始消息
     */
    async handleMessage(rawData: unknown): Promise<void> {
      try {
        await handleWsEventMessage(rawData)
      } catch (err) {
        console.warn('[WS] Event process failed:', err)
      }
    },

    // ─── 重连策略（指数退避 + 抖动，耗尽后自动重登） ───

    recoverAfterConnectFailure(err: unknown): void {
      if (this.manualDisconnect || this.reauthenticating || this.reconnectTimer) return
      if (isUnauthorizedHandshake(err)) {
        this.attemptSilentReauth()
        return
      }
      this.handleReconnect()
    },

    handleReconnect(): void {
      if (this.manualDisconnect || this.reconnectTimer) return
      // connecting 期间不重复触发，避免计数跳变
      if (this.status === 'connecting') return

      if (this.reconnectCount < this.maxReconnect) {
        this.reconnectCount++
        const delay = computeBackoffDelay(this.reconnectCount)
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connect()
        }, delay)
      } else {
        // 重连耗尽：尝试静默重登
        this.attemptSilentReauth()
      }
    },

    /**
     * 用缓存的凭据静默重登，拿新 token 后重连 WS
     * 无缓存凭据则提示用户重新登录
     */
    async attemptSilentReauth(): Promise<void> {
      if (this.reauthenticating || this.manualDisconnect) return
      this.reauthenticating = true

      const { useAuthStore } = await import('./auth')
      const authStore = useAuthStore()
      const creds = authStore.getCachedCredentials()

      if (!creds) {
        this.reauthenticating = false
        const { useNotificationStore } = await import('./notification')
        useNotificationStore().warn(i18n.global.t('ws.linkBroken'))
        authStore.logout()
        return
      }
      try {
        const { login } = await import('../features/auth/api/authApi')
        const data = await login(creds.username, creds.password)
        if (data && data.token) {
          authStore.setToken(data.token, creds.username, creds.password)
          this.reconnectCount = 0
          this.reauthenticating = false
          this.connect()
        } else {
          throw new Error(i18n.global.t('ws.reloginNoToken'))
        }
      } catch (err) {
        console.error('[WS] ❌ 静默重登失败:', err)
        const kind = (err as ClassifiedErrorInfo)?.info?.kind
        // 统一密码模型:同名会话在 60s 断连宽限期内仍占用用户名,此刻重登必 409。
        // 等宽限结束(用户名释放)后自动重试一次;仍 409 说明用户名被其他操作员占用,放弃。
        if (kind === 'conflict' && !this.reauthDeferred) {
          this.reauthDeferred = true
          const waitMs = graceReauthDelayMs(this.disconnectedAt, Date.now())
          const { useNotificationStore } = await import('./notification')
          useNotificationStore().warn(i18n.global.t('ws.reloginGraceWait', { seconds: Math.ceil(waitMs / 1000) }))
          setTimeout(() => {
            this.reauthenticating = false
            void this.attemptSilentReauth()
          }, waitMs)
          return
        }
        this.reauthenticating = false
        const { useNotificationStore } = await import('./notification')
        useNotificationStore().warn(i18n.global.t('ws.autoRecoverFailed'))
        authStore.logout()
      }
    },

    // ─── 断开连接 ───

    markConnected(): void {
      if (this.status === 'open') return
      const reconnected = this.hasConnected
      this.status = 'open'
      this.hasConnected = true
      this.reconnectCount = 0
      this.reauthenticating = false
      this.disconnectedAt = 0
      this.reauthDeferred = false
      notifyWaiters('open')
      bus.emit('ws:connected', { reconnected })
    },

    disconnect(): void {
      this.manualDisconnect = true
      this.reauthenticating = false
      this.reauthDeferred = false
      this.disconnectedAt = 0
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      if (this.nativeWsUnsubscribers.length) {
        this.nativeWsUnsubscribers.forEach(unsub => unsub())
        this.nativeWsUnsubscribers = []
        this.nativeWsRegistered = false
      }
      WebSocketService.Disconnect().catch((err) => {
        console.warn('[WS] Go WebSocket disconnect failed:', err)
      })
      this.status = 'closed'
      notifyWaiters('closed')
    }
  }
})
