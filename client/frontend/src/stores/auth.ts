/**
 * 认证状态 Store
 * 管理 JWT Token、服务器地址、登录/登出状态。
 *
 * 凭据缓存策略：username/password 仅存内存（非 localStorage），
 * 用于 TeamServer 重启后自动静默重登；client 关闭重开则需手输一次。
 */

import { defineStore } from 'pinia'

export interface CachedCredentials {
  username: string
  password: string
}

interface AuthState {
  token: string
  /** 服务器基础地址 (持久化存储) */
  apiBase: string
  user: null
}

// ─── 内存凭据缓存（不落盘，进程生命周期内有效） ───

let cachedCredentials: CachedCredentials | null = null

// ─── Store 定义 ───

export const useAuthStore = defineStore('auth', {

  // ─── 状态 ───

  state: (): AuthState => ({
    token: sessionStorage.getItem('token') || '',
    apiBase: localStorage.getItem('api_base') || 'https://127.0.0.1:8080',
    user: null,
  }),

  // ─── 计算属性 ───

  getters: {
    isLoggedIn: (state) => !!state.token,

    /** 是否有缓存的凭据可用于自动重登 */
    hasCachedCredentials: () => cachedCredentials !== null,
  },

  // ─── 方法 ───

  actions: {
    /**
     * 设置服务器地址
     * @param url 服务器地址
     */
    setApiBase(url: string): void {
      if (!url) return
      // 自动补全 https 协议头（如果没有指定）
      let formattedUrl = url.trim()
      if (!formattedUrl.startsWith('http')) {
        formattedUrl = `https://${formattedUrl}`
      }
      // 移除末尾斜杠
      formattedUrl = formattedUrl.replace(/\/+$/, '')

      this.apiBase = formattedUrl
      localStorage.setItem('api_base', formattedUrl)
    },

    /**
     * 设置登录状态，并缓存凭据用于后续自动重登
     * @param token 访问令牌
     * @param username 用户名
     * @param password 密码
     */
    setToken(token: string, username?: string, password?: string): void {
      this.token = token
      sessionStorage.setItem('token', token)
      if (username && password) {
        cachedCredentials = { username, password }
      }
    },

    /**
     * 获取缓存的凭据（供 WS 自动重登使用）
     */
    getCachedCredentials(): CachedCredentials | null {
      return cachedCredentials
    },

    /**
     * 退出登录，并清除内存凭据缓存
     */
    logout(): void {
      this.token = ''
      this.user = null
      cachedCredentials = null
      sessionStorage.removeItem('token')
      // 跳转到登录页由外部控制或通过 router 全局拦截
    }
  }
})
