/**
 * WebSocket 连接管理 Store
 * 负责与 Teamserver 的 WebSocket 链路建立、断开、自动重连，
 * 以及将原始消息分发到 wsEventRouter 进行事件路由。
 */

import { defineStore } from 'pinia'
import { Events } from '@wailsio/runtime'
import { WebSocketService } from '../../bindings/changeme/service'
import { handleWsEventMessage } from '../features/events/wsEventRouter.js'

// ─── Store 定义 ───

export const useWSStore = defineStore('ws', {

  // ─── 状态 ───

  state: () => ({
    socket: null,
    status: 'closed', 
    reconnectCount: 0,
    maxReconnect: 5,
    reconnectTimer: null,
    nativeWsRegistered: false,
    nativeWsUnsubscribers: [],
    manualDisconnect: false,
  }),

  actions: {

    // ─── Wails 原生事件桥接 ───

    ensureNativeWebSocketEvents() {
      if (this.nativeWsRegistered) return

      this.nativeWsUnsubscribers = [
        Events.On('teamserver:ws:message', (event) => {
          const payload = event?.data
          const data = payload?.data ?? payload?.Data ?? payload
          if (data !== undefined && data !== null) {
            this.handleMessage(String(data))
          }
        }),
        Events.On('teamserver:ws:status', (event) => {
          const payload = event?.data || {}
          const status = String(payload.status || payload.Status || '').toLowerCase()

          if (status === 'open') {
            console.log('[WS] ✅ Go WebSocket 链路已连接')
            this.status = 'open'
            this.reconnectCount = 0
            return
          }

          if (status === 'connecting') {
            this.status = 'connecting'
            return
          }

          if (status === 'closed') {
            console.log('[WS] ❌ Go WebSocket 链路已关闭')
            this.status = 'closed'
            if (!this.manualDisconnect) {
              this.handleReconnect()
            }
          }
        }),
        Events.On('teamserver:ws:error', (event) => {
          const payload = event?.data || {}
          const message = payload.message || payload.Message || 'unknown websocket error'
          console.error('[WS] ⚠️ Go WebSocket 链路异常:', message)
          this.status = 'error'
          if (!this.manualDisconnect) {
            this.handleReconnect()
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
    async connect(explicitToken = null) {
      if (this.status === 'open' || this.status === 'connecting') return

      let token = explicitToken
      let apiBase = ''
      
      try {
        const { useAuthStore } = await import('./auth.js')
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
      console.log(`[WS] 📡 准备建立 Go WebSocket 受控链路: ${targetApiBase}`)
      this.status = 'connecting'

      try {
        await WebSocketService.Connect(targetApiBase, token)
        if (!this.manualDisconnect) {
          this.status = 'open'
          this.reconnectCount = 0
        }
      } catch (err) {
        console.error('[WS] 🚨 Go WebSocket 链路创建失败:', err)
        this.status = 'error'
        if (!this.manualDisconnect) {
          this.handleReconnect()
        }
      }
    },

    /** 
     * 等待连接成功
     */
    waitForConnection(timeout = 10000) {
      if (this.status === 'open') return Promise.resolve()
      
      return new Promise((resolve, reject) => {
        const start = Date.now()
        const timer = setInterval(() => {
          if (this.status === 'open') {
            clearInterval(timer)
            resolve()
          } else if (this.status === 'error' || Date.now() - start > timeout) {
            clearInterval(timer)
            reject(new Error(this.status === 'error' ? '受控链路连接失败' : '链路连接超时 (10s)'))
          }
        }, 200)
      })
    },

    /**
     * 处理收到的原始消息
     */
    async handleMessage(rawData) {
      try {
        await handleWsEventMessage(rawData)
      } catch (err) {
        console.warn('[WS] Event process failed:', err)
      }
    },

    // ─── 重连策略 ───

    handleReconnect() {
      if (this.manualDisconnect || this.reconnectTimer) return
      if (this.reconnectCount < this.maxReconnect) {
        this.reconnectCount++
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connect()
        }, 3000)
      }
    },

    // ─── 断开连接 ───

    disconnect() {
      this.manualDisconnect = true
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
      if (this.socket) {
        this.socket.onclose = null
        this.socket.close()
        this.socket = null
      }
      this.status = 'closed'
    }
  }
})
