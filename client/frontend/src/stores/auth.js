/**
 * 认证状态 Store
 * 管理 JWT Token、服务器地址、登录/登出状态。
 */

import { defineStore } from 'pinia'

// ─── Store 定义 ───

export const useAuthStore = defineStore('auth', {

  // ─── 状态 ───

  state: () => ({
    token: sessionStorage.getItem('token') || '',
    /** 服务器基础地址 (持久化存储) */
    apiBase: localStorage.getItem('api_base') || 'https://127.0.0.1:8080',
    user: null,
  }),

  // ─── 计算属性 ───

  getters: {
    isLoggedIn: (state) => !!state.token,
  },

  // ─── 方法 ───

  actions: {
    /**
     * 设置服务器地址
     * @param {string} url 
     */
    setApiBase(url) {
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
     * 设置登录状态
     */
    setToken(token) {
      this.token = token
      sessionStorage.setItem('token', token)
    },

    /**
     * 退出登录
     */
    logout() {
      this.token = ''
      this.user = null
      sessionStorage.removeItem('token')
      // 跳转到登录页由外部控制或通过 router 全局拦截
    }
  }
})
