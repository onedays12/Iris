/**
 * 认证状态 Store
 * 管理 JWT Token、服务器地址、登录/登出状态。
 *
 * 进程内凭据：username/password 仅存内存，供 TeamServer 重启后静默重登。
 * 「记住密码」：仅在登录成功且勾选后写入 localStorage；失败登录不落盘。
 */

import { defineStore } from 'pinia'

export interface CachedCredentials {
  username: string
  password: string
}

const REMEMBER_KEY = 'iris.remember_login'

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

    rememberLogin(username: string, password: string): void {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }))
    },

    forgetLogin(): void {
      localStorage.removeItem(REMEMBER_KEY)
    },

    loadRememberedLogin(): CachedCredentials | null {
      try {
        const raw = localStorage.getItem(REMEMBER_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<CachedCredentials>
        const username = String(parsed.username || '')
        const password = String(parsed.password || '')
        if (!username || !password) return null
        return { username, password }
      } catch {
        return null
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
