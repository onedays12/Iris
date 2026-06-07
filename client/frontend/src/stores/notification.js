/**
 * 通知管理 Store
 * 管理全局通知消息队列，支持自动销毁。
 */

import { defineStore } from 'pinia'

// ─── Store 定义 ───

export const useNotificationStore = defineStore('notification', {

  // ─── 状态 ───

  state: () => ({
    /** @type {Array<{id: number, message: string, type: string, duration: number}>} */
    notifications: []
  }),

  actions: {
    /**
     * 显示通知
     * @param {string} message 
     * @param {'success' | 'error' | 'warn' | 'info'} type 
     * @param {number} duration (ms)
     */
    add(message, type = 'info', duration = 3000) {
      const id = Date.now()
      this.notifications.push({ id, message, type, duration })

      // 自动销毁
      if (duration > 0) {
        setTimeout(() => {
          this.remove(id)
        }, duration)
      }
    },

    success(message) { this.add(message, 'success') },
    error(message) { this.add(message, 'error', 5000) },
    warn(message) { this.add(message, 'warn', 4000) },
    info(message) { this.add(message, 'info') },

    remove(id) {
      this.notifications = this.notifications.filter(n => n.id !== id)
    }
  }
})
